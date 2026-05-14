// dharmapro-crm | DispPessoalAPI.js | wa-pessoal Fase 2
// Backend GAS — Módulo "WhatsApp Pessoal" (disparo via número comum).
// Integração com Evolution API self-hosted (v1.8.x) em
// https://evolution.ofertasverointernet.com.br
//
// Propriedades necessárias (PropertiesService):
//   EVOLUTION_API_URL  — base URL (sem barra final)
//   EVOLUTION_API_KEY  — chave hex 32 chars (mesma do .env do VPS)
//
// Setup inicial: rodar _setEvolutionProperties() em _arquivo.js uma vez.

// ── CONFIG ─────────────────────────────────────────────────────────────────────
var CFG_WA_PESSOAL = {
  ABA_INSTANCIAS: 'WA Instâncias',
  ABA_CAMPANHAS:  'WA Campanhas',
  ABA_DISPAROS:   'WA Disparos',
  ABA_BLACKLIST:  'WA Blacklist',
  DAILY_LIMIT_DEFAULT: 200,
  DELAY_MIN_DEFAULT: 12,
  DELAY_MAX_DEFAULT: 35,
  // Webhook do n8n para iniciar o despacho de uma campanha (Fase 3).
  // Default hardcoded; pode ser sobrescrito via Script Property 'N8N_WA_DESPACHO_URL'.
  N8N_DESPACHO_URL_PROP: 'N8N_WA_DESPACHO_URL',
  N8N_DESPACHO_URL_DEFAULT: 'https://n8n.ofertasverointernet.com.br/webhook/wa-pessoal-despacho',
  // Secret próprio do módulo wa-pessoal — validado pelo doPost antes de invocar
  // _handleWaPessoalUpdate_. Independente do `webhook_secret` global do CRM.
  WA_PESSOAL_SECRET: '4704300d58ab271ea41fb1f5f42e7c16'
};

// ── HELPERS Evolution API ──────────────────────────────────────────────────────
function _evolutionConfig_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('EVOLUTION_API_URL');
  var key = p.getProperty('EVOLUTION_API_KEY');
  if (!url || !key) {
    throw new Error('Evolution API não configurada. Rode _setEvolutionProperties() em _arquivo.js.');
  }
  return { url: url.replace(/\/+$/, ''), key: key };
}

function _evolutionFetch_(method, path, body) {
  var cfg = _evolutionConfig_();
  var opts = {
    method: method,
    headers: { 'apikey': cfg.key, 'Content-Type': 'application/json' },
    muteHttpExceptions: true
  };
  if (body) opts.payload = JSON.stringify(body);
  var resp = UrlFetchApp.fetch(cfg.url + path, opts);
  var code = resp.getResponseCode();
  var txt = resp.getContentText();
  if (code === 404 && method === 'GET' && path.indexOf('/instance/') === 0) {
    return null; // instância não existe
  }
  if (code >= 400) {
    throw new Error('Evolution ' + method + ' ' + path + ' → HTTP ' + code + ': ' + txt);
  }
  return txt ? JSON.parse(txt) : null;
}

// Nome de instância seguro (sem espaços, sem ponto).
function _instanceNameFromUser_(usuario) {
  return String(usuario || '').replace(/[^A-Za-z0-9_-]/g, '_');
}

// ── HELPERS Sheets ─────────────────────────────────────────────────────────────
function _waSheet_(nome) {
  var ss = _getSpreadsheet_();
  var sh = ss.getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada. Rode _criarAbasWAPessoal() em _arquivo.js.');
  return sh;
}

function _waLerLinhas_(sh) {
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 2) return { header: sh.getRange(1, 1, 1, lc).getValues()[0], linhas: [] };
  var dados = sh.getRange(1, 1, lr, lc).getValues();
  return { header: dados[0], linhas: dados.slice(1) };
}

// Converte Date instances aninhadas em ISO strings — google.script.run NÃO
// serializa Date e silenciosamente vira null no client.
function _waNormalizarParaCliente_(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return Utilities.formatDate(obj, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  if (Array.isArray(obj)) return obj.map(_waNormalizarParaCliente_);
  if (typeof obj === 'object') {
    var out = {};
    Object.keys(obj).forEach(function(k) { out[k] = _waNormalizarParaCliente_(obj[k]); });
    return out;
  }
  return obj;
}

function _waColIdx_(header, nome) {
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).trim() === nome) return i;
  }
  return -1;
}

function _waUpsertInstanciaLinha_(usuario, patch) {
  var sh = _waSheet_(CFG_WA_PESSOAL.ABA_INSTANCIAS);
  var data = _waLerLinhas_(sh);
  var idxUsr = _waColIdx_(data.header, 'usuario');
  var rowIdx = -1;
  for (var i = 0; i < data.linhas.length; i++) {
    if (String(data.linhas[i][idxUsr]) === usuario) { rowIdx = i; break; }
  }
  if (rowIdx < 0) {
    var novaLinha = data.header.map(function() { return ''; });
    novaLinha[idxUsr] = usuario;
    novaLinha[_waColIdx_(data.header, 'daily_count')] = 0;
    novaLinha[_waColIdx_(data.header, 'daily_date')] = '';
    novaLinha[_waColIdx_(data.header, 'daily_limit')] = _getCfgWaPessoal_().daily_limit;
    Object.keys(patch || {}).forEach(function(k) {
      var ci = _waColIdx_(data.header, k);
      if (ci >= 0) novaLinha[ci] = patch[k];
    });
    sh.appendRow(novaLinha);
    return novaLinha;
  }
  var linha = data.linhas[rowIdx];
  Object.keys(patch || {}).forEach(function(k) {
    var ci = _waColIdx_(data.header, k);
    if (ci >= 0) linha[ci] = patch[k];
  });
  sh.getRange(rowIdx + 2, 1, 1, linha.length).setValues([linha]);
  return linha;
}

function _waInstanciaPorUsuario_(usuario) {
  var sh = _waSheet_(CFG_WA_PESSOAL.ABA_INSTANCIAS);
  var data = _waLerLinhas_(sh);
  var idxUsr = _waColIdx_(data.header, 'usuario');
  for (var i = 0; i < data.linhas.length; i++) {
    if (String(data.linhas[i][idxUsr]) === usuario) {
      var obj = {};
      data.header.forEach(function(h, j) { obj[h] = data.linhas[i][j]; });
      obj._row = i + 2;
      return obj;
    }
  }
  return null;
}

// ── AUTENTICAÇÃO ───────────────────────────────────────────────────────────────
// Aceita qualquer usuário válido (admin, supervisor, backoffice).
// O frontend já controla acesso à página por menu — esta função protege a API.
function _assertWaUser_(usuario) {
  if (!usuario) throw new Error('Usuário não informado.');
  // Reusa _getUsuariosSheet_() de Code.js (já existe).
  try {
    var lista = (typeof _getUsuariosSheet_ === 'function') ? _getUsuariosSheet_() : [];
    if (lista.length) {
      var u = lista.filter(function(x) { return String(x.usuario) === String(usuario); })[0];
      if (!u) throw new Error('Usuário "' + usuario + '" não encontrado.');
      if (u.ativo === false || u.ativo === 'false' || u.ativo === 0) {
        throw new Error('Usuário "' + usuario + '" inativo.');
      }
      return u;
    }
  } catch (e) { /* fallback abaixo */ }
  // Fallback: array USUARIOS em Config.js
  var fb = (typeof USUARIOS !== 'undefined' ? USUARIOS : []).filter(function(x) { return x.usuario === usuario; })[0];
  if (!fb) throw new Error('Usuário "' + usuario + '" não encontrado.');
  return fb;
}

// Resolve "qual usuário consultar": se requisitante == alvo, OK. Se requisitante
// é admin, OK qualquer alvo. Senão, throw. Retorna o usuário alvo final.
function _resolveUsuarioAlvo_(usuarioRequisitante, usuarioAlvo) {
  _assertWaUser_(usuarioRequisitante);
  if (!usuarioAlvo || usuarioAlvo === usuarioRequisitante) {
    return usuarioRequisitante;
  }
  var u = _assertWaUser_(usuarioRequisitante);
  if (u && String(u.perfil).toLowerCase() === 'admin') {
    _assertWaUser_(usuarioAlvo); // valida que alvo existe e está ativo
    return usuarioAlvo;
  }
  throw new Error('Sem permissão para consultar dados de outro usuário.');
}

