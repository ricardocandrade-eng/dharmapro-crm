// ══════════════════════════════════════════════════════════════════════════════
//  INADIMPLENCIA API — Módulo Financeiro Fase 8 (sub-fatia 8.1)
//
//  Pipeline de upload do "Relatório de Inadimplência" da Vero (xlsx mono-aba)
//  pra alimentar os campos profundos de risco em `1 - Vendas`:
//    - FAIXA_RISCO        (BF=57) — número 1-6, parseado de "4 - Alto Risco"
//    - NEVER_PAID         (BG=58) — string 3-way EM_DIA / NEVER_PAID / COM_ATRASO
//    - ULTIMO_REFRESH_RISCO (BI=60) — DD/MM/YYYY HH:mm da aplicação
//
//  Origem do anexo (Mobile safra — relatório especial sob demanda da Vero):
//    - Aba única `Sheet1`
//    - Linha 0: filtros aplicados (texto livre — vira RELATORIO_PERIODO)
//    - Linha 1: vazia
//    - Linha 2: headers (28 cols)
//    - Linhas 3+: 1 linha por contrato (Vero pré-agrega — sem multiplicidade)
//
//  AGING_DIAS NÃO é tocado por esta fase — SAFRA daily (Fase 4) é mais fresh.
//
//  Materializa em 3 abas (mais idempotência via Script Property):
//    - `Inadimplencia Vero`        snapshot atual (wipe-and-replace por upload)
//    - `Inadimplencia Historico`   append-only (preserva tendência mês a mês)
//    - `Reconciliacao Inadimplencia` o "levantamento entre os dois relatórios"
//      (wipe-and-replace por upload, 3 categorias: ORFAO / DIVERG_RISCO /
//      DIVERG_CANCELAMENTO)
//
//  Idempotência: `INADIMPLENCIA_VERO_ULTIMO_REFRESH` (Script Property) guarda o
//  registro da última aplicação. Re-aplicar é seguro — sobrescreve.
//
//  Decisões de design fechadas com Ricardo (28/05/2026):
//    1. FAIXA_RISCO: número 1-6 (regex extrai do "4 - Alto Risco")
//    2. NEVER_PAID: string 3-way (EM_DIA / NEVER_PAID / COM_ATRASO)
//    3. AGING_DIAS: SAFRA daily ganha sempre (anexo não sobrescreve)
//    4. Cruzamento: aba `Reconciliacao Inadimplencia` com órfãos + divergências
//       (operador investiga manualmente — sem auto-correção de STATUS)
// ══════════════════════════════════════════════════════════════════════════════

// ─── Frontend handler (injetado pelo navegar() em JS.html) ────────────────────
function getInadimplenciaHtml() {
  return HtmlService.createHtmlOutputFromFile('Inadimplencia').getContent();
}

// Status do último refresh (pra UI exibir "última aplicação: DD/MM/YYYY HH:mm").
function getInadimplenciaStatusUltimoRefresh() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('INADIMPLENCIA_VERO_ULTIMO_REFRESH');
    if (!raw) return { ok: true, jaAplicado: false };
    try { return { ok: true, jaAplicado: true, info: JSON.parse(raw) }; }
    catch (e) { return { ok: true, jaAplicado: true, info: { raw: raw } }; }
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

