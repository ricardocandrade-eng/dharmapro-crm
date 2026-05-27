// ══════════════════════════════════════════════════════════════════════════
//  CONCILIAÇÃO API — Módulo Financeiro Fase 7 (Q3 visual, §8.3)
//
//  Lê a aba `Conciliacao Mensal` (materializada pela sub-fatia 7.2 em cada
//  aplicação de extrato) e devolve dados agrupados pra a tela admin
//  `◆ Conciliação`: lista de meses disponíveis, KPIs agregados do mês alvo
//  e linhas detalhadas pra tabela filtrável no frontend.
//
//  Funções públicas:
//    getConciliacaoHtml()           — entrega o HTML da página
//    getConciliacaoDados(mes)       — dados do mês (ou último disponível)
//
//  Cache 60s no Script Cache (chave por mês). Re-aplicação de extrato
//  invalida via `_limparCacheConciliacao_(mes)` (chamado por ExtratoAPI
//  na sub-fatia 7.2).
// ══════════════════════════════════════════════════════════════════════════

var CONCILIACAO_SHEET_NAME = 'Conciliacao Mensal';
var CONCILIACAO_CACHE_TTL = 60; // segundos

// ── Entrega o HTML pra ser injetado em #conciliacaoContainer ────────────────
function getConciliacaoHtml() {
  return HtmlService.createHtmlOutputFromFile('Conciliacao').getContent();
}

// ── Dados pra renderização ──────────────────────────────────────────────────
// mes (opcional): YYYY-MM. Se vazio/null, devolve o mais recente disponível.
function getConciliacaoDados(mes) {
  try {
    var cacheKey = CONFIG.CACHE_PREFIX + 'conciliacao_v1_' + (mes || 'auto');
    var cache = CacheService.getScriptCache();
    try {
      var hit = cache.get(cacheKey);
      if (hit) return JSON.parse(hit);
    } catch (e) {}

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONCILIACAO_SHEET_NAME);
    if (!sheet) {
      return { ok: true, vazio: true, mensagem: 'Aba "' + CONCILIACAO_SHEET_NAME + '" ainda não existe. Aplique um extrato na página Extrato Mensal pra gerar a primeira conciliação.' };
    }
    var last = sheet.getLastRow();
    if (last < 2) {
      return { ok: true, vazio: true, mensagem: 'Aba "' + CONCILIACAO_SHEET_NAME + '" sem dados ainda. Aplique um extrato.' };
    }

    var n = last - 1;
    // Schema (17 cols, ver ExtratoAPI._materializarConciliacaoMensal_):
    // 1 MES_REF | 2 LINHA_CRM | 3 CONTRATO | 4 CLIENTE | 5 PLANO | 6 PRODUTO
    // 7 SEGMENTACAO | 8 COD_PLANO | 9 PONTOS_VENDA | 10 PONTOS_MOVEL
    // 11 FATOR_APLICADO | 12 RECEITA_PREVISTA | 13 RECEITA_REALIZADA
    // 14 DIFF | 15 PCT | 16 FLAG | 17 APLICADO_EM
    var raw = sheet.getRange(2, 1, n, 17).getValues();

    // Distinct MES_REF (desc) + último aplicado_em por mês.
    // Normalizamos defensivamente: o Sheets pode ter convertido strings em Date
    // se as cols não estavam formatadas como @ no momento da escrita (caso das
    // execuções de 27/05 antes do fix). Reconvertemos pra string esperada.
    var mesesSet = {};
    var aplicadoEmPorMes = {};
    raw.forEach(function(row) {
      var m = _conciliacaoNormMesRef_(row[0]);
      if (!m) return;
      mesesSet[m] = true;
      var aplicado = _conciliacaoNormAplicadoEm_(row[16]);
      if (aplicado && (!aplicadoEmPorMes[m] || aplicado > aplicadoEmPorMes[m])) {
        aplicadoEmPorMes[m] = aplicado;
      }
    });
    var mesesDisponiveis = Object.keys(mesesSet).sort().reverse();
    if (!mesesDisponiveis.length) {
      return { ok: true, vazio: true, mensagem: 'Sem meses na aba "' + CONCILIACAO_SHEET_NAME + '".' };
    }

    var mesAtivo = (mes && mesesSet[mes]) ? mes : mesesDisponiveis[0];

    var linhas = [];
    // KPIs em 2 dimensões pra evitar a falsa "diferença gigante" causada por
    // misturar comparáveis (têm previsto) com sem-previsto (só têm realizado).
    var kpis = {
      totalLinhas: 0,
      // Comparáveis: vendas com previsto > 0 — única dimensão onde a conciliação
      // tem significado (Realizado − Previsto = diferença real).
      comparaveis: { qtd: 0, previsto: 0, realizado: 0, diff: 0 },
      // Sem previsto: vendas sem PONTOS_VENDA/PONTOS_MOVEL (legacy massivo).
      // Só Realizado, sem diferença comparável.
      semPrevisto: { qtd: 0, realizado: 0 },
      // Bruto: soma de todas as linhas (informativo). Diff bruto NÃO é métrica
      // de conciliação — só pra mostrar magnitude do realizado total.
      totalRealizadoBruto: 0,
      flagDist: { OK: 0, DIVERG_LEVE: 0, DIVERG_GRAVE: 0, SEM_PREVISTO: 0 },
      aplicadoEm: aplicadoEmPorMes[mesAtivo] || ''
    };

    raw.forEach(function(row) {
      if (_conciliacaoNormMesRef_(row[0]) !== mesAtivo) return;
      var previsto = Number(row[11] || 0);
      var real = Number(row[12] || 0);
      var diff = Number(row[13] || (real - previsto));
      var pct = row[14] === '' || row[14] == null ? null : Number(row[14]);
      var flag = String(row[15] || '').trim() || 'SEM_PREVISTO';

      linhas.push({
        linhaCrm: row[1],
        contrato: String(row[2] || ''),
        cliente: String(row[3] || ''),
        plano: String(row[4] || ''),
        produto: String(row[5] || ''),
        segmentacao: String(row[6] || ''),
        codPlano: String(row[7] || ''),
        pontosVenda: Number(row[8] || 0),
        pontosMovel: Number(row[9] || 0),
        fatorAplicado: row[10] === '' || row[10] == null ? null : Number(row[10]),
        previsto: previsto,
        realizado: real,
        diff: diff,
        pct: pct,
        flag: flag
      });

      kpis.totalLinhas++;
      kpis.totalRealizadoBruto += real;
      if (flag === 'SEM_PREVISTO') {
        kpis.semPrevisto.qtd++;
        kpis.semPrevisto.realizado += real;
      } else {
        kpis.comparaveis.qtd++;
        kpis.comparaveis.previsto += previsto;
        kpis.comparaveis.realizado += real;
        kpis.comparaveis.diff += (real - previsto);
      }
      if (kpis.flagDist[flag] != null) kpis.flagDist[flag]++;
    });

    // Ordena por |diff| desc — divergências em cima
    linhas.sort(function(a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });

    var resultado = {
      ok: true,
      vazio: false,
      mesesDisponiveis: mesesDisponiveis,
      mesAtivo: mesAtivo,
      kpis: kpis,
      linhas: linhas
    };

    try {
      var json = JSON.stringify(resultado);
      if (json.length < 95000) cache.put(cacheKey, json, CONCILIACAO_CACHE_TTL);
    } catch (e) {}

    return resultado;
  } catch (e) {
    Logger.log('getConciliacaoDados ERRO: ' + e.message + ' | ' + e.stack);
    return { ok: false, erro: e.message };
  }
}

