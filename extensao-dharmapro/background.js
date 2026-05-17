// ══════════════════════════════════════════════════════════════════════════════
//  DharmaPro Connector — Service Worker (background)
//  Faz as chamadas ao Adapter em background, sem abrir popup
// ══════════════════════════════════════════════════════════════════════════════

var BASE = 'https://adapter.veronet.com.br/adapter/server/gateway';

function fmtData(val) {
  if (!val) return '';
  var d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();
}

async function consultarAdapter(cpf, user, pass) {
  try {
    // 1. Login
    var loginResp = await fetch(BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'login=' + encodeURIComponent(user) + '&senha=' + encodeURIComponent(pass)
    });
    if (!loginResp.ok) {
      var errBody = '';
      try { errBody = await loginResp.text(); } catch(x) {}
      return { erro: 'Login falhou (HTTP ' + loginResp.status + '). ' + errBody.substring(0, 200) };
    }

    // 2. Buscar cliente por CPF
    var cpfLimpo = cpf.replace(/\D/g, '');
    var clienteResp = await fetch(BASE + '/comercial/clientes/novo/datatables?cpf=' + cpfLimpo, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draw: 1, start: 0, length: 10 })
    });
    if (!clienteResp.ok) return { erro: 'Erro ao buscar cliente (HTTP ' + clienteResp.status + ')' };

    var clienteData = await clienteResp.json();
    var lista = clienteData.data || clienteData.content || [];
    if (!lista.length) return { erro: 'CPF nao encontrado no Adapter.' };

    var cli = lista[0];
    var clienteId = cli.IDCliente || cli.id || cli.clienteId || cli.codigo || '';

    // 3. Contratos
    var contratosResp = await fetch(BASE + '/comercial/contratos/cliente/' + clienteId);
    var contratosRaw = contratosResp.ok ? await contratosResp.json() : [];

    var contratos = [];
    if (Array.isArray(contratosRaw)) {
      contratos = contratosRaw;
    } else if (contratosRaw && typeof contratosRaw === 'object') {
      if (contratosRaw.data) contratos = contratosRaw.data;
      else if (contratosRaw.content) contratos = contratosRaw.content;
      else {
        var keys = Object.keys(contratosRaw);
        for (var g = 0; g < keys.length; g++) {
          var grupo = contratosRaw[keys[g]];
          if (Array.isArray(grupo)) {
            for (var gi = 0; gi < grupo.length; gi++) {
              if (!grupo[gi].statusGrupo) grupo[gi].statusGrupo = keys[g];
              contratos.push(grupo[gi]);
            }
          }
        }
      }
    }

    // 4. Atendimentos agendados
    var dtBody = JSON.stringify({
      draw: 1, start: 0, length: 50,
      columns: [{ data: null, name: '', searchable: true, orderable: false, search: { value: '', regex: false } }],
      order: [{ column: 0, dir: 'asc' }],
      search: { value: '', regex: false }
    });

    var agendadosResp = await fetch(BASE + '/comercial/atendimentos/novo/datatables?clienteId=' + clienteId + '&status=VISITA_AGENDADA', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: dtBody
    });
    var agendadosRaw = agendadosResp.ok ? await agendadosResp.json() : {};
    var agendados = agendadosRaw.data || agendadosRaw.content || (Array.isArray(agendadosRaw) ? agendadosRaw : []);

    // 5. Processar
    var r = { instalada: false, dataInstalacao: '', dataAgendamento: '', resumo: '', contratos: [], aguardando: false };

    for (var i = 0; i < contratos.length; i++) {
      var c = contratos[i];
      var cStatus = (c.status && typeof c.status === 'object') ? (c.status.descricao || '') : String(c.status || '');
      var cPlano  = (c.plano  && typeof c.plano  === 'object') ? (c.plano.nome || '')       : String(c.plano || '');
      var cStatusUp = cStatus.toUpperCase();

      r.contratos.push({ id: c.id || '', plano: cPlano, status: cStatus });

      if (cStatusUp === 'CANCELADO') continue;
      if (cStatusUp === 'HABILITADO') {
        r.instalada = true;
        var dtHab = c.dataHabilitacao || c.dataUltimaHabilitacao || '';
        if (dtHab) r.dataInstalacao = (typeof dtHab === 'string' && dtHab.indexOf('/') > -1) ? dtHab.split(' ')[0] : fmtData(dtHab);
      }
      if (cStatusUp.indexOf('AGUARDANDO') > -1) r.aguardando = true;
    }

    if (!r.instalada) {
      for (var k = 0; k < agendados.length; k++) {
        var a = agendados[k];
        var dtAg = a.dataAgendamento || '';
        if (dtAg) { r.dataAgendamento = dtAg; break; }
      }
    }

    if (r.instalada) r.resumo = 'Instalada' + (r.dataInstalacao ? ' em ' + r.dataInstalacao : '');
    else if (r.dataAgendamento) r.resumo = 'Agendada para ' + r.dataAgendamento;
    else if (r.aguardando) r.resumo = 'Aguardando Instalacao (sem agendamento)';
    else r.resumo = 'Sem contrato ativo';

    return r;

  } catch (e) {
    return { erro: 'Erro: ' + (e.message || String(e)) };
  }
}