// ─── Preview / Apply ──────────────────────────────────────────────────────────
//   payload = {
//     relatorioVero: {
//       headers: [...28 strings...],
//       rows:    [[...28 valores...], ...],
//       periodoTexto: 'TIPO_PESSOA não é PJ\n...' // linha 0 do xlsx (livre)
//     }
//   }
//   opts    = { confirmar: false }  // preview (default)
//          | { confirmar: true }   // aplica em 1-Vendas + materializa 3 abas
function aplicarInadimplencia(payload, opts) {
  try {
    payload = payload || {};
    opts = opts || {};
    var rel = payload.relatorioVero || {};
    var headers = rel.headers || [];
    var rows = rel.rows || [];
    var periodoTexto = String(rel.periodoTexto || '').trim();

    if (!headers.length || !rows.length) {
      return { ok: false, erro: 'Relatório vazio ou sem cabeçalho. Carregue um xlsx de inadimplência primeiro.' };
    }

    // ── 1. Resolve índices das 28 colunas por header (defensivo) ──
    var idx = _inadResolverIndices_(headers);
    if (idx.contrato < 0) {
      return {
        ok: false,
        erro: 'Coluna "Contrato" não encontrada. Headers recebidos: ' + JSON.stringify(headers)
      };
    }

    // ── 2. Normaliza linhas (1 linha = 1 contrato) ──
    var porContrato = {};
    var skipSemContrato = 0;
    var distRisco = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, '': 0 };
    var distNeverPaid = { EM_DIA: 0, NEVER_PAID: 0, COM_ATRASO: 0, '': 0 };
    var distInadimp = { PAGO_SEM_ATRASO: 0, PAGO_COM_ATRASO: 0, ATRASADO_30D: 0, '': 0 };
    var distStatus = {};

    rows.forEach(function(row) {
      var contratoBruto = row[idx.contrato];
      var contratoNorm = _cruzNormIdServer_(contratoBruto);
      if (!contratoNorm) { skipSemContrato++; return; }

      var faixaRisco = _inadParseFaixaRisco_(row[idx.faixaRisco]);
      var neverPaid = _inadNormalizeNeverPaid_(row[idx.neverPaid]);
      var inadimp = _inadNormalizeInadimp_(row[idx.inadimplencia]);
      var statusContrato = String(row[idx.statusContrato] || '').toUpperCase().trim();
      var aging = _inadNumOrNull_(row[idx.aging]);
      var dataCancelamento = _inadDateOrEmpty_(row[idx.dataCancelamento]);
      var dataEntrada = _inadDateOrEmpty_(row[idx.dataEntrada]);

      // Snapshot completo do anexo (mantém os 28 valores originais pra
      // diagnostico/auditoria; row vira o array preservado).
      porContrato[contratoNorm] = {
        contratoNorm: contratoNorm,
        rowOriginal: row,
        faixaRisco: faixaRisco,      // 1-6 ou null
        neverPaid: neverPaid,        // EM_DIA / NEVER_PAID / COM_ATRASO / ''
        inadimplencia: inadimp,      // PAGO_SEM_ATRASO / PAGO_COM_ATRASO / ATRASADO_30D / ''
        statusContrato: statusContrato,
        aging: aging,
        dataCancelamento: dataCancelamento,
        dataEntrada: dataEntrada
      };

      distRisco[faixaRisco === null ? '' : faixaRisco] =
        (distRisco[faixaRisco === null ? '' : faixaRisco] || 0) + 1;
      distNeverPaid[neverPaid || ''] = (distNeverPaid[neverPaid || ''] || 0) + 1;
      distInadimp[inadimp || ''] = (distInadimp[inadimp || ''] || 0) + 1;
      distStatus[statusContrato || '(vazio)'] =
        (distStatus[statusContrato || '(vazio)'] || 0) + 1;
    });

    var contratos = Object.keys(porContrato);
    var totalContratos = contratos.length;
    if (!totalContratos) {
      return { ok: false, erro: 'Nenhum contrato válido no relatório (todas as linhas sem Contrato).' };
    }

    // ── 3. Carrega `1 - Vendas` (cols relevantes pra match + diagnóstico) ──
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return { ok: false, erro: 'Aba "' + CONFIG.SHEET_NAME + '" não encontrada.' };
    var last = sheet.getLastRow();
    if (last < 3) return { ok: false, erro: 'Sem vendas na planilha.' };
    var n = last - 2;
    var c = CONFIG.COLUNAS;

    var crmContratos        = sheet.getRange(3, c.CONTRATO + 1, n, 1).getValues();
    var crmStatus           = sheet.getRange(3, c.STATUS + 1, n, 1).getValues();
    var crmCliente          = sheet.getRange(3, c.CLIENTE + 1, n, 1).getValues();
    var crmDataAtiv         = sheet.getRange(3, c.DATA_ATIV + 1, n, 1).getValues();
    var crmFaixaRiscoAtual  = sheet.getRange(3, c.FAIXA_RISCO + 1, n, 1).getValues();
    var crmNeverPaidAtual   = sheet.getRange(3, c.NEVER_PAID + 1, n, 1).getValues();
    var crmUltimoRefresh    = sheet.getRange(3, c.ULTIMO_REFRESH_RISCO + 1, n, 1).getValues();
    var crmAgingAtual       = sheet.getRange(3, c.AGING_DIAS + 1, n, 1).getValues();
    var crmStatusAdimpl     = sheet.getRange(3, c.STATUS_ADIMPL_90D + 1, n, 1).getValues();

    // ── 4. Match + monta plano de escrita + reconciliação ──
    var matched = 0;
    var contratosVistosNoCRM = {};
    var plano = []; // { idxArr (0-based em arrays), contratoNorm, faixaRisco, neverPaid }
    var divergRisco = [];        // anexo Risco 4-5 + Never Paid, mas CRM STATUS_ADIMPL = EM_DIA
    var divergCancelamento = []; // anexo tem Data Cancelamento, CRM STATUS ≠ cancelado

    for (var i = 0; i < n; i++) {
      var idCRM = _cruzNormIdServer_(crmContratos[i][0]);
      if (!idCRM) continue;
      var info = porContrato[idCRM];
      if (!info) continue;
      contratosVistosNoCRM[idCRM] = true;
      matched++;

      plano.push({
        idxArr: i,
        contratoNorm: idCRM,
        linhaCrm: i + 3,
        faixaRisco: info.faixaRisco,
        neverPaid: info.neverPaid
      });

      // Divergência risco vs SAFRA: anexo grita "Risco 4-5 + Never Paid"
      // mas o daily SAFRA (Fase 4) marca STATUS_ADIMPL_90D = EM_DIA. Pode
      // indicar que o cliente regularizou recentemente (anexo defasado) OU
      // que a SAFRA não viu a fatura aberta ainda. Operador investiga.
      var statusAdimplCrm = String(crmStatusAdimpl[i][0] || '').toUpperCase();
      var risco = info.faixaRisco;
      var nPaid = info.neverPaid;
      var temSinalForte = (risco === 4 || risco === 5) ||
                          (nPaid === 'NEVER_PAID' || nPaid === 'COM_ATRASO');
      var crmDizEmDia = !statusAdimplCrm || statusAdimplCrm === 'EM_DIA' ||
                        statusAdimplCrm === 'NORMAL' || statusAdimplCrm === 'ATIVO';
      if (temSinalForte && crmDizEmDia) {
        divergRisco.push({
          contrato: idCRM, linhaCrm: i + 3,
          cliente: String(crmCliente[i][0] || ''),
          anexoFaixaRisco: risco,
          anexoNeverPaid: nPaid,
          anexoAging: info.aging,
          crmAgingDias: crmAgingAtual[i][0] || 0,
          crmStatusAdimpl: statusAdimplCrm || '(vazio)'
        });
      }

      // Divergência de cancelamento: anexo registra Data Cancelamento
      // mas CRM ainda mostra STATUS ≠ cancelado.
      var statusCrm = String(crmStatus[i][0] || '').toUpperCase();
      var crmCancelado = statusCrm.indexOf('CANCEL') > -1;
      if (info.dataCancelamento && !crmCancelado) {
        divergCancelamento.push({
          contrato: idCRM, linhaCrm: i + 3,
          cliente: String(crmCliente[i][0] || ''),
          anexoDataCancelamento: info.dataCancelamento,
          anexoStatusContrato: info.statusContrato,
          crmStatus: String(crmStatus[i][0] || '')
        });
      }
    }

    // Órfãos: contratos no anexo sem venda correspondente no CRM
    var orfaos = [];
    contratos.forEach(function(id) {
      if (!contratosVistosNoCRM[id]) {
        var info = porContrato[id];
        orfaos.push({
          contrato: id,
          anexoFaixaRisco: info.faixaRisco,
          anexoStatusContrato: info.statusContrato,
          anexoDataEntrada: info.dataEntrada,
          anexoDataCancelamento: info.dataCancelamento
        });
      }
    });

    // ── 5. Se preview, retorna sem escrever ──
    var statusUltimo = getInadimplenciaStatusUltimoRefresh();
    var jaAplicado = !!(statusUltimo && statusUltimo.jaAplicado);

    if (!opts.confirmar) {
      return {
        ok: true, modo: 'preview',
        jaAplicado: jaAplicado, infoUltimo: jaAplicado ? statusUltimo.info : null,
        periodoTexto: periodoTexto,
        headers: headers, indicesResolvidos: idx,
        linhasRelatorio: rows.length,
        skipSemContrato: skipSemContrato,
        contratosNoRelatorio: totalContratos,
        matched: matched,
        orfaos: orfaos.length,
        orfaosAmostra: orfaos.slice(0, 10),
        divergRisco: divergRisco.length,
        divergRiscoAmostra: divergRisco.slice(0, 10),
        divergCancelamento: divergCancelamento.length,
        divergCancelamentoAmostra: divergCancelamento.slice(0, 10),
        distribuicoes: {
          faixaRisco: distRisco,
          neverPaid: distNeverPaid,
          inadimplencia: distInadimp,
          statusContrato: distStatus
        }
      };
    }

    // ── 6. Aplica em batch (FAIXA_RISCO + NEVER_PAID + ULTIMO_REFRESH_RISCO) ──
    var tz = Session.getScriptTimeZone();
    var quandoStr = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
    var quandoIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');

    plano.forEach(function(p) {
      if (p.faixaRisco !== null && p.faixaRisco !== undefined && p.faixaRisco !== '') {
        crmFaixaRiscoAtual[p.idxArr][0] = p.faixaRisco;
      }
      if (p.neverPaid) {
        crmNeverPaidAtual[p.idxArr][0] = p.neverPaid;
      }
      crmUltimoRefresh[p.idxArr][0] = quandoStr;
    });

    sheet.getRange(3, c.FAIXA_RISCO + 1, n, 1).setValues(crmFaixaRiscoAtual);
    sheet.getRange(3, c.NEVER_PAID + 1, n, 1).setValues(crmNeverPaidAtual);
    sheet.getRange(3, c.ULTIMO_REFRESH_RISCO + 1, n, 1).setValues(crmUltimoRefresh);

    // ── 7. Materializa as 3 abas auxiliares ──
    var resSnapshot = _inadMaterializarSnapshot_(ss, porContrato, quandoStr, periodoTexto);
    var resHistorico = _inadAppendHistorico_(ss, porContrato, quandoStr, periodoTexto);
    var resReconciliacao = _inadMaterializarReconciliacao_(ss, {
      quandoStr: quandoStr,
      orfaos: orfaos,
      divergRisco: divergRisco,
      divergCancelamento: divergCancelamento
    });

    // ── 8. Marca idempotência ──
    var registro = {
      quando: quandoIso,
      quandoStr: quandoStr,
      periodoTexto: periodoTexto,
      linhasRelatorio: rows.length,
      contratosNoRelatorio: totalContratos,
      matched: matched,
      orfaos: orfaos.length,
      divergRisco: divergRisco.length,
      divergCancelamento: divergCancelamento.length,
      distribuicoes: {
        faixaRisco: distRisco,
        neverPaid: distNeverPaid,
        inadimplencia: distInadimp
      },
      snapshot: resSnapshot,
      historico: resHistorico,
      reconciliacao: resReconciliacao
    };
    PropertiesService.getScriptProperties().setProperty(
      'INADIMPLENCIA_VERO_ULTIMO_REFRESH', JSON.stringify(registro)
    );

    // ── 9. Limpa cache (FAIXA_RISCO/NEVER_PAID podem aparecer em painéis Q2) ──
    try { _limparCacheListaV3(); } catch (e) {}

    return {
      ok: true, modo: 'aplicado',
      quandoStr: quandoStr,
      escrito: matched,
      contratosNoRelatorio: totalContratos,
      orfaos: orfaos.length,
      orfaosAmostra: orfaos.slice(0, 10),
      divergRisco: divergRisco.length,
      divergRiscoAmostra: divergRisco.slice(0, 10),
      divergCancelamento: divergCancelamento.length,
      divergCancelamentoAmostra: divergCancelamento.slice(0, 10),
      distribuicoes: {
        faixaRisco: distRisco,
        neverPaid: distNeverPaid,
        inadimplencia: distInadimp
      },
      snapshot: resSnapshot,
      historico: resHistorico,
      reconciliacao: resReconciliacao,
      registro: registro
    };
  } catch (e) {
    Logger.log('aplicarInadimplencia ERRO: ' + e.message + ' | ' + e.stack);
    return { ok: false, erro: e.message };
  }
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

