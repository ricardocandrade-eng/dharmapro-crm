// ══════════════════════════════════════════════════════════════════════════════
//  DharmaPro Connector — Ping Main World
//  Roda no MAIN WORLD do SPA do PinG (ping.veronet.com.br). Tem acesso ao
//  window.fetch original que o SPA já configurou com Authorization injetado.
//
//  Protocolo (window.postMessage <-> window.addEventListener('message')):
//    Recebe:  { __dharmaPing:true, kind:"command",  id, payload:{ action, ...args } }
//    Envia:   { __dharmaPing:true, kind:"response", id, payload:{ ok, status, body? | erro, msg? } }
//             { __dharmaPing:true, kind:"ready" }             (boot)
//             { __dharmaPing:true, kind:"passive", path, status, bodyLen }   (observação passiva)
//
//  Ações suportadas:
//    autocomplete       { input, latitude?, longitude? }
//    coverage_area      { params:{...} }   (params de bbox livres)
//    detalhes_numero    { string_query, numero, cidade, lat, long }
//    health             {}
// ══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  if (window.__dharmaPingMainInstalled) return;
  window.__dharmaPingMainInstalled = true;

  var GATEWAY = 'https://gateway.pi.ngtools.com.br';
  var TIMEOUT_MS = 8000;

  // Capturador de auth: o SPA do PinG injeta Authorization (provavelmente JWT)
  // nas chamadas dele ao gateway. Vamos interceptar window.fetch passivamente,
  // ler os headers das chamadas REAIS que ele faz, e reusar nos nossos fetches.
  var lastSpaAuth = null;     // último Authorization observado
  var origFetch = window.fetch.bind(window);

  try {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      try {
        if (url && url.indexOf(GATEWAY) === 0) {
          // Extrai headers — pode vir em init OU no Request (input)
          var hdrs = null;
          if (init && init.headers) hdrs = init.headers;
          else if (input && input.headers) hdrs = input.headers;
          var auth = null;
          if (hdrs) {
            if (typeof hdrs.get === 'function') auth = hdrs.get('Authorization') || hdrs.get('authorization');
            else if (typeof hdrs === 'object') auth = hdrs.Authorization || hdrs.authorization;
          }
          if (auth) {
            if (auth !== lastSpaAuth) {
              console.log('[DHP-PING] capturou Authorization do SPA (' + auth.length + ' chars, prefix=' + auth.substring(0, 20) + '...)');
            }
            lastSpaAuth = auth;
          } else {
            console.log('[DHP-PING] SPA fez fetch ao gateway SEM Authorization header — path=' + new URL(url).pathname);
          }
        }
      } catch (e) {}
      return origFetch.apply(this, arguments);
    };
    console.log('[DHP-PING] window.fetch wrap instalado (capturador de Authorization)');
  } catch (e) {
    console.warn('[DHP-PING] fetch wrap falhou:', e);
  }

  // Chama o gateway reusando o Authorization capturado (se houver). Sem auth,
  // tenta mesmo assim — o gateway pode aceitar cookies puros pra algumas rotas.
  function fetchAuth(url, opts) {
    opts = opts || {};
    opts.credentials = 'include';
    opts.headers = opts.headers || {};
    if (lastSpaAuth && !opts.headers.Authorization && !opts.headers.authorization) {
      opts.headers.Authorization = lastSpaAuth;
    }
    if (!lastSpaAuth) {
      console.warn('[DHP-PING] fetchAuth SEM Authorization (SPA ainda não chamou gateway nesta sessão) — url=' + url);
    }
    return origFetch(url, opts);
  }

  // 3. Listener de comandos do content-ping (isolated world)
  window.addEventListener('message', function (ev) {
    var m = ev && ev.data;
    if (!m || m.__dharmaPing !== true || m.kind !== 'command') return;
    var id = m.id;
    executar(m.payload).then(function (result) {
      try {
        window.postMessage({ __dharmaPing: true, kind: 'response', id: id, payload: result }, '*');
      } catch (x) {}
    }, function (err) {
      try {
        window.postMessage({
          __dharmaPing: true, kind: 'response', id: id,
          payload: { ok: false, erro: 'MAIN_WORLD_ERROR', msg: String(err && err.message || err) }
        }, '*');
      } catch (x) {}
    });
  });

  // 4. Executor — usa origFetch (auth do SPA)
  function executar(cmd) {
    if (!cmd || typeof cmd !== 'object') {
      return Promise.resolve({ ok: false, erro: 'ACAO_AUSENTE' });
    }
    var ctrl = new AbortController();
    var to = setTimeout(function () { try { ctrl.abort(); } catch (x) {} }, TIMEOUT_MS);

    function done(p) {
      return p.then(function (r) { clearTimeout(to); return r; },
                    function (e) { clearTimeout(to); throw e; });
    }

    if (cmd.action === 'health') {
      var u = new URL(GATEWAY + '/api/autocomplete/');
      u.searchParams.set('input', 'a');
      u.searchParams.set('latitude', '0');
      u.searchParams.set('longitude', '0');
      return done(fetchAuth(u.toString(), { credentials: 'include', signal: ctrl.signal })
        .then(function (r) {
          return { ok: r.ok, status: r.status, autenticado: r.status !== 401 && r.status !== 403 };
        }, function (e) {
          return { ok: false, erro: nomeErro(e), msg: String(e && e.message || e) };
        }));
    }

    if (cmd.action === 'autocomplete') {
      var u2 = new URL(GATEWAY + '/api/autocomplete/');
      u2.searchParams.set('input', String(cmd.input || ''));
      if (cmd.latitude != null) u2.searchParams.set('latitude', String(cmd.latitude));
      if (cmd.longitude != null) u2.searchParams.set('longitude', String(cmd.longitude));
      return done(fetchJson(u2.toString(), ctrl));
    }

    if (cmd.action === 'coverage_area') {
      var u3 = new URL(GATEWAY + '/api/coverage-area/');
      var params = cmd.params || {};
      Object.keys(params).forEach(function (k) { u3.searchParams.set(k, String(params[k])); });
      return done(fetchJson(u3.toString(), ctrl));
    }

    if (cmd.action === 'detalhes_numero') {
      var u4 = new URL(GATEWAY + '/api/cep/detalhes-numero');
      u4.searchParams.set('string_query', String(cmd.string_query || ''));
      u4.searchParams.set('numero',       String(cmd.numero != null ? cmd.numero : ''));
      u4.searchParams.set('cidade',       String(cmd.cidade || ''));
      u4.searchParams.set('lat',          String(cmd.lat != null ? cmd.lat : ''));
      u4.searchParams.set('long',         String(cmd.long != null ? cmd.long : ''));
      return done(fetchJson(u4.toString(), ctrl));
    }

    return Promise.resolve({ ok: false, erro: 'ACAO_DESCONHECIDA' });
  }

  function nomeErro(e) {
    if (!e) return 'PING_ERRO';
    if (e.name === 'AbortError') return 'PING_TIMEOUT';
    if (e.name === 'TypeError') return 'PING_REDE';
    return 'PING_ERRO';
  }

  function fetchJson(url, ctrl) {
    return fetchAuth(url, { credentials: 'include', signal: ctrl.signal })
      .then(function (r) {
        var ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if (r.status === 401 || r.status === 403) {
          return { ok: false, status: r.status, erro: 'PING_NAO_AUTENTICADO' };
        }
        if (!r.ok) {
          return { ok: false, status: r.status, erro: r.status >= 500 ? 'PING_5XX' : 'PING_4XX' };
        }
        if (ct.indexOf('application/json') === -1) {
          // §11.5 — HTTP 200 mas Content-Type não JSON
          return { ok: false, status: r.status, erro: 'PING_NAO_JSON' };
        }
        return r.json().then(function (body) {
          return { ok: true, status: r.status, body: body };
        }, function () {
          return { ok: false, status: r.status, erro: 'PING_JSON_INVALIDO' };
        });
      }, function (e) {
        return { ok: false, erro: nomeErro(e), msg: String(e && e.message || e) };
      });
  }

  // 5. Boot
  try {
    window.postMessage({ __dharmaPing: true, kind: 'ready' }, '*');
  } catch (x) {}
  console.log('[DHP-PING] main world instalado');
})();
