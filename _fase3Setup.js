// ONE-SHOTS — Módulo Financeiro Fase 3 (schema 1 - Vendas, colunas AU-BL).
// Rodar no editor, na ORDEM: 1) fase3AddColunas  2) fase3BackfillDryRun (preview)
// 3) fase3Backfill (escreve). Depois de validar, DELETAR este arquivo + novo push.
//
// IMPORTANTE: nesta fase o Code.js ainda usa TOTAL_COLUNAS=46. Estas funções
// escrevem nas colunas novas por ÍNDICE EXPLÍCITO (não dependem do CONFIG).
// O bump de TOTAL_COLUNAS + escrita em vendas novas vem no Deploy 2.

// Índices 0-based das 18 colunas novas (AU=46 ... BL=63) e seus headers.
var _FASE3_COLS = [
  [46, 'COD_PLANO'], [47, 'PONTOS_VENDA'], [48, 'PONTOS_MOVEL'], [49, 'MES_COMPETENCIA'],
  [50, 'ESTRELAS_NO_MES'], [51, 'FATOR_APLICADO'], [52, 'RECEITA_PREVISTA'], [53, 'RECEITA_REALIZADA'],
  [54, 'STATUS_ADIMPL_90D'], [55, 'STATUS_CHURN'], [56, 'STATUS_SUSPENSAO'], [57, 'FAIXA_RISCO'],
  [58, 'NEVER_PAID'], [59, 'AGING_DIAS'], [60, 'ULTIMO_REFRESH_RISCO'], [61, 'ORIGEM_CONTRATO_VERO'],
  [62, 'MES_REF_VENDA'], [63, 'CLASSIFICACAO_CLUSTER']
];
var _FASE3_TOTAL_COLS = 64; // A(0)..BL(63)

// 1) Garante 64 colunas físicas + grava os headers na LINHA 2 (padrão AS2/AT2).
//    Idempotente: rodar de novo só reescreve os mesmos headers.
function fase3AddColunas() {
  var sheet = _getSheet();
  if (!sheet) throw new Error('Aba 1 - Vendas não encontrada.');
  var maxCols = sheet.getMaxColumns();
  if (maxCols < _FASE3_TOTAL_COLS) {
    sheet.insertColumnsAfter(maxCols, _FASE3_TOTAL_COLS - maxCols);
  }
  _FASE3_COLS.forEach(function(c) {
    sheet.getRange(2, c[0] + 1).setValue(c[1]); // header na row 2
  });
  var msg = 'OK — colunas garantidas até BL (64 no total); 18 headers gravados na linha 2 (AU..BL). maxCols antes=' + maxCols;
  Logger.log(msg);
  return msg;
}

// Helper interno: calcula os 4 campos econômicos de uma linha de dados (array 0-based).
function _fase3CalcLinha(row) {
  var c = CONFIG.COLUNAS;
  var plano  = row[c.PLANO];
  var cidade = row[c.CIDADE];
  var seg    = row[c.SEGMENTACAO];
  var status = String(row[c.STATUS] || '').trim();
  var instal = row[c.INSTAL];
  var cod = '', pbl = '', pmv = '', mes = '';
  if (plano && cidade) {
    try { cod = getCodigoVeroPorPlanoCidade(plano, cidade) || ''; } catch (e) {}
  }
  if (cod) {
    try {
      var p = getPontuacaoVenda(cod, seg);
      if (p && p.encontrado) { pbl = p.pontos_bl; pmv = p.pontos_movel; }
    } catch (e) {}
  }
  // MES_COMPETENCIA = vintage por instalação (§11.1): só status 3 + INSTAL preenchido.
  if (status === '3 - Finalizada/Instalada' && instal) {
    var d = (instal instanceof Date) ? instal : _parseDDMMYYYY_(String(instal));
    if (d && !isNaN(d)) {
      mes = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
    }
  }
  return { cod: cod, pbl: pbl, pmv: pmv, mes: mes };
}

// 2) DRY-RUN: percorre as vendas e RELATA quantas resolveriam cada campo, SEM escrever.
function fase3BackfillDryRun() {
  var sheet = _getSheet();
  var last = sheet.getLastRow();
  if (last < 3) return 'Sem dados (lastRow=' + last + ').';
  var n = last - 2;
  var data = sheet.getRange(3, 1, n, 46).getValues();
  var r = { total: n, cod: 0, pontos: 0, pontosMovel: 0, mes: 0 };
  for (var i = 0; i < n; i++) {
    var x = _fase3CalcLinha(data[i]);
    if (x.cod) r.cod++;
    if (x.pbl !== '' && x.pbl != null) r.pontos++;
    if (x.pmv !== '' && x.pmv != null && x.pmv > 0) r.pontosMovel++;
    if (x.mes) r.mes++;
  }
  var msg = 'DRY-RUN (nada gravado): ' + r.total + ' vendas | COD_PLANO resolvido: ' + r.cod +
            ' | PONTOS_VENDA: ' + r.pontos + ' | PONTOS_MOVEL (>0): ' + r.pontosMovel +
            ' | MES_COMPETENCIA: ' + r.mes +
            '\n(Cobertura parcial é esperada: COD depende do dicionário de cidades; PONTOS dos 22 códigos do extrato.)';
  Logger.log(msg);
  return msg;
}

// 3) BACKFILL real: grava COD_PLANO/PONTOS_VENDA/PONTOS_MOVEL/MES_COMPETENCIA nas
//    colunas novas das vendas existentes. NÃO sobrescreve com vazio o que já houver
//    (idempotente e conservador: só escreve célula quando tem valor calculado).
//    Pré-requisito: rodar fase3AddColunas antes.
function fase3Backfill() {
  var sheet = _getSheet();
  var last = sheet.getLastRow();
  if (last < 3) return 'Sem dados.';
  if (sheet.getMaxColumns() < _FASE3_TOTAL_COLS) {
    throw new Error('Colunas novas não existem. Rode fase3AddColunas() primeiro.');
  }
  var n = last - 2;
  var data = sheet.getRange(3, 1, n, 46).getValues();
  // Lê o estado atual das 4 colunas-alvo p/ preservar valores já presentes.
  var curCod = sheet.getRange(3, 47, n, 1).getValues(); // AU (idx46)+1
  var curPbl = sheet.getRange(3, 48, n, 1).getValues(); // AV
  var curPmv = sheet.getRange(3, 49, n, 1).getValues(); // AW
  var curMes = sheet.getRange(3, 50, n, 1).getValues(); // AX
  var r = { total: n, cod: 0, pontos: 0, mes: 0 };
  for (var i = 0; i < n; i++) {
    var x = _fase3CalcLinha(data[i]);
    if (x.cod) { curCod[i][0] = x.cod; r.cod++; }
    if (x.pbl !== '' && x.pbl != null) { curPbl[i][0] = x.pbl; r.pontos++; }
    if (x.pmv !== '' && x.pmv != null) { curPmv[i][0] = x.pmv; }
    if (x.mes) { curMes[i][0] = x.mes; r.mes++; }
  }
  sheet.getRange(3, 47, n, 1).setValues(curCod);
  sheet.getRange(3, 48, n, 1).setValues(curPbl);
  sheet.getRange(3, 49, n, 1).setValues(curPmv);
  sheet.getRange(3, 50, n, 1).setValues(curMes);
  try { _limparCache(); } catch (e) {}
  var msg = 'BACKFILL OK: ' + r.total + ' vendas | COD_PLANO: ' + r.cod +
            ' | PONTOS_VENDA: ' + r.pontos + ' | MES_COMPETENCIA: ' + r.mes;
  Logger.log(msg);
  return msg;
}