// Resolve os índices das 28 cols do anexo Vero. Defensivo a renames/encoding
// (Vero entrega latin-1; SheetJS já converte pra UTF-8 antes de chegar aqui,
// mas patterns toleram acentos).
function _inadResolverIndices_(headers) {
  var idx = {
    contrato: -1, statusContrato: -1, dataEntrada: -1, dataCancelamento: -1,
    tipoPessoa: -1, macroRegiao: -1, regional: -1, rede: -1, cidade: -1, bairro: -1,
    canal: -1, subgrupoCanal: -1, tipoCanal: -1, vendedor: -1,
    fatura: -1, valor: -1, vencimento: -1, pagamento: -1,
    aging: -1, inadimplencia: -1, neverPaid: -1,
    roku: -1, movel: -1, mesh: -1,
    plano: -1, valorPlano: -1, faixaRisco: -1, crm: -1
  };
  for (var i = 0; i < headers.length; i++) {
    var h = _inadNormHeader_(headers[i]);
    if (idx.contrato < 0 && h === 'contrato') idx.contrato = i;
    else if (idx.statusContrato < 0 && /status\s*contrato/.test(h)) idx.statusContrato = i;
    else if (idx.dataEntrada < 0 && /data\s*entrada/.test(h)) idx.dataEntrada = i;
    else if (idx.dataCancelamento < 0 && /data\s*cancelamento/.test(h)) idx.dataCancelamento = i;
    else if (idx.tipoPessoa < 0 && /tipo\s*de\s*pessoa/.test(h)) idx.tipoPessoa = i;
    else if (idx.macroRegiao < 0 && /macro\s*regiao/.test(h)) idx.macroRegiao = i;
    else if (idx.regional < 0 && h === 'regional') idx.regional = i;
    else if (idx.rede < 0 && h === 'rede') idx.rede = i;
    else if (idx.cidade < 0 && h === 'cidade') idx.cidade = i;
    else if (idx.bairro < 0 && h === 'bairro') idx.bairro = i;
    else if (idx.canal < 0 && h === 'canal') idx.canal = i;
    else if (idx.subgrupoCanal < 0 && /subgrupo\s*canal/.test(h)) idx.subgrupoCanal = i;
    else if (idx.tipoCanal < 0 && /tipo\s*canal/.test(h)) idx.tipoCanal = i;
    else if (idx.vendedor < 0 && h === 'vendedor') idx.vendedor = i;
    else if (idx.fatura < 0 && h === 'fatura') idx.fatura = i;
    else if (idx.valor < 0 && h === 'valor') idx.valor = i;
    else if (idx.vencimento < 0 && h === 'vencimento') idx.vencimento = i;
    else if (idx.pagamento < 0 && h === 'pagamento') idx.pagamento = i;
    else if (idx.aging < 0 && h === 'aging') idx.aging = i;
    else if (idx.inadimplencia < 0 && /inadimplencia/.test(h)) idx.inadimplencia = i;
    else if (idx.neverPaid < 0 && /never\s*paid/.test(h)) idx.neverPaid = i;
    else if (idx.roku < 0 && h === 'roku') idx.roku = i;
    else if (idx.movel < 0 && h === 'movel') idx.movel = i;
    else if (idx.mesh < 0 && h === 'mesh') idx.mesh = i;
    else if (idx.plano < 0 && h === 'plano') idx.plano = i;
    else if (idx.valorPlano < 0 && /valor\s*do\s*plano/.test(h)) idx.valorPlano = i;
    else if (idx.faixaRisco < 0 && /faixa\s*de\s*risco/.test(h)) idx.faixaRisco = i;
    else if (idx.crm < 0 && h === 'crm') idx.crm = i;
  }
  return idx;
}

