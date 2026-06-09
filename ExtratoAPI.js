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
    // Cols extras p/ alimentar a aba Conciliacao Mensal na confirmação
    var crmCliente = sheet.getRange(3, c.CLIENTE + 1, n, 1).getValues();
    var crmPlano = sheet.getRange(3, c.PLANO + 1, n, 1).getValues();
    var crmProduto = sheet.getRange(3, c.PRODUTO + 1, n, 1).getValues();
    var crmSegmentacao = sheet.getRange(3, c.SEGMENTACAO + 1, n, 1).getValues();
    var crmCodPlano = sheet.getRange(3, c.COD_PLANO + 1, n, 1).getValues();
    var crmPontosVenda = sheet.getRange(3, c.PONTOS_VENDA + 1, n, 1).getValues();
    var crmPontosMovel = sheet.getRange(3, c.PONTOS_MOVEL + 1, n, 1).getValues();

    // ── 4. Match + montar plano de escrita ──
    var matched = 0, semMatchNoCRM = [], divergencias = [];
    var plano = []; // { linha, idCRM, fator, receitaReal, mes }
    var contratosVistosNoCRM = {};
    // Sub-fatia 7.5 — backfill de PONTOS via extrato (Path A direto).
    // Quando a venda matched tem PONTOS_VENDA/PONTOS_MOVEL vazios E o extrato
    // traz pontosBL/pontosMovelCombo, carimba retroativamente. Resolve
    // SEM_PREVISTO legacy (39/53 em abril) — previsto bate com realizado por
    // construção pra essas vendas (flag vira OK).
    var backfill75 = { vendas: 0, somaPV: 0, somaPM: 0 };

    for (var i = 0; i < n; i++) {
      var idCRM = _cruzNormIdServer_(crmContratos[i][0]);
      if (!idCRM) continue;
      var info = porContrato[idCRM];
      if (!info) continue;
      contratosVistosNoCRM[idCRM] = true;

      var fator = info.fator;
      var receitaReal = info.totalPago;

      // 7.5 — pontos efetivos: prioriza o que já está em 1-Vendas; se vazio
      // e o extrato trouxe pontos > 0, usa o do extrato (e marca pra escrita
      // no batch). Idempotente: nunca sobrescreve valor existente.
      // Math.max(0, ...) clampa lixo: células que tiveram Date object gravado
      // (visto no caso ANDRESSA 3013549: PONTOS_MOVEL = -2.2e12, timestamp em
      // ms) viram 0 e disparam o backfill normalmente em vez de poluir o
      // previsto com valor negativo absurdo (que vira SEM_PREVISTO falso).
      var pvAtual = Math.max(0, Number(crmPontosVenda[i][0] || 0));
      var pmAtual = Math.max(0, Number(crmPontosMovel[i][0] || 0));
      var pvEfetivo = pvAtual;
      var pmEfetivo = pmAtual;
      var stampedPV = false, stampedPM = false;
      if (pvAtual <= 0 && Number(info.pontosBL || 0) > 0) {
        pvEfetivo = Number(info.pontosBL);
        stampedPV = true;
      }
      if (pmAtual <= 0 && Number(info.pontosMovel || 0) > 0) {
        pmEfetivo = Number(info.pontosMovel);
        stampedPM = true;
      }
      if (stampedPV || stampedPM) {
        backfill75.vendas++;
        if (stampedPV) backfill75.somaPV += pvEfetivo;
        if (stampedPM) backfill75.somaPM += pmEfetivo;
      }

      // RECEITA_PREVISTA: usa o que está em 1-Vendas (BA=52). Se vazio (caso
      // default hoje — não há job que popule), calcula retroativamente como
      // (PONTOS_VENDA + PONTOS_MOVEL) × FATOR_APLICADO (§11.9). Usa pontos
      // EFETIVOS (com o backfill 7.5 aplicado) — garante que SEM_PREVISTO
      // resolvido pelo 7.5 vire OK na conciliação.
      var previsto = Number(crmPrevistas[i][0] || 0);
      if (previsto <= 0 && fator != null) {
        var pontosTotal = pvEfetivo + pmEfetivo;
        if (pontosTotal > 0) previsto = pontosTotal * Number(fator);
      }

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

      plano.push({
        linha: i + 3, contrato: idCRM, fator: fator, receitaReal: receitaReal, mes: mes,
        previsto: previsto,
        cliente: String(crmCliente[i][0] || ''),
        planoNome: String(crmPlano[i][0] || ''),
        produto: String(crmProduto[i][0] || ''),
        segmentacao: String(crmSegmentacao[i][0] || ''),
        codPlano: String(crmCodPlano[i][0] || ''),
        pontosVenda: pvEfetivo,
        pontosMovel: pmEfetivo,
        stampedPV: stampedPV,
        stampedPM: stampedPM
      });
      // Atualiza arrays in-place pra escrita em batch da sub-fatia 7.5
      if (stampedPV) crmPontosVenda[i][0] = pvEfetivo;
      if (stampedPM) crmPontosMovel[i][0] = pmEfetivo;
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
        backfill75: backfill75,
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
    // Sub-fatia 7.5 — escreve PONTOS_VENDA/PONTOS_MOVEL backfilled pelo extrato.
    // Arrays já têm os valores novos in-place (loop de match); só grava se algo
    // foi carimbado pra evitar setValues desnecessário.
    if (backfill75.vendas > 0) {
      sheet.getRange(3, c.PONTOS_VENDA + 1, n, 1).setValues(crmPontosVenda);
      sheet.getRange(3, c.PONTOS_MOVEL + 1, n, 1).setValues(crmPontosMovel);
    }

    // ── 6.b. Materializa aba `Conciliacao Mensal` (sub-fatia 7.2, §8.3) ──
    var quandoStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var resConciliacao = _materializarConciliacaoMensal_(ss, mes, plano, quandoStr);

    // ── 6.c. Sub-fatia 7.4: refina STATUS_CHURN via aba BD_CHURN ──
    var resBdChurn = null;
    if (payload.bdChurn && payload.bdChurn.rows && payload.bdChurn.rows.length) {
      resBdChurn = _aplicarBdChurnEm1Vendas_(payload.bdChurn, sheet, c, n, crmContratos);
    }

    // ── 6.d. Sub-fatia 7.3: materializa agregados mensais (Extrato Vero) ──
    // Componentes do Realizado por mês: instBL, móvel, adimplência, bônus,
    // descontos (churn/inadimp/susp/estorno). Spec §8.3 do roadmap.
    var resAgregados = null;
    if (payload.agregadosResumo) {
      resAgregados = _materializarExtratoVero_(ss, mes, payload.agregadosResumo, quandoStr);
    }

    // ── 7. Marca idempotência ──
    var registro = {
      mes: mes,
      quando: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'),
      matched: matched,
      contratosNoExtrato: contratos.length,
      semMatchNoCRM: semMatchNoCRM.length,
      divergencias: divergencias.length,
      backfill75: backfill75,
      conciliacao: resConciliacao,
      bdChurn: resBdChurn,
      agregados: resAgregados
    };
    PropertiesService.getScriptProperties().setProperty('EXTRATO_VERO_PROCESSADO_' + mes, JSON.stringify(registro));

    // ── 8. Limpa cache da lista (mudou RECEITA_REALIZADA visível em painéis) ──
    try { _limparCacheListaV3(); } catch (e) {}
    try { _limparCacheConciliacao_(mes); } catch (e) {}

    return {
      ok: true, modo: 'aplicado', mes: mes,
      escrito: matched,
      contratosNoExtrato: contratos.length,
      semMatchNoCRM: semMatchNoCRM.length,
      semMatchNoCRMAmostra: semMatchNoCRM.slice(0, 20),
      divergencias: divergencias.length,
      divergenciasAmostra: divergencias.slice(0, 20),
      backfill75: backfill75,
      conciliacao: resConciliacao,
      bdChurn: resBdChurn,
      agregados: resAgregados,
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
    if (idx.contrato < 0 && /^(id[\s_]*contrato|contrato)$/.test(h)) idx.contrato = i;
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

// ─── Sub-fatia 7.2 (§8.3) — aba `Conciliacao Mensal` ────────────────────────
// Snapshot do cruzamento RECEITA_PREVISTA × RECEITA_REALIZADA por contrato,
// com flag de divergência. Wipe-and-replace POR MÊS: remove só as linhas do
// mes alvo e re-insere. Outros meses ficam intactos. Permite histórico
// acumulado mês a mês sem reprocessar tudo.

var EXTRATO_CONCILIACAO_SHEET = 'Conciliacao Mensal';
var EXTRATO_CONCILIACAO_HEADERS = [
  'MES_REF', 'LINHA_CRM', 'CONTRATO', 'CLIENTE', 'PLANO', 'PRODUTO', 'SEGMENTACAO',
  'COD_PLANO', 'PONTOS_VENDA', 'PONTOS_MOVEL', 'FATOR_APLICADO',
  'RECEITA_PREVISTA', 'RECEITA_REALIZADA', 'DIFF', 'PCT', 'FLAG', 'APLICADO_EM'
];

// ─── Sub-fatia 7.3 (§8.3) — agregados mensais em aba `Extrato Vero` ────────
// Snapshot dos componentes do Realizado por mês. Wipe-and-replace POR MÊS.
// Permite ao Painel Q3 (Conciliação) mostrar a tabela do §8.3 — decomposição
// do Realizado total: Pontos×Fator + Móvel + Adimplência + Bônus − Descontos.
//
// Os valores vêm direto do RESUMO COMPLETO parseado client-side (epDados).
// O backend não recalcula nada — só materializa pra o Q3 ler depois.

var EXTRATO_VERO_SHEET = 'Extrato Vero';
var EXTRATO_VERO_HEADERS = ['MES_REF', 'COMPONENTE', 'VALOR', 'SINAL', 'CATEGORIA', 'APLICADO_EM'];

// Definição dos componentes: label legível, campo no payload, sinal (positivo
// soma no Realizado / negativo desconta), categoria pra agrupamento visual.
var EXTRATO_VERO_COMPONENTES = [
  { campo: 'instBL',       label: 'Instalações BL',         sinal: '+', categoria: 'BASE' },
  { campo: 'movel',        label: 'Móvel',                  sinal: '+', categoria: 'BASE' },
  { campo: 'adimplencia',  label: 'Adimplência M-3',        sinal: '+', categoria: 'BONIFICACAO' },
  { campo: 'bonusQuin',    label: 'Bônus Quinzenal',        sinal: '+', categoria: 'BONIFICACAO' },
  { campo: 'bonusExtra',   label: 'Bônus Extra',            sinal: '+', categoria: 'BONIFICACAO' },
  { campo: 'multaCanc',    label: 'Multa Cancelamento',     sinal: '+', categoria: 'AJUSTE' },
  { campo: 'descChurn',    label: 'Desconto Churn',         sinal: '-', categoria: 'DESCONTO' },
  { campo: 'descInadimp',  label: 'Desconto Inadimplentes', sinal: '-', categoria: 'DESCONTO' },
  { campo: 'susp120',      label: 'Suspensos 120 dias',     sinal: '-', categoria: 'DESCONTO' },
  { campo: 'estornoMovel', label: 'Estorno Móvel Combo',    sinal: '-', categoria: 'DESCONTO' },
  { campo: 'descHUB',      label: 'Desconto HUB',           sinal: '-', categoria: 'DESCONTO' },
  { campo: 'b2bReal',      label: 'B2B Realizado',          sinal: '+', categoria: 'EXTRA' },
  { campo: 'realizado',    label: 'REALIZADO TOTAL',        sinal: '=', categoria: 'TOTAL' }
];

function _materializarExtratoVero_(ss, mes, agregados, quandoStr) {
  try {
    var sheet = ss.getSheetByName(EXTRATO_VERO_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(EXTRATO_VERO_SHEET);
      sheet.getRange(1, 1, 1, EXTRATO_VERO_HEADERS.length).setValues([EXTRATO_VERO_HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, EXTRATO_VERO_HEADERS.length)
        .setFontWeight('bold').setBackground('#1a1e2a').setFontColor('#e4e8f5');
      try {
        sheet.setColumnWidth(1, 80);   // MES_REF
        sheet.setColumnWidth(2, 220);  // COMPONENTE
        sheet.setColumnWidth(3, 120);  // VALOR
        sheet.setColumnWidth(4, 60);   // SINAL
        sheet.setColumnWidth(5, 130);  // CATEGORIA
        sheet.setColumnWidth(6, 130);  // APLICADO_EM
      } catch (e) {}
    } else {
      sheet.getRange(1, 1, 1, EXTRATO_VERO_HEADERS.length).setValues([EXTRATO_VERO_HEADERS]);
    }

    // Texto puro nas cols MES_REF e APLICADO_EM (evita auto-convert Date)
    try {
      var maxRowsForFmt = Math.max(sheet.getMaxRows(), 2);
      sheet.getRange(1, 1, maxRowsForFmt, 1).setNumberFormat('@');
      sheet.getRange(1, 6, maxRowsForFmt, 1).setNumberFormat('@');
    } catch (e) {}

    // Wipe-and-replace por MES_REF
    var last = sheet.getLastRow();
    var removidas = 0;
    if (last >= 2) {
      var colMes = sheet.getRange(2, 1, last - 1, 1).getValues();
      var linhasARemover = [];
      for (var i = 0; i < colMes.length; i++) {
        if (String(colMes[i][0] || '').trim() === mes) linhasARemover.push(i + 2);
      }
      linhasARemover.reverse();
      var j = 0;
      while (j < linhasARemover.length) {
        var fim = linhasARemover[j];
        var inicio = fim;
        var k = j + 1;
        while (k < linhasARemover.length && linhasARemover[k] === inicio - 1) {
          inicio = linhasARemover[k]; k++;
        }
        sheet.deleteRows(inicio, fim - inicio + 1);
        removidas += fim - inicio + 1;
        j = k;
      }
    }

    // Insere componentes do mês
    var novasLinhas = [];
    var totaisCat = { BASE: 0, BONIFICACAO: 0, AJUSTE: 0, DESCONTO: 0, EXTRA: 0 };
    EXTRATO_VERO_COMPONENTES.forEach(function(comp) {
      var v = Number(agregados[comp.campo] || 0);
      if (comp.categoria === 'TOTAL') {
        novasLinhas.push([mes, comp.label, v, comp.sinal, comp.categoria, quandoStr]);
        return;
      }
      // Componentes zerados não viram linha (mantém a aba limpa). Negativos
      // ficam como valor positivo + sinal '-' na col D.
      var abs = Math.abs(v);
      if (abs < 0.005) return;
      var valorGravado = comp.sinal === '-' ? -abs : abs;
      novasLinhas.push([mes, comp.label, valorGravado, comp.sinal, comp.categoria, quandoStr]);
      if (totaisCat[comp.categoria] != null) {
        totaisCat[comp.categoria] += (comp.sinal === '-' ? -abs : abs);
      }
    });

    var inseridas = 0;
    if (novasLinhas.length) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, novasLinhas.length, EXTRATO_VERO_HEADERS.length).setValues(novasLinhas);
      inseridas = novasLinhas.length;
      try {
        sheet.getRange(startRow, 3, novasLinhas.length, 1).setNumberFormat('R$ #,##0.00');
      } catch (e) {}
    }

    Logger.log('_materializarExtratoVero_ [' + mes + ']: removidas=' + removidas + ' inseridas=' + inseridas +
      ' | base=' + totaisCat.BASE.toFixed(2) +
      ' bonif=' + totaisCat.BONIFICACAO.toFixed(2) +
      ' desc=' + totaisCat.DESCONTO.toFixed(2) +
      ' realizado=' + (agregados.realizado || 0));

    return {
      sheet: EXTRATO_VERO_SHEET, mes: mes,
      removidas: removidas, inseridas: inseridas,
      totais: totaisCat,
      realizadoTotal: Number(agregados.realizado || 0)
    };
  } catch (e) {
    Logger.log('_materializarExtratoVero_ ERRO: ' + e.message + ' | ' + e.stack);
    return { erro: e.message };
  }
}

// ─── Sub-fatia 7.4 (§5 BD col) — refina STATUS_CHURN via aba BD_CHURN ──────
// Hoje a SAFRA (Fase 4) colapsa STATUS_CHURN em CANCELADO_COMERCIAL pra tudo
// que apareceu como cancelado/inativo. BD_CHURN do extrato fechado distingue
// CHURN_VOLUNTARIO (cliente cancelou) de CHURN_INVOLUNTARIO (Vero cortou).
//
// Detecta o tipo por header da aba (defensivo — nome da col pode variar):
//   - col "TIPO" / "TIPO_CHURN" / "CATEGORIA" / "MOTIVO_CHURN"
//   - valor contendo "VOLUNTAR" → CHURN_VOLUNTARIO
//   - valor contendo "INVOLUNTAR" → CHURN_INVOLUNTARIO
// Linhas sem tipo identificável caem em CHURN_VOLUNTARIO por default (a aba
// BD_CHURN historicamente lista voluntários; involuntários têm aba própria
// em alguns extratos). Log defensivo + amostra de tipos desconhecidos.
function _aplicarBdChurnEm1Vendas_(bdChurn, sheet, c, n, crmContratos) {
  try {
    var headers = bdChurn.headers || [];
    var rows = bdChurn.rows || [];
    if (!rows.length) return { processados: 0, matched: 0, vol: 0, invol: 0, semTipo: 0 };

    // Resolve cols por header
    var idxContrato = bdChurn.contractColIdx != null ? bdChurn.contractColIdx : 0;
    var idxTipo = -1;
    for (var i = 0; i < headers.length; i++) {
      var h = _extratoNormHeader_(headers[i]);
      if (idxTipo < 0 && (/\btipo\b/.test(h) || /\bcategoria\b/.test(h) || /motivo[\s_]*churn/.test(h))) {
        idxTipo = i;
      }
    }

    // Agrega por contrato (último tipo visto vence)
    var porContrato = {};
    var tiposDist = {};
    rows.forEach(function(row) {
      var id = _cruzNormIdServer_(row[idxContrato]);
      if (!id) return;
      var tipoRaw = idxTipo >= 0 ? String(row[idxTipo] || '').toUpperCase().trim() : '';
      tiposDist[tipoRaw || '(vazio)'] = (tiposDist[tipoRaw || '(vazio)'] || 0) + 1;
      var statusChurn = 'CHURN_VOLUNTARIO'; // default (memo)
      if (tipoRaw.indexOf('INVOLUNT') > -1) statusChurn = 'CHURN_INVOLUNTARIO';
      else if (tipoRaw.indexOf('VOLUNT') > -1) statusChurn = 'CHURN_VOLUNTARIO';
      porContrato[id] = statusChurn;
    });

    // Lê col STATUS_CHURN atual em batch, escreve por contrato matched
    var statusChurnArr = sheet.getRange(3, c.STATUS_CHURN + 1, n, 1).getValues();
    var stats = { processados: rows.length, matched: 0, vol: 0, invol: 0, semTipo: 0 };
    for (var k = 0; k < n; k++) {
      var idCRM = _cruzNormIdServer_(crmContratos[k][0]);
      if (!idCRM) continue;
      var novoStatus = porContrato[idCRM];
      if (!novoStatus) continue;
      statusChurnArr[k][0] = novoStatus;
      stats.matched++;
      if (novoStatus === 'CHURN_INVOLUNTARIO') stats.invol++;
      else stats.vol++;
    }
    sheet.getRange(3, c.STATUS_CHURN + 1, n, 1).setValues(statusChurnArr);

    if (idxTipo < 0) {
      Logger.log('_aplicarBdChurnEm1Vendas_: header de TIPO não encontrado. Headers: ' + JSON.stringify(headers));
      stats.semTipo = rows.length;
    }
    Logger.log('_aplicarBdChurnEm1Vendas_: ' + stats.matched + ' matches | vol ' + stats.vol + ' / invol ' + stats.invol +
      ' | dist tipos: ' + JSON.stringify(tiposDist));
    return stats;
  } catch (e) {
    Logger.log('_aplicarBdChurnEm1Vendas_ ERRO: ' + e.message + ' | ' + e.stack);
    return { erro: e.message };
  }
}

function _materializarConciliacaoMensal_(ss, mes, plano, quandoStr) {
  try {
    var sheet = ss.getSheetByName(EXTRATO_CONCILIACAO_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(EXTRATO_CONCILIACAO_SHEET);
      sheet.getRange(1, 1, 1, EXTRATO_CONCILIACAO_HEADERS.length).setValues([EXTRATO_CONCILIACAO_HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, EXTRATO_CONCILIACAO_HEADERS.length)
        .setFontWeight('bold').setBackground('#1a1e2a').setFontColor('#e4e8f5');
      // Larguras razoáveis
      try {
        sheet.setColumnWidth(1, 80);   // MES_REF
        sheet.setColumnWidth(2, 80);   // LINHA_CRM
        sheet.setColumnWidth(3, 100);  // CONTRATO
        sheet.setColumnWidth(4, 200);  // CLIENTE
        sheet.setColumnWidth(5, 260);  // PLANO
        sheet.setColumnWidth(16, 110); // FLAG
        sheet.setColumnWidth(17, 130); // APLICADO_EM
      } catch (e) {}
    } else {
      // Garante headers atualizados (idempotente — caso schema mude na fase futura)
      sheet.getRange(1, 1, 1, EXTRATO_CONCILIACAO_HEADERS.length).setValues([EXTRATO_CONCILIACAO_HEADERS]);
    }

    // Força col A (MES_REF) e col Q (APLICADO_EM) como texto puro pra evitar
    // auto-convert do Sheets ("2026-04" → Date, "27/05/2026 17:38" → Date).
    try {
      var maxRowsForFmt = Math.max(sheet.getMaxRows(), 2);
      sheet.getRange(1, 1, maxRowsForFmt, 1).setNumberFormat('@');
      sheet.getRange(1, 17, maxRowsForFmt, 1).setNumberFormat('@');
    } catch (e) {}

    var last = sheet.getLastRow();
    // Wipe-and-replace por MES_REF: lê col A das linhas existentes, identifica as do mês,
    // e remove em blocos contíguos (de baixo pra cima pra não bagunçar índices).
    var removidas = 0;
    if (last >= 2) {
      var colMes = sheet.getRange(2, 1, last - 1, 1).getValues();
      // Identifica linhas a remover (1-based, na planilha)
      var linhasARemover = [];
      for (var i = 0; i < colMes.length; i++) {
        if (String(colMes[i][0] || '').trim() === mes) linhasARemover.push(i + 2);
      }
      // Agrupa em ranges contíguos descendentes
      linhasARemover.reverse();
      var j = 0;
      while (j < linhasARemover.length) {
        var fim = linhasARemover[j];
        var inicio = fim;
        var k = j + 1;
        while (k < linhasARemover.length && linhasARemover[k] === inicio - 1) {
          inicio = linhasARemover[k];
          k++;
        }
        sheet.deleteRows(inicio, fim - inicio + 1);
        removidas += fim - inicio + 1;
        j = k;
      }
    }

    // Monta linhas novas
    var novasLinhas = [];
    var flagDist = { OK: 0, DIVERG_LEVE: 0, DIVERG_GRAVE: 0, SEM_PREVISTO: 0 };
    plano.forEach(function(p) {
      // RECEITA_PREVISTA: prioriza valor já gravado em 1-Vendas (BA=52). Se vazio
      // (que é o caso default hoje — não há job que popule a col), calcula
      // retroativamente: (PONTOS_VENDA + PONTOS_MOVEL) × FATOR_APLICADO. Como
      // estamos materializando POR MÊS APLICADO, o fator é conhecido. §11.9.
      var previsto = Number(p.previsto || 0);
      if (previsto <= 0 && p.fator != null) {
        var pontosTotal = Number(p.pontosVenda || 0) + Number(p.pontosMovel || 0);
        if (pontosTotal > 0) previsto = pontosTotal * Number(p.fator);
      }
      var real = Number(p.receitaReal || 0);
      var diff = real - previsto;
      var pct = previsto > 0 ? diff / previsto : null;
      var flag;
      if (previsto <= 0) flag = 'SEM_PREVISTO';
      else if (Math.abs(pct) < 0.05) flag = 'OK';
      else if (Math.abs(pct) < 0.20) flag = 'DIVERG_LEVE';
      else flag = 'DIVERG_GRAVE';
      flagDist[flag]++;

      novasLinhas.push([
        mes,
        p.linha,
        p.contrato,
        p.cliente,
        p.planoNome,
        p.produto,
        p.segmentacao,
        p.codPlano,
        p.pontosVenda || '',
        p.pontosMovel || '',
        p.fator != null ? p.fator : '',
        previsto || '',
        real || '',
        diff,
        pct != null ? pct : '',
        flag,
        quandoStr
      ]);
    });

    var inseridas = 0;
    if (novasLinhas.length) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, novasLinhas.length, EXTRATO_CONCILIACAO_HEADERS.length).setValues(novasLinhas);
      inseridas = novasLinhas.length;

      // Formatação leve: pct % e R$ nas cols numéricas
      try {
        sheet.getRange(startRow, 11, novasLinhas.length, 1).setNumberFormat('0.000'); // fator
        sheet.getRange(startRow, 12, novasLinhas.length, 3).setNumberFormat('R$ #,##0.00'); // previsto/realizado/diff
        sheet.getRange(startRow, 15, novasLinhas.length, 1).setNumberFormat('+0.0%;-0.0%;0.0%'); // pct
      } catch (e) {}
    }

    Logger.log('_materializarConciliacaoMensal_ [' + mes + ']: removidas=' + removidas + ' inseridas=' + inseridas +
      ' | flags=' + JSON.stringify(flagDist));
    return {
      sheet: EXTRATO_CONCILIACAO_SHEET,
      mes: mes,
      removidas: removidas,
      inseridas: inseridas,
      flagDist: flagDist
    };
  } catch (e) {
    Logger.log('_materializarConciliacaoMensal_ ERRO: ' + e.message + ' | ' + e.stack);
    return { erro: e.message };
  }
}