// Escuta mensagens do content script bridge
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg && msg.type === 'dhp_adapter_consulta') {
    consultarAdapter(msg.cpf, msg.user, msg.pass).then(sendResponse);
    return true; // resposta assincrona
  }

  // Ping ready notification do content-ping (apenas log; não responde)
  if (msg && msg.from === 'ping' && msg.kind === 'ready') {
    // sender.tab.id é a aba do PinG que ficou ready
    return false;
  }

  // Roteamento Viabilidade (PinG) — ações `viabilidade.*`
  if (msg && typeof msg.action === 'string' && msg.action.indexOf('viabilidade.') === 0) {
    handleViabilidade(msg, sender).then(sendResponse, function (err) {
      sendResponse({ ok: false, erro: 'EXTENSAO_ERRO_INTERNO', msg: String(err && err.message || err) });
    });
    return true;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  Viabilidade (PinG) — bridge CRM ↔ extensão ↔ aba do PinG (main world)
//  Spec: dharmapro-crm/prompt-viabilidade-ping.v2.md §8, §9, §11
// ══════════════════════════════════════════════════════════════════════════════

var PING_TAB_QUERY     = { url: 'https://ping.veronet.com.br/*' };
var PING_BRIDGE_TIMEOUT_MS = 8000;

// Cache TTLs (segundos)
var TTL_SUGGEST   = 300;     // 5 min
var TTL_CONSULT   = 600;     // 10 min
var TTL_FORBIDDEN = 86400;   // 24 h
var CACHE_MAX_BYTES = 5 * 1024 * 1024;
var CACHE_EVICT_EVERY = 100;

// Throttling buckets (janela em ms)
var THROTTLE = {
  userMin:  { janelaMs:  60000, max:  10 },
  userHora: { janelaMs:3600000, max: 120 },
  global:   { janelaMs:  60000, max:  60 },
  suggest:  { janelaMs:  60000, max:  30 }
};

// ──────────────────────────────────────────────────────────────────────────────
// Entry point por ação
// ──────────────────────────────────────────────────────────────────────────────
async function handleViabilidade(msg, sender) {
  var act = msg.action;
  var usuario = msg.usuario || 'anon';

  if (act === 'viabilidade.health')             return await acaoHealth();
  if (act === 'viabilidade.autocomplete')       return await acaoAutocomplete(usuario, msg);
  if (act === 'viabilidade.coverageArea')       return await acaoCoverageArea(usuario, msg);
  if (act === 'viabilidade.detalhesNumero')     return await acaoDetalhesNumero(usuario, msg);
  if (act === 'viabilidade.cacheClear')         return await cacheClearAll();
  return { ok: false, erro: 'ACAO_DESCONHECIDA', msg: 'Ação não reconhecida: ' + act };
}

// ──────────────────────────────────────────────────────────────────────────────
// Ações
// ──────────────────────────────────────────────────────────────────────────────
async function acaoHealth() {
  var tab = await acharAbaPing();
  if (!tab) return { ok: false, erro: 'PING_TAB_AUSENTE', autenticado: false };
  var r = await enviarParaMainWorld(tab.id, { action: 'health' });
  if (!r || r.ok === false) {
    var erro = (r && r.erro) || 'EXTENSAO_TIMEOUT';
    if (erro === 'PING_NAO_AUTENTICADO' || (r && (r.status === 401 || r.status === 403))) {
      return { ok: false, erro: 'PING_NAO_AUTENTICADO', autenticado: false };
    }
    return { ok: false, erro: erro, autenticado: false, msg: r && r.msg };
  }
  return { ok: true, autenticado: !!r.autenticado, status: r.status };
}

async function acaoAutocomplete(usuario, msg) {
  var input = String(msg.input || '');
  if (input.length < 2) return { ok: true, body: [], cacheHit: false };

  var lat = (msg.latitude  != null) ? Number(msg.latitude)  : null;
  var lng = (msg.longitude != null) ? Number(msg.longitude) : null;

  var qNorm = normalizarTexto(input);
  var key = await sha256Hex(qNorm + '|' + (lat || '') + '|' + (lng || ''));
  var cacheKey = 'ping:suggest:' + key;

  var hit = await cacheGet(cacheKey);
  if (hit) return { ok: true, body: hit.body, cacheHit: true };

  var thr = await throttleAcquire(usuario, ['userMin', 'userHora', 'global', 'suggest']);
  if (!thr.ok) return thr;

  var tab = await acharAbaPing();
  if (!tab) return { ok: false, erro: 'PING_TAB_AUSENTE' };

  var r = await enviarParaMainWorld(tab.id, {
    action: 'autocomplete',
    input: input,
    latitude: lat,
    longitude: lng
  });
  if (!r || r.ok === false) return mapearErroMainWorld(r);

  await cacheSet(cacheKey, { body: r.body }, TTL_SUGGEST);
  return { ok: true, body: r.body, cacheHit: false };
}

async function acaoCoverageArea(usuario, msg) {
  var cidade = String(msg.cidade || '');
  var params = msg.params || {};

  var cidadeNorm = normalizarTexto(cidade);
  var key = cidadeNorm ? ('ping:forbidden:' + cidadeNorm) : null;

  if (key) {
    var hit = await cacheGet(key);
    if (hit) return { ok: true, body: hit.body, cacheHit: true };
  }

  var thr = await throttleAcquire(usuario, ['userMin', 'userHora', 'global']);
  if (!thr.ok) return thr;

  var tab = await acharAbaPing();
  if (!tab) return { ok: false, erro: 'PING_TAB_AUSENTE' };

  var r = await enviarParaMainWorld(tab.id, { action: 'coverage_area', params: params });
  if (!r || r.ok === false) return mapearErroMainWorld(r);

  if (key) await cacheSet(key, { body: r.body }, TTL_FORBIDDEN);
  return { ok: true, body: r.body, cacheHit: false };
}

async function acaoDetalhesNumero(usuario, msg) {
  var sq  = String(msg.string_query || '');
  var num = msg.numero;
  var cid = String(msg.cidade || '');
  var lat = msg.lat, lng = msg.long;

  var keySrc = sq + '|' + (num || '') + '|' + (lat || '') + '|' + (lng || '');
  var key = 'ping:consult:' + (await sha256Hex(keySrc));

  var hit = await cacheGet(key);
  if (hit) return { ok: true, body: hit.body, cacheHit: true };

  var thr = await throttleAcquire(usuario, ['userMin', 'userHora', 'global']);
  if (!thr.ok) return thr;

  var tab = await acharAbaPing();
  if (!tab) return { ok: false, erro: 'PING_TAB_AUSENTE' };

  var r = await enviarParaMainWorld(tab.id, {
    action: 'detalhes_numero',
    string_query: sq, numero: num, cidade: cid, lat: lat, long: lng
  });
  if (!r || r.ok === false) return mapearErroMainWorld(r);

  await cacheSet(key, { body: r.body }, TTL_CONSULT);
  return { ok: true, body: r.body, cacheHit: false };
}

// ──────────────────────────────────────────────────────────────────────────────
// Bridge para a aba do PinG (content-ping → main world)
// ──────────────────────────────────────────────────────────────────────────────
function acharAbaPing() {
  return new Promise(function (resolve) {
    try {
      chrome.tabs.query(PING_TAB_QUERY, function (tabs) {
        if (chrome.runtime.lastError) return resolve(null);
        if (!tabs || !tabs.length) return resolve(null);
        // prioriza tab ativa, depois mais recentemente acessada
        var ativa = tabs.find(function (t) { return t.active; });
        resolve(ativa || tabs[0]);
      });
    } catch (e) { resolve(null); }
  });
}

function enviarParaMainWorld(tabId, payload) {
  return new Promise(function (resolve) {
    var done = false;
    var to = setTimeout(function () {
      if (done) return;
      done = true;
      resolve({ ok: false, erro: 'EXTENSAO_TIMEOUT' });
    }, PING_BRIDGE_TIMEOUT_MS);

    try {
      chrome.tabs.sendMessage(tabId, { target: 'ping-main-world', payload: payload }, function (resp) {
        if (done) return;
        done = true;
        clearTimeout(to);
        if (chrome.runtime.lastError) {
          resolve({ ok: false, erro: 'CONTENT_PING_INACESSIVEL', msg: chrome.runtime.lastError.message });
          return;
        }
        resolve(resp);
      });
    } catch (e) {
      if (done) return;
      done = true;
      clearTimeout(to);
      resolve({ ok: false, erro: 'EXTENSAO_ERRO_INTERNO', msg: String(e && e.message || e) });
    }
  });
}

function mapearErroMainWorld(r) {
  if (!r) return { ok: false, erro: 'EXTENSAO_TIMEOUT' };
  if (r.erro === 'PING_NAO_AUTENTICADO' || r.status === 401 || r.status === 403) {
    return { ok: false, erro: 'PING_NAO_AUTENTICADO' };
  }
  if (r.status >= 500) return { ok: false, erro: 'PING_5XX', status: r.status };
  if (r.erro === 'PING_NAO_JSON') return { ok: false, erro: 'PING_SCHEMA_INVALIDO' };
  if (r.erro === 'PING_TIMEOUT') return { ok: false, erro: 'EXTENSAO_TIMEOUT' };
  return { ok: false, erro: r.erro || 'PING_ERRO', status: r.status, msg: r.msg };
}

// ──────────────────────────────────────────────────────────────────────────────
// Cache (chrome.storage.local) — 3 namespaces, TTL, eviction periódica
// ──────────────────────────────────────────────────────────────────────────────
function cacheGet(key) {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.get(key, function (obj) {
        if (chrome.runtime.lastError) return resolve(null);
        var entry = obj && obj[key];
        if (!entry || typeof entry.exp !== 'number') return resolve(null);
        if (entry.exp < Date.now()) {
          // expirado — remove
          chrome.storage.local.remove(key, function () { void chrome.runtime.lastError; });
          return resolve(null);
        }
        resolve(entry.data);
      });
    } catch (e) { resolve(null); }
  });
}