function _inadNormHeader_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function _inadNumOrNull_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).replace(/R\$\s*/i, '').replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.');
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}

// "4 - Alto Risco" → 4 | "5 - Altíssimo Risco" → 5 | "6 - Sem Informação" → 6
// Fallback: tenta parseInt direto se já vier numérico.
function _inadParseFaixaRisco_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    var n = parseInt(v, 10);
    return (n >= 1 && n <= 6) ? n : null;
  }
  var s = String(v).trim();
  var m = s.match(/^(\d)\b/);
  if (m) {
    var k = parseInt(m[1], 10);
    return (k >= 1 && k <= 6) ? k : null;
  }
  return null;
}

// "Em Dia" → EM_DIA | "Never Paid" → NEVER_PAID | "Com Atraso" → COM_ATRASO
function _inadNormalizeNeverPaid_(v) {
  if (!v) return '';
  var s = String(v).toUpperCase().trim();
  if (s.indexOf('NEVER') > -1) return 'NEVER_PAID';
  if (s.indexOf('ATRASO') > -1 || s.indexOf('ATRAS') > -1) return 'COM_ATRASO';
  if (s.indexOf('EM DIA') > -1 || s.indexOf('EM_DIA') > -1) return 'EM_DIA';
  return '';
}

// "Pago sem atraso" → PAGO_SEM_ATRASO | "Pago com atraso" → PAGO_COM_ATRASO
// "Atrasado 30 dias" → ATRASADO_30D
function _inadNormalizeInadimp_(v) {
  if (!v) return '';
  var s = String(v).toUpperCase().trim();
  if (s.indexOf('PAGO') > -1 && s.indexOf('SEM') > -1) return 'PAGO_SEM_ATRASO';
  if (s.indexOf('PAGO') > -1 && s.indexOf('COM') > -1) return 'PAGO_COM_ATRASO';
  if (s.indexOf('ATRASADO') > -1) return 'ATRASADO_30D';
  return '';
}

