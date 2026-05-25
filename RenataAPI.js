// dharmapro-crm | RenataAPI.js | 24/05/2026
// Backend GAS — métricas da Renata IA que dependem do CRM (não só do Supabase).
//
// A aba "Agente IA" do dashboard lê as views do Supabase direto no client. Mas
// "conversão de verdade" (lead da Renata que virou VENDA) não vive no Supabase —
// a venda mora no CRM (aba "1 - Vendas"). Esta função cruza os dois lados por
// telefone (mesmo padrão de `vincularVendaLeadMetaAds`), com janela de atribuição,
// e devolve as taxas pro dashboard.
//
// Conversão é direção única lead → venda. Não cria nem altera nada — só leitura.

var CFG_RENATA = {
  SUPABASE_PATH_METRICAS: '/v_metricas_gerais?select=total_conversas,conversas_handoff,total_leads',
  // leads + conversa embutida (FK) pra pegar telefone/data e excluir [TESTE]
  SUPABASE_PATH_LEADS: '/leads?select=id,nome,whatsapp,cpf,qualificado_em,nivel_lead,score_lead,conversas(contact_name,cidade)',
  JANELA_DIAS_DEFAULT: 30,
  GRACA_DIAS: 1,            // tolera venda lançada até 1 dia ANTES do handoff
  CACHE_TTL: 600,          // 10 min
};

/**
 * Conversão real da Renata: cruza os leads (Supabase) com as vendas do CRM por
 * telefone, dentro de uma janela de atribuição. Retorna contagens + taxas.
 *
 * @param {number} [janelaDias=30] dias após o handoff em que uma venda conta como conversão
 * @return {Object} { ok, janelaDias, conversas, handoffs, leads,
 *                     leadsConvertidos, leadsInstalados,
 *                     taxaHandoff, taxaLeadVenda, taxaConversaVenda, taxaConversaInstalada,
 *                     detalhes:[...], geradoEm }
 */
function getRenataConversao(janelaDias) {
  var janela = parseInt(janelaDias, 10) || CFG_RENATA.JANELA_DIAS_DEFAULT;
  var cacheKey = 'renata_conversao_v1_' + janela;
  try {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {}

  try {
    // 1. Denominadores: a view já exclui [TESTE] (migration 012)
    var mg = _sbFetch_('GET', CFG_RENATA.SUPABASE_PATH_METRICAS);
    var metricas = (mg && mg.length) ? mg[0] : {};
    var conversas = parseInt(metricas.total_conversas || 0, 10);
    var handoffs  = parseInt(metricas.conversas_handoff || 0, 10);
    var leadsTot  = parseInt(metricas.total_leads || 0, 10);

    // 2. Leads da Renata (com a conversa embutida pra filtrar teste)
    var leadsRaw = _sbFetch_('GET', CFG_RENATA.SUPABASE_PATH_LEADS) || [];
    var leads = leadsRaw.filter(function (l) {
      var nm = (l.conversas && l.conversas.contact_name) || '';
      return String(nm).indexOf('[TESTE]') !== 0;
    });

    // 3. Índice telefone-canônico → vendas do CRM
    var idx = _renataIndexVendasPorTelefone_();

    // 4. Match lead → venda dentro da janela
    var convertidos = 0, instalados = 0;
    var detalhes = [];
    var graceMs  = CFG_RENATA.GRACA_DIAS * 86400000;
    var janelaMs = janela * 86400000;

    leads.forEach(function (l) {
      var tel = _normalizePhoneBR_(l.whatsapp);
      var leadDate = _renataParseDate_(l.qualificado_em);
      var vendas = (tel && idx[tel]) ? idx[tel] : [];
      var venda = null;
      for (var i = 0; i < vendas.length; i++) {
        var v = vendas[i];
        var vd = v.data;
        if (!vd) continue;
        if (leadDate) {
          var delta = vd.getTime() - leadDate.getTime();
          if (delta < -graceMs || delta > janelaMs) continue; // fora da janela
        }
        // prefere a venda mais antiga dentro da janela (primeira a fechar)
        if (!venda || vd.getTime() < venda.data.getTime()) venda = v;
      }
      if (venda) {
        convertidos++;
        if (venda.instalada) instalados++;
        detalhes.push({
          nome:     l.nome || (l.conversas && l.conversas.contact_name) || '',
          cidade:   (l.conversas && l.conversas.cidade) || '',
          nivel:    l.nivel_lead || '',
          score:    parseInt(l.score_lead || 0, 10),
          contrato: venda.contrato || '',
          status:   venda.status || '',
          instalada: !!venda.instalada,
        });
      }
    });

    var pct = function (n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : 0; };
    var out = {
      ok: true,
      janelaDias: janela,
      conversas: conversas,
      handoffs: handoffs,
      leads: leadsTot,
      leadsConvertidos: convertidos,
      leadsInstalados: instalados,
      taxaHandoff:           pct(handoffs, conversas),     // % conversas → handoff (a IA qualificou)
      taxaLeadVenda:         pct(convertidos, leadsTot),   // % handoffs → venda
      taxaConversaVenda:     pct(convertidos, conversas),  // % conversas → venda (ponta a ponta)
      taxaConversaInstalada: pct(instalados, conversas),   // % conversas → venda instalada
      detalhes: detalhes,
      geradoEm: new Date().toISOString(),
    };

    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(out), CFG_RENATA.CACHE_TTL); } catch (e) {}
    return out;
  } catch (err) {
    return { ok: false, erro: String(err && err.message || err) };
  }
}

/**
 * Lê a aba de vendas uma vez e monta um índice
 *   { telefoneCanônico: [ { data:Date, status:String, contrato:String, instalada:Bool } ] }
 * Indexa por WHATS e TEL (ambos normalizados via _normalizePhoneBR_).
 * `data` = CRIADO_EM (lançamento) com fallback pra DATA_ATIV.
 */
function _renataIndexVendasPorTelefone_() {
  var c = CONFIG.COLUNAS;
  var sheet = _getSheet();
  var ult = sheet.getLastRow();
  var idx = {};
  if (ult < 3) return idx;

  // lê só até CRIADO_EM (col 43, 1-based) — evita o bloco financeiro AU-BL
  var maxCol = c.CRIADO_EM + 1;
  var raw = sheet.getRange(3, 1, ult - 2, maxCol).getValues();

  for (var r = 0; r < raw.length; r++) {
    var row = raw[r];
    var status = String(row[c.STATUS] || '');
    var data = _renataParseDate_(row[c.CRIADO_EM]) || _renataParseDate_(row[c.DATA_ATIV]);
    var registro = {
      data:      data,
      status:    status,
      contrato:  String(row[c.CONTRATO] || '').trim(),
      instalada: status.indexOf('3 ') === 0 || status.indexOf('Finalizada') !== -1,
    };
    [row[c.WHATS], row[c.TEL]].forEach(function (tel) {
      var t = _normalizePhoneBR_(tel);
      if (!t || t.length < 10) return;
      if (!idx[t]) idx[t] = [];
      idx[t].push(registro);
    });
  }
  return idx;
}

/** Parse robusto pra Date — aceita Date, ISO string, 'DD/MM/YYYY' e serial. Retorna null se inválido. */
function _renataParseDate_(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v).trim();
  if (!s) return null;
  var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);     // DD/MM/YYYY
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  var d = new Date(s);                                // ISO etc
  return isNaN(d.getTime()) ? null : d;
}
