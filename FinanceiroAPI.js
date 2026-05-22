// ══════════════════════════════════════════════════════════════════════════════
//  FinanceiroAPI — backend GAS do Painel Financeiro (Módulo Financeiro, Fase 9)
//  Spec: ARCHITECTURE_FINANCEIRO.md §8.1 (Q1 — Projeção de Caixa).
//
//  Públicas (google.script.run):
//    getFinanceiroHtml()              → string HTML (página injetada)
//    getProjecaoCaixa()               → { ok, meses[], cobertura, observacoes }
//
//  Q1 — Projeção de Caixa (4 meses): para cada mês de competência, soma
//  (PONTOS_VENDA + PONTOS_MOVEL) × fator estimado do tier (nº de instalações).
//  Fórmula §11.9 confirmada. "Realizado" depende do import do extrato (Fase 7) —
//  por ora vem vazio. Acesso: admin only (gate no menu + _assertAdmin_ opcional).
// ══════════════════════════════════════════════════════════════════════════════

function getFinanceiroHtml() {
  return HtmlService.createHtmlOutputFromFile('Financeiro').getContent();
}

// Helper: yyyy-MM de uma data dd/MM/yyyy ou Date. Retorna '' se inválida.
function _finMesDeData_(v) {
  if (!v) return '';
  var d = (v instanceof Date) ? v : _parseDDMMYYYY_(String(v).trim());
  if (!d || isNaN(d)) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
}

// Helper: adiciona N meses a um 'yyyy-MM' → 'yyyy-MM'.
function _finAddMes_(ym, n) {
  var p = ym.split('-');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1 + n, 1);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
}

// Helper: rótulo amigável 'yyyy-MM' → 'Mai/26'.
function _finLabelMes_(ym) {
  var meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var p = ym.split('-');
  return meses[parseInt(p[1], 10) - 1] + '/' + p[0].slice(2);
}

// Q1 — Projeção de Caixa dos próximos 4 meses (mês atual + 3).
function getProjecaoCaixa() {
  try {
    var sheet = _getSheet();
    var c = CONFIG.COLUNAS;
    var ultima = sheet.getLastRow();
    var total = ultima - 2;
    if (total <= 0) return { ok: true, meses: [], cobertura: { total: 0 }, observacoes: ['Sem vendas.'] };

    var raw = sheet.getRange(3, 1, total, CONFIG.TOTAL_COLUNAS).getValues();

    var hoje = new Date();
    var mesAtual = Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'yyyy-MM');
    var janela = [mesAtual, _finAddMes_(mesAtual, 1), _finAddMes_(mesAtual, 2), _finAddMes_(mesAtual, 3)];
    var idxJanela = {};
    janela.forEach(function(m, i) { idxJanela[m] = i; });

    // Buckets por mês da janela.
    var buckets = {};
    janela.forEach(function(m) {
      buckets[m] = { instaladasBL: 0, projetadasBL: 0, pontosBL: 0, pontosMovel: 0,
                     vendasComPontos: 0, vendasNoMes: 0, pontosAdimplencia: 0 };
    });

    var cob = { total: total, comMes: 0, comPontos: 0, instaladas: 0 };

    for (var i = 0; i < raw.length; i++) {
      var row = raw[i];
      var status  = String(row[c.STATUS] || '').trim();
      var produto = _normalizarTexto(row[c.PRODUTO] || '');
      var ehFibra = produto.indexOf('FIBRA') !== -1;
      var pbl = Number(row[c.PONTOS_VENDA]) || 0;
      var pmv = Number(row[c.PONTOS_MOVEL]) || 0;
      var temPontos = (pbl > 0 || pmv > 0);
      if (temPontos) cob.comPontos++;

      // Mês de competência da projeção:
      //  - instalada (status 3): MES_COMPETENCIA (vintage por instalação §11.1)
      //  - aguardando instalação (status 2): mês da AGENDA (instalação projetada)
      var mes = '', projetada = false;
      if (status === '3 - Finalizada/Instalada') {
        mes = String(row[c.MES_COMPETENCIA] || '').trim() || _finMesDeData_(row[c.INSTAL]);
        if (mes) { cob.comMes++; cob.instaladas++; }
      } else if (status === '2- Aguardando Instalação') {
        mes = _finMesDeData_(row[c.AGENDA]);
        projetada = true;
      } else {
        continue; // demais status (lead, cancelado, churn) ficam fora da projeção
      }
      if (!mes || !(mes in buckets)) continue; // fora da janela de 4 meses

      var b = buckets[mes];
      b.vendasNoMes++;
      if (ehFibra) { if (projetada) b.projetadasBL++; else b.instaladasBL++; }
      if (temPontos) {
        b.vendasComPontos++;
        b.pontosBL += pbl;
        b.pontosMovel += pmv;
        b.pontosAdimplencia += pbl * 0.4; // adimplência diferida (M+3), só sobre BL
      }
    }

    // Resolve fator por mês (tier pelo nº de instalações BL = instaladas + projetadas).
    var meses = janela.map(function(m, i) {
      var b = buckets[m];
      var instalacoesBL = b.instaladasBL + b.projetadasBL;
      var est = resolverEstrelaPorInstalacoes(instalacoesBL, m);
      var fator = est ? est.fator_base : 0;
      var tier = est ? est.tier : '—';
      var pontos = b.pontosBL + b.pontosMovel;
      var receita = pontos * fator;
      var confianca = (i === 0) ? 'parcial — em apuração'
                    : (i === 1) ? 'alta'
                    : (i === 2) ? 'média'
                    : 'baixa (estimado)';
      return {
        mes: m,
        label: _finLabelMes_(m),
        tipo: (i === 0) ? 'atual' : ('M+' + i),
        instalacoes_bl: instalacoesBL,
        instaladas_bl: b.instaladasBL,
        projetadas_bl: b.projetadasBL,
        tier: tier,
        fator_base: fator,
        pontos_bl: b.pontosBL,
        pontos_movel: b.pontosMovel,
        pontos_total: pontos,
        receita_prevista: Math.round(receita * 100) / 100,
        adimplencia_diferida: Math.round(b.pontosAdimplencia * fator * 100) / 100,
        vendas_no_mes: b.vendasNoMes,
        vendas_com_pontos: b.vendasComPontos,
        confianca: confianca,
        realizado: null // aguarda import do extrato (Fase 7)
      };
    });

    var observacoes = [];
    var pctPontos = cob.total ? Math.round(100 * cob.comPontos / cob.total) : 0;
    observacoes.push('Pontuação resolvida em ' + cob.comPontos + ' de ' + cob.total + ' vendas (' + pctPontos + '%). Cobertura cresce conforme o dicionário de códigos e o pontuacao_planos.json se expandem.');
    observacoes.push('Fator estimado pelo tier de estrela (nº de instalações BL no mês). "Realizado" virá do import do extrato mensal (Fase 7).');
    observacoes.push('Adimplência diferida (0,4 × pontos BL × fator) é liberada em M+3 se o cliente paga em dia (§11.2) — mostrada à parte.');

    return {
      ok: true,
      gerado_em: new Date().toISOString(),
      mes_atual: mesAtual,
      meses: meses,
      cobertura: cob,
      observacoes: observacoes
    };
  } catch (e) {
    Logger.log('getProjecaoCaixa erro: ' + (e && e.message || e));
    return { ok: false, mensagem: (e && e.message) || String(e), meses: [] };
  }
}