// Date | "DD/MM/YYYY" | "" → "DD/MM/YYYY" ou ''
function _inadDateOrEmpty_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  var s = String(v).trim();
  // Já vem normalizado pelo SheetJS na maioria dos casos
  return s;
}

// ─── Aba `Inadimplencia Vero` — snapshot atual (wipe-and-replace) ──────────
//   Schema: [CONTRATO_NORM, ...28 originais..., APLICADO_EM]
//   30 cols total. Snapshot completo do anexo, pra qualquer query/visualização
//   do operador (filtrar por aging, faixa, never paid, etc).

var INADIMPLENCIA_SNAPSHOT_SHEET = 'Inadimplencia Vero';
var INADIMPLENCIA_SNAPSHOT_HEADERS = [
  'CONTRATO_NORM',
  'Contrato', 'Status Contrato', 'Data Entrada', 'Data Cancelamento',
  'Tipo de Pessoa', 'Macro Regiao', 'Regional', 'Rede', 'Cidade', 'Bairro',
  'Canal', 'Subgrupo Canal', 'Tipo Canal', 'Vendedor',
  'Fatura', 'Valor', 'Vencimento', 'Pagamento',
  'Aging', 'Inadimplencia', 'Never Paid',
  'Roku', 'Movel', 'Mesh',
  'Plano', 'Valor do Plano', 'Faixa de Risco', 'CRM',
  'APLICADO_EM'
];

