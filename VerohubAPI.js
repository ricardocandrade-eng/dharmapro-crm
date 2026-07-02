// ══════════════════════════════════════════════════════════════════════════════
//  VerohubAPI.js — Captura de pedido do VeroHub → venda no CRM (1 - Vendas)
//
//  Fluxo: a extensão DharmaPro Connector (content-verohub.js) lê o objeto
//  window.__SALE da página https://hub.veronet.com.br/sales/{id} e faz POST no
//  doPost do CRM com { action:'verohub_capture', secret, sale:{...} }. O doPost
//  (Code.js) valida o secret e chama _verohubCapturarVenda_ aqui.
//
//  A extensão manda os campos "crus" do __SALE (sem auth_token/selfie/2fa/serasa
//  — removidos já no MAIN world). Toda a normalização acontece aqui no servidor:
//    - plano: resolvido pelo CÓDIGO VeroHub (sale.plan) via _getVerohubCodigos()
//      — forward/determinístico (código → nome), sem a ambiguidade do reverse
//      lookup por nome. O código também vai direto pra COD_PLANO (pontos saem dele).
//    - cidade/UF: resolvidos por buscarCEPBackend(sale.zip_code) (VeroHub só manda
//      city como id interno). Rua/número/bairro vêm do próprio pedido (autoritativo).
//    - combo: se houver mvno_plan/mvno_phone_data, cria o Móvel vinculado via
//      criarVendaMovelVinculada (mesma trilha atômica do cadastro combo do CRM).
//
//  Idempotência: dedupe pela coluna VEROHUB_PEDIDO (nº do pedido). Reenviar o
//  mesmo pedido não duplica — retorna { ok:false, jaExiste:true, linha }.
// ══════════════════════════════════════════════════════════════════════════════

