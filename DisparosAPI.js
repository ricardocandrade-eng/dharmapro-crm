// dharmapro-crm | DisparosAPI.js | 13/05/2026
// Backend GAS — Módulo Disparos WABA
// v2: templates lidos direto da Meta API; destinatários por mailing (upload de planilha)

// ── CONFIG ─────────────────────────────────────────────────────────────────────
var CFG_DISPAROS = {
  SUPABASE_URL: 'https://zfunugupwvktcggvicuk.supabase.co/rest/v1',
  META_WABA_ID: '1266532332108897',
  META_GRAPH:   'https://graph.facebook.com/v20.0',
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

// ── HELPER META API ────────────────────────────────────────────────────────────
// Atenção: endpoints WABA (/{WABA_ID}/message_templates, /phone_numbers etc) exigem
// token com scope `whatsapp_business_management`. O META_ACCESS_TOKEN do projeto é
// um token de Meta Ads (sem esse scope) — usamos SYSTEM_USER_TOKEN (mesmo do n8n
// disparo-massa). Configurar via `_setSystemUserToken()` em `_systemUserTokenSetup.js`.
function _wabaToken_() {
  var token = PropertiesService.getScriptProperties().getProperty('SYSTEM_USER_TOKEN');
  if (!token) throw new Error('SYSTEM_USER_TOKEN não configurado nas propriedades do script. Rode _setSystemUserToken() no editor.');
  return token;
}

// ── FUNÇÕES PÚBLICAS ───────────────────────────────────────────────────────────

/** Retorna o HTML da view Disparos.html */
function getDisparosHtml() {
  return HtmlService.createHtmlOutputFromFile('Disparos').getContent();
}

/**
 * Lista templates APROVADOS direto da Meta API.
 * Não exige registro manual no Supabase — o auto-registro ocorre em criarCampanhaDisparo().
 */
function listarTemplatesDisparo() {
  var token = _wabaToken_();
  // Graph API v20 não aceita filter `?status=APPROVED` em /message_templates — trata como
  // campo desconhecido e devolve erro #100. Pedimos `status` no fields e filtramos client-side.
  var url = CFG_DISPAROS.META_GRAPH + '/' + CFG_DISPAROS.META_WABA_ID +
    '/message_templates?fields=name,status,category,quality_score,language&limit=100';

  var resp = UrlFetchApp.fetch(url, {
    headers:            { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true,
  });

  var code = resp.getResponseCode();
  if (code >= 400)
    throw new Error('Meta API → HTTP ' + code + ': ' + resp.getContentText());

  var data = JSON.parse(resp.getContentText()).data || [];

  return data
    .filter(function(t) { return t.status === 'APPROVED'; })
    .map(function(t) {
      return {
        meta_template_name: t.name,
        category:           t.category  || 'MARKETING',
        quality:            (t.quality_score || {}).score || 'GREEN',
        language:           t.language  || 'pt_BR',
        is_paused:          false,
      };
    });
}

/**
 * Garante que o template existe na tabela campaign_templates do Supabase.
 * Cria automaticamente na primeira vez que uma campanha o utiliza.
 * Retorna o id do registro.
 */
function _garantirTemplateSupabase_(templateName, category, quality, language) {
  var existing = _sbFetch_('GET',
    '/campaign_templates?meta_template_name=eq.' + encodeURIComponent(templateName) +
    '&select=id&limit=1');

  if (existing && existing.length > 0) return existing[0].id;

  var inserted = _sbFetch_('POST', '/campaign_templates', {
    meta_template_name: templateName,
    category:           category  || 'MARKETING',
    quality:            quality   || 'GREEN',
    language:           language  || 'pt_BR',
    is_paused:          false,
  });
  return inserted[0].id;
}

/**
 * Cria campanha draft + insere destinatários do mailing.
 *
 * params: {
 *   nome:             string,
 *   templateName:     string,        // meta_template_name
 *   templateCategory: string,
 *   templateQuality:  string,
 *   templateLanguage: string,
 *   recipients:       [{nome, phone}] // lista vinda do upload de planilha
 * }
 */
function criarCampanhaDisparo(params) {
  if (!params.nome)
    throw new Error('Nome da campanha obrigatório.');
  if (!params.templateName)
    throw new Error('Template obrigatório.');
  if (!params.recipients || params.recipients.length === 0)
    throw new Error('Nenhum destinatário no mailing. Faça o upload de uma planilha com contatos.');

  // 1. Garantir template no Supabase (auto-registra se for a primeira vez)
  var templateId = _garantirTemplateSupabase_(
    params.templateName,
    params.templateCategory,
    params.templateQuality,
    params.templateLanguage
  );

  // 2. Criar campanha
  var campanha = _sbFetch_('POST', '/campaigns', {
    name:               params.nome,
    template_id:        templateId,
    status:             'draft',
    current_batch_size: 100,
  });
  var campanhaId = campanha[0].id;

  // 3. Inserir destinatários em lotes de 200
  var recipients = params.recipients.map(function(r) {
    return {
      campaign_id:     campanhaId,
      phone_e164:      r.phone,
      name:            r.nome || 'Cliente',
      decision_status: 'queued',
    };
  });

  var LOTE = 200;
  for (var i = 0; i < recipients.length; i += LOTE) {
    _sbFetch_('POST', '/campaign_recipients', recipients.slice(i, i + LOTE));
  }

  return { sucesso: true, campanhaId: campanhaId, total: recipients.length };
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
 * Processa planilha XLSX enviada como base64 do client.
 * Fallback server-side para quando o SheetJS não carregou no browser.
 * Retorna [{nome, phone}] prontos para uso.
 */
function parsearPlanilhaDisparo(base64Content, filename) {
  var token = ScriptApp.getOAuthToken();

  // 1. Upload para o Drive convertendo para Google Sheets
  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64Content),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename
  );

  var boundary = '-------disparos314159265';
  var metadata = JSON.stringify({
    name:     filename,
    mimeType: 'application/vnd.google-apps.spreadsheet',
  });

  var bodyParts = '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' + metadata + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n';

  var payload = Utilities.newBlob(bodyParts).getBytes()
    .concat(blob.getBytes())
    .concat(Utilities.newBlob('\r\n--' + boundary + '--').getBytes());

  var uploadResp = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'multipart/related; boundary="' + boundary + '"',
      },
      payload:            Utilities.newBlob(payload).getBytes(),
      muteHttpExceptions: true,
    }
  );

  if (uploadResp.getResponseCode() >= 400)
    throw new Error('Erro ao converter planilha no Drive: ' + uploadResp.getContentText());

  var fileId = JSON.parse(uploadResp.getContentText()).id;

  try {
    var ss    = SpreadsheetApp.openById(fileId);
    var sheet = ss.getSheets()[0];
    var dados = sheet.getDataRange().getValues();
    return _extrairContatosPlanilha_(dados);
  } finally {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* ignora */ }
  }
}