function _inadMaterializarSnapshot_(ss, porContrato, quandoStr, periodoTexto) {
  try {
    var sheet = ss.getSheetByName(INADIMPLENCIA_SNAPSHOT_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(INADIMPLENCIA_SNAPSHOT_SHEET);
      sheet.getRange(1, 1, 1, INADIMPLENCIA_SNAPSHOT_HEADERS.length)
        .setValues([INADIMPLENCIA_SNAPSHOT_HEADERS])
        .setFontWeight('bold').setBackground('#1a1e2a').setFontColor('#e4e8f5');
      sheet.setFrozenRows(1);
      try {
        sheet.setColumnWidth(1, 110);  // CONTRATO_NORM
        sheet.setColumnWidth(2, 110);  // Contrato (raw)
        sheet.setColumnWidth(3, 140);  // Status Contrato
        sheet.setColumnWidth(28, 130); // Faixa de Risco
        sheet.setColumnWidth(30, 130); // APLICADO_EM
      } catch (e) {}
    } else {
      sheet.getRange(1, 1, 1, INADIMPLENCIA_SNAPSHOT_HEADERS.length)
        .setValues([INADIMPLENCIA_SNAPSHOT_HEADERS]);
    }

    // Texto puro em CONTRATO_NORM, Contrato e APLICADO_EM (evita auto-Date)
    try {
      var maxR = Math.max(sheet.getMaxRows(), 2);
      sheet.getRange(1, 1, maxR, 2).setNumberFormat('@');
      sheet.getRange(1, 30, maxR, 1).setNumberFormat('@');
    } catch (e) {}

    // Wipe completo do snapshot (mantém só header)
    var last = sheet.getLastRow();
    if (last >= 2) {
      sheet.getRange(2, 1, last - 1, INADIMPLENCIA_SNAPSHOT_HEADERS.length).clearContent();
    }

    // Insere todos os contratos
    var novasLinhas = [];
    Object.keys(porContrato).forEach(function(id) {
      var info = porContrato[id];
      var row = info.rowOriginal;
      // 1 (CONTRATO_NORM) + 28 (originais) + 1 (APLICADO_EM) = 30
      var linha = [id];
      for (var k = 0; k < 28; k++) {
        linha.push(row[k] === undefined ? '' : row[k]);
      }
      linha.push(quandoStr);
      novasLinhas.push(linha);
    });

    if (novasLinhas.length) {
      sheet.getRange(2, 1, novasLinhas.length, INADIMPLENCIA_SNAPSHOT_HEADERS.length)
        .setValues(novasLinhas);
    }

    Logger.log('_inadMaterializarSnapshot_: ' + novasLinhas.length + ' contratos no snapshot.');
    return {
      sheet: INADIMPLENCIA_SNAPSHOT_SHEET,
      inseridas: novasLinhas.length,
      periodoTexto: periodoTexto
    };
  } catch (e) {
    Logger.log('_inadMaterializarSnapshot_ ERRO: ' + e.message + ' | ' + e.stack);
    return { erro: e.message };
  }
}

// ─── Aba `Inadimplencia Historico` — append-only ──────────────────────────
//   Schema: [APLICADO_EM, RELATORIO_PERIODO, CONTRATO_NORM, ...28 originais...]
//   31 cols total. Cada upload empilha — preserva tendência mês a mês pro
//   slider temporal do §9.2 ("ver evolução").

