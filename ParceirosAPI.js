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

// Aba "1 - Vendas" — índices 1-based das colunas relevantes
const VENDAS_A_CANAL    = 1;
const VENDAS_C_STATUS   = 3;
const VENDAS_M_RESP     = 13;
const VENDAS_N_CPF      = 14;
const VENDAS_O_NOME     = 15;
const VENDAS_P_WHATS    = 16;
const VENDAS_R_CEP      = 18;
const VENDAS_S_RUA      = 19;
const VENDAS_T_NUM      = 20;
const VENDAS_U_COMP     = 21;
const VENDAS_V_BAIRRO   = 22;
const VENDAS_W_CIDADE   = 23;
const VENDAS_X_UF       = 24;
const VENDAS_AD_VENC    = 30;
const VENDAS_AH_PLANO   = 34;
const VENDAS_AL_MOVEL   = 38;
const VENDAS_TOTAL_COLS = 47; // A até AU

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

  try {
    lock.waitLock(10000);
    const id = _papGerarId('PV');
    sheet.appendRow([
      id,
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
    return { ok: true, id };
  } finally {
    lock.releaseLock();
  }
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
  try {
    lock.waitLock(12000);

    const data   = sheetPV.getDataRange().getValues();
    // Colunas PV (0-based): 0=ID 1=TS 2=Status 3=Parceiro 4=ParceiroCPF
    // 5=CPFCliente 6=Nome 7=EndRef 8=ProtRef 9=Whats 10=Email
    // 11=Plano 12=Movel 13=TipoMovel 14=Venc 15=Pag 16=DataDecisão 17=DecididoPor
    const rowIdx = data.findIndex((r, i) => i > 0 && r[0] === id);
    if (rowIdx < 0) return { ok: false, error: 'Pré-venda não encontrada: ' + id };

    const pv = data[rowIdx];
    if (pv[2] !== 'Pendente') return { ok: false, error: 'Pré-venda já processada: ' + pv[2] };

    // 1. Atualizar status em Pré-Vendas
    const sheetRowPV = rowIdx + 1;
    sheetPV.getRange(sheetRowPV, 3).setValue('Aprovado');
    sheetPV.getRange(sheetRowPV, 17).setValue(_papNow());
    sheetPV.getRange(sheetRowPV, 18).setValue(emailAprovador || 'backoffice');

    // 2. Buscar endereço completo nas Consultas pelo CPF do cliente
    const end = _buscarEnderecoConsultas(pv[5]);

    // 3. Montar e inserir linha em "1 - Vendas"
    // Array de 47 posições (cols A-AU), 1-based → índice = col - 1
    const novaVenda = new Array(VENDAS_TOTAL_COLS).fill('');
    novaVenda[VENDAS_A_CANAL  - 1] = 'PAP';
    novaVenda[VENDAS_C_STATUS - 1] = '1- Conferencia/Ativação';
    novaVenda[VENDAS_M_RESP   - 1] = pv[3];   // nome parceiro
    novaVenda[VENDAS_N_CPF    - 1] = pv[5];   // CPF cliente
    novaVenda[VENDAS_O_NOME   - 1] = pv[6];   // nome cliente
    novaVenda[VENDAS_P_WHATS  - 1] = pv[9];   // WhatsApp
    novaVenda[VENDAS_AD_VENC  - 1] = pv[14];  // vencimento
    novaVenda[VENDAS_AH_PLANO - 1] = pv[11];  // plano
    novaVenda[VENDAS_AL_MOVEL - 1] = pv[12];  // móvel (SIM/NÃO)

    if (end) {
      novaVenda[VENDAS_R_CEP    - 1] = end.cep;
      novaVenda[VENDAS_S_RUA    - 1] = end.rua;
      novaVenda[VENDAS_T_NUM    - 1] = end.numero;
      novaVenda[VENDAS_U_COMP   - 1] = end.comp;
      novaVenda[VENDAS_V_BAIRRO - 1] = end.bairro;
      novaVenda[VENDAS_W_CIDADE - 1] = end.cidade;
      novaVenda[VENDAS_X_UF     - 1] = end.uf;
    }

    sheetV.appendRow(novaVenda);
    SpreadsheetApp.flush();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
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
  try {
    lock.waitLock(10000);

    const data   = sheet.getDataRange().getValues();
    const rowIdx = data.findIndex((r, i) => i > 0 && r[0] === id);
    if (rowIdx < 0)              return { ok: false, error: 'Pré-venda não encontrada: ' + id };
    if (data[rowIdx][2] !== 'Pendente') return { ok: false, error: 'Pré-venda já processada: ' + data[rowIdx][2] };

    const sheetRow = rowIdx + 1;
    sheet.getRange(sheetRow, 3).setValue('Rejeitado');
    sheet.getRange(sheetRow, 17).setValue(_papNow());
    sheet.getRange(sheetRow, 18).setValue(emailRejeitor || 'backoffice');
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

  // Consultas: col D (4) = Status
  // Pré-Vendas: col C (3) = Status
  const consultas = contar(PAP_SHEET_CONSULTAS,  4);
  const preVendas = contar(PAP_SHEET_PRE_VENDAS, 3);
  return { ok: true, consultas, preVendas, total: consultas + preVendas };
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