// ── HELPER: extrai [{nome, phone}] de matriz com header na linha 0 ─────────────
function _extrairContatosPlanilha_(dados) {
  if (!dados || dados.length < 2)
    throw new Error('Arquivo vazio ou sem dados suficientes.');

  var header  = dados[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var idxTel  = _findColDisp_(header, ['telefone','whatsapp','fone','celular','phone','cel','numero','número','tel']);
  var idxNome = _findColDisp_(header, ['nome','name','cliente','contato']);

  if (idxTel < 0)
    throw new Error('Coluna de telefone não encontrada. Use um cabeçalho como: telefone, whatsapp, celular ou phone.');

  var vistos   = {};
  var contatos = [];

  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    if (!row || !row[idxTel]) continue;

    var tel = String(row[idxTel]).replace(/\D/g, '');
    if (tel.length < 10) continue;
    if (!tel.startsWith('55')) tel = '55' + tel;
    var phone = '+' + tel;
    if (vistos[phone]) continue;
    vistos[phone] = true;

    var nome = idxNome >= 0 ? String(row[idxNome] || '').trim() : '';
    contatos.push({ phone: phone, nome: nome || 'Cliente' });
  }

  if (contatos.length === 0)
    throw new Error('Nenhum telefone válido encontrado no arquivo.');

  return contatos;
}

function _findColDisp_(header, candidates) {
  for (var i = 0; i < header.length; i++)
    for (var j = 0; j < candidates.length; j++)
      if (header[i].includes(candidates[j])) return i;
  return -1;
}