var INADIMPLENCIA_HISTORICO_SHEET = 'Inadimplencia Historico';
var INADIMPLENCIA_HISTORICO_HEADERS = [
  'APLICADO_EM', 'RELATORIO_PERIODO', 'CONTRATO_NORM',
  'Contrato', 'Status Contrato', 'Data Entrada', 'Data Cancelamento',
  'Tipo de Pessoa', 'Macro Regiao', 'Regional', 'Rede', 'Cidade', 'Bairro',
  'Canal', 'Subgrupo Canal', 'Tipo Canal', 'Vendedor',
  'Fatura', 'Valor', 'Vencimento', 'Pagamento',
  'Aging', 'Inadimplencia', 'Never Paid',
  'Roku', 'Movel', 'Mesh',
  'Plano', 'Valor do Plano', 'Faixa de Risco', 'CRM'
];

function _inadAppendHistorico_(ss, porContrato, quandoStr, periodoTexto) {
  try {
    var sheet = ss.getSheetByName(INADIMPLENCIA_HISTORICO_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(INADIMPLENCIA_HISTORICO_SHEET);
      sheet.getRange(1, 1, 1, INADIMPLENCIA_HISTORICO_HEADERS.length)
        .setValues([INADIMPLENCIA_HISTORICO_HEADERS])
        .setFontWeight('bold').setBackground('#1a1e2a').setFontColor('#e4e8f5');
      sheet.setFrozenRows(1);
    } else {
      sheet.getRange(1, 1, 1, INADIMPLENCIA_HISTORICO_HEADERS.length)
        .setValues([INADIMPLENCIA_HISTORICO_HEADERS]);
    }

    try {
      var maxR = Math.max(sheet.getMaxRows(), 2);
      sheet.getRange(1, 1, maxR, 3).setNumberFormat('@'); // APLICADO_EM/PERIODO/CONTRATO_NORM
      sheet.getRange(1, 4, maxR, 1).setNumberFormat('@'); // Contrato (raw)
    } catch (e) {}

    var periodoCompact = String(periodoTexto || '').replace(/\s+/g, ' ').slice(0, 500);

    var novasLinhas = [];
    Object.keys(porContrato).forEach(function(id) {
      var info = porContrato[id];
      var row = info.rowOriginal;
      var linha = [quandoStr, periodoCompact, id];
      for (var k = 0; k < 28; k++) {
        linha.push(row[k] === undefined ? '' : row[k]);
      }
      novasLinhas.push(linha);
    });

    var startRow = sheet.getLastRow() + 1;
    if (novasLinhas.length) {
      sheet.getRange(startRow, 1, novasLinhas.length, INADIMPLENCIA_HISTORICO_HEADERS.length)
        .setValues(novasLinhas);
    }

    Logger.log('_inadAppendHistorico_: ' + novasLinhas.length + ' contratos appendados ao histórico.');
    return {
      sheet: INADIMPLENCIA_HISTORICO_SHEET,
      appendadas: novasLinhas.length,
      startRow: startRow
    };
  } catch (e) {
    Logger.log('_inadAppendHistorico_ ERRO: ' + e.message + ' | ' + e.stack);
    return { erro: e.message };
  }
}

// ─── Aba `Reconciliacao Inadimplencia` — 3 categorias ─────────────────────
//   Wipe-and-replace POR APLICAÇÃO (cada upload gera uma reconciliação fresca).
//   Operador investiga manualmente — sem auto-correção de STATUS.

var INADIMPLENCIA_RECONCILIACAO_SHEET = 'Reconciliacao Inadimplencia';
var INADIMPLENCIA_RECONCILIACAO_HEADERS = [
  'APLICADO_EM', 'CATEGORIA', 'CONTRATO', 'LINHA_CRM', 'CLIENTE',
  'ANEXO_FAIXA_RISCO', 'ANEXO_NEVER_PAID', 'ANEXO_AGING', 'ANEXO_STATUS',
  'ANEXO_DATA_ENTRADA', 'ANEXO_DATA_CANCELAMENTO',
  'CRM_STATUS', 'CRM_STATUS_ADIMPL_90D', 'CRM_AGING_DIAS',
  'OBSERVACAO'
];