function _verohubCapturarVenda_(payload) {
  payload = payload || {};
  var sale = payload.sale || {};

  var verohubId = String(sale.id || sale.verohubId || '').replace(/\D/g, '').trim();
  if (!verohubId) return { ok: false, erro: 'Pedido sem id (sale.id ausente).' };

  var tz = Session.getScriptTimeZone();
  var sheet = _getSheet();

  // ── 1. Dedupe pela coluna VEROHUB_PEDIDO (nº do pedido) ────────────────────
  try {
    var ultima = sheet.getLastRow();
    if (ultima >= 3) {
      var colPedido = sheet.getRange(3, CONFIG.COLUNAS.VEROHUB_PEDIDO + 1, ultima - 2, 1).getValues();
      for (var i = 0; i < colPedido.length; i++) {
        if (String(colPedido[i][0] || '').replace(/\D/g, '').trim() === verohubId) {
          return { ok: false, jaExiste: true, linha: i + 3,
                   mensagem: 'Pedido ' + verohubId + ' já foi capturado (linha ' + (i + 3) + ').' };
        }
      }
    }
  } catch (eDup) {
    Logger.log('verohub dedupe erro: ' + (eDup && eDup.message || eDup));
  }

  // ── 2. Plano: nome vindo da página (plans_svas) tem prioridade ─────────────
  // A extensão lê o nome real do plano na API da própria página — sempre atual,
  // independe do dicionário (verohub_codigos_cidades.json, que fica defasado
  // quando a Vero troca códigos, ex.: NP 3.0). Fallback: dicionário por código.
  var planCode = String(sale.plan != null ? sale.plan : (sale.planCode || '')).replace(/\D/g, '').trim();
  var planName = '';
  if (sale.plan_name) {
    // tira prefixo de código legado no início do nome (ex.: "4678 - VERO MAIS ...")
    planName = String(sale.plan_name).replace(/^\s*\d+\s*[-–—]\s*/, '').trim();
  }
  if (!planName && planCode) {
    try {
      var vh = _getVerohubCodigos();
      if (vh && vh.codigos && vh.codigos[planCode] && vh.codigos[planCode].nome) {
        planName = String(vh.codigos[planCode].nome).trim();
      }
    } catch (eP) { Logger.log('verohub plano lookup erro: ' + (eP && eP.message || eP)); }
  }

  // ── 3. Endereço: CEP → cidade/UF (VeroHub só manda city como id interno) ───
  var cepLimpo = String(sale.zip_code || sale.zip || '').replace(/\D/g, '');
  var endCep = {};
  if (cepLimpo.length === 8) {
    try {
      var cr = buscarCEPBackend(cepLimpo);
      if (cr && !cr.erro) endCep = cr;
    } catch (eC) { Logger.log('verohub CEP erro: ' + (eC && eC.message || eC)); }
  }
  var cidade = endCep.cidade || '';
  var uf = String(sale.state || '').trim().toUpperCase() || endCep.uf || '';

  // ── 4. Produto (combo?) ────────────────────────────────────────────────────
  var mvnoArr = Array.isArray(sale.mvno_phone_data) ? sale.mvno_phone_data : [];
  var temMovel = !!(sale.mvno_plan || mvnoArr.length);
  var produto = temMovel ? 'Fibra Combo' : 'Fibra Alone';
  if (sale.only_chip_sale) produto = 'Móvel Alone'; // venda só de chip (sem fibra)

  // ── 5. Vencimento (due_date numérico → '05'/'10'/'13'/'19') ────────────────
  var venc = (sale.due_date != null && sale.due_date !== '') ? String(sale.due_date).replace(/\D/g, '') : '';
  if (venc.length === 1) venc = '0' + venc;

  // ── 6. Observação (rastro do pedido VeroHub + e-mail, que não tem coluna) ──
  var obsPartes = [];
  if (sale.proposal_number) obsPartes.push('Proposta VeroHub ' + sale.proposal_number);
  if (sale.status)          obsPartes.push('Status VeroHub: ' + sale.status);
  if (sale.scheduling_date) obsPartes.push('Agendamento VeroHub: ' + sale.scheduling_date);
  if (sale.email)           obsPartes.push('E-mail: ' + sale.email);

  var agora = new Date();
  var dataAtiv = Utilities.formatDate(agora, tz, 'dd/MM/yyyy');

  var d = {
    canal:        String(payload.canal || 'VEROHUB').trim(),
    produto:      produto,
    status:       '1- Conferencia/Ativação',
    dataAtiv:     dataAtiv,
    cliente:      String(sale.name || '').trim(),
    cpf:          String(sale.cpf || '').replace(/\D/g, ''),
    rg:           String(sale.rg || '').trim(),
    nomeMae:      String(sale.mother_name || '').trim(),
    dtNasc:       String(sale.birthday || '').trim(),   // YYYY-MM-DD → _construirLinhaDados normaliza p/ DD/MM/YYYY
    whats:        String(sale.phone || '').replace(/\D/g, ''),
    tel:          String(sale.phone_optional || sale.phone_contact || '').replace(/\D/g, ''),
    cep:          cepLimpo,
    rua:          String(sale.street || endCep.logradouro || '').trim(),
    num:          String(sale.number || '').trim(),
    complemento:  String(sale.complement || '').trim(),
    bairro:       String(sale.neighborhood || endCep.bairro || '').trim(),
    cidade:       cidade,
    uf:           uf,
    venc:         venc,
    plano:        planName,
    codPlano:     planCode,                  // vai direto pra COD_PLANO (pontos resolvem dele)
    valor:        (sale.total_price != null ? sale.total_price : ''),
    portabilidade:'',                        // Fibra não tem portabilidade (o Móvel vinculado tem)
    preStatus:    'EM NEGOCIACAO',
    verohubPedido: verohubId,
    verohubPedidoDt: Utilities.formatDate(agora, tz, 'dd/MM/yyyy HH:mm'),
    observacao:   obsPartes.join(' | '),
    resp:         String(sale.seller || '').trim(),
    criadoPor:    String(payload.criadoPor || 'Captura VeroHub').trim()
  };

  var linha = _construirLinhaDados(d);

  // ── 7. Insere a Fibra (mesma varredura da coluna STATUS do doPost) ─────────
  var novaLinha;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ultimaSheet = sheet.getLastRow();
    if (ultimaSheet < 3) {
      novaLinha = 3;
    } else {
      var colStatus = sheet.getRange(3, CONFIG.COLUNAS.STATUS + 1, ultimaSheet - 2, 1).getValues();
      var ultimaReal = 0;
      for (var r = colStatus.length - 1; r >= 0; r--) {
        if (colStatus[r][0] !== '' && colStatus[r][0] !== null && colStatus[r][0] !== undefined) {
          ultimaReal = r;
          break;
        }
      }
      novaLinha = ultimaReal + 3 + 1;
    }
    sheet.getRange(novaLinha, 1, 1, linha.length).setValues([linha]);
    _limparCache();
  } finally {
    lock.releaseLock();
  }

  // ── 8. Móvel vinculado (combo) — mesma trilha atômica do cadastro do CRM ───
  //     Chamado APÓS liberar o lock da Fibra (criarVendaMovelVinculada pega o seu).
  var combo = null;
  if (produto === 'Fibra Combo' && planName) {
    try {
      // O VeroHub nomeia o móvel como "MAIS CONECTADO XXGB"; a inferência do CRM
      // (_inferirMovelComboFromFibra_) procura "MÓVEL XXGB". Extrai o GB das duas
      // formas e monta um nome sintético que a função reconhece.
      var mGb = planName.match(/(?:M[ÓO]VEL|MAIS\s*CONECTADO)\s*(\d+)\s*GB/i);
      var nomeParaInferir = mGb ? ('MÓVEL ' + mGb[1] + 'GB') : planName;
      var inf = _inferirMovelComboFromFibra_(nomeParaInferir);
      if (inf && !inf.erro) {
        var m0 = mvnoArr[0] || {};
        var portab = m0.is_portability ? 'SIM' : 'NÃO';
        var linhaMovel = String((m0.ddd || '') + (m0.phone_number || '')).replace(/\D/g, '');
        combo = criarVendaMovelVinculada({
          linhaOrigem:   novaLinha,
          produto:       'Móvel Combo',
          plano:         inf.plano,
          valor:         inf.valor,
          portabilidade: portab,
          linhaMovel:    linhaMovel,
          contrato:      ''
        });
      } else {
        combo = { sucesso: false, mensagem: (inf && inf.mensagem) || 'Móvel do combo não inferido.' };
      }
    } catch (eM) {
      combo = { sucesso: false, mensagem: (eM && eM.message) || String(eM) };
    }
  }

  return {
    ok:       true,
    linha:    novaLinha,
    verohub:  verohubId,
    cliente:  d.cliente,
    produto:  produto,
    plano:    planName || ('(código ' + planCode + ' não encontrado no dicionário)'),
    cidade:   cidade,
    valor:    d.valor,
    combo:    combo
  };
}
