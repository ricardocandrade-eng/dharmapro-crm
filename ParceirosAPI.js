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

// Aba "3 - PAP": dados começam na linha 5
// col S (índice 19, 1-based) = Nome do responsável
// col W (índice 23, 1-based) = CPF do responsável
const PAP_FIRST_ROW     = 5;
const PAP_COL_NOME      = 19; // S
const PAP_COL_CPF       = 23; // W

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
  'Endereço Ref', 'Protocolo Ref',
  'WhatsApp', 'Email',
  'Plano', 'Móvel', 'Tipo Móvel',
  'Vencimento', 'Pagamento',
  'Data Decisão', 'Decidido Por'
];

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
        result = consultarAssertivaGAS(payload.cpf);
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
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PAP_SHEET_PAP);
  if (!sheet) return { found: false, error: 'Aba "3 - PAP" não encontrada' };

  const cpfLimpo = _papNormCpf(cpf);
  if (cpfLimpo.length !== 11) return { found: false };

  const lastRow = sheet.getLastRow();
  if (lastRow < PAP_FIRST_ROW) return { found: false };

  // Lê só o intervalo necessário: col NOME até col CPF
  const numRows = lastRow - PAP_FIRST_ROW + 1;
  const numCols = PAP_COL_CPF - PAP_COL_NOME + 1;
  const values  = sheet
    .getRange(PAP_FIRST_ROW, PAP_COL_NOME, numRows, numCols)
    .getValues();

  const cpfOffset = PAP_COL_CPF - PAP_COL_NOME; // = 4

  for (const row of values) {
    const cpfRow = _papNormCpf(String(row[cpfOffset]));
    if (cpfRow === cpfLimpo) {
      return { found: true, nome: String(row[0]).trim() };
    }
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
function consultarAssertivaGAS(cpf) {
  try {
    var res = consultarAssertivaCPF(cpf);
    if (res.erro) return { found: false, status: res.mensagem };
    var d = res.dados || {};
    return {
      found:  !!d.nome,
      nome:   d.nome || '',
      status: d.situacaoCadastral || (d.nome ? 'Localizado' : 'Não encontrado')
    };
  } catch (e) {
    return { found: false, status: 'Erro: ' + e.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. BUSCAR CLIENTE NAS CONSULTAS (para Card 3)
//    Retorna o registro de Crédito mais recente do CPF.
//    Fallback: qualquer consulta do CPF (Viabilidade).
//    Retorna: { found: bool, nome, protocolo, endereco }
// ══════════════════════════════════════════════════════════════════════════════
function buscarClienteConsultas(cpf) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
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
    sheet.appendRow([
      pvId,
      _papNow(),
      'Pendente',
      data.parceiro     || '',
      data.parceiroCpf  || '',
      data.cpfCliente   || '',
      data.nomeCliente  || '',
      data.enderecoRef  || '',
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
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // Notificação fora do lock para não segurar a escrita durante chamada HTTP
  if (pvId) {
    try {
      const v = _papBuscarSubscriberVendedor(data.parceiroCpf, data.parceiro);
      if (v && v.subscriberId) {
        _papNotificarVendedorPAP('pv_recebida', v.subscriberId, {
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
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
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
    // Colunas PV (0-based): 0=ID 1=TS 2=Status 3=Parceiro 4=ParceiroCPF
    // 5=CPFCliente 6=Nome 7=EndRef 8=ProtRef 9=Whats 10=Email
    // 11=Plano 12=Movel 13=TipoMovel 14=Venc 15=Pag 16=DataDecisão 17=DecididoPor
    const rowIdx = data.findIndex((r, i) => i > 0 && r[0] === id);
    if (rowIdx < 0) { resultado = { ok: false, error: 'Pré-venda não encontrada: ' + id }; return resultado; }

    const pv = data[rowIdx];
    if (pv[2] !== 'Pendente') { resultado = { ok: false, error: 'Pré-venda já processada: ' + pv[2] }; return resultado; }

    const sheetRowPV = rowIdx + 1;
    // 1. Buscar endereço completo nas Consultas pelo CPF do cliente
    const end = _buscarEnderecoConsultas(pv[5]);

    // 2. Montar e inserir linha em "1 - Vendas" usando o layout oficial do CRM
    const vendaPayload = {
      canal:         'PAP',
      produto:       _papInferirProduto(pv[12]),
      status:        '1- Conferencia/Ativação',
      preStatus:     'EM NEGOCIACAO',
      resp:          pv[3]  || '',
      cpf:           pv[5]  || '',
      cliente:       pv[6]  || '',
      whats:         pv[9]  || '',
      cep:           end?.cep    || '',
      rua:           end?.rua    || '',
      num:           end?.numero || '',
      complemento:   end?.comp   || '',
      bairro:        end?.bairro || '',
      cidade:        end?.cidade || '',
      uf:            end?.uf     || '',
      venc:          pv[14] || '',
      fat:           pv[15] || '',
      plano:         pv[11] || '',
      linhaMovel:    pv[12] || '',
      portabilidade: pv[13] || '',
      observacao:    _papMontarObservacaoPreVenda(pv),
      statusPAP:     'Em Aberto'
    };

    try {
      const novaVenda = _papConstruirLinhaVenda(vendaPayload);
      sheetV.getRange(sheetV.getLastRow() + 1, 1, 1, novaVenda.length).setValues([novaVenda]);
    } catch (err) {
      Logger.log('aprovarPreVenda ERRO ao inserir na Lista | id=' + id + ' | payload=' + JSON.stringify(vendaPayload) + ' | erro=' + err);
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
      if (v && v.subscriberId) {
        _papNotificarVendedorPAP('pv_aprovada', v.subscriberId, {
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
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
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
  return movelNorm === 'SIM' ? 'FIBRA COMBO' : 'FIBRA ALONE';
}

function _papMontarObservacaoPreVenda(pv) {
  const detalhes = [
    'Pré-venda PAP aprovada pelo backoffice',
    pv[8]  ? 'Consulta: ' + pv[8] : '',
    pv[10] ? 'Email: ' + pv[10] : '',
    pv[7]  ? 'Endereço ref: ' + pv[7] : ''
  ].filter(Boolean);

  return detalhes.join(' | ');
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. REJEITAR PRÉ-VENDA
//    Marca como "Rejeitado" na aba "Pré-Vendas". Sem ação em "1 - Vendas".
//    Retorna: { ok: bool }
// ══════════════════════════════════════════════════════════════════════════════
function rejeitarPreVenda(id, emailRejeitor) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
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
      if (v && v.subscriberId) {
        _papNotificarVendedorPAP('pv_rejeitada', v.subscriberId, {
          pap_pv_id:        pvCopia[0],
          pap_nome_cliente: pvCopia[6] || '',
          pap_plano:        pvCopia[11] || '',
          pap_status:       'Rejeitada'
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();

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
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
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
      enderecoRef:  String(row[7]  || ''),
      protocoloRef: String(row[8]  || ''),
      whatsapp:     String(row[9]  || ''),
      plano:        String(row[11] || ''),
      movel:        String(row[12] || ''),
      vencimento:   row[14] instanceof Date ? row[14].toISOString() : String(row[14] || ''),
      pagamento:    String(row[15] || ''),
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
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
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
// 11. NOTIFICAÇÕES PAP — BotConversa
//     Dispara fluxos para vendedores PAP nos 5 eventos do ciclo da pré-venda.
// ══════════════════════════════════════════════════════════════════════════════

// Busca subscriber BotConversa do vendedor na aba "3 - PAP" por CPF (prioridade)
// ou por nome. Retorna { subscriberId, whatsapp, nome } ou null.
// Cols lidas a partir de S (col 19, 1-based): S=nome T=bcId U=whats V=dataCad W=cpf
function _papBuscarSubscriberVendedor(cpf, nome) {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('3 - PAP');
    if (!sh || sh.getLastRow() < 5) return null;
    const raw      = sh.getRange(5, 19, sh.getLastRow() - 4, 5).getValues();
    const cpfLimpo = cpf  ? String(cpf).replace(/\D/g, '')           : '';
    const nomeBusc = nome ? String(nome).trim().toLowerCase()         : '';
    for (let i = 0; i < raw.length; i++) {
      const rowNome  = String(raw[i][0] || '').trim();
      const rowBcId  = String(raw[i][1] || '').trim();
      const rowWhats = String(raw[i][2] || '').trim();
      const rowCpf   = String(raw[i][4] || '').replace(/\D/g, '');
      const match    = (cpfLimpo && rowCpf   && rowCpf === cpfLimpo) ||
                       (nomeBusc && rowNome  && rowNome.toLowerCase() === nomeBusc);
      if (!match) continue;
      // Busca pelo telefone primeiro (col T pode conter ID de outro sistema)
      const subscriberId = String(_bcGetSubscriberPorTelefone(rowWhats) || rowBcId || '');
      if (!subscriberId) return null;
      return { subscriberId, whatsapp: rowWhats, nome: rowNome };
    }
    return null;
  } catch(e) {
    Logger.log('_papBuscarSubscriberVendedor erro: ' + e.message);
    return null;
  }
}

// Envia mensagem de texto direta ao vendedor PAP via BotConversa.
// Substitui a abordagem de fluxos + variáveis (API não suporta definir campos via PATCH/PUT).
function _papEnviarMensagemDireta(subscriberId, mensagem) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('botconversa_api_key') || '';
    if (!apiKey) return { sucesso: false, mensagem: 'Chave BotConversa não configurada.' };
    const resp = UrlFetchApp.fetch(
      'https://backend.botconversa.com.br/api/v1/webhook/subscriber/' + subscriberId + '/send_message/',
      {
        method             : 'post',
        contentType        : 'application/json',
        headers            : { 'api-key': apiKey },
        payload            : JSON.stringify({ type: 'text', value: mensagem }),
        muteHttpExceptions : true
      }
    );
    const code = resp.getResponseCode();
    if (code >= 200 && code < 300) return { sucesso: true };
    Logger.log('_papEnviarMensagemDireta HTTP ' + code + ': ' + resp.getContentText().slice(0, 200));
    return { sucesso: false, mensagem: 'HTTP ' + code };
  } catch(e) {
    Logger.log('_papEnviarMensagemDireta erro: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}

// Monta o texto da notificação PAP conforme o evento.
function _papMontarMensagemNotificacao(evento, dados) {
  const cliente   = dados.pap_nome_cliente || '';
  const plano     = dados.pap_plano        || '';
  const protocolo = dados.pap_pv_id        || '';

  const rodape = '\n👤 Cliente: ' + cliente +
                 '\n📦 Plano: '   + plano;

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

    case 'pv_rejeitada':
      return '❌ *Pré-venda não aprovada*\n\n' +
             'Infelizmente sua pré-venda não pôde ser aprovada.' +
             rodape +
             '\n🔖 Protocolo: ' + protocolo +
             '\n\nEntre em contato com o backoffice para mais informações.';

    case 'aguardando_instalacao':
      return '📅 *Instalação agendada!*\n\n' +
             'A venda foi ativada e está com instalação agendada pela Vero.' +
             rodape +
             '\n\nAcompanhe o andamento pelo CRM.';

    case 'instalada':
      return '🏠 *Instalação concluída!*\n\n' +
             'A instalação do seu cliente foi realizada com sucesso.' +
             rodape +
             '\n\nComissão registrada. Obrigado pela venda! 💪';

    default:
      return 'Notificação PAP: ' + evento + rodape;
  }
}

// Orquestra notificação PAP: monta mensagem formatada → envia direto ao vendedor.
// evento: 'pv_recebida' | 'pv_aprovada' | 'pv_rejeitada' |
//         'aguardando_instalacao' | 'instalada'
// dados: { pap_pv_id?, pap_nome_cliente, pap_plano }
// Nunca lança exceção — todos os erros são apenas logados.
function _papNotificarVendedorPAP(evento, subscriberId, dados) {
  try {
    const mensagem = _papMontarMensagemNotificacao(evento, dados);
    const res      = _papEnviarMensagemDireta(subscriberId, mensagem);
    Logger.log('_papNotificarVendedorPAP [' + evento + '] sub=' + subscriberId +
               ' → ' + JSON.stringify(res));
  } catch(e) {
    Logger.log('_papNotificarVendedorPAP erro [' + evento + ']: ' + e.message);
  }
}
