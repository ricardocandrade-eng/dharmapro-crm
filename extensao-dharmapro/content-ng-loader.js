// Loader: injeta content-ng.js no mundo principal da página (acesso ao Wing)
// Content scripts rodam em mundo isolado e não veem variáveis JS da página.
// O script é carregado do GitHub para permitir atualizações sem reinstalar a extensão.
(function() {
  var hash = window.location.hash || '';
  if (hash.indexOf('#dhp?') !== 0) return;

  var REMOTE = 'https://cdn.jsdelivr.net/gh/ricardocandrade-eng/dharmapro-crm@main/cdn/content-ng.txt';
  var LOCAL  = chrome.runtime.getURL('content-ng.js');

  var s = document.createElement('script');
  s.src = REMOTE + '?v=' + Date.now();
  s.onerror = function() {
    // Fallback: se GitHub falhar, usa cópia local da extensão
    console.warn('[DHP-NG] Remoto falhou, usando cópia local');
    var s2 = document.createElement('script');
    s2.src = LOCAL;
    s2.onload = function() { s2.remove(); };
    (document.head || document.documentElement).appendChild(s2);
  };
  s.onload = function() { s.remove(); };
  (document.head || document.documentElement).appendChild(s);
})();