function _inadMaterializarReconciliacao_(ss, dados) {
  try {
    var sheet = ss.getSheetByName(INADIMPLENCIA_RECONCILIACAO_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(INADIMPLENCIA_RECONCILIACAO_SHEET);
      sheet.getRange(1, 1, 1, INADIMPLENCIA_RECONCILIACAO_HEADERS.length)
        .setValues([INADIMPLENCIA_RECONCILIACAO_HEADERS])
        .setFontWeight('bold').setBackground('#1a1e2a').setFontColor('#e4e8f5');
      sheet.setFrozenRows(1);
      try {
        sheet.setColumnWidth(2, 200);  // CATEGORIA
        sheet.setColumnWidth(3, 110);  // CONTRATO
        sheet.setColumnWidth(5, 200);  // CLIENTE
        sheet.setColumnWidth(15, 280); // OBSERVACAO
      } catch (e) {}
    } else {
      sheet.getRange(1, 1, 1, INADIMPLENCIA_RECONCILIACAO_HEADERS.length)
        .setValues([INADIMPLENCIA_RECONCILIACAO_HEADERS]);
    }

    try {
      var maxR = Math.max(sheet.getMaxRows(), 2);
      sheet.getRange(1, 1, maxR, 1).setNumberFormat('@'); // APLICADO_EM
      sheet.getRange(1, 3, maxR, 1).setNumberFormat('@'); // CONTRATO
    } catch (e) {}

    // Wipe completo (reconciliação sempre reflete o upload mais recente)
    var last = sheet.getLastRow();
    if (last >= 2) {
      sheet.getRange(2, 1, last - 1, INADIMPLENCIA_RECONCILIACAO_HEADERS.length).clearContent();
    }

    var quando = dados.quandoStr || '';
    var novasLinhas = [];

    // ── Categoria 1: ORFAO ──
    (dados.orfaos || []).forEach(function(o) {
      novasLinhas.push([
        quando, 'ORFAO',
        o.contrato, '', '',
        o.anexoFaixaRisco == null ? '' : o.anexoFaixaRisco,
        '', '', o.anexoStatusContrato || '',
        o.anexoDataEntrada || '', o.anexoDataCancelamento || '',
        '', '', '',
        'Contrato no anexo da Vero sem venda correspondente no CRM. Investigar: venda perdida, NG≠CRM, ou contrato pré-CRM.'
      ]);
    });

    // ── Categoria 2: DIVERG_RISCO_VS_SAFRA ──
    (dados.divergRisco || []).forEach(function(d) {
      novasLinhas.push([
        quando, 'DIVERG_RISCO_VS_SAFRA',
        d.contrato, d.linhaCrm, d.cliente || '',
        d.anexoFaixaRisco == null ? '' : d.anexoFaixaRisco,
        d.anexoNeverPaid || '', d.anexoAging == null ? '' : d.anexoAging, '',
        '', '',
        '', d.crmStatusAdimpl || '', d.crmAgingDias == null ? '' : d.crmAgingDias,
        'Anexo aponta risco alto + Never Paid/Com Atraso, mas SAFRA daily diz EM_DIA. Investigar: cliente regularizou OU fatura aberta não vista pela SAFRA.'
      ]);
    });

    // ── Categoria 3: DIVERG_CANCELAMENTO ──
    (dados.divergCancelamento || []).forEach(function(d) {
      novasLinhas.push([
        quando, 'DIVERG_CANCELAMENTO',
        d.contrato, d.linhaCrm, d.cliente || '',
        '', '', '', d.anexoStatusContrato || '',
        '', d.anexoDataCancelamento || '',
        d.crmStatus || '', '', '',
        'Anexo registra Data Cancelamento, mas CRM ainda mostra status ≠ cancelado. Atualizar status manualmente OU verificar com a operação.'
      ]);
    });

    if (novasLinhas.length) {
      sheet.getRange(2, 1, novasLinhas.length, INADIMPLENCIA_RECONCILIACAO_HEADERS.length)
        .setValues(novasLinhas);
    }

    Logger.log('_inadMaterializarReconciliacao_: ' + novasLinhas.length + ' divergências registradas (' +
      (dados.orfaos || []).length + ' órfãos, ' +
      (dados.divergRisco || []).length + ' risco vs safra, ' +
      (dados.divergCancelamento || []).length + ' cancelamento).');
    return {
      sheet: INADIMPLENCIA_RECONCILIACAO_SHEET,
      total: novasLinhas.length,
      orfaos: (dados.orfaos || []).length,
      divergRisco: (dados.divergRisco || []).length,
      divergCancelamento: (dados.divergCancelamento || []).length
    };
  } catch (e) {
    Logger.log('_inadMaterializarReconciliacao_ ERRO: ' + e.message + ' | ' + e.stack);
    return { erro: e.message };
  }
}
