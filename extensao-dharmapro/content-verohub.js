// ══════════════════════════════════════════════════════════════════════════════
//  content-verohub.js — isolated world, https://hub.veronet.com.br/*
//
//  Injeta o botão "📥 Enviar pro CRM" na página de um pedido (/sales/{id}).
//  Lê o pedido pedindo o window.__SALE ao verohub-main-world.js (MAIN world) e
//  oferece 2 caminhos (decisão do Ricardo, "os dois"):
//    • Revisar antes  → abre painel com os dados p/ conferência → Confirmar
//    • Enviar direto  → manda na hora
//  O envio vai pro background (action:'verohub.enviar'), que faz POST no doPost
//  do CRM (rota verohub_capture). Toda a normalização é server-side.
// ══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Só age em páginas de pedido: /sales/{numero}
  function ehPaginaPedido() { return /\/sales\/\d+/.test(location.pathname); }

  var BTN_ID = 'dhp-verohub-btn';
  var PANEL_ID = 'dhp-verohub-panel';
  var _reqSeq = 0;

  // ── Ponte com o MAIN world: pede o __SALE limpo ────────────────────────────
  function lerSale() {
    return new Promise(function (resolve) {
      var reqId = 'vh_' + (++_reqSeq) + '_' + Date.now();
      var done = false;
      function onMsg(ev) {
        if (ev.source !== window) return;
        var d = ev.data;
        if (!d || d.source !== 'dhp-verohub-res' || d.reqId !== reqId) return;
        window.removeEventListener('message', onMsg);
        done = true;
        resolve({ sale: d.sale, erro: d.erro });
      }
      window.addEventListener('message', onMsg);
      window.postMessage({ source: 'dhp-verohub-req', reqId: reqId }, '*');
      setTimeout(function () {
        if (done) return;
        window.removeEventListener('message', onMsg);
        resolve({ sale: null, erro: 'Não consegui ler o pedido (main world não respondeu). Recarregue a página.' });
      }, 4000);
    });
  }

  // ── Envio pro CRM via background ───────────────────────────────────────────
  function enviarParaCRM(sale) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          { action: 'verohub.enviar', sale: sale, criadoPor: (sale && sale.seller) || '' },
          function (resp) {
            var le = chrome.runtime.lastError;
            if (le) return resolve({ ok: false, erro: 'Extensão: ' + le.message });
            resolve(resp || { ok: false, erro: 'Sem resposta do background.' });
          }
        );
      } catch (e) {
        resolve({ ok: false, erro: 'Falha ao chamar a extensão: ' + (e && e.message || e) });
      }
    });
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function maskCpf(v) {
    var s = String(v || '').replace(/\D/g, '');
    return s.length >= 5 ? s.slice(0, 3) + '.***.***-' + s.slice(-2) : s;
  }

  function toast(msg, tipo) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'right:20px', 'bottom:96px',
      'max-width:360px', 'padding:12px 16px', 'border-radius:10px',
      'font:600 13px/1.4 system-ui,Segoe UI,Arial', 'color:#fff',
      'box-shadow:0 8px 24px rgba(0,0,0,.28)', 'white-space:pre-line',
      'background:' + (tipo === 'erro' ? '#c0392b' : (tipo === 'aviso' ? '#b7791f' : '#1f9d55'))
    ].join(';');
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 4200);
    setTimeout(function () { t.remove(); }, 4800);
  }

  function fecharPainel() {
    var p = document.getElementById(PANEL_ID);
    if (p) p.remove();
  }

  function resultadoTexto(r) {
    if (!r || r.ok === false) {
      if (r && r.jaExiste) return null; // tratado à parte
      return 'erro';
    }
    var linhas = ['✅ Enviado ao CRM — linha ' + r.linha, r.cliente + ' · ' + r.produto];
    if (r.plano) linhas.push('Plano: ' + r.plano);
    if (r.produto === 'Fibra Combo') {
      if (r.combo && r.combo.sucesso) linhas.push('📱 Móvel vinculado (linha ' + r.combo.linha + ')');
      else linhas.push('⚠️ Móvel do combo não criado: ' + ((r.combo && r.combo.mensagem) || '—'));
    }
    return linhas.join('\n');
  }

  function tratarResposta(r) {
    if (r && r.jaExiste) { toast('ℹ️ ' + r.mensagem, 'aviso'); return; }
    if (!r || r.ok === false) { toast('❌ ' + ((r && r.erro) || 'Falha no envio.'), 'erro'); return; }
    toast(resultadoTexto(r), 'ok');
  }

  // Painel de revisão (conferência antes de enviar)
  function abrirPainel(sale) {
    fecharPainel();
    var mvno = (Array.isArray(sale.mvno_phone_data) && sale.mvno_phone_data[0]) || null;
    var linhas = [
      ['Cliente', sale.name],
      ['CPF', maskCpf(sale.cpf)],
      ['Nascimento', sale.birthday],
      ['Nome da mãe', sale.mother_name],
      ['Telefone', sale.phone],
      ['E-mail', sale.email],
      ['CEP', sale.zip_code],
      ['Endereço', [sale.street, sale.number, sale.neighborhood].filter(Boolean).join(', ')],
      ['UF', sale.state],
      ['Plano (código)', sale.plan],
      ['Valor', sale.total_price != null ? ('R$ ' + sale.total_price) : ''],
      ['Vencimento', sale.due_date],
      ['Móvel combo', mvno ? ('DDD ' + mvno.ddd + ' ' + mvno.phone_number + (mvno.is_portability ? ' · portab.' : '')) : '—'],
      ['Vendedor', sale.seller],
      ['Pedido VeroHub', sale.id]
    ];
    var rowsHtml = linhas.map(function (l) {
      return '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f0e6ea">' +
        '<div style="min-width:120px;color:#9b6a7c;font-size:12px">' + esc(l[0]) + '</div>' +
        '<div style="flex:1;color:#2a2230;font-size:13px;font-weight:600">' + (esc(l[1]) || '—') + '</div></div>';
    }).join('');

    var p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'right:20px', 'bottom:20px',
      'width:380px', 'max-height:78vh', 'overflow:auto', 'background:#fff',
      'border-radius:14px', 'box-shadow:0 16px 48px rgba(0,0,0,.3)',
      'font-family:system-ui,Segoe UI,Arial', 'padding:16px 18px'
    ].join(';');
    p.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
        '<div style="font-weight:800;font-size:15px;color:#c2185b">Enviar pedido pro CRM</div>' +
        '<button id="dhp-vh-x" style="border:0;background:#f4e7ec;color:#c2185b;border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:16px">×</button>' +
      '</div>' +
      '<div style="font-size:12px;color:#9b6a7c;margin-bottom:10px">Confira os dados antes de gravar em “1 - Vendas”.</div>' +
      rowsHtml +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
        '<button id="dhp-vh-cancel" style="flex:1;padding:10px;border:1px solid #e2cdd6;background:#fff;color:#8a6575;border-radius:9px;cursor:pointer;font-weight:600">Cancelar</button>' +
        '<button id="dhp-vh-ok" style="flex:2;padding:10px;border:0;background:#c2185b;color:#fff;border-radius:9px;cursor:pointer;font-weight:700">✅ Enviar pro CRM</button>' +
      '</div>';
    document.body.appendChild(p);

    p.querySelector('#dhp-vh-x').onclick = fecharPainel;
    p.querySelector('#dhp-vh-cancel').onclick = fecharPainel;
    p.querySelector('#dhp-vh-ok').onclick = function () {
      var btn = p.querySelector('#dhp-vh-ok');
      btn.disabled = true; btn.textContent = 'Enviando…'; btn.style.opacity = '.7';
      enviarParaCRM(sale).then(function (r) { fecharPainel(); tratarResposta(r); });
    };
  }

  // Clique no botão: lê o pedido e decide o caminho
  function acionar(modo) {
    lerSale().then(function (res) {
      if (!res.sale) { toast('❌ ' + (res.erro || 'Pedido não encontrado.'), 'erro'); return; }
      if (modo === 'direto') {
        toast('Enviando pedido ' + res.sale.id + '…', 'aviso');
        enviarParaCRM(res.sale).then(tratarResposta);
      } else {
        abrirPainel(res.sale);
      }
    });
  }

  function injetarBotao() {
    if (document.getElementById(BTN_ID)) return;
    var wrap = document.createElement('div');
    wrap.id = BTN_ID;
    wrap.style.cssText = [
      'position:fixed', 'z-index:2147483646', 'right:20px', 'bottom:20px',
      'display:flex', 'flex-direction:column', 'align-items:flex-end', 'gap:6px',
      'font-family:system-ui,Segoe UI,Arial'
    ].join(';');
    wrap.innerHTML =
      '<button id="dhp-vh-main" title="Conferir e enviar este pedido pro DharmaPro" ' +
        'style="display:flex;align-items:center;gap:8px;padding:12px 16px;border:0;border-radius:24px;' +
        'background:#c2185b;color:#fff;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 8px 22px rgba(194,24,91,.4)">' +
        '📥 Enviar pro CRM</button>' +
      '<button id="dhp-vh-direto" title="Enviar sem abrir a conferência" ' +
        'style="border:0;background:transparent;color:#c2185b;font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline">⚡ enviar direto</button>';
    document.body.appendChild(wrap);
    wrap.querySelector('#dhp-vh-main').onclick = function () { acionar('revisar'); };
    wrap.querySelector('#dhp-vh-direto').onclick = function () { acionar('direto'); };
  }

  function boot() {
    if (!ehPaginaPedido()) return;
    // Espera o DOM/app assentar antes de injetar (o __SALE é populado após o boot do Alpine)
    if (document.body) injetarBotao();
    else document.addEventListener('DOMContentLoaded', injetarBotao);
  }

  boot();
})();
