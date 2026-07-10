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

  // Overrides opcionais escolhidos pelo operador na caixa da extensão (todos
  // opcionais — vazio cai no comportamento automático atual). Vêm no topo do
  // payload: canal, resp, preStatus, produto, plano, codPlano, formaPagamento,
  // agenda, turno.
  var ov = payload;

  // ── 2. Plano: escolha do operador > nome da página (plans_svas) > dicionário ─
  // A extensão lê o nome real do plano na API da própria página — sempre atual,
  // independe do dicionário (verohub_codigos_cidades.json, que fica defasado
  // quando a Vero troca códigos, ex.: NP 3.0). Fallback: dicionário por código.
  var planCode = String(ov.codPlano || (sale.plan != null ? sale.plan : (sale.planCode || ''))).replace(/\D/g, '').trim();
  var planName = '';
  if (ov.plano) {
    // operador escolheu na caixa — tira sufixo " | R$ XX,XX" e prefixo de código
    planName = String(ov.plano).replace(/\s*\|\s*R?\$?\s*[\d.,]+\s*$/, '').replace(/^\s*\d+\s*[-–—]\s*/, '').trim();
  }
  if (!planName && sale.plan_name) {
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
  if (ov.produto) produto = String(ov.produto).trim(); // override do operador na caixa

  // ── 5. Vencimento (due_date numérico → '05'/'10'/'13'/'19') ────────────────
  var venc = (sale.due_date != null && sale.due_date !== '') ? String(sale.due_date).replace(/\D/g, '') : '';
  if (venc.length === 1) venc = '0' + venc;

  // ── 6. Observação (rastro do pedido VeroHub + e-mail, que não tem coluna) ──
  var obsPartes = [];
  if (sale.proposal_number) obsPartes.push('Proposta VeroHub ' + sale.proposal_number);
  if (sale.status)          obsPartes.push('Status VeroHub: ' + sale.status);
  if (sale.scheduling_date) obsPartes.push('Agendamento VeroHub: ' + sale.scheduling_date);
  if (sale.email)           obsPartes.push('E-mail: ' + sale.email);
  // PJ (venda com CNPJ): registra os dados da empresa que não têm coluna própria
  if (sale.cnpj) {
    obsPartes.push('PJ — CNPJ ' + String(sale.cnpj).replace(/\D/g, ''));
    if (sale.fantasy_name)       obsPartes.push('Nome fantasia: ' + sale.fantasy_name);
    if (sale.state_registration) obsPartes.push('IE: ' + sale.state_registration);
  }

  var agora = new Date();
  var dataAtiv = Utilities.formatDate(agora, tz, 'dd/MM/yyyy');

  var d = {
    canal:        String(ov.canal || 'VEROHUB').trim(),   // vazio → VEROHUB (default)
    produto:      produto,
    status:       '1- Conferencia/Ativação',
    dataAtiv:     dataAtiv,
    agenda:       String(ov.agenda || '').trim(),         // data agendamento (yyyy-mm-dd → normaliza)
    turno:        String(ov.turno  || '').trim(),         // Manhã/Tarde (enum _TURNOS_VALIDOS_)
    formaPagamento: String(ov.formaPagamento || '').trim(), // BOLETO/RECORRENTE (metadado; valor = total_price)
    cliente:      String(sale.name || sale.company_name || sale.fantasy_name || '').trim(),
    cpf:          String(sale.cpf || sale.cnpj || '').replace(/\D/g, ''),  // CRM guarda o documento (CPF ou CNPJ) na coluna CPF
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
    preStatus:    String(ov.preStatus || 'EM NEGOCIACAO').trim(),
    verohubPedido: verohubId,
    verohubPedidoDt: Utilities.formatDate(agora, tz, 'dd/MM/yyyy HH:mm'),
    observacao:   obsPartes.join(' | '),
    resp:         String(ov.resp || sale.seller || '').trim(),  // vendedor escolhido > seller do pedido
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

// ══════════════════════════════════════════════════════════════════════════════
//  _verohubFormOptions_ — opções pros dropdowns da caixa "Enviar pro CRM"
//
//  A extensão (content-verohub.js) não fala google.script.run — só faz POST no
//  doPost. Este endpoint (rota verohub_form_options, mesmo secret) devolve num
//  tiro só o que a caixa precisa pra montar os 7 campos selecionáveis:
//    - cidade resolvida do CEP do pedido (pra listar planos)
//    - vendedores (getResponsaveis — mesma lista da Nova Venda)
//    - planos por produto (Fibra Alone/Combo, Móvel Alone) com nome/valor/código
//    - enums estáticos (canais, pré-status, formas, turnos, produtos) espelhando
//      Nova_venda.html / _TURNOS_VALIDOS_ — fonte única evita drift
//  Reusa caches de _getTabela/_getCidades/getResponsaveis (leitura barata).
// ══════════════════════════════════════════════════════════════════════════════
function _verohubFormOptions_(payload) {
  payload = payload || {};

  // cidade: pelo CEP (autoritativo) ou explícita no payload
  var cidade = '';
  var cepLimpo = String(payload.zip_code || payload.cep || '').replace(/\D/g, '');
  if (cepLimpo.length === 8) {
    try { var cr = buscarCEPBackend(cepLimpo); if (cr && !cr.erro) cidade = cr.cidade || ''; }
    catch (e) { Logger.log('verohub options CEP erro: ' + (e && e.message || e)); }
  }
  if (!cidade && payload.cidade) cidade = String(payload.cidade).trim();

  var vendedores = [];
  try { var rv = getResponsaveis(); if (rv && rv.lista) vendedores = rv.lista; }
  catch (e) { Logger.log('verohub options responsaveis erro: ' + (e && e.message || e)); }

  // planos por produto — a caixa troca o dropdown client-side sem novo round-trip
  var planos = {};
  ['Fibra Alone', 'Fibra Combo', 'Móvel Alone'].forEach(function (prod) {
    var arr = [];
    if (cidade) {
      try {
        var rp = getPlanosPorCidadeProduto(cidade, prod);
        if (rp && rp.planosDetalhes) {
          arr = rp.planosDetalhes.map(function (p) {
            return { nome: p.nome, valor: p.valor, codigo: p.codigo || '' };
          });
        }
      } catch (e) { Logger.log('verohub options planos erro (' + prod + '): ' + (e && e.message || e)); }
    }
    planos[prod] = arr;
  });

  return {
    ok: true,
    cidade: cidade,
    vendedores: vendedores,
    planos: planos,
    enums: {
      // espelham Nova_venda.html (canais/pré-status/formas/produtos) e _TURNOS_VALIDOS_
      canais: ['PAP', 'META ADS', 'INDICAÇÃO', 'ATIVO', 'GOOGLE ADS'],
      preStatus: ['EM NEGOCIAÇÃO', 'ANALISE PENDENTE', 'AG DOC', 'AG COMPROVANTE',
                  'AG SELFIE', 'AG QUALIDADE', 'REPROVADO', 'AG AUDITORIA',
                  'AG ACEITE', 'CRUZAMENTO DE CANAIS', 'ARQUIVAR VENDA'],
      formasPagamento: [{ v: 'BOLETO', label: '💰 Boleto' }, { v: 'RECORRENTE', label: '💳 Cartão' }],
      turnos: (typeof _TURNOS_VALIDOS_ !== 'undefined' ? _TURNOS_VALIDOS_ : ['Manhã (08h às 12h)', 'Tarde (13h às 17h)']),
      produtos: ['Fibra Alone', 'Fibra Combo', 'Móvel Alone']
    }
  };
}
