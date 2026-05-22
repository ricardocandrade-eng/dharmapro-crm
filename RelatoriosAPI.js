// ══════════════════════════════════════════════════════════════════════════════
//  RelatoriosAPI — backend GAS da aba "Relatórios" (filtros dinâmicos estilo BI)
//
//  Públicas (google.script.run):
//    getRelatoriosHtml()              → string HTML (página injetada)
//    getRelatoriosDados(janelaMeses)  → { ok, header[], rows[][], ... }
//    prewarmRelatorios()              → enche o cache em background (chamada no login)
//
//  Filosofia: o GAS entrega o dataset UMA vez; todo filtro/agregação/gráfico roda
//  no cliente (em memória), instantâneo. Por isso o backend só lê, projeta um
//  subconjunto enxuto de colunas e cacheia. Janela padrão = últimos 12 meses
//  (carga mais leve); janelaMeses=0 traz o histórico completo sob demanda.
//
//  Reuso: _getSheet, CONFIG.COLUNAS/TOTAL_COLUNAS/CACHE_PREFIX, _parseDataFlex,
//  _normalizarValorParaNumero_, _cacheGetChunked/_cachePutChunked (todos em Code.js).
// ══════════════════════════════════════════════════════════════════════════════

function getRelatoriosHtml() {
  return HtmlService.createHtmlOutputFromFile('Relatorios').getContent();
}

// Colunas que os relatórios consomem (índices de CONFIG.COLUNAS). Ordem = ordem do header.
function _relCamposProjetados_() {
  var c = CONFIG.COLUNAS;
  return [
    { k: 'canal',          i: c.CANAL,           tipo: 'txt'   },
    { k: 'status',         i: c.STATUS,          tipo: 'txt'   },
    { k: 'dataAtiv',       i: c.DATA_ATIV,       tipo: 'data'  },
    { k: 'resp',           i: c.RESP,            tipo: 'txt'   },
    { k: 'agenda',         i: c.AGENDA,          tipo: 'data'  },
    { k: 'instal',         i: c.INSTAL,          tipo: 'data'  },
    { k: 'produto',        i: c.PRODUTO,         tipo: 'txt'   },
    { k: 'plano',          i: c.PLANO,           tipo: 'txt'   },
    { k: 'valor',          i: c.VALOR,           tipo: 'valor' },
    { k: 'bairro',         i: c.BAIRRO,          tipo: 'txt'   },
    { k: 'cidade',         i: c.CIDADE,          tipo: 'txt'   },
    { k: 'segmentacao',    i: c.SEGMENTACAO,     tipo: 'txt'   },
    { k: 'criadoEm',       i: c.CRIADO_EM,       tipo: 'data'  },
    { k: 'formaPagamento', i: c.FORMA_PAGAMENTO, tipo: 'txt'   }
  ];
}

// Data da planilha → 'YYYY-MM-DD' (string ordenável e fácil de filtrar no JS). '' se inválida.
function _relDataISO_(v) {
  var d = _parseDataFlex(v);
  if (!d || isNaN(d)) return '';
  var mm = d.getMonth() + 1; if (mm < 10) mm = '0' + mm;
  var dd = d.getDate();      if (dd < 10) dd = '0' + dd;
  return d.getFullYear() + '-' + mm + '-' + dd;
}

// getRelatoriosDados(janelaMeses)
//   janelaMeses > 0  → só vendas cuja venda/instalação/agenda/criação caia nos últimos N meses
//   janelaMeses 0/null → histórico completo
//
//  Lê a planilha inteira UMA vez (mesmo padrão de getProjecaoCaixa) e, quando há
//  janela, filtra no servidor pela UNIÃO das datas relevantes — assim uma venda
//  antiga instalada recentemente NÃO some do relatório de instalações (correção
//  vs. cortar só por data de venda). O payload retornado fica do tamanho da janela.
function getRelatoriosDados(janelaMeses) {
  try {
    janelaMeses = parseInt(janelaMeses, 10);
    if (!(janelaMeses > 0)) janelaMeses = 0; // 0 = histórico completo

    var cacheKey = CONFIG.CACHE_PREFIX + 'relatorios_v1_' + janelaMeses;
    var hit = _cacheGetChunked(cacheKey);
    if (hit) { hit.cache = true; return hit; }

    var sheet  = _getSheet();
    var ultima = sheet.getLastRow();
    var total  = ultima - 2; // linha 1 = header, linha 2 = metadados, dados a partir da 3
    if (total <= 0) {
      return { ok: true, header: _relCamposProjetados_().map(function(f){return f.k;}),
               rows: [], total: 0, totalPlanilha: 0, janelaMeses: janelaMeses, gerado_em: new Date().toISOString() };
    }

    var raw    = sheet.getRange(3, 1, total, CONFIG.TOTAL_COLUNAS).getValues();
    var campos = _relCamposProjetados_();
    var header = campos.map(function(f) { return f.k; });

    // Cutoff da janela (string YYYY-MM-DD) — comparação lexicográfica funciona no formato ISO.
    var cutoff = '';
    if (janelaMeses > 0) {
      var hoje = new Date();
      var d = new Date(hoje.getFullYear(), hoje.getMonth() - janelaMeses + 1, 1);
      var mm = d.getMonth() + 1; if (mm < 10) mm = '0' + mm;
      cutoff = d.getFullYear() + '-' + mm + '-01';
    }

    var rows = [];
    for (var r = 0; r < raw.length; r++) {
      var src = raw[r];
      var out = new Array(campos.length);
      var dentro = (janelaMeses === 0); // sem janela = sempre dentro
      for (var k = 0; k < campos.length; k++) {
        var f = campos[k];
        var v = src[f.i];
        if (f.tipo === 'data') {
          var iso = _relDataISO_(v);
          out[k] = iso;
          if (!dentro && iso && iso >= cutoff) dentro = true;
        } else if (f.tipo === 'valor') {
          var n = _normalizarValorParaNumero_(v);
          out[k] = (n === '' ? 0 : n);
        } else {
          out[k] = String(v == null ? '' : v).trim();
        }
      }
      // Linha vazia de verdade (sem status nem cliente nem data) é ignorada.
      if (!out[0] && !out[1] && !out[2]) continue;
      if (dentro) rows.push(out);
    }

    var resultado = {
      ok: true,
      header: header,
      rows: rows,
      total: rows.length,
      totalPlanilha: total,
      janelaMeses: janelaMeses,
      truncado: (janelaMeses > 0),
      gerado_em: new Date().toISOString(),
      cache: false
    };

    _cachePutChunked(cacheKey, resultado, 600);
    return resultado;
  } catch (e) {
    Logger.log('getRelatoriosDados erro: ' + (e && e.message || e));
    return { ok: false, mensagem: (e && e.message) || String(e), rows: [] };
  }
}

// Enche o cache da janela padrão (12 meses) em background. Chamada fire-and-forget
// no pós-login para que a 1ª abertura do dia já venha quente. Nunca lança.
function prewarmRelatorios() {
  try {
    getRelatoriosDados(12);
    return { ok: true };
  } catch (e) {
    return { ok: false, mensagem: (e && e.message) || String(e) };
  }
}