function cacheSet(key, data, ttlSec) {
  return new Promise(function (resolve) {
    var entry = { data: data, exp: Date.now() + ttlSec * 1000 };
    var obj = {};
    obj[key] = entry;
    try {
      chrome.storage.local.set(obj, function () {
        void chrome.runtime.lastError;
        cacheEvictMaybe();
        resolve(true);
      });
    } catch (e) { resolve(false); }
  });
}

function cacheClearAll() {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.get(null, function (all) {
        if (chrome.runtime.lastError) return resolve({ ok: false, erro: 'STORAGE_ERRO' });
        var keys = Object.keys(all || {}).filter(function (k) { return k.indexOf('ping:') === 0; });
        if (!keys.length) return resolve({ ok: true, removidas: 0 });
        chrome.storage.local.remove(keys, function () { resolve({ ok: true, removidas: keys.length }); });
      });
    } catch (e) { resolve({ ok: false, erro: 'STORAGE_ERRO' }); }
  });
}

var _cacheWriteCount = 0;
function cacheEvictMaybe() {
  _cacheWriteCount++;
  if (_cacheWriteCount % CACHE_EVICT_EVERY !== 0) return;
  try {
    chrome.storage.local.getBytesInUse(null, function (bytes) {
      var precisaEvict = bytes && bytes > CACHE_MAX_BYTES;
      chrome.storage.local.get(null, function (all) {
        if (chrome.runtime.lastError) return;
        var now = Date.now();
        var paraRemover = [];
        Object.keys(all || {}).forEach(function (k) {
          if (k.indexOf('ping:') !== 0) return;
          var e = all[k];
          if (!e || typeof e.exp !== 'number' || e.exp < now) paraRemover.push(k);
        });
        if (precisaEvict) {
          // se ainda passar do limite, derruba metade das entradas remanescentes (FIFO simples)
          var remanescente = Object.keys(all).filter(function (k) { return k.indexOf('ping:') === 0 && paraRemover.indexOf(k) === -1; });
          var sobra = Math.floor(remanescente.length / 2);
          for (var i = 0; i < sobra; i++) paraRemover.push(remanescente[i]);
        }
        if (paraRemover.length) chrome.storage.local.remove(paraRemover, function () { void chrome.runtime.lastError; });
      });
    });
  } catch (x) {}
}

