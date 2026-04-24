// dharmapro-crm | DisparosAPI.js | 24/04/2026 16:30
// Backend GAS — Módulo Disparos em Massa (integração Supabase disparo-massa)
// Configurar em Extensões → Apps Script → Propriedades do script:
//   SUPABASE_SERVICE_ROLE = <service_role key do projeto zfunugupwvktcggvicuk>

// ── CONFIG ─────────────────────────────────────────────────────────────────────
var CFG_DISPAROS = {
  SUPABASE_URL: 'https://zfunugupwvktcggvicuk.supabase.co/rest/v1',
  ABA_VENDAS:   '1 - Vendas',
};

// ── HELPERS SUPABASE ───────────────────────────────────────────────────────────
function _sbKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE não configurado. Acesse Extensões → Apps Script → Propriedades do script.');
  return key;
}

function _sbHeaders_(extra) {
  var key = _sbKey_();
  var h = {
    'apikey':        key,
    'Authorization': 'Bearer ' + key,
    'Content-Type':  'application/json',
  };
  if (extra) Object.keys(extra).forEach(function(k) { h[k] = extra[k]; });
  return h;
}

function _sbFetch_(method, path, body) {
  var opts = {
    method:             method,
    headers:            _sbHeaders_(body ? { 'Prefer': 'return=representation' } : {}),
    muteHttpExceptions: true,
  };
  if (body) opts.payload = JSON.stringify(body);
  var resp = UrlFetchApp.fetch(CFG_DISPAROS.SUPABASE_URL + path, opts);
  var code = resp.getResponseCode();
  if (code >= 400) throw new Error('Supabase ' + method + ' ' + path + ' → HTTP ' + code + ': ' + resp.getContentText());
  var txt = resp.getContentText();
  return txt ? JSON.parse(txt) : [];
}

// ── FUNÇÕES PÚBLICAS ───────────────────────────────────────────────────────────

/** Retorna o HTML da view Disparos.html */
function getDisparosHtml() {
  return HtmlService.createHtmlOutputFromFile('Disparos').getContent();
}

/** Lista templates cadastrados no Supabase */
function listarTemplatesDisparo() {
  return _sbFetch_('GET', '/campaign_templates?order=meta_template_name&select=id,meta_template_name,category,quality,is_paused');
}

/** Lista campanhas com stats (view v_campaign_stats) */
function listarCampanhasDisparo() {
  return _sbFetch_('GET', '/v_campaign_stats?order=updated_at.desc&limit=50');
}

/** Muda status de uma campanha (running / paused / draft) */
function atualizarStatusCampanhaDisparo(id, status) {
  var body = { status: status, updated_at: new Date().toISOString() };
  if (status === 'paused') body.pause_reasons = JSON.stringify(['manual_dharmapro']);
  _sbFetch_('PATCH', '/campaigns?id=eq.' + id, body);
  return { sucesso: true };
}

/**
 * Conta leads que serão incluídos num disparo conforme filtro.
 * Filtros: 'todos' | 'sem_resposta_7d' | 'sem_resposta_30d' | 'sem_venda'
 */
function contarLeadsParaDisparo(filtro) {
  var leads = _buscarLeadsDisparo_(filtro);
  return { total: leads.length };
}

/**
 * Cria campanha draft + popula campaign_recipients.
 * params: { nome, templateId, filtro }
 */
function criarCampanhaDisparo(params) {
  if (!params.nome)       throw new Error('Nome da campanha obrigatório.');
  if (!params.templateId) throw new Error('Template obrigatório.');

  // 1. Criar campanha
  var campanha = _sbFetch_('POST', '/campaigns', {
    name:               params.nome,
    template_id:        params.templateId,
    status:             'draft',
    current_batch_size: 100,
  });
  var campanhaId = campanha[0].id;

  // 2. Buscar leads
  var leads = _buscarLeadsDisparo_(params.filtro || 'todos');
  if (leads.length === 0) {
    // Rollback: deletar campanha criada
    _sbFetch_('DELETE', '/campaigns?id=eq.' + campanhaId, null);
    return { sucesso: false, erro: 'Nenhum lead encontrado para o filtro selecionado.' };
  }

  // 3. Inserir destinatários em lotes de 200
  var recipients = leads.map(function(l) {
    return { campaign_id: campanhaId, phone_e164: l.phone, name: l.nome, decision_status: 'queued' };
  });
  var LOTE = 200;
  for (var i = 0; i < recipients.length; i += LOTE) {
    _sbFetch_('POST', '/campaign_recipients', recipients.slice(i, i + LOTE));
  }

  return { sucesso: true, campanhaId: campanhaId, total: leads.length };
}

// ── HELPER: busca leads da planilha ───────────────────────────────────────────
function _buscarLeadsDisparo_(filtro) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var aba  = ss.getSheetByName(CFG_DISPAROS.ABA_VENDAS);
  if (!aba) return [];

  var dados  = aba.getDataRange().getValues();
  var header = dados[0].map(function(h) { return String(h).toLowerCase().trim(); });

  // Detecta colunas por nome (tolerante a variações)
  var idxNome   = _findCol_(header, ['nome', 'cliente', 'name']);
  var idxTel    = _findCol_(header, ['whatsapp', 'fone', 'telef', 'cel', 'phone']);
  var idxStatus = _findCol_(header, ['status', 'etapa', 'situacao']);
  var idxData   = _findCol_(header, ['data atualiz', 'ult contato', 'data contato', 'data', 'atualiz']);

  if (idxTel < 0) return []; // Coluna de telefone não encontrada

  var agora    = new Date();
  var ms7d     = 7  * 24 * 3600 * 1000;
  var ms30d    = 30 * 24 * 3600 * 1000;

  var leads  = [];
  var vistos = {};

  for (var r = 1; r < dados.length; r++) {
    var linha = dados[r];

    // Normaliza telefone → E.164
    var tel = String(linha[idxTel] || '').replace(/\D/g, '');
    if (tel.length < 10) continue;
    if (!tel.startsWith('55')) tel = '55' + tel;
    var phone = '+' + tel;

    // Deduplicar
    if (vistos[phone]) continue;
    vistos[phone] = true;

    var nome = idxNome >= 0 ? String(linha[idxNome] || 'Cliente').trim() : 'Cliente';
    if (!nome) nome = 'Cliente';

    var statusVal = idxStatus >= 0 ? String(linha[idxStatus] || '').toLowerCase() : '';
    var dataVal   = idxData   >= 0 ? linha[idxData] : null;

    // Filtros
    if (filtro === 'sem_venda') {
      // Exclui registros com status que indicam venda concluída
      var vendido = ['instalado', 'contrato', 'ativo', 'concluido', 'ganho'].some(function(s) { return statusVal.includes(s); });
      if (vendido) continue;
    }

    if (filtro === 'sem_resposta_7d' || filtro === 'sem_resposta_30d') {
      if (dataVal instanceof Date) {
        var limite = filtro === 'sem_resposta_7d' ? ms7d : ms30d;
        if ((agora - dataVal) < limite) continue; // Dentro do período → pular
      }
      // Se não tem data → inclui (lead antigo sem data)
    }

    leads.push({ phone: phone, nome: nome });
  }

  return leads;
}

function _findCol_(header, candidates) {
  for (var i = 0; i < header.length; i++) {
    for (var j = 0; j < candidates.length; j++) {
      if (header[i].includes(candidates[j])) return i;
    }
  }
  return -1;
}
