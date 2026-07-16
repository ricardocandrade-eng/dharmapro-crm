// dharmapro-crm | ChatwootAPI.js | 16/07/2026
// Backend GAS — link "abrir conversa no Chatwoot" a partir da Lista de Vendas.
//
// Função pública (chamada via google.script.run pelo JS.html):
//   - getMapaConversasChatwoot()
//
// COMO FUNCIONA
// A tabela `conversas` do Supabase (schema da Renata, agente-ia-vero) tem como
// PK o `conversation_id` TEXT — que É o id da conversa no Chatwoot: o n8n grava
// o `conversation.id` que vem do webhook (no2_agregar_mensagens) e depois usa o
// mesmo valor direto na URL da API do Chatwoot (noF1_encontrar_followups). Com
// `contact_phone` na mesma linha, o mapa telefone → conversa sai de uma query.
//
// O join com a venda é por telefone, fora do banco (a aba "1 - Vendas" não está
// no Postgres) — mesma chave e mesma normalização do módulo Reengajamento WABA
// (_rwNormPhone_) e do wa-pessoal (_normalizePhoneBR_): DDD + 8 dígitos.
//
// ESCOPO: só conversas que passam pela Renata (número WABA). A inbox PAP entra
// no Chatwoot via Evolution e não escreve em `conversas` — venda de PAP/VeroHub/
// cadastro manual não casa e não ganha link. O frontend só mostra o botão quando
// há match, então isso degrada em silêncio (não vira link morto).
//
// Dependências:
//   - _sbFetch_ (DisparosAPI.js) — cliente Supabase REST.
//   - _cachePutChunked/_cacheGetChunked (Code.js) — o mapa passa de 100KB.

var CFG_CHATWOOT = {
  BASE_URL_DEFAULT:   'https://app.chatwoot.com',
  ACCOUNT_ID_DEFAULT: '159121',

  // order=updated_at.asc de propósito: o loop sobrescreve, então em cliente com
  // várias conversas a MAIS RECENTE é a que sobra no mapa.
  SUPABASE_PATH: '/conversas' +
                 '?select=conversation_id,contact_phone,contact_name,updated_at' +
                 '&contact_phone=not.is.null' +
                 '&order=updated_at.asc' +
                 '&limit=8000',

  CACHE_KEY: 'crm_v3_cw_conv_idx_v1',
  CACHE_TTL: 300,   // 5 min, alinhado com o índice do Reengajamento
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Normalização BR — igual a _rwNormPhone_ (ReengajamentoWABAAPI.js) e a
// _normalizePhoneBR_ (DispPessoalAPI.js). Saída: "DDD + 8 dígitos".
function _cwNormPhone_(p) {
  var d = String(p == null ? '' : p).replace(/\D/g, '');
  if (d.length >= 12 && d.substr(0, 2) === '55') d = d.substr(2);
  if (d.length === 11 && d.charAt(2) === '9')    d = d.substr(0, 2) + d.substr(3);
  return d;
}

function _cwBaseUrl_() {
  var v = PropertiesService.getScriptProperties().getProperty('CHATWOOT_BASE_URL');
  return String(v || CFG_CHATWOOT.BASE_URL_DEFAULT).replace(/\/+$/, '');
}

function _cwAccountId_() {
  var v = PropertiesService.getScriptProperties().getProperty('CHATWOOT_ACCOUNT_ID');
  return String(v || CFG_CHATWOOT.ACCOUNT_ID_DEFAULT).trim();
}

// ── PÚBLICA ───────────────────────────────────────────────────────────────────

/**
 * Índice telefone-canônico → id da conversa no Chatwoot, para a Lista de Vendas
 * montar o link. Só leitura; nunca lança (falha vira { ok:false } e a Lista
 * simplesmente não mostra o botão).
 *
 * @return {Object} { ok, baseUrl, accountId, total, mapa:{ '32988306393': '1120' },
 *                    geradoEm, mensagem? }
 */
function getMapaConversasChatwoot() {
  try {
    var hit = _cacheGetChunked(CFG_CHATWOOT.CACHE_KEY);
    if (hit && hit.mapa) return hit;
  } catch (e) { /* cache corrompido — recomputa */ }

  try {
    var rows = _sbFetch_('GET', CFG_CHATWOOT.SUPABASE_PATH) || [];
    var mapa = {};
    var total = 0;

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var conv = String(r.conversation_id == null ? '' : r.conversation_id).trim();
      if (!conv) continue;

      // Conversas de teste da Renata (migration 012 usa o mesmo prefixo).
      if (String(r.contact_name || '').indexOf('[TESTE]') === 0) continue;

      var ph = _cwNormPhone_(r.contact_phone);
      if (ph.length < 10) continue;   // telefone sujo/incompleto — não dá match confiável

      if (!mapa[ph]) total++;
      mapa[ph] = conv;                // asc ⇒ a última (mais recente) vence
    }

    var out = {
      ok:        true,
      baseUrl:   _cwBaseUrl_(),
      accountId: _cwAccountId_(),
      total:     total,
      mapa:      mapa,
      geradoEm:  new Date().toISOString(),
    };

    try { _cachePutChunked(CFG_CHATWOOT.CACHE_KEY, out, CFG_CHATWOOT.CACHE_TTL); } catch (e) {}
    return out;

  } catch (e) {
    Logger.log('getMapaConversasChatwoot erro: ' + e);
    return { ok: false, mensagem: String(e && e.message ? e.message : e), mapa: {} };
  }
}
