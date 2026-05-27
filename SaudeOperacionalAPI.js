// ══════════════════════════════════════════════════════════════════════════════
//  SaudeOperacionalAPI — backend do Painel Q4 — Saúde Operacional
//  Spec: ARCHITECTURE_FINANCEIRO.md §8.4
//
//  Públicas (google.script.run):
//    getSaudeOperacionalHtml()                → string HTML
//    getSaudeOperacionalDados(mes?)           → { ok, mes, kpis, comparativo[] }
//
//  KPIs do mês:
//    - Faixa de estrelas estimada (tier resolvido por instalações BL no mês)
//    - %CN Vendas (cancelamento pré-instalação / total de vendas do mês)
//    - HUB disciplina (%HUB / total) — depende da Fase 7.3 (ORIGEM_CONTRATO_VERO)
//    - Churn no mês (CANCELADO_COMERCIAL via SAFRA) — breakdown vol/invol depende 7.4
//    - DU médio (vendas / dias úteis do mês, excluindo feriados de Config.js)
//    - Comparativo dos últimos 3 meses pra cada KPI
//
//  Admin only (gate via PERFIS_MENUS).
// ══════════════════════════════════════════════════════════════════════════════

function getSaudeOperacionalHtml() {
  return HtmlService.createHtmlOutputFromFile('SaudeOperacional').getContent();
}