// Lista usuários disponíveis para o seletor de admin no frontend.
// Retorna [] para não-admin.
function listarUsuariosWaPessoal(usuarioRequisitante) {
  try {
    var u = _assertWaUser_(usuarioRequisitante);
    if (String(u.perfil).toLowerCase() !== 'admin') {
      return { ok: true, data: [] };
    }
    var lista = (typeof _getUsuariosSheet_ === 'function') ? _getUsuariosSheet_() : [];
    if (!lista.length && typeof USUARIOS !== 'undefined') lista = USUARIOS;
    var ativos = (lista || [])
      .filter(function(x) { return x.ativo !== false && x.ativo !== 'false' && x.ativo !== 0; })
      .map(function(x) { return { usuario: x.usuario, nome: x.nome, perfil: x.perfil }; });
    return { ok: true, data: ativos };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES PÚBLICAS — Frontend (DispPessoal.html via google.script.run)
// ═══════════════════════════════════════════════════════════════════════════════

/** Retorna o HTML de DispPessoal.html para injeção no CRM. */
function getDispPessoalHtml() {
  return HtmlService.createHtmlOutputFromFile('DispPessoal').getContent();
}

// ── INSTÂNCIAS ─────────────────────────────────────────────────────────────────

/**
 * Estado da instância do usuário.
 * Retorna: { ok, status, phone, daily_count, daily_limit, daily_date, instance_id, qrcode }
 *   status: 'desconectado' | 'conectando' | 'conectado' | 'erro'
 *   qrcode: data URL base64 (apenas se status=conectando)
 */
function getMinhaInstancia(usuario, usuarioAlvo) {
  try {
    var alvo = _resolveUsuarioAlvo_(usuario, usuarioAlvo);
    var instance = _instanceNameFromUser_(alvo);
    var info;
    try {
      info = _evolutionFetch_('GET', '/instance/connectionState/' + encodeURIComponent(instance));
    } catch (e) {
      info = null;
    }

    var local = _waInstanciaPorUsuario_(alvo) || {};
    var resp = {
      ok: true,
      usuario: alvo,
      instance_id: instance,
      status: 'desconectado',
      phone: local.phone_display || '',
      daily_count: Number(local.daily_count || 0),
      daily_limit: Number(local.daily_limit || _getCfgWaPessoal_().daily_limit),
      daily_date: local.daily_date || '',
      qrcode: ''
    };

    if (!info || !info.instance) {
      return _waNormalizarParaCliente_(resp);
    }

    var state = (info.instance.state || info.state || '').toLowerCase();
    if (state === 'open') resp.status = 'conectado';
    else if (state === 'connecting') resp.status = 'conectando';
    else if (state === 'close') resp.status = 'desconectado';
    else resp.status = state || 'desconectado';

    // Atualiza phone_display se a Evolution já tem owner identificado
    if (info.instance && info.instance.profileName) {
      resp.phone = info.instance.owner || resp.phone;
    }

    return _waNormalizarParaCliente_(resp);
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

/**
 * Cria a instância na Evolution API (se não existe) e retorna o QR Code base64.
 * Se já existe e não está conectada, força reconectar.
 */
function criarOuReconectarInstancia(usuario) {
  try {
    _assertWaUser_(usuario);
    var instance = _instanceNameFromUser_(usuario);

    // 1. Verifica se já existe
    var estado = null;
    try {
      estado = _evolutionFetch_('GET', '/instance/connectionState/' + encodeURIComponent(instance));
    } catch (e) { estado = null; }

    // 2. Se não existe, cria
    if (!estado) {
      _evolutionFetch_('POST', '/instance/create', {
        instanceName: instance,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
      });
    }

    // 3. Pede QR (também serve pra reconexão)
    var qr = _evolutionFetch_('GET', '/instance/connect/' + encodeURIComponent(instance));

    var qrBase64 = '';
    if (qr) {
      qrBase64 = qr.base64 || qr.qrcode || (qr.qr && qr.qr.base64) || '';
      if (qrBase64 && qrBase64.indexOf('data:') !== 0) {
        qrBase64 = 'data:image/png;base64,' + qrBase64;
      }
    }

    _waUpsertInstanciaLinha_(usuario, {
      instance_id: instance,
      status: 'conectando'
    });

    return { ok: true, qrcode: qrBase64, instance_id: instance };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

/** Desconecta e remove a instância da Evolution API. */
function deletarInstancia(usuario) {
  try {
    _assertWaUser_(usuario);
    var instance = _instanceNameFromUser_(usuario);
    try { _evolutionFetch_('DELETE', '/instance/logout/' + encodeURIComponent(instance), null); } catch (e) {}
    try {
      _evolutionFetch_('DELETE', '/instance/delete/' + encodeURIComponent(instance), null);
    } catch (e) {
      // HTTP 404 = instância já não existe → o objetivo (remover) já está cumprido
      if (String(e.message || '').indexOf('HTTP 404') < 0) throw e;
    }
    _waUpsertInstanciaLinha_(usuario, { status: 'desconectado', phone_display: '' });
    return { ok: true };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

// ── CONFIGURAÇÕES GLOBAIS WA PESSOAL (admin editável via Dashboard) ────────────
// Tudo persistido em Script Properties. Defaults são usados quando a property
// não existe ou é inválida.

var WA_PESSOAL_BYPASS_KEY = 'WA_PESSOAL_BYPASS_HORARIO';
var WA_CFG_KEYS = {
  HORA_INI:            'WA_PESSOAL_HORA_INI',           // 0-23
  HORA_FIM:            'WA_PESSOAL_HORA_FIM',           // 1-24 (exclusivo)
  DIAS_SEMANA:         'WA_PESSOAL_DIAS_SEMANA',        // CSV de 0-6 (0=Dom)
  DELAY_MIN_DEFAULT:   'WA_PESSOAL_DELAY_MIN',          // segundos
  DELAY_MAX_DEFAULT:   'WA_PESSOAL_DELAY_MAX',          // segundos
  DAILY_LIMIT_DEFAULT: 'WA_PESSOAL_DAILY_LIMIT'         // msgs/dia
};
var WA_CFG_DEFAULTS = {
  hora_ini: 9, hora_fim: 18,
  dias_semana: [2, 3, 4],     // ter/qua/qui — recomendação pós-ban
  delay_min: 30, delay_max: 90,
  daily_limit: 30             // conservador pós-ban
};

function _getCfgWaPessoal_() {
  var p = PropertiesService.getScriptProperties();
  function pn(key, def) { var v = parseInt(p.getProperty(key), 10); return isFinite(v) ? v : def; }
  var rawDias = p.getProperty(WA_CFG_KEYS.DIAS_SEMANA);
  var dias;
  if (rawDias != null) {
    dias = String(rawDias).split(',').map(function(s){ return parseInt(s,10); })
      .filter(function(d){ return d>=0 && d<=6; });
    if (!dias.length) dias = WA_CFG_DEFAULTS.dias_semana.slice();
  } else dias = WA_CFG_DEFAULTS.dias_semana.slice();
  return {
    hora_ini:     pn(WA_CFG_KEYS.HORA_INI,            WA_CFG_DEFAULTS.hora_ini),
    hora_fim:     pn(WA_CFG_KEYS.HORA_FIM,            WA_CFG_DEFAULTS.hora_fim),
    dias_semana:  dias,
    delay_min:    pn(WA_CFG_KEYS.DELAY_MIN_DEFAULT,   WA_CFG_DEFAULTS.delay_min),
    delay_max:    pn(WA_CFG_KEYS.DELAY_MAX_DEFAULT,   WA_CFG_DEFAULTS.delay_max),
    daily_limit:  pn(WA_CFG_KEYS.DAILY_LIMIT_DEFAULT, WA_CFG_DEFAULTS.daily_limit)
  };
}

function getConfigWaPessoal(usuario) {
  try { _assertWaUser_(usuario); return { ok: true, config: _getCfgWaPessoal_() }; }
  catch (e) { return { ok: false, mensagem: e.message }; }
}

function setConfigWaPessoal(usuario, config) {
  try {
    var u = _assertWaUser_(usuario);
    if (String(u.perfil || '').toLowerCase() !== 'admin') {
      throw new Error('Apenas admin pode alterar configurações.');
    }
    config = config || {};
    var hi = Math.max(0, Math.min(23, parseInt(config.hora_ini, 10) || WA_CFG_DEFAULTS.hora_ini));
    var hf = parseInt(config.hora_fim, 10) || WA_CFG_DEFAULTS.hora_fim;
    hf = Math.max(hi + 1, Math.min(24, hf));
    var dias = (config.dias_semana || []).map(function(d){ return parseInt(d,10); })
      .filter(function(d){ return d>=0 && d<=6; });
    if (!dias.length) throw new Error('Selecione ao menos 1 dia da semana.');
    dias = Array.from(new Set(dias)).sort();
    var dmin = Math.max(5, parseInt(config.delay_min, 10) || WA_CFG_DEFAULTS.delay_min);
    var dmax = Math.max(dmin, parseInt(config.delay_max, 10) || WA_CFG_DEFAULTS.delay_max);
    var dlimit = Math.max(1, Math.min(2000, parseInt(config.daily_limit, 10) || WA_CFG_DEFAULTS.daily_limit));

    var p = PropertiesService.getScriptProperties();
    p.setProperty(WA_CFG_KEYS.HORA_INI, String(hi));
    p.setProperty(WA_CFG_KEYS.HORA_FIM, String(hf));
    p.setProperty(WA_CFG_KEYS.DIAS_SEMANA, dias.join(','));
    p.setProperty(WA_CFG_KEYS.DELAY_MIN_DEFAULT, String(dmin));
    p.setProperty(WA_CFG_KEYS.DELAY_MAX_DEFAULT, String(dmax));
    p.setProperty(WA_CFG_KEYS.DAILY_LIMIT_DEFAULT, String(dlimit));

    return { ok: true, config: _getCfgWaPessoal_() };
  } catch (e) { return { ok: false, mensagem: e.message }; }
}

// ── BYPASS HORÁRIO (admin only) ────────────────────────────────────────────────
// Quando ativo, ignora a janela configurada e libera disparos a qualquer hora.

function getBypassHorarioWaPessoal(usuario) {
  try {
    _assertWaUser_(usuario);
    var v = PropertiesService.getScriptProperties().getProperty(WA_PESSOAL_BYPASS_KEY);
    return { ok: true, ativo: v === 'true' };
  } catch (e) { return { ok: false, mensagem: e.message }; }
}

function setBypassHorarioWaPessoal(usuario, ativo) {
  try {
    var u = _assertWaUser_(usuario);
    if (String(u.perfil || '').toLowerCase() !== 'admin') {
      throw new Error('Apenas admin pode alterar bypass de horário.');
    }
    PropertiesService.getScriptProperties().setProperty(WA_PESSOAL_BYPASS_KEY, ativo ? 'true' : 'false');
    return { ok: true, ativo: !!ativo };
  } catch (e) { return { ok: false, mensagem: e.message }; }
}

/**
 * Endpoint chamado pelo WF1 no início (substitui Code "Checa Horário" do n8n).
 * Calcula janela horário + dias da semana via Script Properties (admin editável).
 * Bypass admin libera fora da janela.
 * Retorno: { ok, skip, motivo, hora, dow, bypass, hora_ini, hora_fim, dias_semana }
 */
function _handleWaPessoalCheckDispatch_(payload) {
  var bypass = PropertiesService.getScriptProperties().getProperty(WA_PESSOAL_BYPASS_KEY) === 'true';
  var cfg = _getCfgWaPessoal_();
  var tz = 'America/Sao_Paulo';
  var agora = new Date();
  var hora = parseInt(Utilities.formatDate(agora, tz, 'H'), 10);
  // u = ISO day-of-week (1=seg…7=dom) → mapeio pra dow JS-style (0=dom)
  var u = parseInt(Utilities.formatDate(agora, tz, 'u'), 10);
  var dow = (u === 7) ? 0 : u;
  var dayOk = cfg.dias_semana.indexOf(dow) >= 0;
  var hourOk = hora >= cfg.hora_ini && hora < cfg.hora_fim;
  var inWindow = dayOk && hourOk;
  var base = { hora: hora, dow: dow, hora_ini: cfg.hora_ini, hora_fim: cfg.hora_fim, dias_semana: cfg.dias_semana };
  if (bypass) return Object.assign({ ok: true, skip: false, motivo: 'bypass admin ativo', bypass: true }, base);
  if (!inWindow) {
    var motivo = !dayOk
      ? 'dia (' + dow + ') fora dos dias permitidos [' + cfg.dias_semana.join(',') + ']'
      : 'hora (' + hora + ') fora da janela ' + cfg.hora_ini + '-' + cfg.hora_fim + ' BRT';
    return Object.assign({ ok: true, skip: true, motivo: motivo, bypass: false }, base);
  }
  return Object.assign({ ok: true, skip: false, motivo: 'dentro da janela', bypass: false }, base);
}

// ── CAMPANHAS ATIVAS (badge no menu) ───────────────────────────────────────────

// Janela de disparo BRT (admin-config + bypass). Retorna { dentro, bypass }.
function _waDentroDaJanela_() {
  if (PropertiesService.getScriptProperties().getProperty(WA_PESSOAL_BYPASS_KEY) === 'true') {
    return { dentro: true, bypass: true };
  }
  var cfg = _getCfgWaPessoal_();
  var tz = 'America/Sao_Paulo';
  var agora = new Date();
  var hora = parseInt(Utilities.formatDate(agora, tz, 'H'), 10);
  var u = parseInt(Utilities.formatDate(agora, tz, 'u'), 10);
  var dow = (u === 7) ? 0 : u;
  var dentro = cfg.dias_semana.indexOf(dow) >= 0 && hora >= cfg.hora_ini && hora < cfg.hora_fim;
  return { dentro: dentro, bypass: false };
}

// Parse tolerante de célula de data do Sheets (Date, ISO string ou vazio).
function _waParseData_(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Mapa usuario -> nome (aba Usuarios, fallback Config.js).
function _waMapaNomesUsuarios_() {
  var lista = (typeof _getUsuariosSheet_ === 'function') ? _getUsuariosSheet_() : [];
  if (!lista.length && typeof USUARIOS !== 'undefined') lista = USUARIOS;
  var map = {};
  (lista || []).forEach(function(x) { map[String(x.usuario)] = x.nome || x.usuario; });
  return map;
}

var WA_DISPARO_SILENCIO_MS = 15 * 60 * 1000; // sem envio há +15min dentro da janela = campanha parada

function temCampanhaAtivaWaPessoal(usuario, usuarioAlvo) {
  try {
    var u = _assertWaUser_(usuario);
    var isAdmin = u && String(u.perfil).toLowerCase() === 'admin';
    var data = _waLerLinhas_(_waSheet_(CFG_WA_PESSOAL.ABA_CAMPANHAS));
    var idxUsr = _waColIdx_(data.header, 'usuario');
    var idxStatus = _waColIdx_(data.header, 'status');
    var idxId = _waColIdx_(data.header, 'id');

    // Admin sem alvo específico → visão global de todas as instâncias.
    if (isAdmin && !usuarioAlvo) {
      return _waResumoCampanhasGlobalAdmin_(data, idxUsr, idxStatus, idxId);
    }

    // Usuário comum (ou admin "visualizando como") → escopo de um usuário só.
    var alvo = _resolveUsuarioAlvo_(usuario, usuarioAlvo);
    var ativas = 0;
    for (var i = 0; i < data.linhas.length; i++) {
      if (String(data.linhas[i][idxUsr]) !== alvo) continue;
      if (String(data.linhas[i][idxStatus] || '').toLowerCase() === 'ativa') ativas++;
    }
    return { ok: true, ativas: ativas };
  } catch (e) { return { ok: false, mensagem: e.message, ativas: 0 }; }
}

/**
 * Visão admin: todas as instâncias com campanha ativa + saúde de disparo.
 * "Parada" = campanha ativa, com pendentes, dentro da janela, e sem envio
 * (nem criação) nos últimos 15min — pega o caso da instância desconectada.
 */
function _waResumoCampanhasGlobalAdmin_(dataCamp, idxUsr, idxStatus, idxId) {
  var idxNome = _waColIdx_(dataCamp.header, 'nome');
  var idxCriado = _waColIdx_(dataCamp.header, 'criado_em');
  var janela = _waDentroDaJanela_();

  // 1. Campanhas ativas
  var ativasCampanhas = [];
  for (var i = 0; i < dataCamp.linhas.length; i++) {
    var ln = dataCamp.linhas[i];
    if (String(ln[idxStatus] || '').toLowerCase() !== 'ativa') continue;
    ativasCampanhas.push({
      id: String(ln[idxId]),
      usuario: String(ln[idxUsr]),
      nome: idxNome >= 0 ? String(ln[idxNome] || '') : '',
      criadoEm: idxCriado >= 0 ? _waParseData_(ln[idxCriado]) : null
    });
  }
  if (ativasCampanhas.length === 0) {
    return { ok: true, admin: true, ativas: 0, instancias_ativas: 0,
             travadas: 0, dentro_janela: janela.dentro, detalhe: [] };
  }

  // 2. Lê WA Disparos uma vez — só para os ids ativos
  var idsAtivos = {};
  ativasCampanhas.forEach(function(c) { idsAtivos[c.id] = true; });
  var dataD = _waLerLinhas_(_waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS));
  var dIdxCamp = _waColIdx_(dataD.header, 'campanha_id');
  var dIdxStatus = _waColIdx_(dataD.header, 'status');
  var dIdxEnviado = _waColIdx_(dataD.header, 'enviado_em');

  var AGORA = Date.now();
  var porCamp = {};
  ativasCampanhas.forEach(function(c) {
    porCamp[c.id] = { ultimoEnvioMs: 0, enviadosRecentes: 0, temPendente: false };
  });
  for (var r = 0; r < dataD.linhas.length; r++) {
    var row = dataD.linhas[r];
    var cid = String(row[dIdxCamp]);
    if (!idsAtivos[cid]) continue;
    var st = String(row[dIdxStatus] || '').toLowerCase();
    if (st === 'pendente' || st === 'enviando') porCamp[cid].temPendente = true;
    var env = _waParseData_(row[dIdxEnviado]);
    if (env) {
      var ms = env.getTime();
      if (ms > porCamp[cid].ultimoEnvioMs) porCamp[cid].ultimoEnvioMs = ms;
      if (AGORA - ms <= WA_DISPARO_SILENCIO_MS) porCamp[cid].enviadosRecentes++;
    }
  }

  // 3. Consolida por usuário + detecta paradas
  var nomes = _waMapaNomesUsuarios_();
  var porUsuario = {};
  var totalTravadas = 0;
  ativasCampanhas.forEach(function(c) {
    var pc = porCamp[c.id];
    var refMs = pc.ultimoEnvioMs || (c.criadoEm ? c.criadoEm.getTime() : AGORA);
    var travada = janela.dentro && pc.temPendente && (AGORA - refMs > WA_DISPARO_SILENCIO_MS);
    if (travada) totalTravadas++;
    if (!porUsuario[c.usuario]) {
      porUsuario[c.usuario] = { usuario: c.usuario, nome: nomes[c.usuario] || c.usuario,
                                ativas: 0, enviadas_recentes: 0, ultimoEnvioMs: 0, travadas: 0 };
    }
    var pu = porUsuario[c.usuario];
    pu.ativas++;
    pu.enviadas_recentes += pc.enviadosRecentes;
    if (pc.ultimoEnvioMs > pu.ultimoEnvioMs) pu.ultimoEnvioMs = pc.ultimoEnvioMs;
    if (travada) pu.travadas++;
  });

  var detalhe = Object.keys(porUsuario).map(function(k) {
    var pu = porUsuario[k];
    return {
      usuario: pu.usuario,
      nome: pu.nome,
      ativas: pu.ativas,
      enviadas_recentes: pu.enviadas_recentes,
      ultimo_envio: pu.ultimoEnvioMs
        ? Utilities.formatDate(new Date(pu.ultimoEnvioMs), 'America/Sao_Paulo', 'dd/MM HH:mm')
        : '',
      travadas: pu.travadas
    };
  }).sort(function(a, b) { return (b.travadas - a.travadas) || (b.ativas - a.ativas); });

  return {
    ok: true,
    admin: true,
    ativas: ativasCampanhas.length,
    instancias_ativas: detalhe.length,
    travadas: totalTravadas,
    dentro_janela: janela.dentro,
    detalhe: detalhe
  };
}

// ── UPLOAD DE IMAGEM (campanhas com mídia) ─────────────────────────────────────

function _getOuCreateFolderWaPessoalImagens_() {
  var nome = 'WA Pessoal Imagens';
  var it = DriveApp.getFoldersByName(nome);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(nome);
}

/**
 * Recebe imagem em base64, salva no Drive (folder "WA Pessoal Imagens"),
 * marca como pública e retorna URL direto que Evolution pode baixar.
 * Limite: 5MB.
 */
function uploadImagemCampanha(usuario, base64Data, filename, mimeType) {
  try {
    _assertWaUser_(usuario);
    if (!base64Data) throw new Error('Conteúdo da imagem vazio.');
    if (!mimeType || mimeType.indexOf('image/') !== 0) throw new Error('Apenas imagens.');
    var binarySize = Math.floor(base64Data.length * 3 / 4);
    if (binarySize > 5 * 1024 * 1024) {
      throw new Error('Imagem maior que 5MB (tem ' + Math.round(binarySize / 1024 / 1024 * 10) / 10 + 'MB).');
    }

    var nomeArquivo = (filename || 'campanha.jpg').replace(/[^\w.\- ]/g, '_');
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    nomeArquivo = stamp + '_' + nomeArquivo;

    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, nomeArquivo);
    var folder = _getOuCreateFolderWaPessoalImagens_();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    // URL direto que retorna bytes da imagem (Evolution baixa por essa URL)
    var url = 'https://drive.google.com/uc?export=download&id=' + fileId;
    return { ok: true, url: url, file_id: fileId, size: binarySize, filename: nomeArquivo };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

// ── CAMPANHAS ──────────────────────────────────────────────────────────────────

/** Lista campanhas do usuário (admin pode passar usuarioAlvo para ver de outro). */
function getCampanhasUsuario(usuario, usuarioAlvo) {
  try {
    var alvo = _resolveUsuarioAlvo_(usuario, usuarioAlvo);
    var sh = _waSheet_(CFG_WA_PESSOAL.ABA_CAMPANHAS);
    var data = _waLerLinhas_(sh);
    var idxUsr = _waColIdx_(data.header, 'usuario');
    var camps = [];
    for (var i = 0; i < data.linhas.length; i++) {
      if (String(data.linhas[i][idxUsr]) !== alvo) continue;
      var obj = {};
      data.header.forEach(function(h, j) { obj[h] = data.linhas[i][j]; });
      obj._row = i + 2;
      camps.push(obj);
    }
    camps.sort(function(a, b) {
      return (b.criado_em instanceof Date ? b.criado_em.getTime() : 0)
           - (a.criado_em instanceof Date ? a.criado_em.getTime() : 0);
    });
    return _waNormalizarParaCliente_({ ok: true, data: camps });
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

/**
 * Cria campanha + popula WA Disparos (status=pendente) + dispara webhook n8n.
 * dados = { nome, template_msg, delay_min, delay_max, contatos: [{nome, phone}],
 *           variacoes?: string[],  // opcional — variações geradas via Claude API
 *           imagem_url?: string    // opcional — URL pública de imagem; quando presente,
 *                                  // n8n usa sendMedia com texto como caption }
 */
function criarCampanha(usuario, dados) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    _assertWaUser_(usuario);
    if (!dados || !dados.nome) throw new Error('Nome da campanha obrigatório.');
    if (!dados.template_msg)   throw new Error('Template da mensagem obrigatório.');
    if (!Array.isArray(dados.contatos) || !dados.contatos.length) {
      throw new Error('Lista de contatos vazia.');
    }
    // Placeholders {nome}/{cidade} são opcionais — uso de variações via Claude
    // já reduz risco de hash duplicado, então personalização não é mais obrigatória.

    var camp_id   = 'C' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    var cfgGlobal = _getCfgWaPessoal_();
    var delay_min = Math.max(5, Number(dados.delay_min || cfgGlobal.delay_min));
    var delay_max = Math.max(delay_min, Number(dados.delay_max || cfgGlobal.delay_max));

    // Serializar variações (se fornecidas) — apenas remover vazias
    var variacoesJson = '';
    if (Array.isArray(dados.variacoes) && dados.variacoes.length) {
      var variacoesLimpa = dados.variacoes
        .map(function(v) { return String(v == null ? '' : v).trim(); })
        .filter(function(v) { return !!v; });
      if (variacoesLimpa.length) variacoesJson = JSON.stringify(variacoesLimpa);
    }

    var shCamps = _waSheet_(CFG_WA_PESSOAL.ABA_CAMPANHAS);
    var shDisp  = _waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS);
    var imagemUrl = String(dados.imagem_url || '').trim();

    // 1. Monta linhas de WA Disparos com dedup por telefone normalizado.
    //    Telefone repetido no mailing vira UMA linha só. Sem dedup, cada duplicata
    //    é um disparo real e os updates de status por (campanha,phone) se espalham
    //    entre as linhas irmãs — inflando total_enviado/total_respondeu.
    var instance = _instanceNameFromUser_(usuario);
    var vistosFone = {};
    var rowsDisp = [];
    (dados.contatos || []).forEach(function(c) {
      var phone = String(c.phone || '').replace(/\D/g, '');
      if (phone && !phone.startsWith('55')) phone = '55' + phone;
      if (!phone) return;
      var chave = _normalizePhoneBR_(phone);
      if (vistosFone[chave]) return;
      vistosFone[chave] = true;
      rowsDisp.push([camp_id, String(c.nome || '').trim() || 'Cliente', phone,
                     'pendente', new Date(), '', '', '', 0, instance]);
    });
    if (!rowsDisp.length) throw new Error('Nenhum telefone válido na lista de contatos.');

    // 2. Linha em WA Campanhas (total_contatos = nº já deduplicado)
    //    col M = variacoes_json (via _addColunaVariacoes)
    //    col N = imagem_url (via _addColunaImagemUrl)
    shCamps.appendRow([
      camp_id, usuario, dados.nome, new Date(), 'ativa',
      rowsDisp.length, 0, 0, 0, dados.template_msg, delay_min, delay_max,
      variacoesJson, imagemUrl
    ]);

    // 3. Linhas em WA Disparos (lote)
    shDisp.getRange(shDisp.getLastRow() + 1, 1, rowsDisp.length, rowsDisp[0].length).setValues(rowsDisp);

    // 3. Webhook n8n (best-effort: não falha a campanha se webhook estiver fora)
    var n8nUrl = PropertiesService.getScriptProperties().getProperty(CFG_WA_PESSOAL.N8N_DESPACHO_URL_PROP)
              || CFG_WA_PESSOAL.N8N_DESPACHO_URL_DEFAULT;
    if (n8nUrl) {
      try {
        UrlFetchApp.fetch(n8nUrl, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ campanha_id: camp_id, usuario: usuario }),
          muteHttpExceptions: true
        });
      } catch (e) { Logger.log('Webhook n8n falhou: ' + e.message); }
    }

    return { ok: true, campanha_id: camp_id, total: rowsDisp.length,
             recebidos: (dados.contatos || []).length };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Gera 10 variações da mensagem via Claude API. Frontend chama isso ANTES de criar
 * a campanha — o usuário aprova/rejeita variações antes de iniciar o disparo.
 *
 * Validações: cada variação precisa preservar os mesmos placeholders ({nome} e/ou
 * {cidade}) presentes no template original. Variações que perdem placeholder são
 * descartadas silenciosamente.
 *
 * Retorno: { ok: true, variacoes: ["v1", "v2", ...] } ou { ok: false, mensagem }
 */
function gerarVariacoesMensagem(usuario, template_msg) {
  try {
    _assertWaUser_(usuario);
    var template = String(template_msg || '').trim();
    if (!template) throw new Error('Template vazio.');

    var claudeKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!claudeKey) throw new Error('CLAUDE_API_KEY não configurada nas Script Properties.');

    var temNome = /{nome}/.test(template);
    var temCidade = /{cidade}/.test(template);
    var temPlaceholders = temNome || temCidade;
    var placeholdersTxt = [
      temNome ? '{nome}' : null,
      temCidade ? '{cidade}' : null
    ].filter(Boolean).join(' e ');

    var manterLinhas = [
      'Gere exatamente 10 variações dessa mensagem mantendo:',
      '- O mesmo objetivo (oferta de internet/serviço)'
    ];
    if (temPlaceholders) {
      manterLinhas.push('- Os placeholders ' + placeholdersTxt + ' EXATAMENTE como aparecem no original (chaves incluídas)');
    }
    manterLinhas.push('- Tom amigável e direto, em português brasileiro');
    manterLinhas.push('- Tamanho similar (até 25% maior ou menor que o original)');
    manterLinhas.push('- TODOS os nomes próprios e marcas EXATAMENTE como no original '
      + '(ex.: se diz "Nio", mantenha "Nio"; se diz "Vero", mantenha "Vero"). '
      + 'NUNCA troque uma marca por outra nem "corrija" o nome de uma empresa — '
      + 'a campanha pode citar marcas diferentes de propósito');

    var prompt = [
      'Você está gerando variações de mensagem de WhatsApp para uma campanha de vendas',
      'da Mobile Digital, operação de internet em Juiz de Fora, MG. A mensagem pode',
      'citar marcas específicas (Vero, Nio, etc.) — reproduza-as exatamente como',
      'estão, sem trocar nem "corrigir", pois a campanha pode ser sobre migração',
      'entre marcas.',
      '',
      'Mensagem original:',
      '"""',
      template,
      '"""',
      ''
    ].concat(manterLinhas).concat([
      '',
      'Varie:',
      '- Estrutura das frases',
      '- Saudação inicial',
      '- Call-to-action final',
      '- Vocabulário e sinônimos',
      '',
      'NUNCA mude o significado nem invente preços, planos, prazos ou benefícios que',
      'não estavam no original. Se o original menciona "fibra", mantenha "fibra";',
      'idem para qualquer detalhe de plano/preço.',
      '',
      'Retorne APENAS um array JSON válido com 10 strings, sem nenhum comentário e sem',
      'texto fora do JSON. Cada string é uma variação da mensagem completa.',
      'Formato: ["variação 1", "variação 2", ..., "variação 10"]'
    ]).join('\n');

    var bruto = _callClaudeApiDiag_(claudeKey, prompt, 2000);

    // Tenta extrair o array JSON da resposta (remove possível ```json ... ``` ou texto fora)
    var jsonStr = String(bruto || '').trim();
    var match = jsonStr.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Claude API não retornou array JSON.');
    var arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) throw new Error('Resposta da Claude não é array.');

    // Filtra: precisa preservar os placeholders do original
    var variacoes = arr
      .map(function(s) { return String(s == null ? '' : s).trim(); })
      .filter(function(s) {
        if (!s) return false;
        if (temNome && !/{nome}/.test(s)) return false;
        if (temCidade && !/{cidade}/.test(s)) return false;
        return true;
      });

    if (!variacoes.length) {
      throw new Error('Nenhuma variação preservou os placeholders do template.');
    }

    return { ok: true, variacoes: variacoes };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

function _setStatusCampanha_(usuario, campanhaId, novoStatus, usuarioAlvo) {
  var alvo = _resolveUsuarioAlvo_(usuario, usuarioAlvo);
  var sh = _waSheet_(CFG_WA_PESSOAL.ABA_CAMPANHAS);
  var data = _waLerLinhas_(sh);
  var idxId = _waColIdx_(data.header, 'id');
  var idxUsr = _waColIdx_(data.header, 'usuario');
  var idxStatus = _waColIdx_(data.header, 'status');
  for (var i = 0; i < data.linhas.length; i++) {
    if (data.linhas[i][idxId] === campanhaId && data.linhas[i][idxUsr] === alvo) {
      sh.getRange(i + 2, idxStatus + 1).setValue(novoStatus);
      return { ok: true };
    }
  }
  throw new Error('Campanha não encontrada para o usuário.');
}

function pausarCampanha(usuario, campanhaId, usuarioAlvo)   { try { return _setStatusCampanha_(usuario, campanhaId, 'pausada',   usuarioAlvo); } catch (e) { return { ok: false, mensagem: e.message }; } }
function cancelarCampanha(usuario, campanhaId, usuarioAlvo) { try { return _setStatusCampanha_(usuario, campanhaId, 'cancelada', usuarioAlvo); } catch (e) { return { ok: false, mensagem: e.message }; } }

/**
 * Retomar campanha pausada: marca 'ativa' E dispara webhook n8n pra acordar
 * o Loop do WF1 (status sozinho não basta — o loop morre quando a Decisão
 * retorna skip_pausada e nenhum trigger externo está agendado).
 */
function retomarCampanha(usuario, campanhaId, usuarioAlvo) {
  try {
    var alvo = _resolveUsuarioAlvo_(usuario, usuarioAlvo);
    _setStatusCampanha_(usuario, campanhaId, 'ativa', usuarioAlvo);

    // Dispara webhook pra reativar o pipeline (best-effort)
    var n8nUrl = PropertiesService.getScriptProperties().getProperty(CFG_WA_PESSOAL.N8N_DESPACHO_URL_PROP)
              || CFG_WA_PESSOAL.N8N_DESPACHO_URL_DEFAULT;
    if (n8nUrl) {
      try {
        UrlFetchApp.fetch(n8nUrl, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ campanha_id: campanhaId, usuario: alvo }),
          muteHttpExceptions: true
        });
      } catch (e) { Logger.log('Webhook n8n (retomar) falhou: ' + e.message); }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

/**
 * Remove campanha definitivamente — apaga linha de WA Campanhas e TODAS as linhas
 * relacionadas em WA Disparos. Apenas admin pode executar.
 */
function excluirCampanha(usuario, campanhaId, usuarioAlvo) {
  try {
    var u = _assertWaUser_(usuario);
    if (String(u.perfil || '').toLowerCase() !== 'admin') {
      throw new Error('Apenas admin pode excluir campanhas.');
    }
    if (!campanhaId) throw new Error('campanha_id obrigatório.');

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var shCamps = _waSheet_(CFG_WA_PESSOAL.ABA_CAMPANHAS);
      var dCamps = _waLerLinhas_(shCamps);
      var idxId = _waColIdx_(dCamps.header, 'id');
      var rowsCamp = [];
      for (var i = 0; i < dCamps.linhas.length; i++) {
        if (dCamps.linhas[i][idxId] === campanhaId) rowsCamp.push(i + 2);
      }
      // Apaga de baixo pra cima pra preservar índices
      rowsCamp.sort(function(a,b){ return b - a; }).forEach(function(r) { shCamps.deleteRow(r); });

      var shDisp = _waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS);
      var dDisp = _waLerLinhas_(shDisp);
      var idxCampDisp = _waColIdx_(dDisp.header, 'campanha_id');
      var rowsDisp = [];
      for (var k = 0; k < dDisp.linhas.length; k++) {
        if (dDisp.linhas[k][idxCampDisp] === campanhaId) rowsDisp.push(k + 2);
      }
      rowsDisp.sort(function(a,b){ return b - a; }).forEach(function(r) { shDisp.deleteRow(r); });

      return { ok: true, removidasCampanhas: rowsCamp.length, removidosDisparos: rowsDisp.length };
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

/** Retorna progresso de uma campanha: { total, enviado, respondeu, erro, pendente } */
function getProgressoCampanha(usuario, campanhaId, usuarioAlvo) {
  try {
    _resolveUsuarioAlvo_(usuario, usuarioAlvo);
    var sh = _waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS);
    var data = _waLerLinhas_(sh);
    var idxId = _waColIdx_(data.header, 'campanha_id');
    var idxStatus = _waColIdx_(data.header, 'status');
    var stats = { total: 0, enviado: 0, respondeu: 0, erro: 0, pendente: 0, blacklist: 0 };
    for (var i = 0; i < data.linhas.length; i++) {
      if (data.linhas[i][idxId] !== campanhaId) continue;
      stats.total++;
      var s = String(data.linhas[i][idxStatus] || 'pendente');
      if (stats.hasOwnProperty(s)) stats[s]++;
    }
    return { ok: true, data: stats };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

// ── FONTE DE CONTATOS (para o frontend "Nova Campanha") ────────────────────────

/**
 * Retorna contatos para alimentar o seletor de fonte da campanha.
 * fonte: 'leads_meta_sem_status' | 'leads_meta_desqualificados'
 * Reusa a aba "Leads Meta Ads" do CRM.
 */
function getContatosParaCampanha(usuario, fonte) {
  try {
    _assertWaUser_(usuario);
    var ss = _getSpreadsheet_();
    var sh = ss.getSheetByName('Leads Meta Ads');
    if (!sh) return { ok: true, data: [] };
    var data = _waLerLinhas_(sh);
    var idxNome   = _waColIdx_(data.header, 'Nome');
    var idxFone   = _waColIdx_(data.header, 'Telefone');
    var idxStatus = _waColIdx_(data.header, 'Status');
    if (idxFone < 0) {
      // tenta alternativas
      idxFone = _waColIdx_(data.header, 'WhatsApp');
    }
    if (idxFone < 0 || idxNome < 0) return { ok: true, data: [] };
    var out = [];
    var vistos = {};
    for (var i = 0; i < data.linhas.length; i++) {
      var linha = data.linhas[i];
      var status = idxStatus >= 0 ? String(linha[idxStatus] || '').toLowerCase() : '';
      if (fonte === 'leads_meta_sem_status') {
        if (status && status !== 'sem status' && status !== '') continue;
      } else if (fonte === 'leads_meta_desqualificados') {
        if (status.indexOf('desqualif') < 0) continue;
      }
      var fone = String(linha[idxFone] || '').replace(/\D/g, '');
      if (fone.length < 10) continue;
      if (vistos[fone]) continue;
      vistos[fone] = true;
      out.push({ nome: String(linha[idxNome] || '').trim() || 'Cliente', phone: fone });
    }
    return { ok: true, data: out };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────────

/**
 * KPIs e série temporal (últimos 30 dias) para a aba Dashboard.
 * Admin pode passar usuarioAlvo para ver de outro user; null → próprio.
 * usuarioAlvo === '__all__' → admin agrega TODOS os usuários.
 *
 * Retorna: {
 *   ok, escopo, kpis: { enviado_mes, taxa_resposta, blacklist_size, campanhas_ativas, total_campanhas },
 *   serie: [{ data: 'YYYY-MM-DD', enviado, respondeu, erro }, ...],
 *   instancias: [{ usuario, status, daily_count, daily_limit, phone_display }, ...]
 * }
 */
/**
 * Health/Saúde do WA Pessoal: KPIs do dia vs baseline rolling 7d, alertas
 * com sugestões, status por instância. Heurística pra detectar shadowban
 * antes de virar ban definitivo.
 *
 * Retorno: {
 *   ok, escopo, status: 'verde'|'amarelo'|'vermelho',
 *   hoje: { enviado, entregue, lido, respondeu, erro, pct_* },
 *   baseline_7d: { ... },                         // últimos 7 dias completos (sem hoje)
 *   deltas: { entrega, lido, resposta },          // % de variação hoje vs baseline
 *   alertas: [{ nivel, kpi, mensagem, sugestao }],
 *   serie_14d: [{ data, enviado, entregue, lido, respondeu }],
 *   instancias: [{ usuario, status, daily_count, daily_limit, ... }]
 * }
 */
function getSaudeWaPessoal(usuario, usuarioAlvo) {
  try {
    var u = _assertWaUser_(usuario);
    var isAdmin = String(u.perfil || '').toLowerCase() === 'admin';
    var alvo;
    if (usuarioAlvo === '__all__') {
      if (!isAdmin) throw new Error('Só admin pode ver agregado.');
      alvo = '__all__';
    } else {
      alvo = _resolveUsuarioAlvo_(usuario, usuarioAlvo);
    }

    var dDisp  = _waLerLinhas_(_waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS));
    var dInst  = _waLerLinhas_(_waSheet_(CFG_WA_PESSOAL.ABA_INSTANCIAS));
    var dCamps = _waLerLinhas_(_waSheet_(CFG_WA_PESSOAL.ABA_CAMPANHAS));

    // Filtra disparos do escopo
    var idxIdCamp  = _waColIdx_(dCamps.header, 'id');
    var idxUsrCamp = _waColIdx_(dCamps.header, 'usuario');
    var campIds = {};
    dCamps.linhas.forEach(function(r) {
      if (alvo === '__all__' || String(r[idxUsrCamp]) === alvo) campIds[r[idxIdCamp]] = 1;
    });

    var idxCampDisp   = _waColIdx_(dDisp.header, 'campanha_id');
    var idxStatusDisp = _waColIdx_(dDisp.header, 'status');
    var idxEnvEm      = _waColIdx_(dDisp.header, 'enviado_em');
    var idxEntr       = _waColIdx_(dDisp.header, 'entregue_em');
    var idxLido       = _waColIdx_(dDisp.header, 'lido_em');
    var idxResp       = _waColIdx_(dDisp.header, 'respondeu_em');

    var disparos = (alvo === '__all__') ? dDisp.linhas
      : dDisp.linhas.filter(function(r) { return campIds[r[idxCampDisp]]; });

    function asDate(v) {
      if (!v) return null;
      if (v instanceof Date) return v;
      var d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

    var agora = new Date();
    var inicioHoje = startOfDay(agora);
    var fimHoje    = new Date(inicioHoje.getTime() + 24 * 3600 * 1000);
    var inicio7d   = new Date(inicioHoje.getTime() - 7 * 24 * 3600 * 1000); // 7 dias antes do início de hoje

    function bucket(periodoIni, periodoFim) {
      var bk = { enviado: 0, entregue: 0, lido: 0, respondeu: 0, erro: 0, lido_efetivo: 0 };
      disparos.forEach(function(r) {
        var dEnv = asDate(r[idxEnvEm]);
        if (!dEnv) return;
        if (dEnv < periodoIni || dEnv >= periodoFim) return;
        var st = String(r[idxStatusDisp] || '').toLowerCase();
        if (st === 'enviado' || st === 'respondeu') bk.enviado++;
        if (r[idxEntr]) bk.entregue++;
        if (r[idxLido])  bk.lido++;
        if (r[idxResp])  bk.respondeu++;
        if (st === 'erro') bk.erro++;
        // Leitura efetiva: conta como lido se tem lido_em OU respondeu_em
        // (read receipts são amplamente desabilitados; resposta implica leitura)
        if (r[idxLido] || r[idxResp]) bk.lido_efetivo++;
      });
      var totalTry = bk.enviado + bk.erro;
      bk.pct_entregue     = bk.enviado  > 0 ? Math.round(bk.entregue     / bk.enviado  * 1000) / 10 : 0;
      bk.pct_lido         = bk.entregue > 0 ? Math.round(bk.lido         / bk.entregue * 1000) / 10 : 0;
      // Engajamento sobre ENVIADO (não sobre entregue): entregue_em vem do webhook
      // best-effort da Evolution — dividir por ele estoura 100% e mente. Enviado é confiável.
      bk.pct_lido_efetivo = bk.enviado  > 0 ? Math.round(bk.lido_efetivo / bk.enviado  * 1000) / 10 : 0;
      bk.pct_respondeu    = bk.enviado  > 0 ? Math.round(bk.respondeu    / bk.enviado  * 1000) / 10 : 0;
      bk.pct_erro         = totalTry    > 0 ? Math.round(bk.erro         / totalTry    * 1000) / 10 : 0;
      return bk;
    }

    var bkHoje = bucket(inicioHoje, fimHoje);
    var bk7d   = bucket(inicio7d,   inicioHoje);

    // Série diária últimos 14 dias (gráfico mini)
    var serie = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date(inicioHoje.getTime() - i * 24 * 3600 * 1000);
      var f = new Date(d.getTime() + 24 * 3600 * 1000);
      var b = bucket(d, f);
      serie.push({
        data: Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        enviado: b.enviado, entregue: b.entregue, lido: b.lido, respondeu: b.respondeu, erro: b.erro,
        pct_entregue: b.pct_entregue, pct_lido: b.pct_lido_efetivo, pct_respondeu: b.pct_respondeu
      });
    }

    // Deltas vs baseline (% de variação)
    function deltaPct(h, base) { return base <= 0 ? 0 : Math.round((h - base) / base * 1000) / 10; }
    var deltas = {
      entrega: deltaPct(bkHoje.pct_entregue,      bk7d.pct_entregue),
      lido:    deltaPct(bkHoje.pct_lido_efetivo,  bk7d.pct_lido_efetivo),
      resposta:deltaPct(bkHoje.pct_respondeu,     bk7d.pct_respondeu)
    };

    // ── ALERTAS — thresholds absolutos + quedas relativas ─────────────────────
    var alertas = [];

    // Entrega: entregue_em vem do webhook `messages.update` da Evolution, que é
    // BEST-EFFORT (dispara de forma intermitente). pct_entregue baixo não distingue
    // "não entregou" de "Evolution não reportou" — só vira alerta de saúde quando
    // há amostra mínima de receipts (ENTREGA_AMOSTRA_MIN).
    var ENTREGA_AMOSTRA_MIN = 10;
    if (bkHoje.entregue >= ENTREGA_AMOSTRA_MIN && bkHoje.pct_entregue < 70) {
      alertas.push({
        nivel: 'vermelho', kpi: 'entrega',
        mensagem: 'Entrega crítica: ' + bkHoje.pct_entregue + '% (' + bkHoje.entregue + '/' + bkHoje.enviado + ')',
        sugestao: 'Pausar disparos AGORA. Entrega <70% com amostra significativa é forte indício de shadowban — mande mensagens orgânicas pra contatos próximos por 24-48h.'
      });
    } else if (bkHoje.entregue >= ENTREGA_AMOSTRA_MIN && bkHoje.pct_entregue < 85) {
      alertas.push({
        nivel: 'amarelo', kpi: 'entrega',
        mensagem: 'Entrega abaixo do saudável: ' + bkHoje.pct_entregue + '%',
        sugestao: 'Reduzir ritmo. Considere aumentar delay min/max e cortar limite diário pela metade.'
      });
    } else if (bkHoje.enviado >= 20 && bkHoje.entregue < ENTREGA_AMOSTRA_MIN) {
      alertas.push({
        nivel: 'info', kpi: 'entrega',
        mensagem: 'Confirmação de entrega indisponível hoje (' + bkHoje.entregue + '/' + bkHoje.enviado + ' com receipt)',
        sugestao: 'O webhook de entrega da Evolution não está reportando — a % de entrega não é confiável. Use a taxa de erro e a de resposta como termômetro.'
      });
    }

    // Leitura efetiva (lido_em OU respondeu_em). Read receipts amplamente
    // desabilitados no Brasil — só consideramos crítico se TAMBÉM resposta
    // estiver baixa (< 3%). Se resposta tá ok, engajamento é evidente.
    var respostaSaudavel = bkHoje.pct_respondeu >= 3;
    if (bkHoje.enviado >= 10 && bkHoje.pct_lido_efetivo < 10 && !respostaSaudavel) {
      alertas.push({
        nivel: 'vermelho', kpi: 'leitura',
        mensagem: 'Engajamento crítico: leitura ' + bkHoje.pct_lido_efetivo + '% + resposta ' + bkHoje.pct_respondeu + '%',
        sugestao: 'WhatsApp pode estar marcando como spam. Pause campanhas e envie mensagens orgânicas (chamadas, áudios, etc) por algumas horas pra reativar reputação.'
      });
    } else if (bkHoje.enviado >= 10 && bkHoje.pct_lido_efetivo < 25 && !respostaSaudavel) {
      alertas.push({
        nivel: 'amarelo', kpi: 'leitura',
        mensagem: 'Engajamento baixo: leitura ' + bkHoje.pct_lido_efetivo + '% + resposta ' + bkHoje.pct_respondeu + '%',
        sugestao: 'Lista pode estar mal qualificada ou template não está engajando. Reveja o gancho da mensagem.'
      });
    }

    // Amarelo: resposta <1% com volume mínimo
    if (bkHoje.enviado >= 20 && bkHoje.pct_respondeu < 1) {
      alertas.push({
        nivel: 'amarelo', kpi: 'resposta',
        mensagem: 'Resposta muito baixa: ' + bkHoje.pct_respondeu + '%',
        sugestao: 'Engajamento <1% piora ranking. Considere mudar oferta, ou segmentar lista pra público mais qualificado.'
      });
    }

    // Vermelho: instância desconectada
    var idxUsrInst    = _waColIdx_(dInst.header, 'usuario');
    var idxStInst     = _waColIdx_(dInst.header, 'status');
    var idxDailyCount = _waColIdx_(dInst.header, 'daily_count');
    var idxDailyLimit = _waColIdx_(dInst.header, 'daily_limit');
    var idxDailyDate  = _waColIdx_(dInst.header, 'daily_date');
    var instLinhas = (alvo === '__all__') ? dInst.linhas
      : dInst.linhas.filter(function(r) { return String(r[idxUsrInst]) === alvo; });
    var instancias = instLinhas.map(function(r) {
      var o = {};
      dInst.header.forEach(function(h, j) { o[h] = r[j]; });
      return o;
    });
    instancias.forEach(function(inst) {
      var st = String(inst.status || '').toLowerCase();
      if (st === 'desconectado' && bkHoje.enviado === 0 && bk7d.enviado > 0) {
        alertas.push({
          nivel: 'vermelho', kpi: 'instancia',
          mensagem: 'Instância "' + inst.usuario + '" está desconectada (sem ação manual)',
          sugestao: 'Possível ban automático. Tente reconectar via QR — se não reconectar, o número foi banido.'
        });
      }
    });

    // Vermelho: 3+ erros e 0 enviados hoje
    if (bkHoje.erro >= 3 && bkHoje.enviado === 0) {
      alertas.push({
        nivel: 'vermelho', kpi: 'erros',
        mensagem: bkHoje.erro + ' erros sem nenhum envio bem-sucedido hoje',
        sugestao: 'Verificar conexão da instância e se número não foi banido.'
      });
    }

    // Quedas relativas vs baseline (só com volume mínimo de 10 envios em ambos)
    if (bkHoje.enviado >= 10 && bk7d.enviado >= 10) {
      if (deltas.entrega <= -15 && bkHoje.entregue >= ENTREGA_AMOSTRA_MIN) {
        alertas.push({
          nivel: 'amarelo', kpi: 'queda_entrega',
          mensagem: 'Entrega caiu ' + Math.abs(deltas.entrega) + '% vs baseline 7d',
          sugestao: 'Algo mudou hoje (template, hora, lista). Investigar diferença antes de continuar.'
        });
      }
      // Queda de leitura só vira alerta se resposta também caiu (engajamento global)
      if (deltas.lido <= -25 && deltas.resposta <= -25) {
        alertas.push({
          nivel: 'amarelo', kpi: 'queda_lido',
          mensagem: 'Engajamento caiu: leitura ' + Math.abs(deltas.lido) + '% + resposta ' + Math.abs(deltas.resposta) + '% vs baseline',
          sugestao: 'Pode estar atingindo público errado ou caindo em ranking de spam.'
        });
      }
    }

    // Status geral
    var statusGeral = 'verde';
    if (alertas.some(function(a) { return a.nivel === 'vermelho'; })) statusGeral = 'vermelho';
    else if (alertas.some(function(a) { return a.nivel === 'amarelo'; })) statusGeral = 'amarelo';
    if (bkHoje.enviado === 0 && bk7d.enviado === 0) statusGeral = 'sem_dados';

    return _waNormalizarParaCliente_({
      ok: true,
      escopo: alvo,
      status: statusGeral,
      hoje: bkHoje,
      baseline_7d: bk7d,
      deltas: deltas,
      alertas: alertas,
      serie_14d: serie,
      instancias: instancias
    });
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

function getDashboardWaPessoal(usuario, usuarioAlvo) {
  try {
    var u = _assertWaUser_(usuario);
    var isAdmin = String(u.perfil || '').toLowerCase() === 'admin';
    var alvo;
    if (usuarioAlvo === '__all__') {
      if (!isAdmin) throw new Error('Só admin pode ver o agregado de todos.');
      alvo = '__all__';
    } else {
      alvo = _resolveUsuarioAlvo_(usuario, usuarioAlvo);
    }

    var shCamps = _waSheet_(CFG_WA_PESSOAL.ABA_CAMPANHAS);
    var shDisp  = _waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS);
    var shInst  = _waSheet_(CFG_WA_PESSOAL.ABA_INSTANCIAS);
    var shBl    = _waSheet_(CFG_WA_PESSOAL.ABA_BLACKLIST);

    var dCamps = _waLerLinhas_(shCamps);
    var dDisp  = _waLerLinhas_(shDisp);
    var dInst  = _waLerLinhas_(shInst);
    var dBl    = _waLerLinhas_(shBl);

    function filtraPorUsuario(linhas, header, colNome) {
      if (alvo === '__all__') return linhas;
      var idx = _waColIdx_(header, colNome);
      return linhas.filter(function(r) { return String(r[idx]) === alvo; });
    }

    // Campanhas do escopo
    var camps = filtraPorUsuario(dCamps.linhas, dCamps.header, 'usuario');
    var idxStatusCamp = _waColIdx_(dCamps.header, 'status');
    var ativas = camps.filter(function(r) { return String(r[idxStatusCamp]) === 'ativa'; }).length;

    // Disparos do escopo (filtra por campanha_id de campanhas do escopo)
    var idxIdCamp = _waColIdx_(dCamps.header, 'id');
    var campIds = {};
    camps.forEach(function(r) { campIds[r[idxIdCamp]] = 1; });

    var idxCampDisp = _waColIdx_(dDisp.header, 'campanha_id');
    var idxStatusDisp = _waColIdx_(dDisp.header, 'status');
    var idxEnvEm  = _waColIdx_(dDisp.header, 'enviado_em');
    var idxRespEm = _waColIdx_(dDisp.header, 'respondeu_em');
    var dispsEscopo = (alvo === '__all__') ? dDisp.linhas
      : dDisp.linhas.filter(function(r) { return campIds[r[idxCampDisp]]; });

    // Mês atual
    var hoje = new Date();
    var mesIni = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    function ymd(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
    function asDate(v) {
      if (v instanceof Date) return v;
      if (!v) return null;
      var d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }

    var totalEnvMes = 0, totalRespMes = 0, totalErrMes = 0;
    var serieMap = {}; // { 'yyyy-MM-dd': {enviado, respondeu, erro} }
    for (var i = 0; i < 30; i++) {
      var d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i);
      serieMap[ymd(d)] = { data: ymd(d), enviado: 0, respondeu: 0, erro: 0 };
    }

    dispsEscopo.forEach(function(r) {
      var st = String(r[idxStatusDisp] || '');
      var dEnv = asDate(r[idxEnvEm]);
      var dResp = asDate(r[idxRespEm]);
      if (dEnv && dEnv >= mesIni) {
        if (st === 'enviado' || st === 'respondeu') totalEnvMes++;
        if (st === 'respondeu') totalRespMes++;
        if (st === 'erro') totalErrMes++;
      }
      if (dEnv) {
        var k = ymd(dEnv);
        if (serieMap[k]) {
          if (st === 'enviado' || st === 'respondeu') serieMap[k].enviado++;
          if (st === 'erro') serieMap[k].erro++;
        }
      }
      if (dResp) {
        var k2 = ymd(dResp);
        if (serieMap[k2]) serieMap[k2].respondeu++;
      }
    });

    var taxa = totalEnvMes > 0 ? Math.round((totalRespMes / totalEnvMes) * 100) : 0;
    var blacklistSize = dBl.linhas.length; // global (blacklist é compartilhada)

    // Instâncias do escopo
    var idxUsrInst = _waColIdx_(dInst.header, 'usuario');
    var instLinhas = (alvo === '__all__') ? dInst.linhas
      : dInst.linhas.filter(function(r) { return String(r[idxUsrInst]) === alvo; });
    var instancias = instLinhas.map(function(r) {
      var o = {}; dInst.header.forEach(function(h, j) { o[h] = r[j]; });
      return o;
    });

    var serie = Object.keys(serieMap).sort().map(function(k) { return serieMap[k]; });

    return _waNormalizarParaCliente_({
      ok: true,
      escopo: alvo,
      kpis: {
        enviado_mes: totalEnvMes,
        respondeu_mes: totalRespMes,
        erro_mes: totalErrMes,
        taxa_resposta: taxa,
        blacklist_size: blacklistSize,
        campanhas_ativas: ativas,
        total_campanhas: camps.length
      },
      serie: serie,
      instancias: instancias
    });
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER doPost — chamado pelo n8n após cada envio/resposta
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Atualiza um disparo a partir do n8n. Aceita 2 shapes:
 *
 * SHAPE A — atualização por (campanha_id + phone):
 *   { action: 'wa_pessoal_update',
 *     campanha_id, phone, novo_status: 'enviado'|'erro'|'respondeu'|'blacklist',
 *     erro_msg?, increment_daily?, add_to_blacklist?,
 *     mensagem_enviada?, message_id?    // novos: gravados quando novo_status='enviado' }
 *
 * SHAPE B — delivery/read receipt por message_id:
 *   { action: 'wa_pessoal_update',
 *     delivery_update: true, message_id, delivery_status: 'DELIVERY_ACK'|'READ' }
 */
function _handleWaPessoalUpdate_(payload) {
  if (payload && payload.delivery_update === true) {
    return _handleWaPessoalDeliveryUpdate_(payload);
  }
  if (!payload.campanha_id || !payload.phone || !payload.novo_status) {
    return { ok: false, mensagem: 'Faltam campos obrigatórios (campanha_id, phone, novo_status).' };
  }

  // Sem LockService global: ScriptLock entra em conflito quando múltiplos endpoints
  // GAS são chamados em sequência rápida pela mesma chain do n8n (Lock timeout em
  // <10s entre Próximo Pendente e Marca Enviado). Single-chain não tem race risk.
  try {
    var phoneNorm = String(payload.phone).replace(/\D/g, '');
    var shDisp = _waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS);
    var data = _waLerLinhas_(shDisp);
    var idxCamp = _waColIdx_(data.header, 'campanha_id');
    var idxFone = _waColIdx_(data.header, 'contato_phone');
    var idxStatus = _waColIdx_(data.header, 'status');
    var idxEnv   = _waColIdx_(data.header, 'enviado_em');
    var idxResp  = _waColIdx_(data.header, 'respondeu_em');
    var idxErro  = _waColIdx_(data.header, 'erro_msg');
    var idxTent  = _waColIdx_(data.header, 'tentativas');
    var idxMsg   = _waColIdx_(data.header, 'mensagem_enviada'); // -1 se col não existe
    var idxMsgId = _waColIdx_(data.header, 'message_id');       // -1 se col não existe
    var rowIdx = -1;
    for (var i = 0; i < data.linhas.length; i++) {
      if (data.linhas[i][idxCamp] === payload.campanha_id &&
          String(data.linhas[i][idxFone]).replace(/\D/g, '') === phoneNorm) {
        rowIdx = i; break;
      }
    }
    if (rowIdx < 0) return { ok: false, mensagem: 'Disparo não encontrado.' };
    var linha = data.linhas[rowIdx];
    linha[idxStatus] = payload.novo_status;
    if (payload.novo_status === 'enviado')   linha[idxEnv]  = new Date();
    if (payload.novo_status === 'respondeu') linha[idxResp] = new Date();
    if (payload.novo_status === 'erro')      linha[idxErro] = String(payload.erro_msg || '');
    linha[idxTent] = (Number(linha[idxTent]) || 0) + 1;

    // Persiste mensagem efetivamente enviada e message_id (apenas no envio)
    if (payload.novo_status === 'enviado') {
      if (idxMsg   >= 0 && payload.mensagem_enviada) linha[idxMsg]   = String(payload.mensagem_enviada);
      if (idxMsgId >= 0 && payload.message_id)       linha[idxMsgId] = String(payload.message_id);
    }
    shDisp.getRange(rowIdx + 2, 1, 1, linha.length).setValues([linha]);

    // Atualiza totais na campanha
    _recalcularTotaisCampanha_(payload.campanha_id);

    // Incrementa daily_count se for envio
    if (payload.increment_daily) {
      var usuario = payload.usuario;
      if (usuario) {
        var inst = _waInstanciaPorUsuario_(usuario) || {};
        var hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
        var dc = (String(inst.daily_date) === hoje) ? (Number(inst.daily_count) || 0) + 1 : 1;
        _waUpsertInstanciaLinha_(usuario, { daily_count: dc, daily_date: hoje });
      }
    }

    // Blacklist automática (status='blacklist' OU flag add_to_blacklist em paralelo a 'respondeu')
    if (payload.novo_status === 'blacklist' || payload.add_to_blacklist === true) {
      var shBl = _waSheet_(CFG_WA_PESSOAL.ABA_BLACKLIST);
      shBl.appendRow([phoneNorm, new Date(), payload.erro_msg || 'opt-out automático']);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

/**
 * Normaliza phones brasileiros pra comparação cross-formato.
 * Lida com TODAS as variantes: com/sem prefixo "55", com/sem o "9" extra de mobile.
 *
 * Reduz tudo a 10 dígitos canônicos: DDD(2) + 8 dígitos do número.
 *
 * Exemplos:
 *   5532999700092 (13) → strip 55, strip 9 → "3299700092"
 *   553291534154  (12, sem 9) → strip 55     → "3291534154"
 *   32988442309   (11, sem 55) → strip 9      → "3288442309"
 *   3288442309    (10, canônico) → "3288442309"
 */
function _normalizePhoneBR_(p) {
  var d = String(p == null ? '' : p).replace(/\D/g, '');
  // Strip prefixo país "55" se tiver 12+ dígitos
  if (d.length >= 12 && d.substr(0, 2) === '55') d = d.substr(2);
  // Strip dígito "9" extra de mobile (DDD + 9 + 8 dígitos = 11 → DDD + 8 = 10)
  if (d.length === 11 && d.charAt(2) === '9') d = d.substr(0, 2) + d.substr(3);
  return d;
}

/**
 * Match resposta → disparo. Substitui "Resolve match" do WF2 (que tinha bug pelo
 * Sheets node com multi-filter retornando rows incorretas).
 *
 * payload: { secret, action='wa_pessoal_mark_respondeu',
 *            instance, phone (do sender JID), isLid (boolean), texto, isOptOut }
 *
 * Lógica:
 * 1. Busca todos disparos com status='enviado' da instância
 * 2. Match EXATO por phone normalizado (resolve diff entre 12/13 dígitos BR)
 * 3. Se isLid e match exato falhou: heurística "mais recente por enviado_em" como fallback
 * 4. Marca status='respondeu' + respondeu_em na row
 * 5. Adiciona à blacklist se isOptOut
 * 6. Recalcula totais da campanha
 */
function _handleWaPessoalMarkRespondeu_(payload) {
  if (!payload.phone) return { ok: false, mensagem: 'phone obrigatório.' };
  var phoneNorm = _normalizePhoneBR_(payload.phone);

  var sh = _waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS);
  var data = _waLerLinhas_(sh);
  var idxStatus = _waColIdx_(data.header, 'status');
  var idxInstance = _waColIdx_(data.header, 'instance_id');
  var idxFone = _waColIdx_(data.header, 'contato_phone');
  var idxEnvEm = _waColIdx_(data.header, 'enviado_em');
  var idxResp = _waColIdx_(data.header, 'respondeu_em');
  var idxCamp = _waColIdx_(data.header, 'campanha_id');

  // Disparos enviados da instância
  var candidates = [];
  for (var i = 0; i < data.linhas.length; i++) {
    var row = data.linhas[i];
    if (payload.instance && String(row[idxInstance]) !== String(payload.instance)) continue;
    if (String(row[idxStatus] || '').toLowerCase() !== 'enviado') continue;
    candidates.push({ i: i, row: row });
  }

  // Match exato por phone normalizado
  var match = null;
  for (var k = 0; k < candidates.length; k++) {
    if (_normalizePhoneBR_(candidates[k].row[idxFone]) === phoneNorm) {
      match = candidates[k]; break;
    }
  }

  // Fallback heurística LID: pega mais recente por enviado_em (apenas se sender veio LID)
  if (!match && payload.isLid && candidates.length) {
    candidates.sort(function(a, b) {
      var da = a.row[idxEnvEm] ? new Date(a.row[idxEnvEm]).getTime() : 0;
      var db = b.row[idxEnvEm] ? new Date(b.row[idxEnvEm]).getTime() : 0;
      return db - da;
    });
    match = candidates[0];
  }

  if (!match) return { ok: true, matched: false, motivo: 'nenhum disparo enviado bateu com phone ' + phoneNorm };

  // Marca respondeu
  var row = match.row;
  row[idxStatus] = 'respondeu';
  row[idxResp] = new Date();
  sh.getRange(match.i + 2, 1, 1, row.length).setValues([row]);

  // Blacklist (opt-out)
  if (payload.isOptOut) {
    var shBl = _waSheet_(CFG_WA_PESSOAL.ABA_BLACKLIST);
    shBl.appendRow([_normalizePhoneBR_(row[idxFone]), new Date(), 'opt-out na resposta: ' + (payload.texto || '').slice(0, 100)]);
  }

  _recalcularTotaisCampanha_(row[idxCamp]);

  return { ok: true, matched: true, campanha_id: row[idxCamp], phone: String(row[idxFone]), via: match.viaLid ? 'lid' : 'phone' };
}

/**
 * Retorna o primeiro disparo com status='pendente' da campanha E o marca atomicamente
 * como 'enviando' (claim) — assim o próximo loop NÃO pega a mesma row novamente, mesmo
 * que Marca Enviado falhe depois.
 *
 * NÃO usa LockService global (ScriptLock). O claim usa o setValue do Sheets como
 * operação síncrona; em single-chain (um disparo por vez) não há contenção. Caso 2+
 * chains tentem claim simultaneo, ambos podem ler a mesma row antes do write — risco
 * mínimo aceitável. ScriptLock é evitado porque ele entra em conflito com outras
 * chamadas GAS (Marca Enviado) dentro da mesma chain do WF1.
 *
 * Chamado pelo WF1 via webhook (action=wa_pessoal_next_pending, com secret).
 * payload: { action, secret, campanha_id }
 * Retorno: { ok: true, disparo: {...} | null }
 */
function _handleWaPessoalNextPending_(payload) {
  if (!payload.campanha_id) return { ok: false, mensagem: 'campanha_id obrigatório.' };
  var sh = _waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS);
  var data = _waLerLinhas_(sh);
  var idxCamp = _waColIdx_(data.header, 'campanha_id');
  var idxStatus = _waColIdx_(data.header, 'status');
  for (var i = 0; i < data.linhas.length; i++) {
    if (String(data.linhas[i][idxCamp]) !== String(payload.campanha_id)) continue;
    if (String(data.linhas[i][idxStatus]).trim().toLowerCase() !== 'pendente') continue;
    // Claim: marcar status='enviando' antes de retornar
    sh.getRange(i + 2, idxStatus + 1).setValue('enviando');
    SpreadsheetApp.flush(); // garante commit imediato pra que outras chamadas vejam
    var disparo = {};
    data.header.forEach(function(h, j) { disparo[h] = data.linhas[i][j]; });
    disparo.status = 'enviando';
    disparo._row = i + 2;
    return { ok: true, disparo: _waNormalizarParaCliente_(disparo) };
  }
  // Sem pendentes → marca campanha como concluída (se ainda estiver 'ativa')
  var concluiu = _concluirCampanhaSeAtiva_(payload.campanha_id);
  return { ok: true, disparo: null, conclusao: concluiu };
}

/**
 * Marca campanha como 'concluida' em WA Campanhas se status atual é 'ativa'.
 * Não toca em pausada/cancelada/etc. Idempotente.
 * Retorna {alterou, statusAnterior, encontrou}.
 */
function _concluirCampanhaSeAtiva_(campanhaId) {
  var sh = _waSheet_(CFG_WA_PESSOAL.ABA_CAMPANHAS);
  var data = _waLerLinhas_(sh);
  var idxId = _waColIdx_(data.header, 'id');
  var idxStatus = _waColIdx_(data.header, 'status');
  for (var i = 0; i < data.linhas.length; i++) {
    if (String(data.linhas[i][idxId]).trim() !== String(campanhaId).trim()) continue;
    var atual = String(data.linhas[i][idxStatus] || '').trim().toLowerCase();
    if (atual === 'ativa') {
      sh.getRange(i + 2, idxStatus + 1).setValue('concluida');
      return { alterou: true, statusAnterior: atual, encontrou: true };
    }
    return { alterou: false, statusAnterior: atual, encontrou: true };
  }
  return { alterou: false, statusAnterior: null, encontrou: false };
}

/**
 * Atualiza entregue_em / lido_em por message_id (Evolution event messages.update).
 * delivery_status:
 *   'DELIVERY_ACK' → entregue_em = now (se ainda não preenchido)
 *   'READ'         → lido_em = now (se ainda não preenchido); preenche entregue_em se vazio
 */
function _handleWaPessoalDeliveryUpdate_(payload) {
  if (!payload.message_id || !payload.delivery_status) {
    return { ok: false, mensagem: 'Faltam message_id ou delivery_status.' };
  }
  var status = String(payload.delivery_status).toUpperCase();
  if (status !== 'DELIVERY_ACK' && status !== 'READ') {
    return { ok: true, ignorado: true, motivo: 'status ' + status + ' não rastreado' };
  }

  // Sem LockService — webhook de delivery do Evolution pode ocorrer concorrente com
  // outras chamadas GAS na mesma chain. ScriptLock causaria timeout cascateado.
  try {
    var shDisp = _waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS);
    var data = _waLerLinhas_(shDisp);
    var idxMsgId = _waColIdx_(data.header, 'message_id');
    var idxEntr  = _waColIdx_(data.header, 'entregue_em');
    var idxLido  = _waColIdx_(data.header, 'lido_em');
    if (idxMsgId < 0 || idxEntr < 0 || idxLido < 0) {
      return { ok: false, mensagem: 'Colunas de rastreamento ausentes em WA Disparos. Rode _addColunasRastreamentoWaDisparos.' };
    }
    var rowIdx = -1;
    for (var i = 0; i < data.linhas.length; i++) {
      if (String(data.linhas[i][idxMsgId]) === String(payload.message_id)) {
        rowIdx = i; break;
      }
    }
    if (rowIdx < 0) return { ok: false, mensagem: 'message_id não encontrado.' };

    var linha = data.linhas[rowIdx];
    var agora = new Date();
    var alterou = false;
    if (status === 'DELIVERY_ACK') {
      if (!linha[idxEntr]) { linha[idxEntr] = agora; alterou = true; }
    } else if (status === 'READ') {
      if (!linha[idxLido]) { linha[idxLido] = agora; alterou = true; }
      if (!linha[idxEntr]) { linha[idxEntr] = agora; alterou = true; } // read implica entregue
    }
    if (alterou) {
      shDisp.getRange(rowIdx + 2, 1, 1, linha.length).setValues([linha]);
    }
    return { ok: true, alterou: alterou };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

/**
 * Lista todos os disparos de uma campanha (pra modal "Ver disparos" no Histórico).
 * Retorna campos cruz: contato, telefone, status, mensagem_enviada, timestamps.
 */
function getDisparosCampanha(usuario, campanhaId, usuarioAlvo) {
  try {
    var alvo = _resolveUsuarioAlvo_(usuario, usuarioAlvo);
    if (!campanhaId) throw new Error('campanha_id obrigatório.');

    // Verifica que a campanha pertence ao alvo (segurança)
    var shCamps = _waSheet_(CFG_WA_PESSOAL.ABA_CAMPANHAS);
    var dCamps = _waLerLinhas_(shCamps);
    var idxId = _waColIdx_(dCamps.header, 'id');
    var idxUsr = _waColIdx_(dCamps.header, 'usuario');
    var camp = null;
    for (var i = 0; i < dCamps.linhas.length; i++) {
      if (dCamps.linhas[i][idxId] === campanhaId) {
        camp = {};
        dCamps.header.forEach(function(h, j) { camp[h] = dCamps.linhas[i][j]; });
        break;
      }
    }
    if (!camp) throw new Error('Campanha não encontrada.');
    if (String(camp.usuario) !== alvo) throw new Error('Sem permissão para esta campanha.');

    // Lê disparos da campanha
    var shDisp = _waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS);
    var dDisp = _waLerLinhas_(shDisp);
    var idxCampDisp = _waColIdx_(dDisp.header, 'campanha_id');
    var disparos = [];
    for (var k = 0; k < dDisp.linhas.length; k++) {
      if (dDisp.linhas[k][idxCampDisp] !== campanhaId) continue;
      var obj = {};
      dDisp.header.forEach(function(h, j) { obj[h] = dDisp.linhas[k][j]; });
      disparos.push(obj);
    }

    return _waNormalizarParaCliente_({ ok: true, campanha: { id: camp.id, nome: camp.nome, usuario: camp.usuario }, data: disparos });
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

function _recalcularTotaisCampanha_(campanhaId) {
  var shDisp = _waSheet_(CFG_WA_PESSOAL.ABA_DISPAROS);
  var data = _waLerLinhas_(shDisp);
  var idxCamp = _waColIdx_(data.header, 'campanha_id');
  var idxStatus = _waColIdx_(data.header, 'status');
  var t_env = 0, t_resp = 0, t_err = 0;
  for (var i = 0; i < data.linhas.length; i++) {
    if (data.linhas[i][idxCamp] !== campanhaId) continue;
    var s = data.linhas[i][idxStatus];
    if (s === 'enviado' || s === 'respondeu') t_env++;
    if (s === 'respondeu') t_resp++;
    if (s === 'erro') t_err++;
  }
  var shCamps = _waSheet_(CFG_WA_PESSOAL.ABA_CAMPANHAS);
  var dc = _waLerLinhas_(shCamps);
  var idxId = _waColIdx_(dc.header, 'id');
  var idxEnv = _waColIdx_(dc.header, 'total_enviado');
  var idxResp = _waColIdx_(dc.header, 'total_respondeu');
  var idxErr = _waColIdx_(dc.header, 'total_erro');
  for (var j = 0; j < dc.linhas.length; j++) {
    if (dc.linhas[j][idxId] === campanhaId) {
      shCamps.getRange(j + 2, idxEnv + 1).setValue(t_env);
      shCamps.getRange(j + 2, idxResp + 1).setValue(t_resp);
      shCamps.getRange(j + 2, idxErr + 1).setValue(t_err);
      return;
    }
  }
}
