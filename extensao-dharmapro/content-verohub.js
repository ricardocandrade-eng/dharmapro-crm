// ══════════════════════════════════════════════════════════════════════════════
//  content-verohub.js — isolated world, https://hub.veronet.com.br/*
//
//  Injeta o botão "📥 Enviar pro CRM" na página de um pedido (/sales/{id}).
//  Lê o pedido pedindo o window.__SALE ao verohub-main-world.js (MAIN world) e
//  oferece 2 caminhos (decisão do Ricardo, "os dois"):
//    • Revisar antes  → abre painel com os dados p/ conferência + 7 campos
//      selecionáveis (canal, vendedor, pré-status, tipo de plano, plano, forma
//      de pagamento, data+turno de agendamento — todos OPCIONAIS) → Confirmar
//    • Enviar direto  → manda na hora com os defaults automáticos (sem escolhas)
//  As opções dos dropdowns vêm do CRM (endpoint verohub_form_options, via
//  background). O envio vai pro background (action:'verohub.enviar'), que faz
//  POST no doPost do CRM (rota verohub_capture). Normalização é server-side;
//  campo vazio → backend usa o default automático de antes.
//
//  Também injeta, acima dele, o botão "🔎 Assertiva": abre um painel de consulta
//  por CPF (background action:'verohub.assertiva' → doPost rota verohub_assertiva)
//  que devolve nome, nascimento, nome da mãe, telefones, endereços e e-mails do
//  cliente — cada campo copiável ao clique, pra facilitar a coleta de dados.
// ══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Só age em páginas de pedido: /sales/{numero}
  function ehPaginaPedido() { return /\/sales\/\d+/.test(location.pathname); }

  var BTN_ID = 'dhp-verohub-btn';
  var PANEL_ID = 'dhp-verohub-panel';
  var PANEL_ASSERTIVA_ID = 'dhp-verohub-assertiva-panel';
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

  // ── Envio pro CRM via background (escolhas opcionais dos dropdowns) ─────────
  function enviarParaCRM(sale, escolhas) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          {
            action: 'verohub.enviar',
            sale: sale,
            criadoPor: (sale && sale.seller) || '',
            escolhas: escolhas || {}
          },
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

  // ── Opções dos dropdowns (vendedores, planos por cidade, enums) ────────────
  function buscarOpcoes(sale) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          { action: 'verohub.options', zip_code: (sale && sale.zip_code) || '' },
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

  // ── Consulta Assertiva por CPF (via background) ────────────────────────────
  function buscarAssertiva(cpf) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          { action: 'verohub.assertiva', cpf: cpf || '' },
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
  function norm(s) {
    return String(s == null ? '' : s).toUpperCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }
  // scheduling_date do VeroHub → yyyy-mm-dd (valor de <input type=date>)
  function toDateInput(v) {
    if (!v) return '';
    var s = String(v);
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    var b = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); if (b) return b[3] + '-' + b[2] + '-' + b[1];
    return '';
  }
  function inferirProduto(sale) {
    if (sale.only_chip_sale) return 'Móvel Alone';
    var temMovel = !!(sale.mvno_plan || (Array.isArray(sale.mvno_phone_data) && sale.mvno_phone_data.length));
    return temMovel ? 'Fibra Combo' : 'Fibra Alone';
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

  function fecharPainelAssertiva() {
    var p = document.getElementById(PANEL_ASSERTIVA_ID);
    if (p) p.remove();
  }

  // Copia texto pro clipboard (com fallback execCommand pra contextos sem a API).
  function copiar(txt) {
    txt = String(txt == null ? '' : txt);
    function ok() { toast('📋 Copiado', 'ok'); }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        var done = document.execCommand('copy');
        ta.remove();
        done ? ok() : toast('Não consegui copiar.', 'erro');
      } catch (e) { toast('Não consegui copiar.', 'erro'); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(ok, fallback);
      } else { fallback(); }
    } catch (e) { fallback(); }
  }

  // Máscara CPF: 000.000.000-00 (só dígitos, corta em 11).
  function maskCpfInput(v) {
    var s = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (s.length > 9) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    if (s.length > 6) return s.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    if (s.length > 3) return s.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    return s;
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

  // ── Monta as <option> de um select ─────────────────────────────────────────
  function opcoes(lista, sel, placeholder) {
    var html = placeholder != null ? '<option value="">' + esc(placeholder) + '</option>' : '';
    (lista || []).forEach(function (item) {
      var v, label, extra = '';
      if (item && typeof item === 'object') {
        v = item.v != null ? item.v : (item.nome != null ? item.nome : '');
        label = item.label != null ? item.label : v;
        if (item.codigo != null) extra = ' data-codigo="' + esc(item.codigo) + '"';
        if (item.valor != null && item.label == null) label = v + ' | R$ ' + item.valor;
      } else { v = item; label = item; }
      var selAttr = (sel != null && norm(sel) === norm(v)) ? ' selected' : '';
      html += '<option value="' + esc(v) + '"' + extra + selAttr + '>' + esc(label) + '</option>';
    });
    return html;
  }

  // Painel de revisão (conferência + campos selecionáveis antes de enviar)
  function abrirPainel(sale) {
    fecharPainel();
    var mvno = (Array.isArray(sale.mvno_phone_data) && sale.mvno_phone_data[0]) || null;
    var linhas = [
      ['Cliente', sale.name || sale.company_name || sale.fantasy_name],
      ['CPF/CNPJ', maskCpf(sale.cpf || sale.cnpj)],
      ['Telefone', sale.phone],
      ['CEP', sale.zip_code],
      ['Endereço', [sale.street, sale.number, sale.neighborhood].filter(Boolean).join(', ')],
      ['Plano (pedido)', sale.plan_name || sale.plan],
      ['Valor', sale.total_price != null ? ('R$ ' + sale.total_price) : ''],
      ['Vencimento', sale.due_date],
      ['Móvel combo', mvno ? ('DDD ' + mvno.ddd + ' ' + mvno.phone_number + (mvno.is_portability ? ' · portab.' : '')) : '—'],
      ['Pedido VeroHub', sale.id]
    ];
    var rowsHtml = linhas.map(function (l) {
      return '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f0e6ea">' +
        '<div style="min-width:110px;color:#9b6a7c;font-size:12px">' + esc(l[0]) + '</div>' +
        '<div style="flex:1;color:#2a2230;font-size:13px;font-weight:600">' + (esc(l[1]) || '—') + '</div></div>';
    }).join('');

    var selCss = 'width:100%;padding:7px 8px;border:1px solid #e2cdd6;border-radius:8px;' +
      'font:600 13px system-ui,Segoe UI,Arial;color:#2a2230;background:#fff;margin-top:3px';
    var lblCss = 'font-size:11px;font-weight:700;color:#9b6a7c;text-transform:uppercase;letter-spacing:.02em';
    function campo(id, label, inner) {
      return '<div style="margin-bottom:9px"><div style="' + lblCss + '">' + esc(label) + '</div>' +
        '<div id="' + id + '-wrap">' + inner + '</div></div>';
    }
    var loading = '<div style="' + selCss + ';color:#b98;opacity:.7">carregando…</div>';

    var p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'right:20px', 'bottom:20px',
      'width:400px', 'max-height:88vh', 'overflow:auto', 'background:#fff',
      'border-radius:14px', 'box-shadow:0 16px 48px rgba(0,0,0,.3)',
      'font-family:system-ui,Segoe UI,Arial', 'padding:16px 18px'
    ].join(';');
    p.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
        '<div style="font-weight:800;font-size:15px;color:#c2185b">Enviar pedido pro CRM</div>' +
        '<button id="dhp-vh-x" style="border:0;background:#f4e7ec;color:#c2185b;border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:16px">×</button>' +
      '</div>' +
      '<div style="font-size:12px;color:#9b6a7c;margin-bottom:10px">Confira e, se quiser, ajuste os campos abaixo (todos opcionais). Vazio = automático.</div>' +
      rowsHtml +
      '<div style="margin-top:12px;border-top:2px solid #f4e7ec;padding-top:12px">' +
        campo('dhp-vh-canal', 'Canal de Venda', '<select id="dhp-vh-canal" style="' + selCss + '"><option value="">— VEROHUB (padrão) —</option></select>') +
        campo('dhp-vh-vend', 'Vendedor', '<select id="dhp-vh-vend" style="' + selCss + '">' + loading + '</select>') +
        campo('dhp-vh-prestatus', 'Pré-Status', '<select id="dhp-vh-prestatus" style="' + selCss + '"></select>') +
        campo('dhp-vh-produto', 'Tipo de Plano', '<select id="dhp-vh-produto" style="' + selCss + '"></select>') +
        campo('dhp-vh-plano', 'Plano', '<select id="dhp-vh-plano" style="' + selCss + '"><option value="">— manter do pedido —</option></select>') +
        campo('dhp-vh-forma', 'Forma de Pagamento', '<select id="dhp-vh-forma" style="' + selCss + '"><option value="">— não definir —</option></select>') +
        '<div style="margin-bottom:4px"><div style="' + lblCss + '">Agendamento</div>' +
          '<div style="display:flex;gap:6px;margin-top:3px">' +
            '<input type="date" id="dhp-vh-agenda" style="flex:1;padding:7px 8px;border:1px solid #e2cdd6;border-radius:8px;font:600 13px system-ui;color:#2a2230">' +
            '<select id="dhp-vh-turno" style="flex:1;padding:7px 8px;border:1px solid #e2cdd6;border-radius:8px;font:600 13px system-ui;color:#2a2230;background:#fff"><option value="">— turno —</option></select>' +
          '</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
        '<button id="dhp-vh-cancel" style="flex:1;padding:10px;border:1px solid #e2cdd6;background:#fff;color:#8a6575;border-radius:9px;cursor:pointer;font-weight:600">Cancelar</button>' +
        '<button id="dhp-vh-ok" style="flex:2;padding:10px;border:0;background:#c2185b;color:#fff;border-radius:9px;cursor:pointer;font-weight:700">✅ Enviar pro CRM</button>' +
      '</div>';
    document.body.appendChild(p);

    p.querySelector('#dhp-vh-x').onclick = fecharPainel;
    p.querySelector('#dhp-vh-cancel').onclick = fecharPainel;

    // Preenche os dropdowns com as opções do CRM (async)
    var _planosMap = {};
    function montarPlano(produto) {
      var selPlano = p.querySelector('#dhp-vh-plano');
      if (!selPlano) return;
      var lista = _planosMap[produto] || [];
      var alvo = sale.plan_name || sale.plan;
      selPlano.innerHTML = '<option value="">— manter do pedido —</option>' + opcoes(lista, alvo, null);
    }
    buscarOpcoes(sale).then(function (o) {
      if (!o || o.ok === false) {
        var vend = p.querySelector('#dhp-vh-vend');
        if (vend) vend.innerHTML = '<option value="">(sem conexão CRM — recarregue)</option>';
        return;
      }
      var en = o.enums || {};
      _planosMap = o.planos || {};
      var selCanal = p.querySelector('#dhp-vh-canal');
      if (selCanal) selCanal.innerHTML = '<option value="">— VEROHUB (padrão) —</option>' + opcoes(en.canais, null, null);
      var selVend = p.querySelector('#dhp-vh-vend');
      if (selVend) selVend.innerHTML = opcoes((o.vendedores || []), sale.seller, '— manter do pedido —');
      var selPre = p.querySelector('#dhp-vh-prestatus');
      if (selPre) selPre.innerHTML = opcoes(en.preStatus, 'EM NEGOCIAÇÃO', null);
      var selProd = p.querySelector('#dhp-vh-produto');
      if (selProd) {
        selProd.innerHTML = opcoes(en.produtos, inferirProduto(sale), null);
        selProd.onchange = function () { montarPlano(selProd.value); };
      }
      montarPlano((selProd && selProd.value) || inferirProduto(sale));
      var selForma = p.querySelector('#dhp-vh-forma');
      if (selForma) selForma.innerHTML = '<option value="">— não definir —</option>' + opcoes(en.formasPagamento, null, null);
      var selTurno = p.querySelector('#dhp-vh-turno');
      if (selTurno) selTurno.innerHTML = '<option value="">— turno —</option>' + opcoes(en.turnos, null, null);
      var inAg = p.querySelector('#dhp-vh-agenda');
      if (inAg) inAg.value = toDateInput(sale.scheduling_date);
    });

    p.querySelector('#dhp-vh-ok').onclick = function () {
      var btn = p.querySelector('#dhp-vh-ok');
      function gv(sel) { var el = p.querySelector(sel); return el ? el.value : ''; }
      var selPlano = p.querySelector('#dhp-vh-plano');
      var codigo = (selPlano && selPlano.selectedOptions && selPlano.selectedOptions[0])
        ? (selPlano.selectedOptions[0].getAttribute('data-codigo') || '') : '';
      var escolhas = {
        canal:          gv('#dhp-vh-canal'),
        resp:           gv('#dhp-vh-vend'),
        preStatus:      gv('#dhp-vh-prestatus'),
        produto:        gv('#dhp-vh-produto'),
        plano:          gv('#dhp-vh-plano'),
        codPlano:       codigo,
        formaPagamento: gv('#dhp-vh-forma'),
        agenda:         gv('#dhp-vh-agenda'),
        turno:          gv('#dhp-vh-turno')
      };
      btn.disabled = true; btn.textContent = 'Enviando…'; btn.style.opacity = '.7';
      enviarParaCRM(sale, escolhas).then(function (r) { fecharPainel(); tratarResposta(r); });
    };
  }

  // ── Painel Assertiva: consulta por CPF pra facilitar a coleta de dados ──────
  // Linha copiável: clicar copia `copyVal` (ou o próprio display se omitido).
  function linhaAssertiva(label, display, copyVal) {
    if (display == null || display === '') return '';
    var cv = (copyVal != null && copyVal !== '') ? copyVal : display;
    return '<div class="dhp-as-row" data-copy="' + esc(cv) + '" title="Clique para copiar" ' +
      'style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #f0e6ea;cursor:pointer">' +
      '<div style="min-width:104px;color:#9b6a7c;font-size:12px">' + esc(label) + '</div>' +
      '<div style="flex:1;color:#2a2230;font-size:13px;font-weight:600">' + esc(display) +
        ' <span style="color:#c99;font-weight:400;font-size:11px">📋</span></div></div>';
  }

  function renderAssertiva(d) {
    d = d || {};
    var h = '<div style="margin-top:10px;border-top:2px solid #f4e7ec;padding-top:8px">' +
      '<div style="font-size:11px;color:#9b6a7c;margin-bottom:4px">Clique num campo pra copiar.</div>';
    h += linhaAssertiva('Nome', d.nome);
    h += linhaAssertiva('Nascimento', d.nascimento);
    h += linhaAssertiva('Nome da mãe', d.nomeMae);
    h += linhaAssertiva('Sexo', d.sexo);
    h += linhaAssertiva('Idade', d.idade != null && d.idade !== '' ? (d.idade + ' anos') : '', d.idade);
    h += linhaAssertiva('Situação CPF', d.situacao);
    if (d.obito) h += '<div style="color:#c0392b;font-weight:700;font-size:12px;padding:4px 0">⚠️ Óbito provável</div>';
    (d.telefones || []).forEach(function (t, i) {
      var num = (t && t.numero) || '';
      if (!num) return;
      var extra = [t.tipo, t.operadora].filter(Boolean).join(' · ');
      h += linhaAssertiva('Telefone ' + (i + 1), num + (extra ? '  (' + extra + ')' : ''), num);
    });
    (d.enderecos || []).forEach(function (e, i) {
      var partes = [
        [e.logradouro, e.numero].filter(Boolean).join(', '),
        e.complemento, e.bairro,
        [e.cidade, e.uf].filter(Boolean).join('/'),
        e.cep ? ('CEP ' + e.cep) : ''
      ].filter(Boolean);
      var full = partes.join(' · ');
      if (full) h += linhaAssertiva('Endereço ' + (i + 1), full);
    });
    (d.emails || []).forEach(function (em, i) {
      if (em) h += linhaAssertiva('E-mail ' + (i + 1), em);
    });
    h += '</div>';
    if (h.indexOf('dhp-as-row') === -1) {
      h = '<div style="margin-top:10px;color:#9b6a7c;font-size:13px">Consulta feita, mas sem dados cadastrais retornados.</div>';
    }
    return h;
  }

  function abrirPainelAssertiva() {
    fecharPainel();            // evita sobreposição com a caixa de envio
    fecharPainelAssertiva();

    var inCss = 'flex:1;padding:9px 10px;border:1px solid #cfe6ea;border-radius:8px;' +
      'font:600 15px system-ui,Segoe UI,Arial;color:#12333a;letter-spacing:.5px';

    var p = document.createElement('div');
    p.id = PANEL_ASSERTIVA_ID;
    p.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'right:20px', 'bottom:20px',
      'width:380px', 'max-height:88vh', 'overflow:auto', 'background:#fff',
      'border-radius:14px', 'box-shadow:0 16px 48px rgba(0,0,0,.3)',
      'font-family:system-ui,Segoe UI,Arial', 'padding:16px 18px'
    ].join(';');
    p.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
        '<div style="font-weight:800;font-size:15px;color:#0d7a8c">🔎 Consultar Assertiva</div>' +
        '<button id="dhp-as-x" style="border:0;background:#e4f2f4;color:#0d7a8c;border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:16px">×</button>' +
      '</div>' +
      '<div style="font-size:12px;color:#5b7a80;margin-bottom:10px">Digite o CPF do cliente pra puxar os dados cadastrais.</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:4px">' +
        '<input id="dhp-as-cpf" inputmode="numeric" placeholder="000.000.000-00" style="' + inCss + '">' +
        '<button id="dhp-as-go" style="padding:9px 14px;border:0;background:#0d7a8c;color:#fff;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px">Consultar</button>' +
      '</div>' +
      '<div id="dhp-as-result"></div>';
    document.body.appendChild(p);

    var inp = p.querySelector('#dhp-as-cpf');
    var out = p.querySelector('#dhp-as-result');
    p.querySelector('#dhp-as-x').onclick = fecharPainelAssertiva;
    inp.oninput = function () { inp.value = maskCpfInput(inp.value); };

    function msgErro(txt) {
      return '<div style="margin-top:10px;color:#c0392b;font-size:13px;font-weight:600">❌ ' + esc(txt) + '</div>';
    }

    function consultar() {
      var cpf = (inp.value || '').replace(/\D/g, '');
      if (cpf.length !== 11) { out.innerHTML = msgErro('Digite um CPF válido (11 dígitos).'); return; }
      var btn = p.querySelector('#dhp-as-go');
      btn.disabled = true; btn.textContent = '…'; btn.style.opacity = '.7';
      out.innerHTML = '<div style="margin-top:12px;color:#0d7a8c;font-size:13px">Consultando…</div>';
      buscarAssertiva(cpf).then(function (r) {
        btn.disabled = false; btn.textContent = 'Consultar'; btn.style.opacity = '1';
        if (!r || r.ok === false) { out.innerHTML = msgErro((r && r.erro) || 'Falha na consulta.'); return; }
        out.innerHTML = renderAssertiva(r.dados);
        Array.prototype.forEach.call(out.querySelectorAll('.dhp-as-row'), function (el) {
          el.onclick = function () { copiar(el.getAttribute('data-copy')); };
        });
      });
    }
    p.querySelector('#dhp-as-go').onclick = consultar;
    inp.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); consultar(); } };

    inp.focus();

    // Pré-preenche com o CPF do pedido (PF), se der pra ler o __SALE.
    lerSale().then(function (res) {
      var doc = res && res.sale && String(res.sale.cpf || '').replace(/\D/g, '');
      if (doc && doc.length === 11 && !inp.value) inp.value = maskCpfInput(doc);
    });
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
      '<button id="dhp-vh-assertiva" title="Consultar dados do cliente por CPF (Assertiva)" ' +
        'style="display:flex;align-items:center;gap:8px;padding:10px 16px;border:0;border-radius:24px;' +
        'background:#0d7a8c;color:#fff;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 8px 22px rgba(13,122,140,.4)">' +
        '🔎 Assertiva</button>' +
      '<button id="dhp-vh-main" title="Conferir e enviar este pedido pro DharmaPro" ' +
        'style="display:flex;align-items:center;gap:8px;padding:12px 16px;border:0;border-radius:24px;' +
        'background:#c2185b;color:#fff;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 8px 22px rgba(194,24,91,.4)">' +
        '📥 Enviar pro CRM</button>' +
      '<button id="dhp-vh-direto" title="Enviar sem abrir a conferência" ' +
        'style="border:0;background:transparent;color:#c2185b;font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline">⚡ enviar direto</button>';
    document.body.appendChild(wrap);
    wrap.querySelector('#dhp-vh-assertiva').onclick = function () { abrirPainelAssertiva(); };
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