// ──────────────────────────────────────────────────────────────────────────────
// Throttling (chrome.storage.local) — janela deslizante
// ──────────────────────────────────────────────────────────────────────────────
async function throttleAcquire(usuario, buckets) {
  var now = Date.now();
  for (var i = 0; i < buckets.length; i++) {
    var b = buckets[i];
    var cfg = THROTTLE[b];
    if (!cfg) continue;
    var key = bucketKey(b, usuario);
    var arr = await throttleGet(key);
    arr = arr.filter(function (t) { return (now - t) < cfg.janelaMs; });
    if (arr.length >= cfg.max) {
      return { ok: false, erro: 'PING_RATE_LIMIT', bucket: b, msg: 'Aguarde alguns segundos antes de nova consulta' };
    }
  }
  // todos os buckets passaram — registra o hit em cada um
  var promises = buckets.map(function (b) {
    var cfg = THROTTLE[b];
    if (!cfg) return Promise.resolve();
    var key = bucketKey(b, usuario);
    return throttleGet(key).then(function (arr) {
      arr = arr.filter(function (t) { return (now - t) < cfg.janelaMs; });
      arr.push(now);
      return throttleSet(key, arr);
    });
  });
  await Promise.all(promises);
  return { ok: true };
}

function bucketKey(bucket, usuario) {
  if (bucket === 'global') return 'ping:throttle:global';
  if (bucket === 'suggest') return 'ping:throttle:suggest:' + usuario;
  return 'ping:throttle:' + bucket + ':' + usuario;
}

function throttleGet(key) {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.get(key, function (obj) {
        if (chrome.runtime.lastError) return resolve([]);
        resolve((obj && Array.isArray(obj[key])) ? obj[key] : []);
      });
    } catch (e) { resolve([]); }
  });
}

function throttleSet(key, arr) {
  return new Promise(function (resolve) {
    var obj = {}; obj[key] = arr;
    try { chrome.storage.local.set(obj, function () { resolve(true); }); }
    catch (e) { resolve(false); }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers — hash + normalização
// ──────────────────────────────────────────────────────────────────────────────
function normalizarTexto(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ').trim();
}

function sha256Hex(s) {
  var enc = new TextEncoder().encode(String(s || ''));
  return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
    var bytes = new Uint8Array(buf);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex.slice(0, 16);
  });
}
