// ══════════════════════════════════════════════════════════════════════════════
//  content-viabilidade-bridge.js — bridge MV3 pra falar com Viabilidade.html
//  rodando dentro do iframe sandbox do Apps Script (userCodeAppPanel).
//
//  Por que existe: `chrome.runtime` não é exposto pelo Chrome/Edge dentro
//  do iframe sandbox do HtmlService, mesmo com `externally_connectable`
//  matches corretos. Spec prompt-viabilidade-ping.v2.md §8.1 documenta este
//  fallback.
//
//  Fluxo:
//   page  → window.postMessage({__dharmaViabilidade:true, kind:'request', id, payload})
//   bridge ← recebe, faz chrome.runtime.sendMessage(payload) ao background
//   bridge → window.postMessage({__dharmaViabilidade:true, kind:'response', id, payload})
//   page  ← recebe pelo id
//
//  Carrega em https://*.googleusercontent.com/userCodeAppPanel* (all_frames:true)
//  via content_scripts do manifest.
// ══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';
  if (window.__dharmaViabilidadeBridgeInstalled) return;
  window.__dharmaViabilidadeBridgeInstalled = true;

  try { console.log('[DHP-VIA-BRIDGE] instalado em', window.location.href); } catch (e) {}

  function processar(id, payload, via) {
    try { console.log('[DHP-VIA-BRIDGE] request id=' + id + ' via=' + via + ' action=' + (payload && payload.action)); } catch (e) {}
    try {
      chrome.runtime.sendMessage(payload, function (resp) {
        var err = chrome.runtime.lastError;
        try { console.log('[DHP-VIA-BRIDGE] sendMessage CALLBACK id=' + id + ' err=', err && err.message, 'resp=', resp); } catch (e) {}
        var out;
        if (err) {
          out = { ok: false, erro: 'EXTENSAO_RUNTIME_ERRO', msg: err.message };
        } else if (resp === undefined) {
          out = { ok: false, erro: 'BG_RESP_UNDEFINED', msg: 'background não chamou sendResponse' };
        } else {
          out = resp;
        }
        responder(id, out);
      });
      try { console.log('[DHP-VIA-BRIDGE] sendMessage CHAMADO id=' + id + ' (aguardando callback)'); } catch (e) {}
    } catch (e) {
      try { console.warn('[DHP-VIA-BRIDGE] sendMessage EXCEÇÃO id=' + id + ' err=', e); } catch (e2) {}
      responder(id, { ok: false, erro: 'BRIDGE_EXCECAO', msg: String(e && e.message || e) });
    }
  }

  function responder(id, payload) {
    // Responde pelas DUAS vias — a página remove ambos os listeners no 1º que chegar
    try {
      window.postMessage({ __dharmaViabilidade: true, kind: 'response', id: id, payload: payload }, '*');
    } catch (e) {}
    try {
      document.dispatchEvent(new CustomEvent('dhp-via-res', { detail: { id: id, payload: payload } }));
    } catch (e) {}
  }

  // Via 1: window.postMessage
  window.addEventListener('message', function (ev) {
    var d = ev && ev.data;
    if (!d || d.__dharmaViabilidade !== true || d.kind !== 'request') return;
    processar(d.id, d.payload || {}, 'postMessage');
  });

  // Via 2: CustomEvent no document (escapa do dispatcher do HtmlService que dropa postMessage)
  document.addEventListener('dhp-via-req', function (ev) {
    var d = ev && ev.detail;
    if (!d) return;
    processar(d.id, d.payload || {}, 'CustomEvent');
  });

  // Anuncia presença
  try {
    window.postMessage({ __dharmaViabilidade: true, kind: 'ready' }, '*');
  } catch (e) {}
})();
