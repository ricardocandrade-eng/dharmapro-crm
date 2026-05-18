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

  // IDs já vistos (request OU response) — evita reprocessar / loop entre frames
  var visto = Object.create(null);
  function jaViu(id, kind) {
    var key = kind + ':' + id;
    if (visto[key]) return true;
    visto[key] = Date.now();
    // GC simples
    var keys = Object.keys(visto);
    if (keys.length > 200) {
      var corte = Date.now() - 60000;
      for (var i = 0; i < keys.length; i++) if (visto[keys[i]] < corte) delete visto[keys[i]];
    }
    return false;
  }

  function processar(id, payload, via) {
    if (jaViu(id, 'req')) return;
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

  // Envia o envelope pra TODOS os frames descendentes a partir de window.top.
  // Cada bridge instalado em outro frame irá disparar CustomEvent local ao
  // receber kind:'response' — isso garante que o frame do CRM (que pode não
  // ser o frame onde a request foi atendida) também veja a resposta.
  function blastEntreFrames(envelope) {
    var visitados = [];
    function blast(w) {
      if (!w) return;
      for (var i = 0; i < visitados.length; i++) if (visitados[i] === w) return;
      visitados.push(w);
      try { w.postMessage(envelope, '*'); } catch (e) {}
      try {
        var fs = w.frames;
        for (var j = 0; j < fs.length; j++) blast(fs[j]);
      } catch (e) {}
    }
    try { blast(window.top); } catch (e) { blast(window); }
  }

  function responder(id, payload) {
    var envelope = { __dharmaViabilidade: true, kind: 'response', id: id, payload: payload };
    // CustomEvent local: pega caso o CRM esteja no MESMO frame deste bridge
    try {
      document.dispatchEvent(new CustomEvent('dhp-via-res', { detail: { id: id, payload: payload } }));
    } catch (e) {}
    // Broadcast cross-frame: alcança o frame do CRM mesmo que a request tenha
    // sido atendida por outra instância do bridge num frame irmão/parent
    blastEntreFrames(envelope);
  }

  // Via 1: window.postMessage — request OU response vinda de outro bridge
  window.addEventListener('message', function (ev) {
    var d = ev && ev.data;
    if (!d || d.__dharmaViabilidade !== true) return;
    if (d.kind === 'request') {
      processar(d.id, d.payload || {}, 'postMessage');
    } else if (d.kind === 'response') {
      // Resposta veio de outro bridge (frame irmão/parent) — re-dispara CustomEvent
      // local pra que o CRM no MESMO frame deste bridge possa capturar
      if (jaViu(d.id, 'res')) return;
      try {
        document.dispatchEvent(new CustomEvent('dhp-via-res', { detail: { id: d.id, payload: d.payload } }));
      } catch (e) {}
    }
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
