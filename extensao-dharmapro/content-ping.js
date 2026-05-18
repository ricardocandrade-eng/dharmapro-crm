// ══════════════════════════════════════════════════════════════════════════════
//  DharmaPro Connector — Content Ping (isolated world)
//  Roda em ping.veronet.com.br no isolated world.
//
//  Responsabilidades:
//   1. Injeta ping-main-world.js no contexto da página (main world) via <script>
//      (precisa estar em web_accessible_resources do manifest).
//   2. Recebe comandos do background via chrome.runtime.onMessage e despacha
//      ao main world via window.postMessage.
//   3. Recebe respostas do main world via window.addEventListener('message')
//      e responde de volta ao background (sendResponse async).
//   4. Avisa o background quando o main world está READY.
//
//  Mensagens do background → content-ping:
//    { target:"ping-main-world", id:"uuid", payload:{ action:"...", ... } }
//
//  Mensagens do main world → background (via content-ping):
//    { __dharmaPing:true, kind:"ready" }                      → forward { from:"ping", kind:"ready" }
//    { __dharmaPing:true, kind:"passive", path, status, ... } → ignorado (debug interno)
//    { __dharmaPing:true, kind:"response", id, payload }      → resolvido localmente, vide handler
// ══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // 1. Main world é injetado direto pelo Chrome via manifest (world: "MAIN").
  //    Não precisa injetar via <script> — evita problema de CSP do SPA do PinG.

  // 2. Tabela de handlers pendentes (id → sendResponse)
  var pendentes = Object.create(null);

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'dhp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  // 3. Escuta mensagens do main world (window) e roteia
  window.addEventListener('message', function (ev) {
    var d = ev && ev.data;
    if (!d || d.__dharmaPing !== true) return;

    if (d.kind === 'ready') {
      try {
        chrome.runtime.sendMessage({ from: 'ping', kind: 'ready' }, function () { void chrome.runtime.lastError; });
      } catch (x) {}
      console.log('[DHP-PING] main world ready');
      return;
    }

    if (d.kind === 'passive') {
      // observação passiva — não loga query/body; podemos relayar pra background se quisermos métrica
      return;
    }

    if (d.kind === 'response' && d.id && pendentes[d.id]) {
      var cb = pendentes[d.id];
      delete pendentes[d.id];
      try { cb(d.payload); } catch (x) {}
      return;
    }
  });

  // 4. Escuta mensagens do background e despacha ao main world
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.target !== 'ping-main-world') return false;
    var id = msg.id || uuid();
    pendentes[id] = function (payload) {
      try { sendResponse(payload); } catch (x) {}
    };

    // Timeout local (caso main world morra/responda nada). Background tem timeout próprio também.
    setTimeout(function () {
      if (pendentes[id]) {
        var cb = pendentes[id];
        delete pendentes[id];
        try { cb({ ok: false, erro: 'CONTENT_PING_TIMEOUT' }); } catch (x) {}
      }
    }, 7000);

    try {
      window.postMessage({
        __dharmaPing: true,
        kind: 'command',
        id: id,
        payload: msg.payload || {}
      }, '*');
    } catch (e) {
      delete pendentes[id];
      try { sendResponse({ ok: false, erro: 'CONTENT_PING_POSTMESSAGE_FAIL', msg: String(e && e.message || e) }); } catch (x) {}
      return false;
    }
    return true; // manterá sendResponse async
  });

  console.log('[DHP-PING] content-ping pronto');
})();
