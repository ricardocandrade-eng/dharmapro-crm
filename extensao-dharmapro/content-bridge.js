// ══════════════════════════════════════════════════════════════════════════════
//  DharmaPro Connector — Bridge entre a pagina GAS e o service worker
//  Roda em *.googleusercontent.com (onde o DharmaPro e servido)
// ══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Escuta eventos da pagina (DharmaPro JS.html)
  window.addEventListener('dhp-adapter-request', function(e) {
    var data = e.detail;
    if (!data || data.type !== 'dhp_adapter_consulta') return;

    // Envia para o service worker da extensao
    chrome.runtime.sendMessage(data, function(response) {
      // Devolve resultado para a pagina
      window.dispatchEvent(new CustomEvent('dhp-adapter-response', { detail: response }));
    });
  });
})();