// Limpa o cache de todos os meses (chamar após aplicar extrato — invalida
// a próxima leitura). Não há lista de meses no cache, então removemos só
// a chave "auto" e os meses conhecidos via Script Property (best-effort).
function _limparCacheConciliacao_(mes) {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove(CONFIG.CACHE_PREFIX + 'conciliacao_v1_auto');
    if (mes) cache.remove(CONFIG.CACHE_PREFIX + 'conciliacao_v1_' + mes);
  } catch (e) {}
}

// Normaliza MES_REF (col A). Aceita string "YYYY-MM" (esperado) ou Date
// (o Sheets pode ter convertido — bug pré-fix). Devolve "YYYY-MM" sempre.
function _conciliacaoNormMesRef_(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    var y = v.getFullYear();
    var m = v.getMonth() + 1;
    return y + '-' + (m < 10 ? '0' + m : '' + m);
  }
  var s = String(v).trim();
  // Já no formato esperado?
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  // Pode ter vindo como "01/05/2026" ou similar — tenta extrair Y-M.
  var m1 = s.match(/(\d{4})-(\d{2})/);
  if (m1) return m1[1] + '-' + m1[2];
  var m2 = s.match(/\d{2}\/(\d{2})\/(\d{4})/);
  if (m2) return m2[2] + '-' + m2[1];
  return s; // último recurso — devolve o que tem, frontend lida
}

// Normaliza APLICADO_EM (col Q) pra string "dd/MM/yyyy HH:mm".
// Cobre o caso do Sheets ter convertido a string pra Date.
function _conciliacaoNormAplicadoEm_(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  }
  var s = String(v).trim();
  // Se já parece "dd/MM/yyyy HH:mm" devolve cru
  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(s)) return s;
  // String stringificada de Date ("Wed May 27 2026 17:38:00 ...")? Tenta parsear.
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  }
  return s;
}