function getSaudeOperacionalDados(mes) {
  try {
    var hoje = new Date();
    var tz = Session.getScriptTimeZone();
    var mesAlvo = mes && /^\d{4}-\d{2}$/.test(mes)
      ? mes
      : Utilities.formatDate(hoje, tz, 'yyyy-MM');

    // Janela de meses pra calcular: alvo + 3 anteriores
    var meses = [mesAlvo, _q4AddMes(mesAlvo, -1), _q4AddMes(mesAlvo, -2), _q4AddMes(mesAlvo, -3)];

    var sheet = _getSheet();
    var c = CONFIG.COLUNAS;
    var ultima = sheet.getLastRow();
    var total = ultima - 2;
    if (total <= 0) return { ok: true, mes: mesAlvo, kpis: _q4VazioKpi_(mesAlvo), comparativo: [], obs: ['Sem vendas.'] };

    var raw = sheet.getRange(3, 1, total, CONFIG.TOTAL_COLUNAS).getValues();

    // Buckets por mês
    var buckets = {};
    meses.forEach(function(m) {
      buckets[m] = {
        // Vendas criadas no mês (CRIADO_EM, ou DATA_ATIV como fallback)
        vendasCriadas: 0,         // qualquer produto — usado pra DU médio
        // %CN da Vero: trigger de multa em 5% / bônus abaixo (§8.4 + regra Ricardo)
        vendasBrutasFibra: 0,     // denominador — Fibra Alone + Fibra Combo no mês
        cancelComercialFibra: 0,  // numerador — STATUS = "Cancelamento Comercial"
        // Instalações no mês (status 3 + INSTAL no mês OU MES_COMPETENCIA do mês)
        instalacoesBL: 0,       // fibra instaladas
        pontosBL: 0,
        pontosMovel: 0,
        // Origem do contrato (vem da Fase 7.3)
        origemHUB: 0,
        origemOutras: 0,
        origemPreenchidos: 0,
        // Churn (via SAFRA — Fase 4)
        churnTotal: 0,          // STATUS_CHURN != ATIVO com MES_REF_VENDA do mês
        churnCancelComercial: 0,
        churnVoluntario: 0,
        churnInvoluntario: 0
      };
    });

    for (var i = 0; i < raw.length; i++) {
      var row = raw[i];
      var status = String(row[c.STATUS] || '').trim();
      var produto = _normalizarTexto(row[c.PRODUTO] || '');
      var ehFibra = produto.indexOf('FIBRA') !== -1; // pega "Fibra Alone" e "Fibra Combo"

      // ── Por CRIADO_EM (DU médio + %CN da Vero) ──
      var criadoEm = row[c.CRIADO_EM];
      var mesCriacao = _q4MesDeData_(criadoEm);
      if (!mesCriacao) mesCriacao = _q4MesDeData_(row[c.DATA_ATIV]);
      if (mesCriacao && buckets[mesCriacao]) {
        buckets[mesCriacao].vendasCriadas++;
        // %CN Vero: só Fibra. Denominador = vendas brutas Fibra criadas no mês.
        //           Numerador = mesmas vendas que terminaram em "Cancelamento Comercial".
        // Trigger de multa em 5%, bônus abaixo. Cohort do mês.
        if (ehFibra) {
          buckets[mesCriacao].vendasBrutasFibra++;
          if (status === 'Cancelamento Comercial') {
            buckets[mesCriacao].cancelComercialFibra++;
          }
        }
      }

      // ── Por instalação (INSTAL preenchido) ──
      // KPI histórico fiel: conta TODAS as instalações que ocorreram no mês,
      // independente do status atual no CRM. Vendas que foram instaladas em
      // abril e depois cancelaram (churn) ainda contam pra "Inst. BL de abril".
      // É o que a Vero pagou (e o que o tier de estrela do mês usa).
      // Pontos só vêm das que têm snapshot calculado (forward-only); meses
      // antigos majoritariamente têm INSTAL mas não PONTOS (memo legacy).
      var temInstal = !!row[c.INSTAL];
      if (temInstal) {
        var mesComp = String(row[c.MES_COMPETENCIA] || '').trim() || _q4MesDeData_(row[c.INSTAL]);
        if (mesComp && buckets[mesComp]) {
          var pbl = Number(row[c.PONTOS_VENDA]) || 0;
          var pmv = Number(row[c.PONTOS_MOVEL]) || 0;
          if (ehFibra) buckets[mesComp].instalacoesBL++;
          buckets[mesComp].pontosBL += pbl;
          buckets[mesComp].pontosMovel += pmv;

          // Origem do contrato (Fase 7.3 ainda não popula — defensivo)
          var origem = String(row[c.ORIGEM_CONTRATO_VERO] || '').trim().toUpperCase();
          if (origem) {
            buckets[mesComp].origemPreenchidos++;
            if (origem === 'HUB') buckets[mesComp].origemHUB++;
            else buckets[mesComp].origemOutras++;
          }
        }
      }

      // ── Churn por MES_REF_VENDA (atualizado pela SAFRA / extrato) ──
      var mesRef = String(row[c.MES_REF_VENDA] || '').trim();
      if (mesRef && buckets[mesRef]) {
        var statusChurn = String(row[c.STATUS_CHURN] || '').trim().toUpperCase();
        if (statusChurn && statusChurn !== 'ATIVO') {
          buckets[mesRef].churnTotal++;
          if (statusChurn === 'CANCELADO_COMERCIAL') buckets[mesRef].churnCancelComercial++;
          else if (statusChurn === 'CHURN_VOLUNTARIO') buckets[mesRef].churnVoluntario++;
          else if (statusChurn === 'CHURN_INVOLUNTARIO') buckets[mesRef].churnInvoluntario++;
        }
      }
    }

    // ── Resolve KPIs por mês ──
    var resumos = meses.map(function(m) {
      var b = buckets[m];
      var tier = null, fatorBase = null;
      if (b.instalacoesBL > 0) {
        try {
          var est = resolverEstrelaPorInstalacoes(b.instalacoesBL, m);
          if (est) { tier = est.tier; fatorBase = est.fator_base; }
        } catch (e) {}
      }
      // %CN Vero: Cancelamento Comercial / vendas brutas Fibra (cohort do mês).
      // Threshold 5%: acima = multa, abaixo = bônus. Regra Ricardo 27/05.
      var pctCN = b.vendasBrutasFibra > 0 ? (b.cancelComercialFibra / b.vendasBrutasFibra) : null;
      var pctHUB = b.origemPreenchidos > 0 ? (b.origemHUB / b.origemPreenchidos) : null;
      var diasUteis = _q4DiasUteis_(m);
      var duMedio = diasUteis > 0 ? (b.vendasCriadas / diasUteis) : null;
      var pontosTotal = b.pontosBL + b.pontosMovel;
      var receitaEst = (fatorBase != null) ? pontosTotal * fatorBase : null;

      return {
        mes: m,
        label: _q4LabelMes_(m),
        tier: tier,
        fator_base: fatorBase,
        instalacoes_bl: b.instalacoesBL,
        pontos_bl: b.pontosBL,
        pontos_movel: b.pontosMovel,
        pontos_total: pontosTotal,
        receita_estimada: receitaEst,
        vendas_criadas: b.vendasCriadas,           // qualquer produto — pra DU médio
        vendas_brutas_fibra: b.vendasBrutasFibra,  // denominador do %CN
        cancel_comercial_fibra: b.cancelComercialFibra, // numerador do %CN
        pct_cn: pctCN,
        alerta_cn: pctCN != null && pctCN >= 0.05, // multa Vero acima de 5%
        bonus_cn: pctCN != null && pctCN < 0.05 && b.vendasBrutasFibra > 0, // bônus abaixo
        origem_preenchidos: b.origemPreenchidos,
        origem_hub: b.origemHUB,
        pct_hub: pctHUB,
        alerta_hub: pctHUB != null && pctHUB >= 0.05,
        churn_total: b.churnTotal,
        churn_cancel_comercial: b.churnCancelComercial,
        churn_voluntario: b.churnVoluntario,
        churn_involuntario: b.churnInvoluntario,
        dias_uteis: diasUteis,
        du_medio: duMedio
      };
    });

    var atual = resumos[0];
    var anteriores = resumos.slice(1).filter(function(r) { return r.vendas_criadas > 0 || r.instalacoes_bl > 0 || r.churn_total > 0; });

    var obs = [];
    if (atual.origem_preenchidos === 0) {
      obs.push('HUB disciplina indisponível: depende da Fase 7.3 (coluna ORIGEM_CONTRATO_VERO populada pelo extrato).');
    }
    if (atual.churn_total > 0 && atual.churn_voluntario === 0 && atual.churn_involuntario === 0) {
      obs.push('Churn breakdown voluntário/involuntário indisponível: depende da Fase 7.4 (aba BD_CHURN refinando STATUS_CHURN).');
    }

    return {
      ok: true,
      mes: mesAlvo,
      gerado_em: new Date().toISOString(),
      mesesDisponiveis: meses, // permite navegação
      kpis: atual,
      comparativo: anteriores,
      obs: obs
    };
  } catch (e) {
    Logger.log('getSaudeOperacionalDados erro: ' + (e && e.message || e));
    return { ok: false, mensagem: (e && e.message) || String(e) };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function _q4AddMes(ym, n) {
  var p = ym.split('-');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1 + n, 1);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
}

function _q4LabelMes_(ym) {
  var meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var p = ym.split('-');
  return meses[parseInt(p[1], 10) - 1] + '/' + p[0].slice(2);
}

function _q4MesDeData_(v) {
  if (!v) return '';
  var d = (v instanceof Date) ? v : null;
  if (!d) {
    var s = String(v).trim();
    // dd/MM/yyyy ou dd/MM/yyyy HH:mm
    var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    else {
      var d2 = new Date(s);
      if (!isNaN(d2.getTime())) d = d2;
    }
  }
  if (!d || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
}

// Dias úteis do mês (exclui sáb/dom + feriados de DASHBOARD_CONFIG.FERIADOS).
function _q4DiasUteis_(ym) {
  try {
    var p = ym.split('-');
    var ano = parseInt(p[0], 10);
    var mes = parseInt(p[1], 10) - 1;
    var feriados = {};
    if (typeof DASHBOARD_CONFIG !== 'undefined' && DASHBOARD_CONFIG.FERIADOS) {
      DASHBOARD_CONFIG.FERIADOS.forEach(function(f) { feriados[f] = true; });
    }
    var inicio = new Date(ano, mes, 1);
    var fim = new Date(ano, mes + 1, 0);
    var du = 0;
    for (var d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      var dow = d.getDay(); // 0=dom, 6=sáb
      if (dow === 0 || dow === 6) continue;
      var iso = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (feriados[iso]) continue;
      du++;
    }
    return du;
  } catch (e) { return 0; }
}

function _q4VazioKpi_(mes) {
  return {
    mes: mes, label: _q4LabelMes_(mes),
    tier: null, fator_base: null,
    instalacoes_bl: 0, pontos_bl: 0, pontos_movel: 0, pontos_total: 0, receita_estimada: null,
    vendas_criadas: 0, vendas_brutas_fibra: 0, cancel_comercial_fibra: 0,
    pct_cn: null, alerta_cn: false, bonus_cn: false,
    origem_preenchidos: 0, origem_hub: 0, pct_hub: null, alerta_hub: false,
    churn_total: 0, churn_cancel_comercial: 0, churn_voluntario: 0, churn_involuntario: 0,
    dias_uteis: 0, du_medio: null
  };
}
