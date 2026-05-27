// ══════════════════════════════════════════════════════════════════════════
//  EXTRATO API — Módulo Financeiro Fase 7 (sub-fatia 1: BD_INSTALAÇÃO)
//
//  Ponte entre o parser client-side da página Extrato.html (SheetJS, em
//  produção desde 17/03) e o `1 - Vendas`. Recebe o shape `_sheets.instBL`
//  via google.script.run, faz preview server-side, e aplica em batch nas
//  colunas econômicas live:
//    - FATOR_APLICADO     (AZ=51) — do extrato fechado mensal
//    - RECEITA_REALIZADA  (BB=53) — Total Pago da BD_INSTALAÇÃO
//    - MES_REF_VENDA      (BK=62) — YYYY-MM do extrato (snapshot por venda)
//
//  Fórmula da §11.9 (Cenário 1, confirmada):
//    Total Pago = (Pontos BL + Pontos Móvel Combo + Móvel Adicional) × Fator
//
//  Idempotência via Script Property `EXTRATO_VERO_PROCESSADO_<YYYY-MM>`.
//  Confirmação obrigatória — preview server-side antes do batch write.
// ══════════════════════════════════════════════════════════════════════════

// Frontend handler (chamado por Code.js / Index.html). Mantém padrão das outras
// telas (FinanceiroAPI.getFinanceiroHtml(), etc).
function getExtratoStatusMes(mes) {
  try {
    if (!mes || !/^\d{4}-\d{2}$/.test(String(mes))) return { ok: false, erro: 'Mês inválido (esperado YYYY-MM).' };
    var raw = PropertiesService.getScriptProperties().getProperty('EXTRATO_VERO_PROCESSADO_' + mes);
    if (!raw) return { ok: true, jaProcessado: false };
    try { return { ok: true, jaProcessado: true, info: JSON.parse(raw) }; }
    catch (e) { return { ok: true, jaProcessado: true, info: { raw: raw } }; }
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

// Preview ou aplica o extrato mensal (aba BD_INSTALAÇÃO).
//   payload = { mes: 'YYYY-MM', instBL: { headers: [...], rows: [[...],[...]], contractColIdx: 0 } }
//   opts    = { confirmar: false } pra preview | { confirmar: true } pra aplicar
function aplicarExtratoMensal(payload, opts) {
  try {
    payload = payload || {};
    opts = opts || {};
    var mes = String(payload.mes || '').trim();
    var instBL = payload.instBL || {};
    var headers = instBL.headers || [];
    var rows = instBL.rows || [];

    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return { ok: false, erro: 'Mês inválido (esperado YYYY-MM).' };
    }
    if (!headers.length || !rows.length) {
      return { ok: false, erro: 'BD_INSTALAÇÃO vazia ou sem cabeçalho. Carregue um arquivo de extrato mensal primeiro.' };
    }

    // ── 1. Resolve índices das colunas-alvo por header (defensivo) ──
    var idx = _extratoResolverIndices_(headers);
    if (idx.contrato < 0) {
      return { ok: false, erro: 'Coluna de contrato não encontrada nos headers da BD_INSTALAÇÃO. Headers recebidos: ' + JSON.stringify(headers) };
    }
    if (idx.totalPago < 0 && idx.fator < 0) {
      return {
        ok: false,
        erro: 'Nenhuma coluna identificável de Total Pago/Fator. Headers recebidos: ' + JSON.stringify(headers),
        debug: { headers: headers, indices: idx }
      };
    }

    // ── 2. Agrega por contrato (mesmo contrato pode ter múltiplas linhas) ──
    var porContrato = {};
    var skipNaoNum = 0;
    rows.forEach(function(row) {
      var idBruto = row[idx.contrato];
      var id = _cruzNormIdServer_(idBruto);
      if (!id) { skipNaoNum++; return; }

      var fator = _extratoNumOrNull_(row[idx.fator]);
      var totalPago = _extratoNumOrNull_(row[idx.totalPago]);
      var pontosBL = _extratoNumOrNull_(row[idx.pontosBL]);
      var pontosMovelCombo = _extratoNumOrNull_(row[idx.pontosMovelCombo]);
      var movelAdicional = _extratoNumOrNull_(row[idx.movelAdicional]);

      if (!porContrato[id]) {
        porContrato[id] = { fator: null, totalPago: 0, pontosBL: 0, pontosMovel: 0, linhas: 0 };
      }
      var b = porContrato[id];
      b.linhas++;
      if (fator != null) b.fator = fator; // último válido
      if (totalPago != null) b.totalPago += totalPago;
      if (pontosBL != null) b.pontosBL += pontosBL;
      if (pontosMovelCombo != null) b.pontosMovel += pontosMovelCombo;
      if (movelAdicional != null) b.pontosMovel += movelAdicional;
    });
    var contratos = Object.keys(porContrato);

    // ── 3. Carrega 1 - Vendas (col CONTRATO + col PREVISTA pra divergência) ──
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return { ok: false, erro: 'Aba "' + CONFIG.SHEET_NAME + '" não encontrada.' };
    var last = sheet.getLastRow();
    if (last < 3) return { ok: false, erro: 'Sem vendas na planilha.' };
    var n = last - 2;
    var c = CONFIG.COLUNAS;

    var crmContratos = sheet.getRange(3, c.CONTRATO + 1, n, 1).getValues();
    var crmPrevistas = sheet.getRange(3, c.RECEITA_PREVISTA + 1, n, 1).getValues();
    var crmFatorAtual = sheet.getRange(3, c.FATOR_APLICADO + 1, n, 1).getValues();
    var crmReceitaRealAtual = sheet.getRange(3, c.RECEITA_REALIZADA + 1, n, 1).getValues();
    var crmMesRefAtual = sheet.getRange(3, c.MES_REF_VENDA + 1, n, 1).getValues();

    // ── 4. Match + montar plano de escrita ──
    var matched = 0, semMatchNoCRM = [], divergencias = [];
    var plano = []; // { linha, idCRM, fator, receitaReal, mes }
    var contratosVistosNoCRM = {};

    for (var i = 0; i < n; i++) {
      var idCRM = _cruzNormIdServer_(crmContratos[i][0]);
      if (!idCRM) continue;
      var info = porContrato[idCRM];
      if (!info) continue;
      contratosVistosNoCRM[idCRM] = true;

      var fator = info.fator;
      var receitaReal = info.totalPago;

      var previsto = Number(crmPrevistas[i][0] || 0);
      if (previsto > 0 && receitaReal > 0) {
        var diff = receitaReal - previsto;
        var pctDiff = Math.abs(diff) / previsto;
        if (pctDiff >= 0.05) {
          divergencias.push({
            linha: i + 3, contrato: idCRM,
            previsto: previsto, realizado: receitaReal, diff: diff, pct: pctDiff
          });
        }
      }

      plano.push({ linha: i + 3, contrato: idCRM, fator: fator, receitaReal: receitaReal, mes: mes });
      matched++;
    }

    contratos.forEach(function(id) {
      if (!contratosVistosNoCRM[id]) semMatchNoCRM.push(id);
    });

    var statusMes = getExtratoStatusMes(mes);
    var jaProcessado = !!(statusMes && statusMes.jaProcessado);

    // ── 5. Se preview, retorna sem escrever ──
    if (!opts.confirmar) {
      return {
        ok: true, modo: 'preview', mes: mes,
        jaProcessado: jaProcessado, infoUltimo: jaProcessado ? statusMes.info : null,
        headers: headers, indicesResolvidos: idx,
        contratosNoExtrato: contratos.length,
        linhasExtrato: rows.length,
        skipNaoNum: skipNaoNum,
        matched: matched,
        semMatchNoCRM: semMatchNoCRM.length,
        semMatchNoCRMAmostra: semMatchNoCRM.slice(0, 20),
        divergencias: divergencias.length,
        divergenciasAmostra: divergencias.slice(0, 20),
        agregados: {
          totalPagoSomado: contratos.reduce(function(s, k){ return s + (porContrato[k].totalPago || 0); }, 0),
          contratosComFator: contratos.filter(function(k){ return porContrato[k].fator != null; }).length
        }
      };
    }

    // ── 6. Aplica em batch (3 cols) ──
    var fatorOut = crmFatorAtual; // reusa o array já lido
    var receitaOut = crmReceitaRealAtual;
    var mesOut = crmMesRefAtual;
    plano.forEach(function(p) {
      var idxArr = p.linha - 3;
      if (p.fator != null) fatorOut[idxArr][0] = p.fator;
      if (p.receitaReal != null && p.receitaReal > 0) receitaOut[idxArr][0] = p.receitaReal;
      if (p.mes) mesOut[idxArr][0] = p.mes;
    });

    sheet.getRange(3, c.FATOR_APLICADO + 1, n, 1).setValues(fatorOut);
    sheet.getRange(3, c.RECEITA_REALIZADA + 1, n, 1).setValues(receitaOut);
    sheet.getRange(3, c.MES_REF_VENDA + 1, n, 1).setValues(mesOut);

    // ── 7. Marca idempotência ──
    var registro = {
      mes: mes,
      quando: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'),
      matched: matched,
      contratosNoExtrato: contratos.length,
      semMatchNoCRM: semMatchNoCRM.length,
      divergencias: divergencias.length
    };
    PropertiesService.getScriptProperties().setProperty('EXTRATO_VERO_PROCESSADO_' + mes, JSON.stringify(registro));

    // ── 8. Limpa cache da lista (mudou RECEITA_REALIZADA visível em painéis) ──
    try { _limparCacheListaV3(); } catch (e) {}

    return {
      ok: true, modo: 'aplicado', mes: mes,
      escrito: matched,
      contratosNoExtrato: contratos.length,
      semMatchNoCRM: semMatchNoCRM.length,
      semMatchNoCRMAmostra: semMatchNoCRM.slice(0, 20),
      divergencias: divergencias.length,
      divergenciasAmostra: divergencias.slice(0, 20),
      registro: registro
    };
  } catch (e) {
    Logger.log('aplicarExtratoMensal ERRO: ' + e.message + ' | ' + e.stack);
    return { ok: false, erro: e.message };
  }
}

// ── Helpers internos ─────────────────────────────────────────────────────────

// Detecta os índices das colunas-alvo a partir dos headers extraídos pelo
// `epExtractSheet`. Patterns case-insensitive, tolerante a underscore/espaço
// e acentuação. Retorna -1 quando não acha (defensivo).
function _extratoResolverIndices_(headers) {
  var idx = { contrato: -1, fator: -1, totalPago: -1, pontosBL: -1, pontosMovelCombo: -1, movelAdicional: -1 };
  for (var i = 0; i < headers.length; i++) {
    var h = _extratoNormHeader_(headers[i]);
    if (idx.contrato < 0 && (h === 'id contrato' || h === 'id_contrato' || h === 'contrato')) idx.contrato = i;
    if (idx.fator < 0 && /\bfator\b/.test(h)) idx.fator = i;
    if (idx.totalPago < 0 && /total\s*pago/.test(h)) idx.totalPago = i;
    if (idx.pontosBL < 0 && /pontos\s*bl/.test(h)) idx.pontosBL = i;
    if (idx.pontosMovelCombo < 0 && /pontos\s*movel\s*combo/.test(h)) idx.pontosMovelCombo = i;
    if (idx.movelAdicional < 0 && /movel\s*adicional/.test(h)) idx.movelAdicional = i;
  }
  // Fallback: o `epExtractSheet` força contractColIdx=0 quando achou via header
  if (idx.contrato < 0 && headers.length > 0) idx.contrato = 0;
  return idx;
}

function _extratoNormHeader_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function _extratoNumOrNull_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).replace(/R\$\s*/i, '').replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.');
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}
