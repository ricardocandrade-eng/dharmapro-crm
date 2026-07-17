// ══════════════════════════════════════════════════════════════════════════════
// ParceirosAPI.js — Backend do Mini Site PAP · DharmaPro CRM
// Criado em: 28/03/2026
//
// NOVAS ABAS CRIADAS POR ESTE ARQUIVO:
//   "Consultas"   → recebe Cards 1 (Viabilidade) e 2 (Crédito)
//   "Pré-Vendas"  → recebe Card 3 (pedidos aguardando aprovação)
//
// INTEGRAÇÃO COM doPost (Code.js):
//   Adicionar no início do doPost do Code.js, ANTES do bloco BotConversa:
//
//     const _papPayload = JSON.parse(e.postData?.contents || '{}');
//     if (_papPayload.action && !_papPayload.webhook_secret) {
//       return _routePAP(_papPayload);
//     }
//
// ALERTAS NO CRM (Index.html / Mobile.html):
//   Chamar listarPendentes() via google.script.run a cada 60s.
//   Retorna: { consultas: N, preVendas: N, total: N }
//   Usar total para exibir badge e banner persistente.
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes ─────────────────────────────────────────────────────────────────
const PAP_SHEET_CONSULTAS  = 'Consultas';
const PAP_SHEET_PRE_VENDAS = 'Pré-Vendas';
const PAP_SHEET_PAP        = '3 - PAP';
const PAP_SHEET_VENDAS     = '1 - Vendas';

// Aba "3 - PAP": dados começam na linha 5 (linha 4 = cabeçalho).
//   col S=19 NOME · T=20 IDBOT (legacy) · U=21 WHATSAPP · V=22 DATA_CADASTRO
//   col W=23 CPF · X=24 CHAVE_PIX · Y=25 · Z=26 · AA=27 FORMA_PGTO
//   col AB=28 PERIODICIDADE · AC=29 ATIVO (boolean — 03/06/2026)
const PAP_FIRST_ROW     = 5;
const PAP_HEADER_ROW    = 4;
const PAP_COL_NOME      = 19; // S
const PAP_COL_WHATS     = 21; // U
const PAP_COL_DATA_CAD  = 22; // V
const PAP_COL_CPF       = 23; // W
const PAP_COL_PIX       = 24; // X
const PAP_COL_FORMA     = 27; // AA
const PAP_COL_PERIOD    = 28; // AB
const PAP_COL_ATIVO     = 29; // AC

// Vendedor sem nada gravado em AC (linhas históricas pré-migração) é tratado
// como ativo. Backfill em `_setupColunaAtivoPAP` (one-shot) deixa tudo `true`.
function _papEhAtivo_(v) {
  if (v === false) return false;
  if (v === true || v === '' || v === null || v === undefined) return true;
  var s = String(v).trim().toUpperCase();
  if (s === 'FALSE' || s === 'NAO' || s === 'NÃO' || s === '0' || s === 'INATIVO') return false;
  return true;
}

// Cabeçalhos das novas abas (criadas automaticamente se não existirem)
const HEADERS_CONSULTAS = [
  'ID', 'Timestamp', 'Tipo', 'Status',
  'Parceiro', 'Parceiro CPF',
  'CPF Cliente', 'Nome Cliente',
  'CEP', 'Rua', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF',
  'Data Nascimento', 'Nome da Mãe', 'Via Manual Assertiva',
  'Observações'
];

const HEADERS_PRE_VENDAS = [
  'ID', 'Timestamp', 'Status',
  'Parceiro', 'Parceiro CPF',
  'CPF Cliente', 'Nome Cliente',
  'CEP', 'Protocolo Ref',
  'WhatsApp', 'Email',
  'Plano', 'Móvel', 'Tipo Móvel',
  'Vencimento', 'Pagamento',
  'Data Decisão', 'Decidido Por',
  'Rua', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF', 'Valor Plano',
  'Motivo Rejeição',
  'Data Nascimento Cliente', 'Nome Mãe Cliente',
  'Número Portado'
];
// Índices PV (0-based): 0=ID 1=TS 2=Status 3=Parceiro 4=ParceiroCPF
// 5=CPFCliente 6=Nome 7=CEP 8=ProtRef 9=Whats 10=Email
// 11=Plano 12=Movel 13=TipoMovel 14=Venc 15=Pag 16=DataDecisão 17=DecididoPor
// 18=Rua 19=Num 20=Complemento 21=Bairro 22=Cidade 23=UF 24=ValorPlano 25=MotivoRejeição
// 26=DataNascimentoCliente 27=NomeMãeCliente (Assertiva na Máscara de Venda)
// 28=NúmeroPortado (número a portar, quando Tipo Móvel = Portabilidade)

// ── Roteador principal ─────────────────────────────────────────────────────────
// Chamado pelo doPost do Code.js quando payload.action está presente.
function _routePAP(payload) {
  let result;
  try {
    switch (payload.action) {
      case 'autenticarParceiro':
        result = autenticarParceiro(payload.cpf);
        break;
      case 'analisarViabilidade':
        result = salvarConsulta('Viabilidade', payload);
        break;
      case 'analisarCredito':
        result = salvarConsulta('Crédito', payload);
        break;
      case 'consultarAssertiva':
        result = consultarAssertivaGAS(payload.cpf, payload.parceiroCpf);
        break;
      case 'buscarCliente':
        result = buscarClienteConsultas(payload.cpf);
        break;
      case 'buscarCEP':
        result = buscarCEPBackend(payload.cep, payload.produto || 'Fibra Alone');
        break;
      case 'salvarPreVenda':
        result = salvarPreVenda(payload);
        break;
      case 'aprovarPreVenda':
        result = aprovarPreVenda(payload.id, payload.email);
        break;
      case 'rejeitarPreVenda':
        result = rejeitarPreVenda(payload.id, payload.email);
        break;
      case 'apagarConsulta':
        result = apagarConsulta(payload.id);
        break;
      case 'apagarPreVenda':
        result = apagarPreVenda(payload.id);
        break;
      case 'listarPendentes':
        result = listarPendentes();
        break;
      case 'listarConsultas':
        result = listarConsultas(payload.filtro);
        break;
      case 'listarPreVendas':
        result = listarPreVendas(payload.filtro);
        break;
      case 'getMinhaDashboard':
        result = getMinhaDashboard(payload.cpf);
        break;
      case 'getCatalogoPremios':
        result = getCatalogoPremios();
        break;
      case 'resgatarPremio':
        result = resgatarPremio(payload.cpf, payload.premioId);
        break;
      case 'getExtratoPontos':
        result = getExtratoPontos(payload.cpf);
        break;
      case 'getExtratoPontosLedger': // Fase 1 — consulta read-only do ledger (saldo + eventos)
        result = getExtratoPontosLedger(payload.cpf, payload.limite);
        break;
      case 'getSaldoPontos':         // Fase 1 — saldo (SUM do ledger) + porTipo
        result = getSaldoPontos(payload.cpf);
        break;
      case 'getMeusPagamentosPAP':
        result = getMeusPagamentosPAP(payload.cpf);
        break;
      case 'listarCidadesPAP':
        // Reusa o helper público do doGet (Code.js) — lista de cidades ordenada.
        result = (typeof _serveActionCidades_ === 'function')
          ? _serveActionCidades_()
          : { ok: false, error: 'Cidades indisponíveis', cidades: [] };
        break;
      case 'getOfertasCidade':
        // Reusa getOfertasCidade do CRM (Code.js) — Mapa de Ofertas no portal PAP.
        result = (typeof getOfertasCidade === 'function')
          ? getOfertasCidade(payload.cidade)
          : { erro: true, mensagem: 'Ofertas indisponíveis.' };
        break;
      default:
        result = { ok: false, error: 'Ação desconhecida: ' + payload.action };
    }
  } catch (err) {
    console.error('[PAP] Erro em _routePAP:', err);
    result = { ok: false, error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. AUTENTICAR PARCEIRO
//    Busca CPF na aba "3 - PAP", coluna W.
//    Retorna: { found: bool, nome: string }
// ══════════════════════════════════════════════════════════════════════════════
function autenticarParceiro(cpf) {
  const ss    = _getSpreadsheet_();
  const sheet = ss.getSheetByName(PAP_SHEET_PAP);
  if (!sheet) return { found: false, error: 'Aba "3 - PAP" não encontrada' };

  const cpfLimpo = _papNormCpf(cpf);
  if (cpfLimpo.length !== 11) return { found: false };

  const lastRow = sheet.getLastRow();
  if (lastRow < PAP_FIRST_ROW) return { found: false };

  // Lê do nome (S) até o ATIVO (AC), inclusivo.
  const numRows = lastRow - PAP_FIRST_ROW + 1;
  const numCols = PAP_COL_ATIVO - PAP_COL_NOME + 1;
  const values  = sheet
    .getRange(PAP_FIRST_ROW, PAP_COL_NOME, numRows, numCols)
    .getValues();

  const cpfOffset   = PAP_COL_CPF   - PAP_COL_NOME; // = 4
  const ativoOffset = PAP_COL_ATIVO - PAP_COL_NOME; // = 10

  for (const row of values) {
    const cpfRow = _papNormCpf(String(row[cpfOffset]));
    if (cpfRow !== cpfLimpo) continue;
    if (!_papEhAtivo_(row[ativoOffset])) {
      return { found: false, motivo: 'inativo' };
    }
    return { found: true, nome: String(row[0]).trim() };
  }
  return { found: false };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. SALVAR CONSULTA (Viabilidade ou Crédito)
//    Destino: aba "Consultas"
//    Retorna: { ok: bool, id: string }
// ══════════════════════════════════════════════════════════════════════════════
function salvarConsulta(tipo, data) {
  const sheet = _papGetOrCreateSheet(PAP_SHEET_CONSULTAS, HEADERS_CONSULTAS);
  const lock  = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
    const id = _papGerarId(tipo === 'Viabilidade' ? 'VB' : 'CR');
    sheet.appendRow([
      id,
      _papNow(),
      tipo,
      'Pendente',
      data.parceiro    || '',
      data.parceiroCpf || '',
      data.cpf         || '',
      data.nome        || '',
      data.cep         || '',
      data.rua         || '',
      data.numero      || '',
      data.comp        || '',
      data.bairro      || '',
      data.cidade      || '',
      data.uf          || '',
      data.nascimento  || '',  // só Crédito
      data.nomeMae     || '',  // só Crédito
      data.extraFields ? 'SIM' : 'NÃO',
      data.obs         || '',
    ]);
    SpreadsheetApp.flush();
    return { ok: true, id };
  } finally {
    lock.releaseLock();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. CONSULTAR ASSERTIVA (via Localize API)
//    Usa consultarAssertivaCPF() definida em Code.js
// ══════════════════════════════════════════════════════════════════════════════
// ── Controle de custo da Assertiva (PAP) ─────────────────────────────────────
// A Assertiva cobra por consulta. Para evitar que parceiros gastem crédito à toa
// (ou usem o portal como ferramenta de consulta avulsa), TODA consulta passa por
// aqui e sofre 3 travas + auditoria:
//   1. Dígito verificador do CPF   → não paga por CPF inválido/typo.
//   2. Dedupe por 30 dias          → mesmo CPF já consultado (por qualquer
//                                     parceiro) reusa o resultado, sem cobrar.
//   3. Limite de 5 PAGAS/dia/parceiro.
//   + Log de tudo na aba "Log Assertiva PAP" (auditoria consulta→venda).
var PAP_SHEET_LOG_ASSERTIVA  = 'Log Assertiva PAP';
var PAP_ASSERTIVA_LIMITE_DIA = 5;   // consultas PAGAS por parceiro por dia
var PAP_ASSERTIVA_CACHE_DIAS = 30;  // reusa resultado do mesmo CPF por N dias
var HEADERS_LOG_ASSERTIVA = [
  'Timestamp', 'Parceiro CPF', 'Parceiro Nome', 'CPF Consultado',
  'Encontrado', 'Origem', 'Nome', 'Nascimento', 'Nome Mae', 'Status'
];

// Valida CPF com dígito verificador (evita gastar consulta com CPF inválido).
function _papCpfValido(cpf) {
  var s = String(cpf || '').replace(/\D/g, '');
  if (s.length !== 11 || /^(\d)\1{10}$/.test(s)) return false;
  var soma = 0, resto, i;
  for (i = 1; i <= 9; i++)  soma += parseInt(s.substring(i-1, i), 10) * (11 - i);
  resto = (soma * 10) % 11; if (resto >= 10) resto = 0;
  if (resto !== parseInt(s.substring(9, 10), 10)) return false;
  soma = 0;
  for (i = 1; i <= 10; i++) soma += parseInt(s.substring(i-1, i), 10) * (12 - i);
  resto = (soma * 10) % 11; if (resto >= 10) resto = 0;
  return resto === parseInt(s.substring(10, 11), 10);
}

function _papDiaBRT_(d) {
  return Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd');
}

function _papRegistrarLogAssertiva_(sheet, parceiroCpf, parceiroNome, cpf, res, origem) {
  try {
    sheet.appendRow([
      new Date(),
      String(parceiroCpf || ''),
      String(parceiroNome || ''),
      String(cpf || ''),
      (res && res.found) ? 'SIM' : 'NÃO',
      origem,                               // PAGO | CACHE | BLOQUEADO | INVALIDO
      (res && res.nome)       || '',
      (res && res.nascimento) || '',
      (res && res.nomeMae)    || '',
      (res && res.status)     || ''
    ]);
  } catch (e) { Logger.log('_papRegistrarLogAssertiva_: ' + e.message); }
}

function consultarAssertivaGAS(cpf, parceiroCpf) {
  var cpfLimpo = _papNormCpf(cpf);
  var pcpf     = _papNormCpf(parceiroCpf);
  var parceiroNome = '';
  try { var a = autenticarParceiro(pcpf); if (a && a.found) parceiroNome = a.nome; } catch (_) {}

  var sheet = null;
  try { sheet = _papGetOrCreateSheet(PAP_SHEET_LOG_ASSERTIVA, HEADERS_LOG_ASSERTIVA); } catch (_) {}

  // 1) CPF inválido → não gasta consulta.
  if (!_papCpfValido(cpfLimpo)) {
    var invRes = { found: false, status: 'CPF inválido' };
    if (sheet) _papRegistrarLogAssertiva_(sheet, pcpf, parceiroNome, cpfLimpo, invRes, 'INVALIDO');
    return invRes;
  }

  // Lê o log UMA vez (de baixo p/ cima, parando fora da janela) para resolver
  // dedupe (cache) e o contador diário do parceiro na mesma passada.
  var agora = new Date();
  var hojeBRT = _papDiaBRT_(agora);
  var msJanela = PAP_ASSERTIVA_CACHE_DIAS * 24 * 60 * 60 * 1000;
  var cacheHit = null, consultasHoje = 0;
  if (sheet && sheet.getLastRow() >= 2) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_LOG_ASSERTIVA.length).getValues();
    for (var i = rows.length - 1; i >= 0; i--) {
      var r  = rows[i];
      var ts = (r[0] instanceof Date) ? r[0] : new Date(r[0]);
      if (isNaN(ts)) continue;
      if ((agora - ts) > msJanela) break;   // além de 30 dias → nada relevante daqui p/ cima
      var origem = String(r[5] || '');
      if (origem === 'PAGO' && _papNormCpf(r[1]) === pcpf && _papDiaBRT_(ts) === hojeBRT) {
        consultasHoje++;
      }
      if (!cacheHit && origem === 'PAGO' && String(r[4]) === 'SIM' && _papNormCpf(r[3]) === cpfLimpo) {
        cacheHit = {
          found: true,
          nome:       String(r[6] || ''),
          nascimento: String(r[7] || ''),
          nomeMae:    String(r[8] || ''),
          status:     String(r[9] || '') || 'Localizado',
          cache: true
        };
      }
    }
  }

  // 2) Dedupe → devolve o cache, sem custo (e não conta no limite diário).
  if (cacheHit) {
    if (sheet) _papRegistrarLogAssertiva_(sheet, pcpf, parceiroNome, cpfLimpo, cacheHit, 'CACHE');
    return cacheHit;
  }

  // 3) Limite diário de consultas PAGAS por parceiro.
  if (consultasHoje >= PAP_ASSERTIVA_LIMITE_DIA) {
    var blkRes = {
      found: false, blocked: true,
      status: 'Limite de ' + PAP_ASSERTIVA_LIMITE_DIA + ' consultas por dia atingido. Tente amanhã.'
    };
    if (sheet) _papRegistrarLogAssertiva_(sheet, pcpf, parceiroNome, cpfLimpo, blkRes, 'BLOQUEADO');
    return blkRes;
  }

  // 4) Consulta paga.
  var out;
  try {
    var res = consultarAssertivaCPF(cpfLimpo);
    if (res.erro) {
      out = { found: false, status: res.mensagem };
    } else {
      var d = res.dados || {};
      var nasc = '';
      if (d.dataNascimento) {
        nasc = (typeof _formatarDataNascimento === 'function')
          ? (_formatarDataNascimento(d.dataNascimento, 'dd/MM/yyyy') || String(d.dataNascimento))
          : String(d.dataNascimento);
      }
      out = {
        found:      !!d.nome,
        nome:       d.nome || '',
        nascimento: nasc,
        nomeMae:    d.nomeMae || '',
        status:     d.situacaoCadastral || (d.nome ? 'Localizado' : 'Não encontrado')
      };
    }
  } catch (e) {
    out = { found: false, status: 'Erro: ' + e.message };
  }

  if (sheet) _papRegistrarLogAssertiva_(sheet, pcpf, parceiroNome, cpfLimpo, out, 'PAGO');
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. BUSCAR CLIENTE NAS CONSULTAS (para Card 3)
//    Retorna o registro de Crédito mais recente do CPF.
//    Fallback: qualquer consulta do CPF (Viabilidade).
//    Retorna: { found: bool, nome, protocolo, endereco }
// ══════════════════════════════════════════════════════════════════════════════
function buscarClienteConsultas(cpf) {
  const ss    = _getSpreadsheet_();
  const sheet = ss.getSheetByName(PAP_SHEET_CONSULTAS);
  if (!sheet || sheet.getLastRow() < 2) return { found: false };

  const cpfLimpo = _papNormCpf(cpf);
  const data     = sheet.getDataRange().getValues();

  // Colunas (0-based): A=0:ID B=1:TS C=2:Tipo D=3:Status E=4:Parceiro F=5:ParceiroCPF
  // G=6:CPFCliente H=7:Nome I=8:CEP J=9:Rua K=10:Num L=11:Comp M=12:Bairro N=13:Cidade O=14:UF
  const _extrairRegistro = (row) => ({
    found:      true,
    protocolo:  String(row[0]  || ''),
    cpf:        String(row[6]  || ''),
    nome:       String(row[7]  || ''),
    cep:        String(row[8]  || ''),
    rua:        String(row[9]  || ''),
    numero:     String(row[10] || ''),
    comp:       String(row[11] || ''),
    bairro:     String(row[12] || ''),
    cidade:     String(row[13] || ''),
    uf:         String(row[14] || ''),
    nascimento: String(row[15] || ''),
    nomeMae:    String(row[16] || ''),
    endereco:   [row[9], row[10], row[11], row[12], row[13] + (row[14] ? '/' + row[14] : '')]
                .filter(Boolean).join(', '),
  });

  // Prioridade: Crédito mais recente
  for (let i = data.length - 1; i >= 1; i--) {
    if (_papNormCpf(data[i][6]) === cpfLimpo && data[i][2] === 'Crédito') {
      return _extrairRegistro(data[i]);
    }
  }
  // Fallback: qualquer consulta com o CPF
  for (let i = data.length - 1; i >= 1; i--) {
    if (_papNormCpf(data[i][6]) === cpfLimpo) {
      return _extrairRegistro(data[i]);
    }
  }
  return { found: false };
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. SALVAR PRÉ-VENDA (Card 3 → staging, aguarda aprovação do backoffice)
//    Destino: aba "Pré-Vendas" com status "Pendente"
//    NÃO entra em "1 - Vendas" até ser aprovada (ver aprovarPreVenda)
//    Retorna: { ok: bool, id: string }
// ══════════════════════════════════════════════════════════════════════════════
function salvarPreVenda(data) {
  const sheet = _papGetOrCreateSheet(PAP_SHEET_PRE_VENDAS, HEADERS_PRE_VENDAS);
  const lock  = LockService.getScriptLock();
  let   pvId  = null;

  try {
    lock.waitLock(10000);
    pvId = _papGerarId('PV');

    // Garante os cabeçalhos das colunas de Assertiva (27/28) em sheets criadas
    // antes desta feature — cosmético, os dados são gravados de qualquer forma.
    try {
      var hdr = sheet.getRange(1, 27, 1, 3).getValues()[0];
      if (!hdr[0]) sheet.getRange(1, 27).setValue('Data Nascimento Cliente');
      if (!hdr[1]) sheet.getRange(1, 28).setValue('Nome Mãe Cliente');
      if (!hdr[2]) sheet.getRange(1, 29).setValue('Número Portado');
    } catch (he) { /* não bloqueia o save */ }

    sheet.appendRow([
      pvId,
      _papNow(),
      'Pendente',
      data.parceiro     || '',
      data.parceiroCpf  || '',
      data.cpfCliente   || '',
      data.nomeCliente  || '',
      data.cep          || '',
      data.protocoloRef || '',
      data.whatsapp     || '',
      data.email        || '',
      data.plano        || '',
      data.movel        || '',
      data.tipoMovel    || '',
      data.vencimento   || '',
      data.pagamento    || '',
      '',  // Data Decisão (preenchida ao aprovar/rejeitar)
      '',  // Decidido Por
      data.rua          || '',
      data.num          || '',
      data.complemento  || '',
      data.bairro       || '',
      data.cidade       || '',
      data.uf           || '',
      data.valor        || '',
      '',  // 25 Motivo Rejeição (preenchido ao rejeitar)
      data.nascimento    || '',  // 26 Data Nascimento (Assertiva)
      data.nomeMae       || '',  // 27 Nome da Mãe (Assertiva)
      data.numeroPortado || '',  // 28 Número Portado (quando Portabilidade)
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // Notificação fora do lock para não segurar a escrita durante chamada HTTP
  if (pvId) {
    try {
      const v = _papBuscarSubscriberVendedor(data.parceiroCpf, data.parceiro);
      if (v && v.whatsapp) {
        _papNotificarVendedorPAP('pv_recebida', v.whatsapp, {
          pap_pv_id:        pvId,
          pap_nome_cliente: data.nomeCliente || '',
          pap_plano:        data.plano       || '',
          pap_status:       'Recebida - em análise'
        });
      }
    } catch(ne) { Logger.log('salvarPreVenda notif: ' + ne.message); }
  }

  return { ok: true, id: pvId };
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. APROVAR PRÉ-VENDA
//    1. Atualiza status em "Pré-Vendas" → "Aprovado"
//    2. Busca endereço completo na aba "Consultas"
//    3. Cria linha em "1 - Vendas" com mapeamento correto de colunas
//    LockService: protege escrita dupla em ambas as abas
// ══════════════════════════════════════════════════════════════════════════════
function aprovarPreVenda(id, emailAprovador) {
  const ss      = _getSpreadsheet_();
  const sheetPV = ss.getSheetByName(PAP_SHEET_PRE_VENDAS);
  const sheetV  = ss.getSheetByName(PAP_SHEET_VENDAS);
  if (!sheetPV) return { ok: false, error: 'Aba "Pré-Vendas" não encontrada' };
  if (!sheetV)  return { ok: false, error: 'Aba "1 - Vendas" não encontrada' };

  const lock = LockService.getScriptLock();
  let resultado = { ok: false, error: 'Não executado' };
  let pvCopia   = null;

  try {
    lock.waitLock(12000);

    const data   = sheetPV.getDataRange().getValues();
    const rowIdx = data.findIndex((r, i) => i > 0 && r[0] === id);
    if (rowIdx < 0) { resultado = { ok: false, error: 'Pré-venda não encontrada: ' + id }; return resultado; }

    const pv = data[rowIdx];
    if (pv[2] !== 'Pendente') { resultado = { ok: false, error: 'Pré-venda já processada: ' + pv[2] }; return resultado; }

    const sheetRowPV = rowIdx + 1;
    // Endereço: usa campos do form (pv[7,18-23]) como primário; Consultas como fallback
    const end = _buscarEnderecoConsultas(pv[5]);

    const _pvCidade = String(pv[22] || end?.cidade || '').toUpperCase();
    const vendaPayload = {
      canal:         'PAP',
      produto:       _papInferirProduto(pv[12]),
      status:        '1- Conferencia/Ativação',
      preStatus:     'EM NEGOCIACAO',
      resp:          pv[3]  || '',
      cpf:           pv[5]  || '',
      cliente:       pv[6]  || '',
      dtNasc:        pv[26] || '',   // Data Nascimento (Assertiva, Máscara de Venda)
      nomeMae:       pv[27] || '',   // Nome da Mãe (Assertiva)
      whats:         pv[9]  || '',
      cep:           String(pv[7]  || end?.cep    || '').replace(/\D/g,'').replace(/(\d{5})(\d{3})/,'$1-$2'),
      rua:           String(pv[18] || end?.rua    || '').toUpperCase(),
      num:           String(pv[19] || end?.numero || ''),
      complemento:   String(pv[20] || end?.comp   || '').toUpperCase(),
      bairro:        String(pv[21] || end?.bairro || '').toUpperCase(),
      cidade:        _pvCidade,
      uf:            String(pv[23] || end?.uf     || '').toUpperCase(),
      sistema:       (typeof getSistemaPorCidade      === 'function') ? (getSistemaPorCidade(_pvCidade)      || '') : '',
      segmentacao:   (typeof getSegmentacaoPorCidade  === 'function') ? (getSegmentacaoPorCidade(_pvCidade)  || '') : '',
      venc:          pv[14] || '',
      fat:           pv[15] || '',
      plano:         pv[11] || '',
      valor:         pv[24] || '',
      linhaMovel:    pv[28] || '',   // número a ser portado (vazio em Número Novo)
      portabilidade: pv[13] || '',
      observacao:    _papMontarObservacaoPreVenda(pv),
      statusPAP:     'Em Aberto'
    };

    try {
      const novaVenda = _papConstruirLinhaVenda(vendaPayload);
      // Mesma lógica de salvarVenda: encontrar última linha com STATUS preenchido
      const ultimaSheet = sheetV.getLastRow();
      let novaLinha = 3;
      if (ultimaSheet >= 3) {
        const colStatus = sheetV.getRange(3, CONFIG.COLUNAS.STATUS + 1, ultimaSheet - 2, 1).getValues();
        for (let r = colStatus.length - 1; r >= 0; r--) {
          if (colStatus[r][0] !== '' && colStatus[r][0] !== null && colStatus[r][0] !== undefined) {
            novaLinha = r + 4; // r é 0-based iniciando em row 3, então row = r+3, próxima = r+4
            break;
          }
        }
      }
      sheetV.getRange(novaLinha, 1, 1, novaVenda.length).setValues([novaVenda]);
      _limparCache();
    } catch (err) {
      Logger.log('aprovarPreVenda ERRO ao inserir na Lista | id=' + id + ' | erro=' + err);
      resultado = { ok: false, error: 'Falha ao criar venda na Lista: ' + (err && err.message ? err.message : err) };
      return resultado;
    }

    // 3. Só marca como aprovado depois da venda entrar na Lista
    sheetPV.getRange(sheetRowPV, 3).setValue('Aprovado');
    sheetPV.getRange(sheetRowPV, 17).setValue(_papNow());
    sheetPV.getRange(sheetRowPV, 18).setValue(emailAprovador || 'backoffice');
    SpreadsheetApp.flush();
    pvCopia   = [...pv];
    resultado = { ok: true };
  } finally {
    lock.releaseLock();
  }

  // Notificação fora do lock para não segurar a escrita durante chamada HTTP
  if (resultado.ok && pvCopia) {
    try {
      const v = _papBuscarSubscriberVendedor(pvCopia[4], pvCopia[3]);
      if (v && v.whatsapp) {
        _papNotificarVendedorPAP('pv_aprovada', v.whatsapp, {
          pap_pv_id:        pvCopia[0],
          pap_nome_cliente: pvCopia[6] || '',
          pap_plano:        pvCopia[11] || '',
          pap_status:       'Aprovada - ativação em andamento pelo backoffice'
        });
      }
    } catch(ne) { Logger.log('aprovarPreVenda notif: ' + ne.message); }
  }

  return resultado;
}

// Helper: busca endereço na aba Consultas pelo CPF do cliente
function _buscarEnderecoConsultas(cpf) {
  const ss    = _getSpreadsheet_();
  const sheet = ss.getSheetByName(PAP_SHEET_CONSULTAS);
  if (!sheet || sheet.getLastRow() < 2) return null;

  const cpfLimpo = _papNormCpf(cpf);
  const data     = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (_papNormCpf(data[i][6]) === cpfLimpo) {
      return {
        cep:    data[i][8]  || '',
        rua:    data[i][9]  || '',
        numero: data[i][10] || '',
        comp:   data[i][11] || '',
        bairro: data[i][12] || '',
        cidade: data[i][13] || '',
        uf:     data[i][14] || '',
      };
    }
  }
  return null;
}

function _papConstruirLinhaVenda(payload) {
  if (typeof _construirLinhaDados === 'function') {
    return _construirLinhaDados(payload);
  }

  if (typeof CONFIG === 'undefined' || !CONFIG.COLUNAS || !CONFIG.TOTAL_COLUNAS) {
    throw new Error('CONFIG do CRM não disponível para montar a venda PAP.');
  }

  const linha = new Array(CONFIG.TOTAL_COLUNAS).fill('');
  const c = CONFIG.COLUNAS;

  linha[c.CANAL]         = payload.canal         || '';
  linha[c.PRODUTO]       = payload.produto       || '';
  linha[c.STATUS]        = payload.status        || '';
  linha[c.RESP]          = payload.resp          || '';
  linha[c.CPF]           = payload.cpf           || '';
  linha[c.CLIENTE]       = payload.cliente       || '';
  linha[c.WHATS]         = payload.whats         || '';
  linha[c.CEP]           = payload.cep           || '';
  linha[c.RUA]           = payload.rua           || '';
  linha[c.NUM]           = payload.num           || '';
  linha[c.COMPLEMENTO]   = payload.complemento   || '';
  linha[c.BAIRRO]        = payload.bairro        || '';
  linha[c.CIDADE]        = payload.cidade        || '';
  linha[c.UF]            = payload.uf            || '';
  linha[c.VENC]          = payload.venc          || '';
  linha[c.FAT]           = payload.fat           || '';
  linha[c.PLANO]         = payload.plano         || '';
  linha[c.LINHA_MOVEL]   = payload.linhaMovel    || '';
  linha[c.PORTABILIDADE] = payload.portabilidade || '';
  linha[c.OBSERVACAO]    = payload.observacao    || '';
  linha[c.PRE_STATUS]    = payload.preStatus     || '';
  linha[c.STATUS_PAP]    = payload.statusPAP     || 'Em Aberto';

  return linha;
}

function _papInferirProduto(movel) {
  const movelNorm = String(movel || '').trim().toUpperCase();
  return movelNorm === 'SIM' ? 'Fibra Combo' : 'Fibra Alone';
}

function _papMontarObservacaoPreVenda(pv) {
  const detalhes = [
    'Pré-venda PAP aprovada pelo backoffice',
    pv[8]  ? 'Consulta: ' + pv[8] : '',
    pv[10] ? 'Email: ' + pv[10] : '',
    pv[7]  ? 'CEP: ' + pv[7] : '',
    pv[28] ? 'Nº portado: ' + pv[28] : ''
  ].filter(Boolean);

  return detalhes.join(' | ');
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. REJEITAR PRÉ-VENDA
//    Marca como "Rejeitado" na aba "Pré-Vendas". Sem ação em "1 - Vendas".
//    Retorna: { ok: bool }
// ══════════════════════════════════════════════════════════════════════════════
function rejeitarPreVenda(id, emailRejeitor, motivo) {
  const ss    = _getSpreadsheet_();
  const sheet = ss.getSheetByName(PAP_SHEET_PRE_VENDAS);
  if (!sheet) return { ok: false, error: 'Aba "Pré-Vendas" não encontrada' };

  const lock = LockService.getScriptLock();
  let resultado = { ok: false, error: 'Não executado' };
  let pvCopia   = null;

  try {
    lock.waitLock(10000);

    const data   = sheet.getDataRange().getValues();
    const rowIdx = data.findIndex((r, i) => i > 0 && r[0] === id);
    if (rowIdx < 0)                      { resultado = { ok: false, error: 'Pré-venda não encontrada: ' + id }; return resultado; }
    if (data[rowIdx][2] !== 'Pendente')  { resultado = { ok: false, error: 'Pré-venda já processada: ' + data[rowIdx][2] }; return resultado; }

    const sheetRow = rowIdx + 1;
    sheet.getRange(sheetRow, 3).setValue('Rejeitado');
    sheet.getRange(sheetRow, 17).setValue(_papNow());
    sheet.getRange(sheetRow, 18).setValue(emailRejeitor || 'backoffice');
    if (motivo) sheet.getRange(sheetRow, 26).setValue(String(motivo));
    SpreadsheetApp.flush();
    pvCopia   = [...data[rowIdx]];
    resultado = { ok: true };
  } finally {
    lock.releaseLock();
  }

  // Notificação fora do lock para não segurar a escrita durante chamada HTTP
  if (resultado.ok && pvCopia) {
    try {
      const v = _papBuscarSubscriberVendedor(pvCopia[4], pvCopia[3]);
      if (v && v.whatsapp) {
        _papNotificarVendedorPAP('pv_rejeitada', v.whatsapp, {
          pap_pv_id:           pvCopia[0],
          pap_nome_cliente:    pvCopia[6] || '',
          pap_plano:           pvCopia[11] || '',
          pap_motivo_rejeicao: motivo || '',
          pap_status:          'Rejeitada'
        });
      }
    } catch(ne) { Logger.log('rejeitarPreVenda notif: ' + ne.message); }
  }

  return resultado;
}

function apagarConsulta(id) {
  return _papApagarRegistroPorId(PAP_SHEET_CONSULTAS, id, 'Consulta');
}

function apagarPreVenda(id) {
  return _papApagarRegistroPorId(PAP_SHEET_PRE_VENDAS, id, 'Pré-venda');
}

function _papApagarRegistroPorId(nomeAba, id, rotulo) {
  const ss = _getSpreadsheet_();
  const sheet = ss.getSheetByName(nomeAba);
  if (!sheet) return { ok: false, error: `Aba "${nomeAba}" não encontrada` };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: `${rotulo} não encontrada: ${id}` };

    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const idx = ids.findIndex(r => String(r[0] || '') === String(id || ''));
    if (idx < 0) return { ok: false, error: `${rotulo} não encontrada: ${id}` };

    sheet.deleteRow(idx + 2);
    SpreadsheetApp.flush();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. LISTAR PENDENTES — usado pelos alertas do CRM
//    Lê só a coluna de status de cada aba (leitura mínima).
//    Retorna: { ok: bool, consultas: N, preVendas: N, total: N }
// ══════════════════════════════════════════════════════════════════════════════
function listarPendentes() {
  const ss = _getSpreadsheet_();

  const contar = (nomeAba, colStatus) => {
    const sheet = ss.getSheetByName(nomeAba);
    if (!sheet || sheet.getLastRow() < 2) return 0;
    const vals = sheet
      .getRange(2, colStatus, sheet.getLastRow() - 1, 1)
      .getValues();
    return vals.filter(r => r[0] === 'Pendente').length;
  };

  const resumirPreVendas = () => {
    const sheet = ss.getSheetByName(PAP_SHEET_PRE_VENDAS);
    if (!sheet || sheet.getLastRow() < 2) return { total: 0, ultima: null };

    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
    let total = 0;
    let ultima = null;

    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (row[2] !== 'Pendente') continue;
      total++;
      if (!ultima) {
        ultima = {
          id:          String(row[0]  || ''),
          ts:          row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ''),
          parceiro:    String(row[3]  || ''),
          cpfCliente:  String(row[5]  || ''),
          nomeCliente: String(row[6]  || ''),
          whatsapp:    String(row[9]  || ''),
          plano:       String(row[11] || '')
        };
      }
    }

    return { total, ultima };
  };

  // Consultas: col D (4) = Status
  // Pré-Vendas: col C (3) = Status
  const consultas = contar(PAP_SHEET_CONSULTAS, 4);
  const preResumo = resumirPreVendas();
  return {
    ok: true,
    consultas,
    preVendas: preResumo.total,
    total: consultas + preResumo.total,
    ultimaPreVenda: preResumo.ultima
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. LISTAR CONSULTAS — para a página FilaPAP.html
//    filtro: 'Pendente' | 'Concluído' | 'Todos'
//    Retorna os 50 mais recentes que batem no filtro.
// ══════════════════════════════════════════════════════════════════════════════
function listarConsultas(filtro) {
  const ss    = _getSpreadsheet_();
  const sheet = ss.getSheetByName(PAP_SHEET_CONSULTAS);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, items: [] };

  const data  = sheet.getDataRange().getValues();
  const items = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (filtro && filtro !== 'Todos' && String(row[3]) !== filtro) continue;
    items.push({
      id:          String(row[0]  || ''),
      ts:          row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ''),
      tipo:        String(row[2]  || ''),
      status:      String(row[3]  || ''),
      parceiro:    String(row[4]  || ''),
      cpfCliente:  String(row[6]  || ''),
      nomeCliente: String(row[7]  || ''),
      bairro:      String(row[12] || ''),
      cidade:      String(row[13] || '') + (row[14] ? '/' + String(row[14]) : ''),
    });
    if (items.length >= 50) break;
  }
  return { ok: true, items };
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. LISTAR PRÉ-VENDAS — para a página FilaPAP.html
//     filtro: 'Pendente' | 'Aprovado' | 'Rejeitado' | 'Todos'
// ══════════════════════════════════════════════════════════════════════════════
function listarPreVendas(filtro) {
  const ss    = _getSpreadsheet_();
  const sheet = ss.getSheetByName(PAP_SHEET_PRE_VENDAS);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, items: [] };

  const data  = sheet.getDataRange().getValues();
  const items = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (filtro && filtro !== 'Todos' && row[2] !== filtro) continue;
    items.push({
      id:           String(row[0]  || ''),
      ts:           row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ''),
      status:       String(row[2]  || ''),
      parceiro:     String(row[3]  || ''),
      cpfCliente:   String(row[5]  || ''),
      nomeCliente:  String(row[6]  || ''),
      cep:          String(row[7]  || ''),
      protocoloRef: String(row[8]  || ''),
      whatsapp:     String(row[9]  || ''),
      email:        String(row[10] || ''),
      plano:        String(row[11] || ''),
      movel:        String(row[12] || ''),
      tipoMovel:    String(row[13] || ''),
      vencimento:   row[14] instanceof Date ? row[14].toISOString() : String(row[14] || ''),
      pagamento:    String(row[15] || ''),
      rua:          String(row[18] || ''),
      num:          String(row[19] || ''),
      complemento:  String(row[20] || ''),
      bairro:       String(row[21] || ''),
      cidade:       String(row[22] || ''),
      uf:           String(row[23] || ''),
      valor:        String(row[24] || ''),
    });
    if (items.length >= 50) break;
  }
  return { ok: true, items };
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS PRIVADOS
// ══════════════════════════════════════════════════════════════════════════════

function _papGerarId(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase().slice(-6);
}

function _papNow() {
  return Utilities.formatDate(
    new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss'
  );
}

function _papNormCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

// Cria a aba com cabeçalho se ela não existir
function _papGetOrCreateSheet(name, headers) {
  const ss    = _getSpreadsheet_();
  let   sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold')
               .setBackground('#141720')
               .setFontColor('#e4e8f5');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. NOTIFICAÇÕES PAP — Evolution API (chip 5532991534154)
//     Dispara mensagens de texto para vendedores PAP nos 5 eventos do ciclo
//     da pré-venda + pagamento. Migrado do BotConversa para Evolution em
//     27/05/2026 devido à descontinuidade do serviço BC. Usa a instância
//     `Ricardo_Andrade` (mesmo chip do disparo-grupo Flow 1 — risco de
//     compartilhamento aceito por Ricardo). Respostas dos vendedores ficam
//     no próprio chip (não roteiam pro CRM).
//
//     Kill switch: Script Property `PAP_CANAL_NOTIFICACAO`
//        'EVOLUTION' (default, ausente) → envia
//        'OFF'                          → no-op silencioso (mantém pagamento, suprime msg)
// ══════════════════════════════════════════════════════════════════════════════

// Instância Evolution usada pelos disparos PAP. Mesma do disparo-grupo Flow 1.
var PAP_EVOLUTION_INSTANCE = 'Ricardo_Andrade';

// Busca dados do vendedor na aba "3 - PAP" por CPF (prioridade) ou por nome.
// Retorna { whatsapp, nome } ou null. Cols lidas a partir de S (col 19,
// 1-based): S=nome T=(legacy bcId — não mais usado) U=whats V=dataCad W=cpf
function _papBuscarSubscriberVendedor(cpf, nome) {
  try {
    const sh = _getSpreadsheet_().getSheetByName('3 - PAP');
    if (!sh || sh.getLastRow() < PAP_FIRST_ROW) return null;
    // Range cobre S (nome) até AC (ativo) — 11 cols. Vendedor inativo é
    // tratado como inexistente (suprime notificação Evolution).
    const numCols = PAP_COL_ATIVO - PAP_COL_NOME + 1;
    const raw      = sh.getRange(PAP_FIRST_ROW, PAP_COL_NOME, sh.getLastRow() - PAP_FIRST_ROW + 1, numCols).getValues();
    const cpfLimpo = cpf  ? String(cpf).replace(/\D/g, '')           : '';
    const nomeBusc = nome ? String(nome).trim().toLowerCase()         : '';
    for (let i = 0; i < raw.length; i++) {
      const rowNome  = String(raw[i][0] || '').trim();
      const rowWhats = String(raw[i][PAP_COL_WHATS - PAP_COL_NOME] || '').trim();
      const rowCpf   = String(raw[i][PAP_COL_CPF   - PAP_COL_NOME] || '').replace(/\D/g, '');
      const rowAtivo = _papEhAtivo_(raw[i][PAP_COL_ATIVO - PAP_COL_NOME]);
      const match    = (cpfLimpo && rowCpf   && rowCpf === cpfLimpo) ||
                       (nomeBusc && rowNome  && rowNome.toLowerCase() === nomeBusc);
      if (!match) continue;
      if (!rowAtivo) return null;
      if (!rowWhats) return null;
      return { whatsapp: rowWhats, nome: rowNome };
    }
    return null;
  } catch(e) {
    Logger.log('_papBuscarSubscriberVendedor erro: ' + e.message);
    return null;
  }
}

// Normaliza qualquer telefone BR para o formato "number" aceito pela Evolution
// v1.8.x: dígitos puros com DDI 55, sem `@s.whatsapp.net` (rejeitado em DM com
// `Bad request — exists:false`). Vendedores PAP são sempre celular: garante o
// dígito 9 entre DDD e número quando vier no formato legado de 8 dígitos.
function _papPhoneToEvolutionNumber_(whatsapp) {
  // _normalizePhoneBR_ reduz a 10 dígitos canônicos (DDD + 8) — compartilhado
  // com o módulo wa-pessoal (DispPessoalAPI.js).
  const norm = _normalizePhoneBR_(whatsapp);
  if (!norm || norm.length < 10) return null;
  const ddd   = norm.substr(0, 2);
  const resto = norm.substr(2);
  // Mobile BR: prepend "9" quando vier no formato antigo de 8 dígitos.
  const numeroSemDDI = (resto.length === 8) ? (ddd + '9' + resto) : (ddd + resto);
  return '55' + numeroSemDDI;
}

// Envia mensagem de texto ao vendedor PAP via Evolution API (chip 5532991534154).
// Compatível com a assinatura anterior do `_papEnviarMensagemDireta(subscriberId, msg)`
// — o 1º arg agora carrega o WhatsApp do vendedor em vez do subscriber_id BC.
// Retorna { sucesso, mensagem }.
function _papEnviarMensagemDireta(whatsapp, mensagem) {
  const canal = (PropertiesService.getScriptProperties().getProperty('PAP_CANAL_NOTIFICACAO') || 'EVOLUTION').toUpperCase();
  if (canal === 'OFF') {
    Logger.log('_papEnviarMensagemDireta: PAP_CANAL_NOTIFICACAO=OFF — disparo suprimido.');
    return { sucesso: true, mensagem: 'Canal de notificação desligado (kill switch).' };
  }
  return _papEnviarMensagemEvolution_(whatsapp, mensagem);
}

// Helper interno: efetiva o POST /message/sendText na Evolution.
function _papEnviarMensagemEvolution_(whatsapp, mensagem) {
  try {
    const p = PropertiesService.getScriptProperties();
    const url = p.getProperty('EVOLUTION_API_URL');
    const key = p.getProperty('EVOLUTION_API_KEY');
    if (!url || !key) {
      Logger.log('_papEnviarMensagemEvolution_: EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes em Script Properties.');
      return { sucesso: false, mensagem: 'Evolution API não configurada.' };
    }
    const numero = _papPhoneToEvolutionNumber_(whatsapp);
    if (!numero) {
      Logger.log('_papEnviarMensagemEvolution_: WhatsApp inválido (' + whatsapp + ').');
      return { sucesso: false, mensagem: 'WhatsApp inválido: ' + whatsapp };
    }
    const endpoint = url.replace(/\/+$/, '') + '/message/sendText/' + PAP_EVOLUTION_INSTANCE;
    const resp = UrlFetchApp.fetch(endpoint, {
      method             : 'post',
      contentType        : 'application/json',
      headers            : { 'apikey': key },
      payload            : JSON.stringify({
        number      : numero,
        text        : String(mensagem == null ? '' : mensagem),
        delay       : 800
      }),
      muteHttpExceptions : true
    });
    const code = resp.getResponseCode();
    if (code >= 200 && code < 300) return { sucesso: true };
    Logger.log('_papEnviarMensagemEvolution_ HTTP ' + code + ': ' + resp.getContentText().slice(0, 300));
    return { sucesso: false, mensagem: 'HTTP ' + code };
  } catch(e) {
    Logger.log('_papEnviarMensagemEvolution_ erro: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}

// Monta o texto da notificação PAP conforme o evento.
function _papMontarMensagemNotificacao(evento, dados) {
  const cliente   = dados.pap_nome_cliente || '';
  const plano     = dados.pap_plano        || '';
  const protocolo = dados.pap_pv_id        || '';

  const rodape = '\n\n👤 Cliente: ' + cliente +
                 '\n📦 Plano: '    + plano;

  switch (evento) {
    case 'pv_recebida':
      return '✅ *Pré-venda recebida!*\n\n' +
             'Recebemos sua pré-venda e ela está sendo analisada pelo nosso backoffice.' +
             rodape +
             '\n🔖 Protocolo: ' + protocolo +
             '\n\nVocê será notificado assim que houver uma decisão.';

    case 'pv_aprovada':
      return '🎉 *Pré-venda aprovada!*\n\n' +
             'Sua pré-venda foi aprovada. A ativação está sendo realizada pelo nosso backoffice.' +
             rodape +
             '\n🔖 Protocolo: ' + protocolo +
             '\n\nEm breve você receberá a confirmação do agendamento da instalação.';

    case 'pv_rejeitada': {
      const motivoTexto = dados.pap_motivo_rejeicao
        ? '\n\n📋 *Motivo:* ' + dados.pap_motivo_rejeicao
        : '\n\nEntre em contato com o backoffice para mais informações.';
      return '❌ *Pré-venda não aprovada*\n\n' +
             'Infelizmente sua pré-venda não pôde ser aprovada.' +
             rodape +
             '\n🔖 Protocolo: ' + protocolo +
             motivoTexto;
    }

    case 'aguardando_instalacao': {
      const agenda = dados.pap_agenda || '';
      const turno  = dados.pap_turno  || '';
      const agendaStr = agenda ? '\n📅 Agendamento: ' + agenda + (turno ? ' — ' + turno : '') : '';
      return '📅 *Instalação agendada!*\n\n' +
             'A venda foi ativada e está com instalação agendada pela Vero.' +
             rodape + agendaStr +
             '\n\nAssim que for instalada, você será notificado.';
    }

    case 'instalada': {
      const agenda2    = dados.pap_agenda || '';
      const turno2     = dados.pap_turno  || '';
      const agendaStr2 = agenda2 ? '\n📅 Agendamento: ' + agenda2 + (turno2 ? ' — ' + turno2 : '') : '';
      return '🏠 *Instalação concluída!*\n\n' +
             'Parabéns! A instalação do seu cliente foi realizada com sucesso.' +
             rodape + agendaStr2 +
             '\n\nComissão registrada. Vamos pra próxima! 💪';
    }

    default:
      return 'Notificação PAP: ' + evento + rodape;
  }
}

// Orquestra notificação PAP: monta mensagem formatada → envia direto ao vendedor.
// evento: 'pv_recebida' | 'pv_aprovada' | 'pv_rejeitada' |
//         'aguardando_instalacao' | 'instalada'
// whatsapp: telefone do vendedor (qualquer formato BR; normalizado pelo helper).
// dados: { pap_pv_id?, pap_nome_cliente, pap_plano }
// Nunca lança exceção — todos os erros são apenas logados.
function _papNotificarVendedorPAP(evento, whatsapp, dados) {
  try {
    const mensagem = _papMontarMensagemNotificacao(evento, dados);
    const res      = _papEnviarMensagemDireta(whatsapp, mensagem);
    Logger.log('_papNotificarVendedorPAP [' + evento + '] whats=' + whatsapp +
               ' → ' + JSON.stringify(res));
  } catch(e) {
    Logger.log('_papNotificarVendedorPAP erro [' + evento + ']: ' + e.message);
  }
}

// Prévia da notificação que seria enviada ao vendedor PAP numa transição de
// status para 2/3 — alimenta o modal de confirmação no frontend ANTES do
// disparo. Leitura leve (1 linha); não chama a BotConversa (a resolução do
// subscriber, que faz HTTP, fica para o disparo real). Reusa
// `_papMontarMensagemNotificacao` para não duplicar o texto.
// `extras` (opcional): { agenda, turno } — quando a agenda/turno foram digitados
// no frontend mas ainda não gravados na planilha (ex.: mover lead), passamos os
// valores aqui para a prévia bater com a mensagem que será de fato enviada.
// Retorna { ok, isPap, vendedorNome, clienteNome, evento, mensagem }.
function getPreviewNotificacaoVendedor(linha, novoStatus, extras) {
  try {
    linha = parseInt(linha, 10);
    if (!linha || linha < 3) return { ok: false, isPap: false };
    var st          = String(novoStatus || '').trim();
    var ehInstalada = (st === '3 - Finalizada/Instalada');
    var ehAgInst    = (st === '2- Aguardando Instalação');
    if (!ehInstalada && !ehAgInst) return { ok: true, isPap: false };

    var c      = CONFIG.COLUNAS;
    var rowPAP = _getSheet().getRange(linha, 1, 1, c.CLIENTE + 1).getValues()[0];
    if (rowPAP[c.CANAL] !== 'PAP') return { ok: true, isPap: false };

    extras = extras || {};
    var evento   = ehInstalada ? 'instalada' : 'aguardando_instalacao';
    var fmtData  = function(v){ if(!v) return ''; var d = new Date(v); return isNaN(d) ? String(v) : Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy'); };
    var agenda   = extras.agenda ? fmtData(extras.agenda) : fmtData(rowPAP[c.AGENDA]);
    var turno    = (extras.turno != null && String(extras.turno).trim() !== '') ? String(extras.turno) : String(rowPAP[c.TURNO] || '');
    var mensagem = _papMontarMensagemNotificacao(evento, {
      pap_nome_cliente: String(rowPAP[c.CLIENTE] || ''),
      pap_plano:        String(rowPAP[c.PLANO]   || ''),
      pap_agenda:       agenda,
      pap_turno:        turno,
      pap_status:       st
    });
    return {
      ok:           true,
      isPap:        true,
      vendedorNome: String(rowPAP[c.RESP]    || ''),
      clienteNome:  String(rowPAP[c.CLIENTE] || ''),
      evento:       evento,
      mensagem:     mensagem
    };
  } catch(e) {
    Logger.log('getPreviewNotificacaoVendedor erro: ' + e.message);
    return { ok: false, isPap: false, erro: e.message };
  }
}

// Dispara a mensagem ao vendedor PAP para a venda na `linha` — chamada pelo
// fluxo "salvar primeiro, perguntar depois" quando o backoffice clica SIM.
// Lê a linha já salva (agenda/turno/status atuais), resolve o subscriber no
// BotConversa e envia. Retorna { ok, mensagem }. Não lança.
function enviarNotificacaoVendedor(linha, novoStatus) {
  try {
    linha = parseInt(linha, 10);
    if (!linha || linha < 3) return { ok: false, mensagem: 'Linha inválida.' };
    var c      = CONFIG.COLUNAS;
    var rowPAP = _getSheet().getRange(linha, 1, 1, c.CLIENTE + 1).getValues()[0];
    var st     = String(novoStatus || '').trim() || String(rowPAP[c.STATUS] || '').trim();
    var ehInstalada = (st === '3 - Finalizada/Instalada');
    var ehAgInst    = (st === '2- Aguardando Instalação');
    if (!ehInstalada && !ehAgInst) return { ok: false, mensagem: 'Status não notificável.' };
    if (rowPAP[c.CANAL] !== 'PAP')  return { ok: false, mensagem: 'Venda não é do canal PAP.' };
    var vPAP = _papBuscarSubscriberVendedor(null, rowPAP[c.RESP]);
    if (!vPAP || !vPAP.whatsapp) return { ok: false, mensagem: 'Vendedor sem WhatsApp cadastrado na aba "3 - PAP".' };

    var evento  = ehInstalada ? 'instalada' : 'aguardando_instalacao';
    var agenda  = (function(v){ if(!v) return ''; var d = new Date(v); return isNaN(d) ? String(v) : Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy'); })(rowPAP[c.AGENDA]);
    var msg = _papMontarMensagemNotificacao(evento, {
      pap_nome_cliente: String(rowPAP[c.CLIENTE] || ''),
      pap_plano:        String(rowPAP[c.PLANO]   || ''),
      pap_agenda:       agenda,
      pap_turno:        String(rowPAP[c.TURNO]   || ''),
      pap_status:       st
    });
    var res = _papEnviarMensagemDireta(vPAP.whatsapp, msg);
    if (res && res.sucesso) {
      Logger.log('enviarNotificacaoVendedor [' + evento + '] linha ' + linha + ' → enviado para ' + vPAP.whatsapp);
      return { ok: true };
    }
    return { ok: false, mensagem: (res && res.mensagem) || 'Falha no envio.' };
  } catch(e) {
    Logger.log('enviarNotificacaoVendedor erro: ' + e.message);
    return { ok: false, mensagem: e.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO DASHBOARD + PONTOS PAP — adicionado 04/05/2026
// ══════════════════════════════════════════════════════════════════════════════

const PAP_SHEET_PREMIOS  = 'PAP Premios';
const PAP_SHEET_RESGATES = 'PAP Resgates';

const HEADERS_PREMIOS = [
  'ID', 'Nome', 'Descricao', 'Pontos', 'Imagem URL', 'Disponivel', 'Estoque'
];
const HEADERS_RESGATES = [
  'ID', 'Timestamp', 'CPF Parceiro', 'Nome Parceiro',
  'Premio ID', 'Premio Nome', 'Pontos', 'Status', 'Data Entrega', 'Observacao'
];

function getMinhaDashboard(cpf) {
  const cpfLimpo = _papNormCpf(cpf);
  if (!cpfLimpo) return { ok: false, error: 'CPF inválido' };
  const auth = autenticarParceiro(cpfLimpo);
  if (!auth.found) return { ok: false, error: 'Parceiro não autenticado' };
  const nomeParceiro = auth.nome || '';
  const ss = _getSpreadsheet_();

  const sheetPV = ss.getSheetByName(PAP_SHEET_PRE_VENDAS);
  const preVendas = [];
  if (sheetPV && sheetPV.getLastRow() >= 2) {
    const pvData = sheetPV.getDataRange().getValues();
    for (let i = pvData.length - 1; i >= 1; i--) {
      const row = pvData[i];
      if (_papNormCpf(row[4]) !== cpfLimpo) continue;
      preVendas.push({
        id:          String(row[0]  || ''),
        ts:          row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ''),
        status:      String(row[2]  || ''),
        nomeCliente: String(row[6]  || ''),
        plano:       String(row[11] || ''),
        movel:       String(row[12] || ''),
        valor:       String(row[24] || ''),
        whatsapp:    String(row[9]  || ''),
        cidade:      String(row[22] || ''),
        motivo:      String(row[25] || ''),
      });
      if (preVendas.length >= 30) break;
    }
  }

  const vendasAtivas = [];
  const sheetV = ss.getSheetByName(PAP_SHEET_VENDAS);
  if (sheetV && sheetV.getLastRow() >= 3 && nomeParceiro && typeof CONFIG !== 'undefined') {
    const c = CONFIG.COLUNAS;
    const numRows = sheetV.getLastRow() - 2;
    if (numRows > 0) {
      const maxCol = Math.max(c.CANAL, c.STATUS, c.RESP, c.CLIENTE||0, c.PLANO||0, c.PRODUTO||0,
                              c.STATUS_PAP||0, c.INSTAL||0, c.DATA_ATIV||0, c.AGENDA||0,
                              c.CIDADE||0, c.WHATS||0, c.CONTRATO||0, c.VALOR||0) + 1;
      const raw = sheetV.getRange(3, 1, numRows, maxCol).getValues();
      const nomeNorm = nomeParceiro.trim().toLowerCase();
      const _stripD = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'');
      const _fmtD   = v => v instanceof Date ? v.toISOString() : String(v||'');
      for (let i = raw.length - 1; i >= 0; i--) {
        const row = raw[i];
        if (String(row[c.CANAL]||'').toUpperCase() !== 'PAP') continue;
        if (String(row[c.RESP]||'').trim().toLowerCase() !== nomeNorm) continue;
        const prodNorm = _stripD(String(row[c.PRODUTO]||'').trim().toUpperCase());
        if (prodNorm !== 'FIBRA ALONE' && prodNorm !== 'FIBRA COMBO') continue;
        vendasAtivas.push({
          cliente:    String(row[c.CLIENTE    ||0]||''),
          plano:      String(row[c.PLANO      ||0]||''),
          produto:    String(row[c.PRODUTO    ||0]||''),
          status:     String(row[c.STATUS]        ||''),
          preStatus:  String(row[c.PRE_STATUS ||0]||''),  // col C — Pré-Status
          statusPAP:  String(row[c.STATUS_PAP ||0]||''),
          valor:      String(row[c.VALOR      ||0]||''),
          dataInstal: _fmtD(row[c.INSTAL      ||0]),
          dataAtiv:   _fmtD(row[c.DATA_ATIV   ||0]),
          agenda:     _fmtD(row[c.AGENDA      ||0]),
          cidade:     String(row[c.CIDADE     ||0]||''),
          whats:      String(row[c.WHATS      ||0]||''),
          contrato:   String(row[c.CONTRATO   ||0]||''),
        });
        if (vendasAtivas.length >= 50) break;
      }
    }
  }

  const pontosInfo = _calcularPontos(cpfLimpo, nomeParceiro);
  return { ok: true, nomeParceiro, preVendas, vendasAtivas,
           pontos: { saldo: pontosInfo.saldo, instaladas: pontosInfo.instaladas } };
}

// LEGADO — substituído pelo ledger (Fase 1). Régua antiga (1/2 por instalação,
// matching por nome). Mantido dormente até a Fase 2 migrar os leitores
// (getMinhaDashboard/getExtratoPontos/resgatarPremio) para getSaldoPontos.
function _calcularPontos(cpfLimpo, nomeParceiro) {
  const ss = _getSpreadsheet_();
  let pontosBrutos = 0, instaladas = 0;

  const sheetV = ss.getSheetByName(PAP_SHEET_VENDAS);
  if (sheetV && sheetV.getLastRow() >= 3 && nomeParceiro && typeof CONFIG !== 'undefined') {
    const c = CONFIG.COLUNAS;
    const numRows = sheetV.getLastRow() - 2;
    if (numRows > 0) {
      const maxCol = Math.max(c.CANAL, c.STATUS, c.RESP, c.PRODUTO||0) + 1;
      const raw = sheetV.getRange(3, 1, numRows, maxCol).getValues();
      const nomeNorm = nomeParceiro.trim().toLowerCase();
      for (const row of raw) {
        if (String(row[c.CANAL]||'').toUpperCase() !== 'PAP') continue;
        if (String(row[c.RESP]||'').trim().toLowerCase() !== nomeNorm) continue;
        const status = String(row[c.STATUS]||'');
        if (!status.match(/^4/) && !status.toLowerCase().includes('instalad') && !status.toLowerCase().includes('ativo')) continue;
        instaladas++;
        pontosBrutos += String(row[c.PRODUTO||0]||'').toUpperCase().includes('COMBO') ? 2 : 1;
      }
    }
  }

  let pontosGastos = 0;
  const sheetR = ss.getSheetByName(PAP_SHEET_RESGATES);
  if (sheetR && sheetR.getLastRow() >= 2) {
    const rData = sheetR.getDataRange().getValues();
    for (let i = 1; i < rData.length; i++) {
      if (_papNormCpf(rData[i][2]) !== cpfLimpo) continue;
      if (String(rData[i][7]||'') === 'Cancelado') continue;
      pontosGastos += Number(rData[i][6]||0);
    }
  }
  return { saldo: Math.max(0, pontosBrutos - pontosGastos), instaladas, pontosBrutos, pontosGastos };
}

function getCatalogoPremios() {
  const sheet = _papGetOrCreateSheet(PAP_SHEET_PREMIOS, HEADERS_PREMIOS);
  if (sheet.getLastRow() < 2) {
    const seed = [
      ['P001','Camiseta Mobile Digital','Camiseta exclusiva da equipe',10,'','SIM',''],
      ['P002','Vale Presente R$ 50','Voucher para parceiros credenciados',25,'','SIM',''],
      ['P003','Vale Presente R$ 100','Voucher para parceiros credenciados',50,'','SIM',''],
      ['P004','Fone Bluetooth','Fone sem fio de alta qualidade',80,'','SIM',5],
      ['P005','Smartwatch','Relógio inteligente — estoque limitado',150,'','SIM',2],
    ];
    seed.forEach(r => sheet.appendRow(r));
    SpreadsheetApp.flush();
  }
  const data = sheet.getDataRange().getValues();
  const premios = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[5]||'').toUpperCase() !== 'SIM') continue;
    premios.push({ id: String(row[0]||''), nome: String(row[1]||''), descricao: String(row[2]||''),
                   pontos: Number(row[3]||0), imagem: String(row[4]||''),
                   estoque: (row[6]!==''&&row[6]!==null) ? Number(row[6]) : null });
  }
  return { ok: true, premios };
}

function getExtratoPontos(cpf) {
  const cpfLimpo = _papNormCpf(cpf);
  if (!cpfLimpo) return { ok: false, error: 'CPF inválido' };
  const auth = autenticarParceiro(cpfLimpo);
  if (!auth.found) return { ok: false, error: 'Parceiro não autenticado' };
  const { saldo, instaladas, pontosBrutos, pontosGastos } = _calcularPontos(cpfLimpo, auth.nome);

  const sheetR = _getSpreadsheet_().getSheetByName(PAP_SHEET_RESGATES);
  const resgates = [];
  if (sheetR && sheetR.getLastRow() >= 2) {
    const rData = sheetR.getDataRange().getValues();
    for (let i = rData.length - 1; i >= 1; i--) {
      if (_papNormCpf(rData[i][2]) !== cpfLimpo) continue;
      resgates.push({ id: String(rData[i][0]||''),
        ts: rData[i][1] instanceof Date ? rData[i][1].toISOString() : String(rData[i][1]||''),
        premioNome: String(rData[i][5]||''), pontos: Number(rData[i][6]||0),
        status: String(rData[i][7]||''),
        entrega: rData[i][8] instanceof Date ? rData[i][8].toISOString() : String(rData[i][8]||'') });
      if (resgates.length >= 20) break;
    }
  }
  return { ok: true, saldo, instaladas, pontosBrutos, pontosGastos, resgates };
}

function resgatarPremio(cpf, premioId) {
  const cpfLimpo = _papNormCpf(cpf);
  if (!cpfLimpo) return { ok: false, error: 'CPF inválido' };
  const auth = autenticarParceiro(cpfLimpo);
  if (!auth.found) return { ok: false, error: 'Parceiro não encontrado' };

  const sheetP = _getSpreadsheet_().getSheetByName(PAP_SHEET_PREMIOS);
  if (!sheetP) return { ok: false, error: 'Catálogo não encontrado' };

  const pData = sheetP.getDataRange().getValues();
  let premioRow = null, premioLine = -1;
  for (let i = 1; i < pData.length; i++) {
    if (String(pData[i][0]) === String(premioId)) { premioRow = pData[i]; premioLine = i + 1; break; }
  }
  if (!premioRow) return { ok: false, error: 'Prêmio não encontrado' };
  if (String(premioRow[5]||'').toUpperCase() !== 'SIM') return { ok: false, error: 'Prêmio indisponível' };

  const custoPontos = Number(premioRow[3]||0);
  const estoque = (premioRow[6]!==''&&premioRow[6]!==null) ? Number(premioRow[6]) : null;
  if (estoque !== null && estoque <= 0) return { ok: false, error: 'Estoque esgotado' };

  const { saldo: saldoPre } = _calcularPontos(cpfLimpo, auth.nome);
  if (saldoPre < custoPontos) return { ok: false, error: `Você tem ${saldoPre} pts, precisa de ${custoPontos} pts.` };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(12000);
    const { saldo } = _calcularPontos(cpfLimpo, auth.nome);
    if (saldo < custoPontos) return { ok: false, error: `Saldo insuficiente (${saldo} pts).` };

    const sheetR = _papGetOrCreateSheet(PAP_SHEET_RESGATES, HEADERS_RESGATES);
    const resId = _papGerarId('RS');
    sheetR.appendRow([resId, _papNow(), cpfLimpo, auth.nome,
      String(premioRow[0]), String(premioRow[1]), custoPontos, 'Pendente', '', '']);

    if (estoque !== null) {
      const novo = estoque - 1;
      sheetP.getRange(premioLine, 7).setValue(novo);
      if (novo <= 0) sheetP.getRange(premioLine, 6).setValue('NÃO');
    }
    SpreadsheetApp.flush();
    return { ok: true, id: resId, pontosSaldo: saldo - custoPontos, premioNome: String(premioRow[1]) };
  } finally {
    lock.releaseLock();
  }
}

// ── Pagamentos PAP do vendedor logado ──────────────────────────────────────
// Retorna as vendas com STATUS_PAP="Em Aberto" e calcula a comissão devida.
function getMeusPagamentosPAP(cpf) {
  const cpfLimpo = _papNormCpf(cpf);
  if (!cpfLimpo) return { ok: false, error: 'CPF inválido' };
  const auth = autenticarParceiro(cpfLimpo);
  if (!auth.found) return { ok: false, error: 'Parceiro não autenticado' };
  const nomeParceiro = auth.nome || '';
  const ss = _getSpreadsheet_();

  // Lê config do vendedor na aba "3 - PAP" (cols S-AB, 1-based 19-28)
  // S=0(nome) T=1(idbot) U=2(whats) V=3(dataCad) W=4(cpf) X=5(chavePix) Y=6 Z=7 AA=8(forma) AB=9(period)
  let formaPgto = '', periodicidade = '', chavePix = '';
  const shPAP = ss.getSheetByName('3 - PAP');
  if (shPAP && shPAP.getLastRow() >= 2) {
    const rawPAP = shPAP.getRange(2, 19, shPAP.getLastRow() - 1, 10).getValues();
    for (const r of rawPAP) {
      if (_papNormCpf(String(r[4]||'')) === cpfLimpo) {
        chavePix      = String(r[5]||'').trim();
        formaPgto     = String(r[8]||'').trim();
        periodicidade = String(r[9]||'').trim();
        break;
      }
    }
  }

  if (!formaPgto) {
    return { ok: true, semConfig: true, totalComissao: 0, qtd: 0,
             formaPgto: '', periodicidade: '', chavePix: '', itens: [] };
  }

  if (!nomeParceiro || typeof CONFIG === 'undefined') {
    return { ok: true, totalComissao: 0, qtd: 0, formaPgto, periodicidade, chavePix, itens: [] };
  }

  const sheetV = ss.getSheetByName(PAP_SHEET_VENDAS);
  if (!sheetV || sheetV.getLastRow() < 3) {
    return { ok: true, totalComissao: 0, qtd: 0, formaPgto, periodicidade, chavePix, itens: [] };
  }

  const c = CONFIG.COLUNAS;
  const numRows = sheetV.getLastRow() - 2;
  const raw = sheetV.getRange(3, 1, numRows, c.STATUS_PAP + 2).getValues();
  const nomeNorm = nomeParceiro.trim().toLowerCase();
  const stripD = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'');
  const fNorm = stripD(formaPgto.toUpperCase());

  let totalComissao = 0;   // a receber (STATUS_PAP = "Em Aberto")
  let totalPago     = 0;   // já recebido (STATUS_PAP = "Pago")
  const itens      = [];   // a receber
  const itensPagos = [];   // recebido

  for (const row of raw) {
    if (String(row[c.CANAL]||'').toUpperCase() !== 'PAP') continue;
    if (String(row[c.RESP]||'').trim().toLowerCase() !== nomeNorm) continue;
    const prodNorm = stripD(String(row[c.PRODUTO]||'').trim().toUpperCase());
    if (prodNorm !== 'FIBRA ALONE' && prodNorm !== 'FIBRA COMBO') continue;
    if (String(row[c.STATUS]||'').trim() !== '3 - Finalizada/Instalada') continue;

    const statusPapNorm = stripD(String(row[c.STATUS_PAP]||'').trim().toUpperCase());
    const ehAberto = statusPapNorm === 'EM ABERTO';
    const ehPago   = statusPapNorm === 'PAGO';
    if (!ehAberto && !ehPago) continue;

    const valor = parseFloat(row[c.VALOR]||0) || 0;
    let comissao;
    if (fNorm === 'VALOR DO PLANO')  comissao = valor;
    else if (fNorm === 'VALOR FIXO') comissao = 100;
    else continue;

    const dInstal = row[c.INSTAL];
    const item = {
      cliente:    String(row[c.CLIENTE] ||''),
      plano:      String(row[c.PLANO]   ||''),
      produto:    String(row[c.PRODUTO] ||''),
      valor,
      comissao,
      dataInstal: dInstal instanceof Date ? dInstal.toISOString() : String(dInstal||''),
    };
    if (ehAberto) { totalComissao += comissao; itens.push(item); }
    else          { totalPago     += comissao; itensPagos.push(item); }
  }

  return { ok: true,
           totalComissao, qtd: itens.length,
           totalPago, qtdPago: itensPagos.length,
           formaPgto, periodicidade, chavePix, itens, itensPagos };
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. CADASTRO DE VENDEDORES PAP (admin/backoffice)
//     CRUD direto na aba "3 - PAP" cols S-AC. Substitui a edição manual da
//     planilha. Toggle ATIVO (col AC) gateia (a) login no portal PAP, (b)
//     listagem em getPagamentosPAP, (c) notificações Evolution.
//     Adicionado em 03/06/2026.
// ══════════════════════════════════════════════════════════════════════════════

// Invalida o cache do dropdown de Responsável (Nova Venda) pra refletir
// imediato após cadastro/edição/toggle/exclusão de vendedor PAP.
function _papInvalidarCacheResponsaveis_() {
  try {
    if (typeof CONFIG === 'undefined' || !CONFIG.CACHE_PREFIX) return;
    CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'responsaveis_v1');
  } catch (_) {}
}

// Aceita admin OU backoffice. Lança erro se nenhum dos dois.
function _assertAdminOuBackofficePAP_(usuario) {
  var u = String(usuario || '').trim().toLowerCase();
  var lista = (typeof _getUsuariosSheet_ === 'function') ? _getUsuariosSheet_() : [];
  if (!lista || lista.length === 0) lista = (typeof USUARIOS !== 'undefined') ? USUARIOS : [];
  for (var i = 0; i < lista.length; i++) {
    var r = lista[i];
    if (String(r.usuario).trim().toLowerCase() === u && r.ativo !== false) {
      if (r.perfil === 'admin' || r.perfil === 'backoffice') return;
    }
  }
  throw new Error('Acesso negado: apenas admin ou backoffice podem gerir vendedores PAP.');
}

// Enums fechados para os selects do form de cadastro.
var PAP_VENDEDOR_FORMAS = ['Valor do Plano', 'Valor Fixo'];
var PAP_VENDEDOR_PERIODOS = ['Diário', 'Mensal (20)'];

function _papNormalizarData_(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) {
    return Utilities.formatDate(v, 'America/Sao_Paulo', 'dd/MM/yyyy');
  }
  return String(v).trim();
}

// Lista todos os vendedores PAP (S–AC) para a tela de gestão.
function listarVendedoresPAP(usuario) {
  try {
    _assertAdminOuBackofficePAP_(usuario);
    var sh = _getSpreadsheet_().getSheetByName(PAP_SHEET_PAP);
    if (!sh) return { ok: false, mensagem: 'Aba "3 - PAP" não encontrada.' };
    var lastRow = sh.getLastRow();
    if (lastRow < PAP_FIRST_ROW) return { ok: true, vendedores: [] };

    var numRows = lastRow - PAP_FIRST_ROW + 1;
    var numCols = PAP_COL_ATIVO - PAP_COL_NOME + 1;
    var raw = sh.getRange(PAP_FIRST_ROW, PAP_COL_NOME, numRows, numCols).getValues();

    var off = function(col) { return col - PAP_COL_NOME; };
    var vendedores = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      var nome  = String(r[off(PAP_COL_NOME)]  || '').trim();
      var cpf   = String(r[off(PAP_COL_CPF)]   || '').replace(/\D/g, '');
      // Linha completamente vazia = fim útil dos dados.
      if (!nome && !cpf) continue;
      vendedores.push({
        linha:        PAP_FIRST_ROW + i,
        nome:         nome,
        whatsapp:     String(r[off(PAP_COL_WHATS)]    || '').trim(),
        cpf:          cpf,
        chavePix:     String(r[off(PAP_COL_PIX)]      || '').trim(),
        formaPgto:    String(r[off(PAP_COL_FORMA)]    || '').trim(),
        periodicidade: String(r[off(PAP_COL_PERIOD)]  || '').trim(),
        dataCadastro: _papNormalizarData_(r[off(PAP_COL_DATA_CAD)]),
        ativo:        _papEhAtivo_(r[off(PAP_COL_ATIVO)])
      });
    }
    return { ok: true, vendedores: vendedores };
  } catch (e) {
    Logger.log('listarVendedoresPAP erro: ' + e.message);
    return { ok: false, mensagem: e.message };
  }
}

// Cria (dados.linha falsy) ou atualiza (dados.linha = nº da linha) vendedor PAP.
// dados = { linha?, nome, cpf, whatsapp, chavePix?, formaPgto, periodicidade, ativo? }
function salvarVendedorPAP(usuario, dados) {
  var lock = LockService.getScriptLock();
  try {
    _assertAdminOuBackofficePAP_(usuario);
    if (!dados) return { ok: false, mensagem: 'Dados ausentes.' };

    var nome = String(dados.nome || '').trim();
    var cpf  = _papNormCpf(dados.cpf);
    if (!nome)            return { ok: false, mensagem: 'Nome é obrigatório.' };
    if (cpf.length !== 11) return { ok: false, mensagem: 'CPF inválido (11 dígitos).' };
    if (PAP_VENDEDOR_FORMAS.indexOf(dados.formaPgto) === -1) {
      return { ok: false, mensagem: 'Forma de pagamento inválida.' };
    }
    if (PAP_VENDEDOR_PERIODOS.indexOf(dados.periodicidade) === -1) {
      return { ok: false, mensagem: 'Periodicidade inválida.' };
    }

    // WhatsApp: normaliza via helper compartilhado (10 dígitos canônicos).
    // Em DM com privacy ON o vendedor pode não ter whatsapp ainda — opcional.
    var whatsRaw = String(dados.whatsapp || '').trim();
    var whats = '';
    if (whatsRaw) {
      var norm = (typeof _normalizePhoneBR_ === 'function') ? _normalizePhoneBR_(whatsRaw) : whatsRaw.replace(/\D/g, '');
      if (!norm || norm.length < 10) return { ok: false, mensagem: 'WhatsApp inválido.' };
      whats = whatsRaw; // preserva o que o backoffice digitou (Evolution normaliza no envio)
    }

    lock.waitLock(10000);

    var sh = _getSpreadsheet_().getSheetByName(PAP_SHEET_PAP);
    if (!sh) return { ok: false, mensagem: 'Aba "3 - PAP" não encontrada.' };

    var linha = parseInt(dados.linha, 10) || 0;
    var ehUpdate = linha >= PAP_FIRST_ROW;

    // Unicidade do CPF (exclui a própria linha em update).
    var lastRow = sh.getLastRow();
    if (lastRow >= PAP_FIRST_ROW) {
      var rawCpf = sh.getRange(PAP_FIRST_ROW, PAP_COL_CPF, lastRow - PAP_FIRST_ROW + 1, 1).getValues();
      for (var i = 0; i < rawCpf.length; i++) {
        var rowNum = PAP_FIRST_ROW + i;
        if (ehUpdate && rowNum === linha) continue;
        var cpfExistente = String(rawCpf[i][0] || '').replace(/\D/g, '');
        if (cpfExistente === cpf) {
          return { ok: false, mensagem: 'Já existe vendedor com este CPF (linha ' + rowNum + ').' };
        }
      }
    }

    // Em cadastro novo: acha primeira linha vazia ≥ PAP_FIRST_ROW (varre col S).
    if (!ehUpdate) {
      linha = PAP_FIRST_ROW;
      if (lastRow >= PAP_FIRST_ROW) {
        var rawNome = sh.getRange(PAP_FIRST_ROW, PAP_COL_NOME, lastRow - PAP_FIRST_ROW + 1, 1).getValues();
        var encontrouVazia = false;
        for (var j = 0; j < rawNome.length; j++) {
          if (!String(rawNome[j][0] || '').trim()) {
            linha = PAP_FIRST_ROW + j;
            encontrouVazia = true;
            break;
          }
        }
        if (!encontrouVazia) linha = lastRow + 1;
      }
    }

    // Grava cada coluna individualmente (range S–AC tem células reservadas Y/Z não-usadas).
    var ativoFinal = dados.ativo === false ? false : true;
    sh.getRange(linha, PAP_COL_NOME).setValue(nome);
    sh.getRange(linha, PAP_COL_WHATS).setValue(whats);
    sh.getRange(linha, PAP_COL_CPF).setValue(cpf);
    sh.getRange(linha, PAP_COL_PIX).setValue(String(dados.chavePix || '').trim());
    sh.getRange(linha, PAP_COL_FORMA).setValue(dados.formaPgto);
    sh.getRange(linha, PAP_COL_PERIOD).setValue(dados.periodicidade);
    sh.getRange(linha, PAP_COL_ATIVO).setValue(ativoFinal);

    // Data de cadastro: preenche só se vazia (preserva histórico em updates).
    var dataAtual = sh.getRange(linha, PAP_COL_DATA_CAD).getValue();
    if (!dataAtual) {
      sh.getRange(linha, PAP_COL_DATA_CAD).setValue(_papNow());
    }

    SpreadsheetApp.flush();
    _papInvalidarCacheResponsaveis_();
    return {
      ok: true,
      mensagem: ehUpdate ? 'Vendedor atualizado.' : 'Vendedor cadastrado.',
      linha: linha
    };
  } catch (e) {
    Logger.log('salvarVendedorPAP erro: ' + e.message);
    return { ok: false, mensagem: e.message };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// Ativa/desativa vendedor (col AC).
function toggleAtivoVendedorPAP(usuario, linha, ativo) {
  try {
    _assertAdminOuBackofficePAP_(usuario);
    linha = parseInt(linha, 10);
    if (!(linha >= PAP_FIRST_ROW)) return { ok: false, mensagem: 'Linha inválida.' };
    var sh = _getSpreadsheet_().getSheetByName(PAP_SHEET_PAP);
    if (!sh) return { ok: false, mensagem: 'Aba "3 - PAP" não encontrada.' };
    sh.getRange(linha, PAP_COL_ATIVO).setValue(ativo === true);
    SpreadsheetApp.flush();
    _papInvalidarCacheResponsaveis_();
    return { ok: true, mensagem: ativo ? 'Vendedor ativado.' : 'Vendedor desativado.' };
  } catch (e) {
    Logger.log('toggleAtivoVendedorPAP erro: ' + e.message);
    return { ok: false, mensagem: e.message };
  }
}

// Soft-delete: marca ativo=false em vez de remover linha (preserva
// vendas históricas que referenciam o nome do vendedor no campo RESP).
function excluirVendedorPAP(usuario, linha) {
  try {
    _assertAdminOuBackofficePAP_(usuario);
    linha = parseInt(linha, 10);
    if (!(linha >= PAP_FIRST_ROW)) return { ok: false, mensagem: 'Linha inválida.' };
    var sh = _getSpreadsheet_().getSheetByName(PAP_SHEET_PAP);
    if (!sh) return { ok: false, mensagem: 'Aba "3 - PAP" não encontrada.' };
    sh.getRange(linha, PAP_COL_ATIVO).setValue(false);
    SpreadsheetApp.flush();
    _papInvalidarCacheResponsaveis_();
    return { ok: true, mensagem: 'Vendedor desativado (histórico preservado).' };
  } catch (e) {
    Logger.log('excluirVendedorPAP erro: ' + e.message);
    return { ok: false, mensagem: e.message };
  }
}

// Injeta a página VendedoresPAP.html no CRM.
function getVendedoresPAPHtml() {
  return HtmlService.createHtmlOutputFromFile('VendedoresPAP').getContent();
}

// ══════════════════════════════════════════════════════════════════════════════
// PROGRAMA DE PONTOS PAP — Motor de Crédito + Ledger (Fase 1)
//   Spec: BRIEF_PROGRAMA_PONTOS_PAP.md (decisões D1–D10) +
//         BRIEF_PROGRAMA_PONTOS_PAP_FASE1.md.
//   Modelo: livro-razão de eventos (ledger). Saldo = SUM(Pontos) por CPF.
//   Régua: 1 ponto = R$ 1,00 do VALOR (Math.round), combo soma o Móvel filho.
//   Gate: venda (DATA_ATIV, fallback CRIADO_EM) ≥ 01/07/2026, instalada.
//   Fase 1 grava só CREDITO_VENDA (+). Resgate/estorno/expiração → fases 2-4.
// ══════════════════════════════════════════════════════════════════════════════

const PAP_SHEET_LEDGER = 'PAP Pontos Ledger';
const HEADERS_LEDGER = [
  'ID','Timestamp','CPF','Nome','Tipo','Pontos',
  'Ref','Ref Tipo','Data Competencia','Expira Em','Origem','Obs'
];

// Índices 0-based das colunas do ledger (espelham HEADERS_LEDGER).
const PAP_LEDGER_COL = {
  ID: 0, TS: 1, CPF: 2, NOME: 3, TIPO: 4, PONTOS: 5,
  REF: 6, REF_TIPO: 7, DATA_COMPETENCIA: 8, EXPIRA_EM: 9, ORIGEM: 10, OBS: 11
};

// Gate de elegibilidade (D4): venda a partir de 01/07/2026 (00:00 local).
const PAP_PONTOS_GATE = new Date(2026, 6, 1); // mês 6 = julho (0-based)

// ── 2.1 Resolver nome do vendedor (RESP) → CPF do parceiro via "3 - PAP" ────────
// Retorna { cpf, nome, ambiguo }. Cacheia o índice nome→CPF por execução para
// não reler "3 - PAP" a cada venda (passar `indice` construído por
// _papIndiceParceirosPorNome()).
function _papResolverCpfParceiroPorNome(nomeResp, indice) {
  const chave = _papNormNome_(nomeResp);
  if (!chave) return { cpf: '', nome: '', ambiguo: false };
  const idx = indice || _papIndiceParceirosPorNome();
  const hit = idx[chave];
  if (!hit) return { cpf: '', nome: String(nomeResp || '').trim(), ambiguo: false };
  if (hit.ambiguo) return { cpf: '', nome: hit.nome, ambiguo: true };
  return { cpf: hit.cpf, nome: hit.nome, ambiguo: false };
}

// Normaliza nome: trim + lowercase + strip acento.
function _papNormNome_(nome) {
  return String(nome || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Constrói { nomeNorm: { cpf, nome, ambiguo } } lendo "3 - PAP" uma única vez.
// Nome que casa com 2+ CPFs distintos vira { ambiguo:true }.
function _papIndiceParceirosPorNome() {
  const idx = {};
  const sh = _getSpreadsheet_().getSheetByName(PAP_SHEET_PAP);
  if (!sh || sh.getLastRow() < PAP_FIRST_ROW) return idx;
  const numRows = sh.getLastRow() - PAP_FIRST_ROW + 1;
  const numCols = PAP_COL_ATIVO - PAP_COL_NOME + 1;
  const raw = sh.getRange(PAP_FIRST_ROW, PAP_COL_NOME, numRows, numCols).getValues();
  for (let i = 0; i < raw.length; i++) {
    const nome = String(raw[i][0] || '').trim();
    const cpf  = _papNormCpf(String(raw[i][PAP_COL_CPF - PAP_COL_NOME] || ''));
    if (!nome || cpf.length !== 11) continue;
    const chave = _papNormNome_(nome);
    if (!chave) continue;
    const atual = idx[chave];
    if (!atual) {
      idx[chave] = { cpf: cpf, nome: nome, ambiguo: false };
    } else if (!atual.ambiguo && atual.cpf !== cpf) {
      idx[chave] = { cpf: '', nome: nome, ambiguo: true };
    }
  }
  return idx;
}

// ── 2.2 Pontos de uma venda (régua R$1=1pt, combo somado) ───────────────────────
function _papPontosDaVenda(row, c, vinculosMap, linha1based, sheetV) {
  let pts = _papValorEmPontos_(row[c.VALOR]);
  const prod = String(row[c.PRODUTO] || '').toUpperCase();
  if (prod.indexOf('COMBO') !== -1 && vinculosMap && vinculosMap.filhasPorMae) {
    const filhas = vinculosMap.filhasPorMae[linha1based] || [];
    for (let i = 0; i < filhas.length; i++) {
      const filhaLinha = filhas[i].vendaFilhaLinha;
      if (!filhaLinha) continue;
      const rowFilha = sheetV.getRange(filhaLinha, c.VALOR + 1).getValue();
      pts += _papValorEmPontos_(rowFilha);
    }
  }
  return pts;
}

// R$ → pontos inteiros. _normalizarValorParaNumero_ devolve '' quando vazio/ruim.
function _papValorEmPontos_(v) {
  const n = _normalizarValorParaNumero_(v);
  return (typeof n === 'number' && isFinite(n)) ? Math.round(n) : 0;
}

// ── 2.3 Elegibilidade da venda ──────────────────────────────────────────────────
function _papVendaElegivel(row, c) {
  if (String(row[c.CANAL] || '').trim().toUpperCase() !== 'PAP') return false;

  const status = String(row[c.STATUS] || '');
  const statusInstalado = /^4/.test(status) ||
    status.toLowerCase().indexOf('instalad') !== -1 ||
    status.toLowerCase().indexOf('ativo')    !== -1;
  if (!statusInstalado) return false;

  if (!_parseDataFlex(row[c.INSTAL])) return false; // INSTAL preenchido/válido

  // Gate D4: data da venda (DATA_ATIV, fallback CRIADO_EM) ≥ 01/07/2026.
  let dVenda = _parseDataFlex(row[c.DATA_ATIV]);
  if (!dVenda && c.CRIADO_EM != null) dVenda = _parseDataFlex(row[c.CRIADO_EM]);
  if (!dVenda || dVenda < PAP_PONTOS_GATE) return false;

  return true;
}

// ── 2.4 Motor de crédito idempotente ────────────────────────────────────────────
// opts = { dryRun?:bool, origem?:string }. Um CREDITO_VENDA por contrato.
function creditarPontosPAPVendas(opts) {
  opts = opts || {};
  const origem = opts.origem || 'JOB_DIARIO';
  const dryRun = !!opts.dryRun;

  if (typeof CONFIG === 'undefined') {
    return { ok: false, error: 'CONFIG indisponível' };
  }
  const c  = CONFIG.COLUNAS;
  const ss = _getSpreadsheet_();
  const sheetV = ss.getSheetByName(PAP_SHEET_VENDAS);
  if (!sheetV || sheetV.getLastRow() < 3) {
    return { ok: true, creditadas: 0, pulhadas: 0, semParceiro: 0, ambiguos: 0, pontosTotais: 0 };
  }

  // 1. Set de contratos já creditados (CREDITO_VENDA no ledger) — 1 leitura.
  const ledger = _papGetOrCreateSheet(PAP_SHEET_LEDGER, HEADERS_LEDGER);
  const jaCreditados = {};
  if (ledger.getLastRow() >= 2) {
    const lRaw = ledger.getRange(2, 1, ledger.getLastRow() - 1, HEADERS_LEDGER.length).getValues();
    for (let i = 0; i < lRaw.length; i++) {
      if (String(lRaw[i][PAP_LEDGER_COL.TIPO] || '') !== 'CREDITO_VENDA') continue;
      const ref = String(lRaw[i][PAP_LEDGER_COL.REF] || '').trim();
      if (ref) jaCreditados[ref] = true;
    }
  }

  // Índice nome→CPF (1 leitura de "3 - PAP") + mapa de vínculos de combo.
  const idxParceiros = _papIndiceParceirosPorNome();
  const vinculosMap  = _getVinculosVendasMap_();

  // 2. Varre 1 - Vendas (linha 3+). Só col VALOR-dependente lê filha por getValue.
  const numRows = sheetV.getLastRow() - 2;
  const maxCol  = Math.max(c.CANAL, c.STATUS, c.RESP, c.PRODUTO, c.VALOR,
                           c.DATA_ATIV, c.INSTAL, c.CONTRATO, c.CLIENTE,
                           (c.CRIADO_EM != null ? c.CRIADO_EM : 0)) + 1;
  const raw = sheetV.getRange(3, 1, numRows, maxCol).getValues();

  let creditadas = 0, pulhadas = 0, semParceiro = 0, ambiguos = 0, pontosTotais = 0;
  const novasLinhas = [];
  const ts = _papNow();

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    const linha1based = i + 3;

    if (!_papVendaElegivel(row, c)) continue;

    // Móvel filho de um combo: seu VALOR já é somado no crédito da Fibra mãe
    // (D2). Creditá-lo no próprio contrato duplicaria os pontos do móvel — pula.
    if (vinculosMap.maePorFilha && vinculosMap.maePorFilha[linha1based]) continue;

    const contrato = String(row[c.CONTRATO] || '').trim();
    if (!contrato) { pulhadas++; continue; }
    if (jaCreditados[contrato]) continue; // idempotência

    const resolvido = _papResolverCpfParceiroPorNome(row[c.RESP], idxParceiros);
    if (resolvido.ambiguo) { ambiguos++; Logger.log('creditarPontosPAP: parceiro ambíguo "' + row[c.RESP] + '" contrato ' + contrato); continue; }
    if (!resolvido.cpf)    { semParceiro++; Logger.log('creditarPontosPAP: sem CPF p/ "' + row[c.RESP] + '" contrato ' + contrato); continue; }

    const pontos = _papPontosDaVenda(row, c, vinculosMap, linha1based, sheetV);
    if (!(pontos > 0)) { pulhadas++; continue; }

    const dInstal = _parseDataFlex(row[c.INSTAL]);
    const dExpira = dInstal ? new Date(dInstal.getFullYear(), dInstal.getMonth() + 24, dInstal.getDate()) : '';

    novasLinhas.push([
      _papGerarId('PL'),           // ID
      ts,                          // Timestamp
      resolvido.cpf,               // CPF
      resolvido.nome,              // Nome
      'CREDITO_VENDA',             // Tipo
      pontos,                      // Pontos (+)
      contrato,                    // Ref
      'CONTRATO',                  // Ref Tipo
      dInstal ? _fmtDataBR(dInstal) : '', // Data Competencia
      dExpira ? _fmtDataBR(dExpira) : '', // Expira Em
      origem,                      // Origem
      String(row[c.CLIENTE] || '').trim() // Obs (snapshot cliente)
    ]);
    jaCreditados[contrato] = true; // evita duplicar dentro da mesma execução
    creditadas++;
    pontosTotais += pontos;
  }

  // 4. Grava em batch, sob lock. dryRun não grava.
  if (!dryRun && novasLinhas.length) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(20000);
      const start = ledger.getLastRow() + 1;
      ledger.getRange(start, 1, novasLinhas.length, HEADERS_LEDGER.length).setValues(novasLinhas);
      SpreadsheetApp.flush();
    } finally {
      try { lock.releaseLock(); } catch (_) {}
    }
  }

  return { ok: true, dryRun: dryRun, creditadas: creditadas, pulhadas: pulhadas,
           semParceiro: semParceiro, ambiguos: ambiguos, pontosTotais: pontosTotais };
}

// ── 2.5 Saldo a partir do ledger ────────────────────────────────────────────────
function getSaldoPontos(cpf) {
  const cpfLimpo = _papNormCpf(cpf);
  if (cpfLimpo.length !== 11) return { ok: false, error: 'CPF inválido' };
  const ledger = _getSpreadsheet_().getSheetByName(PAP_SHEET_LEDGER);
  let saldo = 0;
  const porTipo = {};
  if (ledger && ledger.getLastRow() >= 2) {
    const raw = ledger.getRange(2, 1, ledger.getLastRow() - 1, HEADERS_LEDGER.length).getValues();
    for (let i = 0; i < raw.length; i++) {
      if (_papNormCpf(raw[i][PAP_LEDGER_COL.CPF]) !== cpfLimpo) continue;
      const pts  = Number(raw[i][PAP_LEDGER_COL.PONTOS] || 0);
      const tipo = String(raw[i][PAP_LEDGER_COL.TIPO] || '');
      saldo += pts;
      porTipo[tipo] = (porTipo[tipo] || 0) + pts;
    }
  }
  return { ok: true, saldo: saldo, porTipo: porTipo };
}

// ── 2.6 Extrato a partir do ledger (Fase 2 troca getExtratoPontos por este) ──────
function getExtratoPontosLedger(cpf, limite) {
  limite = limite || 50;
  const cpfLimpo = _papNormCpf(cpf);
  if (cpfLimpo.length !== 11) return { ok: false, error: 'CPF inválido' };
  const ledger = _getSpreadsheet_().getSheetByName(PAP_SHEET_LEDGER);
  let saldo = 0;
  const eventos = [];
  if (ledger && ledger.getLastRow() >= 2) {
    const raw = ledger.getRange(2, 1, ledger.getLastRow() - 1, HEADERS_LEDGER.length).getValues();
    for (let i = raw.length - 1; i >= 0; i--) {
      if (_papNormCpf(raw[i][PAP_LEDGER_COL.CPF]) !== cpfLimpo) continue;
      saldo += Number(raw[i][PAP_LEDGER_COL.PONTOS] || 0);
      if (eventos.length < limite) {
        const r = raw[i];
        eventos.push({
          tipo:   String(r[PAP_LEDGER_COL.TIPO]   || ''),
          pontos: Number(r[PAP_LEDGER_COL.PONTOS] || 0),
          ref:    String(r[PAP_LEDGER_COL.REF]    || ''),
          data:   _papCelToStr_(r[PAP_LEDGER_COL.DATA_COMPETENCIA]),
          expira: _papCelToStr_(r[PAP_LEDGER_COL.EXPIRA_EM]),
          ts:     _papCelToStr_(r[PAP_LEDGER_COL.TS]),
          obs:    String(r[PAP_LEDGER_COL.OBS]    || '')
        });
      }
    }
  }
  // eventos já em ordem desc (varremos de baixo p/ cima = mais recentes primeiro).
  return { ok: true, saldo: saldo, eventos: eventos };
}

function _papCelToStr_(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString();
  return String(v || '');
}

// Entrypoint do trigger diário (permanece deployado — o trigger referencia por
// nome). Instalação/remoção do trigger ficam em _pontosPapSetup.js (one-shot).
function creditarPontosPAPDiario() {
  var res = creditarPontosPAPVendas({ origem: 'JOB_DIARIO' });
  Logger.log('creditarPontosPAPDiario: ' + JSON.stringify(res));
  return res;
}
