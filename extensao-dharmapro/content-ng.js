// ══════════════════════════════════════════════════════════════════════════════
//  DharmaPro — Content Script para NG Billing (Wing Framework / Objective)
//  Roda em ng.vero.objective.com.br (document_start)
//
//  Modo de operação:
//    QUERY — popup aberto pelo DharmaPro com #dhp?contrato=...&user=...&pass=...
//            Deixa Wing carregar, faz login se necessário, busca o contrato no
//            campo de pesquisa, lê o contrato certo dos controllers Wing e
//            devolve via postMessage.
//    PASSIVO — se não há hash #dhp?, não faz nada (não interfere no uso normal)
// ══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var hash = window.location.hash || '';
  if (hash.indexOf('#dhp?') !== 0) return; // nao e consulta DharmaPro

  var params = new URLSearchParams(hash.substring(4));
  var contrato = params.get('contrato');
  var user = params.get('user');
  var pass = params.get('pass');
  if (!contrato || !user || !pass) return;

  // Limpar hash (segurança)
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function enviar(dados) {
    dados.type = 'dhp_ng_result';
    try { if (window.opener) window.opener.postMessage(dados, '*'); } catch(x) {}
    // Mantém popup aberto 60s em casos suspeitos (erro OU resultado vazio/inconclusivo)
    // para permitir inspecionar console (F12). Sucesso confirmado fecha rápido.
    var suspeito = !!dados.erro ||
                   (Array.isArray(dados.contratos) && dados.contratos.length === 0) ||
                   /sem contrato|não identificado|nao identificado/i.test(dados.resumo || '');
    var delay = suspeito ? 60000 : 800;
    if (suspeito) {
      console.warn('[DHP-NG] ⚠ Popup ficará aberto 60s para debug. Abra F12 → Console.');
    }
    setTimeout(function() { window.close(); }, delay);
  }

  function erroFatal(msg) { enviar({ erro: msg }); }

  function aguardar(condicao, timeout, intervalo, label) {
    timeout  = timeout  || 30000;
    intervalo = intervalo || 300;
    label = label || 'aguardar';
    return new Promise(function(resolve, reject) {
      var inicio = Date.now();
      function checar() {
        var r = condicao();
        if (r) {
          console.log('[DHP-NG] ✔ ' + label + ' (' + (Date.now() - inicio) + 'ms)');
          return resolve(r);
        }
        if (Date.now() - inicio > timeout) {
          console.error('[DHP-NG] ✘ TIMEOUT em: ' + label + ' (' + timeout + 'ms)');
          return reject(new Error('Timeout em: ' + label));
        }
        setTimeout(checar, intervalo);
      }
      checar();
    });
  }

  // Simula digitação real no campo (dispatch input events)
  function simularDigitacao(input, texto) {
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    for (var i = 0; i < texto.length; i++) {
      input.value += texto[i];
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // Simula Enter no campo
  function simularEnter(input) {
    input.dispatchEvent(new KeyboardEvent('keydown',  { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup',    { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  }

  // Simula clique completo (Wing precisa de pointer+mouse events, não só el.click())
  function clicarCompleto(el) {
    if (!el) return;
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var optsBase = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };

    try { el.focus(); } catch(e) {}

    // PointerEvent (Wing/Objective frequentemente escuta isso)
    if (typeof PointerEvent !== 'undefined') {
      var pOpts = Object.assign({}, optsBase, { pointerType: 'mouse', pointerId: 1, isPrimary: true });
      try { el.dispatchEvent(new PointerEvent('pointerover', pOpts)); } catch(e) {}
      try { el.dispatchEvent(new PointerEvent('pointerenter', pOpts)); } catch(e) {}
      try { el.dispatchEvent(new PointerEvent('pointerdown', pOpts)); } catch(e) {}
    }

    el.dispatchEvent(new MouseEvent('mouseover', optsBase));
    el.dispatchEvent(new MouseEvent('mouseenter', optsBase));
    el.dispatchEvent(new MouseEvent('mousedown', optsBase));

    var optsUp = Object.assign({}, optsBase, { buttons: 0 });
    if (typeof PointerEvent !== 'undefined') {
      try { el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, optsUp, { pointerType: 'mouse', pointerId: 1, isPrimary: true }))); } catch(e) {}
    }
    el.dispatchEvent(new MouseEvent('mouseup', optsUp));
    el.dispatchEvent(new MouseEvent('click', optsUp));

    // Fallback: el.click() nativo também
    try { el.click(); } catch(e) {}
  }

  // Busca controller por tipo (fragmento do nome completo)
  function findCtrlByType(instances, typeFragment) {
    for (var id in instances) {
      var ctrl = instances[id];
      if (ctrl && ctrl.type && ctrl.type.indexOf(typeFragment) > -1) {
        return { id: parseInt(id), ctrl: ctrl };
      }
    }
    return null;
  }

  // Em multi-contrato, ha um Atend360ContratoTipoFisicoCardWComp por card lateral.
  // findCtrlByType pegaria o primeiro (top do painel) — pode nao ser o nosso.
  function findContratoCardByNumero(instances, numero) {
    var alvo = String(numero || '').trim();
    if (!alvo) return null;
    for (var id in instances) {
      var ctrl = instances[id];
      if (!ctrl || !ctrl.type) continue;
      if (ctrl.type.indexOf('Atend360ContratoTipoFisicoCardWComp') < 0) continue;
      var n = '';
      try { n = lerItemTexto(ctrl.items && ctrl.items.numeroContratoST); } catch(e) {}
      if (String(n).trim() === alvo) {
        return { id: parseInt(id), ctrl: ctrl };
      }
    }
    return null;
  }

  // Verifica se há um campo de senha *visível* (visibilidade efetiva, não só DOM)
  function temCampoSenhaVisivel() {
    var pwFields = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < pwFields.length; i++) {
      var f = pwFields[i];
      if (f.offsetParent === null) continue; // hidden (display:none ou ancestor hidden)
      var rect = f.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var st = window.getComputedStyle(f);
      if (st.visibility === 'hidden' || st.display === 'none') continue;
      return f;
    }
    return null;
  }

  // Lê texto de um item Wing (via value, text ou DOM element)
  function lerItemTexto(item) {
    if (!item) return '';
    var t = item.value || item.text || '';
    if (!t && item.element) t = item.element.textContent || item.element.innerText || '';
    if (!t && item.labelElement) t = item.labelElement.textContent || '';
    return (t || '').toString().trim();
  }

  // ── Fluxo principal ─────────────────────────────────────────────────────

  async function executar() {
    try {
      console.log('[DHP-NG] Iniciando consulta. Contrato: ' + contrato);
      console.log('[DHP-NG] URL: ' + window.location.href);
      console.log('[DHP-NG] readyState: ' + document.readyState);

      // Validação leve de formato: Wing aceita contratos de ~6 a 12 dígitos.
      var contratoLimpo = String(contrato).replace(/\D/g, '');
      if (!/^\d{6,12}$/.test(contratoLimpo)) {
        erroFatal('contrato_formato_invalido');
        return;
      }

      // 1. Aguardar Wing carregar
      try {
        await aguardar(function() {
          return typeof Wing !== 'undefined' && Wing.session;
        }, 20000, 500, 'Wing carregar');
      } catch(wingErr) {
        // Diagnóstico: o que existe na página?
        console.error('[DHP-NG] Wing não encontrado. Diagnóstico:');
        console.log('[DHP-NG]   typeof Wing:', typeof Wing);
        console.log('[DHP-NG]   readyState:', document.readyState);
        console.log('[DHP-NG]   title:', document.title);
        console.log('[DHP-NG]   body length:', document.body ? document.body.innerHTML.length : 0);
        console.log('[DHP-NG]   scripts:', document.querySelectorAll('script').length);
        // Buscar possíveis variáveis Wing
        var candidates = ['Wing', 'wing', 'WING', 'WingApp', 'wingApp'];
        for (var ci = 0; ci < candidates.length; ci++) {
          if (typeof window[candidates[ci]] !== 'undefined') {
            console.log('[DHP-NG]   ENCONTRADO: window.' + candidates[ci], typeof window[candidates[ci]]);
          }
        }
        throw wingErr;
      }

      // 2. Aguardar sessão abrir (OPEN)
      await aguardar(function() {
        return Wing.session.OPEN;
      }, 15000, 300, 'Sessão OPEN');

      // 3. Verificar se é tela de login ou já autenticado
      var precisaLogin = await detectarEstado();
      console.log('[DHP-NG] Estado detectado: ' + precisaLogin);

      if (precisaLogin === 'login') {
        await fazerLogin();
      } else if (precisaLogin === 'menu') {
        await irParaAtendimento();
      }
      // Se já está na busca, segue direto

      // 4. Aguardar tela de busca (controller Atend360BuscaWComp)
      // irParaAtendimento() já verifica internamente, mas garantir
      var buscaCtrlFinal = findCtrlByType(Wing.session.controllerManager.instances, 'Atend360BuscaWComp');
      if (!buscaCtrlFinal) {
        await aguardar(function() {
          return findCtrlByType(Wing.session.controllerManager.instances, 'Atend360BuscaWComp');
        }, 15000, 500, 'Controller Atend360BuscaWComp');
      }

      // 5. Buscar contrato
      await buscarContrato(contratoLimpo);

      // 6. Clicar em Visualizar
      await clicarVisualizar();

      // 7. Ler dados dos controllers
      var resultado = lerResultados();
      console.log('[DHP-NG] ✔ Resultado final:', JSON.stringify(resultado));
      enviar(resultado);

    } catch(e) {
      var msg = e.message || String(e);
      console.error('[DHP-NG] ✘ ERRO:', msg);
      // Preserva tokens de categoria conhecidos para o categorizador do JS.html.
      if (msg === 'contrato_nao_encontrado' || msg === 'contrato_formato_invalido') {
        erroFatal(msg);
      } else {
        erroFatal('Erro NG: ' + msg);
      }
    }
  }

  // ── Detectar estado da tela ─────────────────────────────────────────────

  function detectarEstado() {
    return aguardar(function() {
      // Já está na busca? (checa primeiro — se já tem controller, login não é necessário)
      var buscaCtrl = findCtrlByType(Wing.session.controllerManager.instances, 'Atend360BuscaWComp');
      if (buscaCtrl) return 'busca';

      // Tela de login: precisa de campo de senha *visível* (DOM oculto não conta).
      var pwField = temCampoSenhaVisivel();
      if (pwField) return 'login';

      // Menu principal: session READY (pode ter controllers residuais)
      if (Wing.session.READY) {
        return 'menu';
      }

      return null; // ainda carregando
    }, 20000, 300, 'Detectar estado (login/menu/busca)');
  }

  // ── Login ──────────────────────────────────────────────────────────────

  async function fazerLogin() {
    // Preencher usuário
    var userInput = document.querySelector('input[type="text"]');
    if (userInput) {
      simularDigitacao(userInput, user);
    }

    // Preencher senha (campo visível)
    var passInput = temCampoSenhaVisivel();
    if (!passInput) throw new Error('Campo de senha não encontrado');
    simularDigitacao(passInput, pass);

    // Pausa pós-blur: NG pode auto-submeter (cookie/sessão pré-existente / autofill).
    await new Promise(function(r) { setTimeout(r, 800); });

    // Se campo de senha sumiu/escondeu, login já passou — segue direto.
    if (!temCampoSenhaVisivel()) {
      console.log('[DHP-NG] ✔ Login auto-completado (senha não mais visível após blur).');
    } else {

    // Clicar em "Iniciar sessão" — busca ampla (button, input[type=submit], [role=button], a)
    // e regex de texto (Iniciar/Entrar/Acessar/Login/OK/Confirmar)
    var TEXTO_LOGIN = /iniciar|entrar|acessar|login|confirmar|^ok$/i;
    var SELECTOR_LOGIN = 'button, input[type="submit"], input[type="button"], [role="button"], a';

    function buscarBotaoLogin() {
      // Se senha sumiu/escondeu durante a espera, login transicionou — sai com sentinel
      if (!temCampoSenhaVisivel()) {
        return { __autoLogin: true };
      }
      var els = document.querySelectorAll(SELECTOR_LOGIN);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var txt = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
        if (!txt) continue;
        if (!TEXTO_LOGIN.test(txt)) continue;
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (el.disabled) continue;
        return el;
      }
      return null;
    }

    try {
      var btnLogin = await aguardar(buscarBotaoLogin, 10000, 300, 'Botão Iniciar sessão');
      if (btnLogin.__autoLogin) {
        console.log('[DHP-NG] ✔ Login passou automaticamente durante a espera.');
      } else {
        console.log('[DHP-NG] Botão login encontrado: <' + btnLogin.tagName +
                    '> texto="' + (btnLogin.textContent || btnLogin.value || '').trim() +
                    '" cls="' + btnLogin.className + '"');
        clicarCompleto(btnLogin);
      }
    } catch(loginErr) {
      // Diagnóstico: listar TODOS os elementos clicáveis na tela de login
      console.error('[DHP-NG] Botão de login não encontrado. Diagnóstico da tela:');
      var todos = document.querySelectorAll(SELECTOR_LOGIN);
      console.log('[DHP-NG]   Total clicáveis: ' + todos.length);
      for (var k = 0; k < todos.length; k++) {
        var e = todos[k];
        var t = (e.textContent || e.value || e.getAttribute('aria-label') || '').trim();
        var r = e.getBoundingClientRect();
        console.log('[DHP-NG]   [' + k + '] <' + e.tagName + '> texto="' + t.substring(0, 50) +
                    '" cls="' + e.className + '" ' + r.width + 'x' + r.height +
                    (e.disabled ? ' [disabled]' : ''));
      }
      // Lista de todos os inputs também (alguns submits podem ser <input> sem aparecer no SELECTOR)
      var inputs = document.querySelectorAll('input');
      console.log('[DHP-NG]   Inputs (' + inputs.length + '):');
      for (var ii = 0; ii < inputs.length; ii++) {
        var ip = inputs[ii];
        console.log('[DHP-NG]     [' + ii + '] type="' + ip.type + '" name="' + ip.name +
                    '" placeholder="' + ip.placeholder + '" value="' + (ip.value || '').substring(0, 30) + '"');
      }
      throw loginErr;
    }

    } // fim do else (caminho com botão de login explícito)

    // Aguardar menu carregar (session READY)
    await aguardar(function() {
      return Wing.session.READY;
    }, 20000, 300, 'Session READY após login');

    // Após login, Wing precisa de tempo para renderizar o menu completamente
    console.log('[DHP-NG] Login OK. Aguardando UI estabilizar...');
    await new Promise(function(r) { setTimeout(r, 3000); });

    // Verificar se já caiu direto na busca (sessão anterior)
    var buscaJaAberta = findCtrlByType(Wing.session.controllerManager.instances, 'Atend360BuscaWComp');
    if (buscaJaAberta) {
      console.log('[DHP-NG] Busca já aberta após login, pulando navegação');
      return;
    }

    // Navegar para Atendimento
    await irParaAtendimento();
  }

  // ── Navegar para Atendimento ──────────────────────────────────────────

  async function irParaAtendimento() {
    // IMPORTANTE: NÃO usar Wing API (menuManager, eFireEvent, etc.)
    // Wing corrompe a sessão (clientKey: -1) quando se usa API JS diretamente.
    // Só automação DOM pura funciona.
    console.log('[DHP-NG] Navegando para Atendimento via DOM...');

    // Diagnóstico: listar TODOS os botões visíveis na página
    var allBtns = document.querySelectorAll('button');
    var btnTexts = [];
    for (var b = 0; b < allBtns.length; b++) {
      var bt = allBtns[b].textContent.trim();
      if (bt && bt.length < 50) btnTexts.push('"' + bt + '" <' + allBtns[b].tagName + '.' + allBtns[b].className.split(' ')[0] + '>');
    }
    console.log('[DHP-NG] Botões na página (' + btnTexts.length + '):', btnTexts.join(' | '));

    // Tentar até 3 vezes com estratégias diferentes
    for (var tentativa = 1; tentativa <= 3; tentativa++) {
      console.log('[DHP-NG] Tentativa ' + tentativa + ' de navegar para Atendimento...');

      // Verificar se já está na busca (pode ter carregado entre tentativas)
      var buscaExiste = findCtrlByType(Wing.session.controllerManager.instances, 'Atend360BuscaWComp');
      if (buscaExiste) {
        console.log('[DHP-NG] BuscaWComp já existe!');
        return;
      }

      // ── Passo 0: Abrir menu lateral (hamburger) se existir ──
      if (tentativa >= 2) {
        var hamburger = document.querySelector('button.w-menu-button') ||
                        document.querySelector('[class*="hamburger"]') ||
                        document.querySelector('[class*="menu-toggle"]');
        // Tentar o primeiro botão da página (geralmente é o hamburger ☰)
        if (!hamburger) {
          var firstBtn = document.querySelector('button');
          if (firstBtn && firstBtn.textContent.trim().length <= 3) {
            hamburger = firstBtn;
          }
        }
        if (hamburger) {
          console.log('[DHP-NG] Clicando hamburger/menu: "' + hamburger.textContent.trim() + '"');
          clicarCompleto(hamburger);
          await new Promise(function(r) { setTimeout(r, 1500); });
        }
      }

      // ── Passo 1: Encontrar e clicar em "Atendimento" ──
      // Busca ampla: texto, aria-label, title, ou className contendo "atend" (case-insensitive)
      var candidatos = [];
      var all = document.querySelectorAll('button, div[role="button"], a, li, span, div, [role="menuitem"], [role="treeitem"]');
      var REGEX_ATEND = /atend/i;
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var txt = (el.textContent || '').trim();
        var aria = el.getAttribute('aria-label') || '';
        var title = el.getAttribute('title') || '';
        var cls = el.className || '';
        if (typeof cls !== 'string') cls = '';
        // Match estrito original (texto exato curto começando com "Atendimento")
        var matchEstrito = txt === 'Atendimento' || (txt.indexOf('Atendimento') === 0 && txt.length < 20);
        // Match amplo case-insensitive: texto curto (folha de menu), aria-label, title, ou class
        var matchAmplo = (txt.length < 30 && REGEX_ATEND.test(txt)) ||
                         REGEX_ATEND.test(aria) ||
                         REGEX_ATEND.test(title) ||
                         REGEX_ATEND.test(cls);
        if (matchEstrito || matchAmplo) {
          var rect = el.getBoundingClientRect();
          var visivel = rect.width > 0 && rect.height > 0;
          candidatos.push({
            el: el,
            tag: el.tagName,
            cls: cls,
            filhos: el.childElementCount,
            visivel: visivel,
            w: rect.width,
            h: rect.height,
            txt: txt.substring(0, 30),
            aria: aria,
            title: title,
            estrito: matchEstrito,
            iconsHidden: el.classList.contains('w-icons-hidden')
          });
        }
      }

      console.log('[DHP-NG] Candidatos "Atendimento": ' + candidatos.length);
      for (var c = 0; c < candidatos.length; c++) {
        var cc = candidatos[c];
        console.log('[DHP-NG]   [' + c + '] <' + cc.tag + '>' + (cc.estrito ? ' [estrito]' : '') +
                    ' txt="' + cc.txt + '" aria="' + cc.aria + '" title="' + cc.title + '"' +
                    ' cls="' + cc.cls + '" filhos=' + cc.filhos +
                    ' visível=' + cc.visivel + ' ' + cc.w + 'x' + cc.h +
                    (cc.iconsHidden ? ' [w-icons-hidden]' : ''));
      }

      // Diagnóstico extra: se nenhum candidato visível, lista TODO o menu lateral
      var temVisivel = false;
      for (var cv = 0; cv < candidatos.length; cv++) { if (candidatos[cv].visivel) { temVisivel = true; break; } }
      if (!temVisivel) {
        console.warn('[DHP-NG] Nenhum candidato visível. Listando estrutura de menu/nav...');
        var navs = document.querySelectorAll('nav, aside, [role="menu"], [role="navigation"], [class*="menu" i], [class*="nav" i], [class*="sidebar" i]');
        console.log('[DHP-NG]   Containers menu/nav encontrados: ' + navs.length);
        for (var nv = 0; nv < Math.min(navs.length, 5); nv++) {
          var n = navs[nv];
          console.log('[DHP-NG]     <' + n.tagName + ' cls="' + (n.className || '').substring(0, 60) + '"> filhos=' + n.children.length +
                      ' txt(80)="' + (n.textContent || '').trim().substring(0, 80) + '"');
        }
        // Lista todos os botões/links visíveis com texto curto (provável menu)
        var clicaveis = document.querySelectorAll('button, a, [role="button"], [role="menuitem"], li');
        var menuVis = [];
        for (var cl = 0; cl < clicaveis.length; cl++) {
          var elc = clicaveis[cl];
          var rc = elc.getBoundingClientRect();
          if (rc.width === 0 || rc.height === 0) continue;
          var t = (elc.textContent || '').trim();
          if (!t || t.length > 30) continue;
          menuVis.push('<' + elc.tagName + '>"' + t + '"');
        }
        console.log('[DHP-NG]   Itens clicáveis visíveis curtos (' + menuVis.length + '): ' + menuVis.slice(0, 40).join(' | '));
      }

      if (candidatos.length === 0) {
        console.warn('[DHP-NG] Nenhum candidato "Atendimento" encontrado!');
        await new Promise(function(r) { setTimeout(r, 2000); });
        continue;
      }

      // Clicar em cada candidato visível, um por um, até BuscaWComp carregar
      // Priorização: match estrito antes, depois maior largura (label visível, não só ícone)
      candidatos.sort(function(a, b) {
        if (a.estrito !== b.estrito) return a.estrito ? -1 : 1;
        return (b.w || 0) - (a.w || 0);
      });
      for (var ci = 0; ci < candidatos.length; ci++) {
        var cand = candidatos[ci];
        if (!cand.visivel) continue;

        console.log('[DHP-NG] Clicando candidato [' + ci + ']: <' + cand.tag + '> txt="' + cand.txt +
                    '" cls="' + cand.cls + '" ' + cand.w + 'x' + cand.h + ' (eventos completos)');
        clicarCompleto(cand.el);

        // Esperar um pouco para ver se carregou (3.5s — Wing pode demorar)
        await new Promise(function(r) { setTimeout(r, 3500); });

        // Verificar se BuscaWComp apareceu
        buscaExiste = findCtrlByType(Wing.session.controllerManager.instances, 'Atend360BuscaWComp');
        if (buscaExiste) {
          console.log('[DHP-NG] ✔ BuscaWComp carregou após clique no candidato [' + ci + ']');
          return;
        }

        // Verificar se campo de busca específico do Atendimento apareceu
        var campoBusca = document.querySelector('input[placeholder*="CPF/CNPJ"]');
        if (campoBusca) {
          console.log('[DHP-NG] ✔ Campo de busca Atendimento encontrado no DOM após clique [' + ci + ']');
          // Esperar controller registrar
          await new Promise(function(r) { setTimeout(r, 3000); });
          buscaExiste = findCtrlByType(Wing.session.controllerManager.instances, 'Atend360BuscaWComp');
          if (buscaExiste) return;
          console.log('[DHP-NG] Campo encontrado mas controller não registrou, continuando...');
        }

        console.log('[DHP-NG] Clique [' + ci + '] não abriu busca, tentando próximo...');
      }

      // Se chegou aqui, nenhum candidato funcionou nesta tentativa
      console.warn('[DHP-NG] Tentativa ' + tentativa + ' falhou. Aguardando antes de retry...');
      await new Promise(function(r) { setTimeout(r, 2000); });
    }

    // Última chance: aguardar BuscaWComp aparecer (pode ter loading lento)
    await aguardar(function() {
      return findCtrlByType(Wing.session.controllerManager.instances, 'Atend360BuscaWComp');
    }, 15000, 500, 'Controller BuscaWComp (espera final)');
  }

  // ── Buscar contrato ──────────────────────────────────────────────────────
  // O campo de busca do NG aceita "nome, contrato, CPF/CNPJ, telefone, e-mail ou
  // login PPPoE". Buscar pelo contrato retorna 1 card e abre direto a aba do
  // contrato certo — elimina a ambiguidade multi-contrato da busca por CPF.

  async function buscarContrato(contratoLimpo) {
    var buscaCtrl = findCtrlByType(Wing.session.controllerManager.instances, 'Atend360BuscaWComp');
    if (!buscaCtrl) throw new Error('Tela de busca não encontrada');

    // Encontrar o input do campo de pesquisa via Wing item
    var campoItem = buscaCtrl.ctrl.items.campoPesquisaTF;
    var input = campoItem && campoItem.inputField;

    if (!input) {
      // Fallback: buscar por placeholder
      input = document.querySelector('input[placeholder*="CPF"]') ||
              document.querySelector('input[placeholder*="Buscar"]') ||
              document.querySelector('input[placeholder*="contrato"]');
    }
    if (!input) throw new Error('Campo de pesquisa não encontrado');

    // Limpar campo e digitar o contrato
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    simularDigitacao(input, contratoLimpo);

    // Pressionar Enter — caminho natural do Wing (click no pesquisaB pode
    // causar timeout intermitente em "Resultado busca")
    console.log('[DHP-NG] Disparando busca via Enter');
    simularEnter(input);

    console.log('[DHP-NG] Digitou contrato e Enter, aguardando resultado...');

    // Aguardar resultado (CardRetornoBusca ou resultadoTotalSl com "0")
    // Evita falso positivo do detector "Nenhum resultado" em estados iniciais
    var _buscaInicio = Date.now();
    await aguardar(function() {
      var cardCtrl = findCtrlByType(Wing.session.controllerManager.instances, 'Atend360CardRetornoBuscaWComp');
      if (cardCtrl) return 'encontrado';

      // Só considera "nao_encontrado" após 4s
      if (Date.now() - _buscaInicio < 4000) return null;

      // Verificar se "Resultado: 0"
      var buscaItems = buscaCtrl.ctrl.items;
      if (buscaItems.resultadoTotalSl) {
        var label = lerItemTexto(buscaItems.resultadoTotalSl);
        if (label.indexOf(': 0') > -1 || label === 'Resultado: 0') return 'nao_encontrado';
      }

      // Wing novo: detecta "Nenhum resultado para mostrar" no DOM
      var bodyTxt = document.body ? document.body.textContent : '';
      if (/Nenhum resultado para mostrar/i.test(bodyTxt)) return 'nao_encontrado';

      return null;
    }, 15000, 300, 'Resultado busca contrato');

    // Verificar se encontrou
    var cardCtrl = findCtrlByType(Wing.session.controllerManager.instances, 'Atend360CardRetornoBuscaWComp');
    if (!cardCtrl) {
      // Token de categoria — o catch de executar() repassa cru pro JS.html.
      throw new Error('contrato_nao_encontrado');
    }
  }

  // ── Clicar em Visualizar ──────────────────────────────────────────────

  // CORRETO: "Atender" abre o Atendimento completo com painel Contratos.
  // ERRADO: "Visualizar" (visualizaPessoaB) abre só modal de Pessoa, sem contrato.
  async function clicarVisualizar() {
    var cardCtrl = findCtrlByType(Wing.session.controllerManager.instances, 'Atend360CardRetornoBuscaWComp');
    var btnClicado = false;

    if (cardCtrl && cardCtrl.ctrl.items) {
      var itemsKeys = Object.keys(cardCtrl.ctrl.items);
      console.log('[DHP-NG] cardCtrl items:', itemsKeys.join(', '));
      window.__dhpCardItems = itemsKeys;
    }

    // Estratégia 1: items Wing que casem com "atender" (descartando Pessoa)
    if (cardCtrl && cardCtrl.ctrl.items) {
      var items = cardCtrl.ctrl.items;
      var keysAtender = Object.keys(items).filter(function(k) {
        if (/pessoa/i.test(k)) return false;
        return /atend(e|er|imento)/i.test(k);
      });

      for (var ka = 0; ka < keysAtender.length && !btnClicado; ka++) {
        var item = items[keysAtender[ka]];
        if (item && item.element) {
          console.log('[DHP-NG] Clicando Atender via item Wing:', keysAtender[ka]);
          try { item.element.click(); btnClicado = true; }
          catch(e) { console.warn('[DHP-NG] Falha em ' + keysAtender[ka] + ':', e.message); }
        }
      }
    }

    // Estratégia 2: fallback DOM — botão com texto "Atender"
    if (!btnClicado) {
      var btnAt = await aguardar(function() {
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          if (buttons[i].textContent.trim() === 'Atender') return buttons[i];
        }
        return null;
      }, 10000, 300, 'Botão Atender (DOM)');

      console.log('[DHP-NG] Clicando Atender via DOM');
      btnAt.click();
      btnClicado = true;
    }

    console.log('[DHP-NG] Clicou Atender, aguardando painel Contratos...');

    // Aguardar cabeçalho "Contratos (N)" no DOM. Bumped 30s→60s pra
    // vendas recém-criadas / Wing throttled em popup sem foco.
    await aguardar(function() {
      var els = document.querySelectorAll('span, div, h2, h3, h4');
      for (var h = 0; h < els.length; h++) {
        var t = els[h].textContent.trim();
        if (/^Contratos\s*\(\s*\d+\s*\)$/.test(t)) return true;
      }
      return null;
    }, 60000, 500, 'Cabeçalho Contratos (N) após Atender');

    // Pausa para card renderizar completamente (5s tolera multi-contract)
    console.log('[DHP-NG] Painel Contratos carregou, pausando 5s para card renderizar...');
    await new Promise(function(r) { setTimeout(r, 5000); });
  }

  // ── Ler resultados dos controllers Wing + fallback DOM ──────────────

  function lerResultados() {
    var instances = Wing.session.controllerManager.instances;
    var r = {
      instalada:       false,
      dataInstalacao:  '',
      dataAgendamento: '',
      resumo:          '',
      contratos:       [],
      aguardando:      false,
      nome:            '',
      debug:           {}
    };

    // ── Listar controllers disponíveis para debug ──
    var ctrlTypes = [];
    for (var cid in instances) {
      if (instances[cid] && instances[cid].type) ctrlTypes.push(instances[cid].type);
    }
    r.debug.controllers = ctrlTypes;
    console.log('[DHP-NG] Controllers disponíveis:', ctrlTypes.join(', '));

    // ── DIAGNÓSTICO: dump dos items de cada controller (top-level keys) ──
    console.group('[DHP-NG] Items por controller');
    for (var cidD in instances) {
      var c = instances[cidD];
      if (!c || !c.type || !c.items) continue;
      var nome = c.type.split('.').pop();
      var keys = Object.keys(c.items);
      if (!keys.length) continue;
      // Para cada item, mostra valor/text se for primitivo
      var resumoItems = [];
      for (var ki = 0; ki < keys.length; ki++) {
        var k = keys[ki];
        var it = c.items[k];
        var v = '';
        try { v = lerItemTexto(it); } catch(e) {}
        if (v) v = ' = "' + v.substring(0, 80) + '"';
        resumoItems.push(k + v);
      }
      console.log('[DHP-NG] ' + nome + ' (' + keys.length + '):', resumoItems.join(' | '));
    }
    console.groupEnd();

    // ── DIAGNÓSTICO: dump de texto visível da área principal ──
    var mainArea = document.querySelector('main, [role="main"], .w-content, #content') || document.body;
    if (mainArea) {
      var txtArea = (mainArea.textContent || '').replace(/\s+/g, ' ').trim();
      console.log('[DHP-NG] Texto principal (' + txtArea.length + ' chars):', txtArea.substring(0, 1500));
    }

    // ── Nome da pessoa (Wing) ──
    var pessoaCtrl = findCtrlByType(instances, 'Atend360TabPessoaFisicaWComp');
    if (pessoaCtrl && pessoaCtrl.ctrl.items) {
      r.nome = lerItemTexto(pessoaCtrl.ctrl.items.nomePessoaST);
    }
    if (!r.nome) {
      var mainCtrl = findCtrlByType(instances, 'Atend360WMC');
      if (mainCtrl && mainCtrl.ctrl.items) {
        r.nome = lerItemTexto(mainCtrl.ctrl.items.nomePessoaST);
      }
    }

    // ── Dados do contrato (Wing) ──
    // Fix multi-contrato: filtra pelo numeroContratoST igual ao contrato buscado.
    // Sem isso, com cliente de N contratos, o card do TOPO da lista vencia mesmo
    // sendo de outro contrato — e a dataInstalacaoST dele virava r.dataInstalacao.
    var contratoCard = findContratoCardByNumero(instances, contrato);
    if (!contratoCard) {
      r.debug.cardLateralSkip = true;
      console.warn('[DHP-NG] Nenhum card lateral casou com contrato ' + contrato +
                   ' — pulando leitura do card. Fonte da verdade: OS Externa + Taxa.');
    }
    if (contratoCard && contratoCard.ctrl.items) {
      var items = contratoCard.ctrl.items;
      var numContrato = lerItemTexto(items.numeroContratoST);
      var tipoContrato = lerItemTexto(items.tipoContratoST);
      var dataInst = lerItemTexto(items.dataInstalacaoST);
      var endereco = lerItemTexto(items.enderecoST);
      var bairro = lerItemTexto(items.bairroST);

      r.contratos.push({
        numero: numContrato,
        tipo: tipoContrato,
        dataInstalacao: dataInst,
        endereco: endereco,
        bairro: bairro
      });

      if (dataInst && dataInst !== '-') {
        r.dataInstalacao = dataInst;
      }
    }

    // ── OS Externa de Habilitação (status da instalação) ──
    var osCtrl = findCtrlByType(instances, 'CasoCriacaoCheckOSExternaDeHabilitacaoWComp');
    if (osCtrl && osCtrl.ctrl.items) {
      var detalheOS = lerItemTexto(osCtrl.ctrl.items.checkDetalheSL);
      r.debug.osExterna = detalheOS;

      if (detalheOS) {
        var detalheUp = detalheOS.toUpperCase();
        if (detalheUp.indexOf('BAIXADA') > -1) {
          r.instalada = true;
          var m1 = detalheOS.match(/(\d{2}\/\d{2}\/\d{4})/);
          if (m1) r.dataInstalacao = m1[1];
        } else if (detalheUp.indexOf('AGENDADA') > -1 || detalheUp.indexOf('AGENDA') > -1) {
          r.aguardando = true;
          var m2 = detalheOS.match(/(\d{2}\/\d{2}\/\d{4})/);
          if (m2) r.dataAgendamento = m2[1];
        } else if (detalheUp.indexOf('AGUARDANDO') > -1 || detalheUp.indexOf('PENDENTE') > -1) {
          r.aguardando = true;
        }
      }
    }

    // ── Contrato criação ──
    var criacaoCtrl = findCtrlByType(instances, 'CasoCriacaoDeContratoWComp');
    if (criacaoCtrl && criacaoCtrl.ctrl.items) {
      var numContr = lerItemTexto(criacaoCtrl.ctrl.items.contratoST);
      if (numContr) {
        r.debug.contrato = numContr;
        // Em multi-contrato, o card lateral do nosso contrato pode nao estar
        // exposto (o filtro de findContratoCardByNumero pula). Mas criacaoCtrl
        // e atrelado a aba ativa — se ele bate, garante presenca em r.contratos
        // pra branch de pre-instalacao do resumo ("taxa aplicada em ...") rodar.
        if (r.contratos.length === 0 && String(numContr).trim() === String(contrato).trim()) {
          r.contratos.push({
            numero: numContr,
            tipo: '',
            dataInstalacao: '',
            endereco: '',
            bairro: ''
          });
          r.debug.contratoStubFromCriacao = true;
        }
      }
    }

    // ── Taxa de Habilitação ──
    var taxaCtrl = findCtrlByType(instances, 'CasoCriacaoCheckTaxaDeHabilitacaoWComp');
    if (taxaCtrl && taxaCtrl.ctrl.items) {
      r.debug.taxaHabilitacao = lerItemTexto(taxaCtrl.ctrl.items.checkDetalheSL);
    }

    // ── Análise de Crédito ──
    var creditoCtrl = findCtrlByType(instances, 'CasoCriacaoCheckAnaliseCreditoWComp');
    if (creditoCtrl && creditoCtrl.ctrl.items) {
      r.debug.analiseCredito = lerItemTexto(creditoCtrl.ctrl.items.checkDetalheSL);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  FALLBACK DOM: se controllers Wing não retornaram dados suficientes,
    //  ler diretamente do DOM (tela Visualizar mostra dados visíveis)
    // ══════════════════════════════════════════════════════════════════════
    if (!r.nome || r.contratos.length === 0) {
      console.log('[DHP-NG] Tentando fallback DOM...');
      lerDadosDom(r);
    }

    // ── Se não achou OS Externa mas tem contrato com data de instalação ──
    if (!r.instalada && !r.aguardando && r.dataInstalacao) {
      r.instalada = true;
    }

    // ── Se não tem contrato ──
    if (r.contratos.length === 0 && !contratoCard && !criacaoCtrl) {
      if (r.nome) {
        r.resumo = 'Sem contrato ativo';
        return r;
      }
    }

    // ── Montar resumo ──
    if (r.instalada) {
      r.resumo = 'Instalada' + (r.dataInstalacao ? ' em ' + r.dataInstalacao : '');
    } else if (r.dataAgendamento) {
      r.resumo = 'Agendada para ' + r.dataAgendamento;
    } else if (r.aguardando) {
      r.resumo = 'Aguardando Instalação (sem agendamento)';
    } else if (r.contratos && r.contratos.length > 0 && r.debug.taxaHabilitacao && !r.debug.contratoCancelado) {
      // Pré-instalação: contrato + taxa aplicada, sem dataInstalacao
      var taxaMsg = String(r.debug.taxaHabilitacao || '');
      var mTaxa = taxaMsg.match(/(\d{2}\/\d{2}\/\d{4})/);
      r.resumo = mTaxa
        ? 'Aguardando instalação (taxa aplicada em ' + mTaxa[1] + ')'
        : 'Aguardando instalação (taxa aplicada)';
    } else if (r.contratos && r.contratos.length > 0 && !r.debug.contratoCancelado) {
      // Default conservador: card lateral confirmou nosso contrato, sem cancelamento,
      // mas Wing nao expoe Caso Criacao* (taxa/osExterna ausentes — estado fora do
      // fluxo de criacao, ex: Caso Contratacao). Resolve como "aguardando" em vez
      // de "nao identificado" — informativo e nunca arrisca falso positivo.
      r.resumo = 'Aguardando instalação';
    } else {
      r.resumo = 'Status não identificado (ver debug)';
    }

    return r;
  }

  // ── Fallback: ler dados diretamente do DOM ────────────────────────────

  function lerDadosDom(r) {
    // Utilitário: prioriza nextElementSibling (mais preciso pra label-value pares)
    // sobre varrer filhos do pai (que pode pegar valor errado em rows com múltiplos campos)
    function lerCampoDOM(rotulo) {
      var spans = document.querySelectorAll('span, div, label, p');
      for (var i = 0; i < spans.length; i++) {
        var txt = spans[i].textContent.trim();
        if (txt === rotulo) {
          // Estratégia 1: irmão imediato
          var next = spans[i].nextElementSibling;
          if (next) {
            var val2 = next.textContent.trim();
            if (val2 && val2 !== rotulo) return val2;
          }
          // Estratégia 2: irmão do pai
          if (spans[i].parentElement) {
            var parentNext = spans[i].parentElement.nextElementSibling;
            if (parentNext) {
              var val3 = parentNext.textContent.trim();
              if (val3 && val3 !== rotulo) return val3;
            }
          }
          // Estratégia 3: filhos do pai (último recurso)
          var parent = spans[i].parentElement;
          if (parent) {
            var filhos = parent.querySelectorAll('span, div');
            for (var j = 0; j < filhos.length; j++) {
              var val = filhos[j].textContent.trim();
              if (val && val !== rotulo && val.length > 0 && val.length < 100) return val;
            }
          }
        }
      }
      return '';
    }

    // Nome do cliente
    if (!r.nome) {
      r.nome = lerCampoDOM('Nome') || lerCampoDOM('Nome completo');
      if (r.nome) console.log('[DHP-NG] DOM nome:', r.nome);
    }

    // Detectar "Contratos (0)" — sinal explícito de cliente sem contrato
    if (r.contratos.length === 0) {
      var headers = document.querySelectorAll('span, div, h2, h3, h4');
      for (var hh = 0; hh < headers.length; hh++) {
        var ht = headers[hh].textContent.trim();
        if (/^Contratos\s*\(\s*0\s*\)$/.test(ht)) {
          r.debug.semContratoConfirmado = true;
          console.log('[DHP-NG] DOM confirma: Contratos (0)');
          break;
        }
      }
    }

    // Contrato (card no painel esquerdo)
    if (r.contratos.length === 0 && !r.debug.semContratoConfirmado) {
      var numContrato = lerCampoDOM('Contrato');

      // Guard multi-contrato: lerCampoDOM('Contrato') pega o PRIMEIRO label do DOM,
      // que pode ser o card de outro contrato do mesmo cliente. Se nao bate com o
      // contrato buscado, aborta — confiar no centro (CasoCriacao*) e nao inventar.
      if (numContrato && String(numContrato).trim() !== String(contrato).trim()) {
        r.debug.domSkipMultiContrato = true;
        r.debug.domNumContrato = numContrato;
        console.warn('[DHP-NG] DOM fallback abortado: card lateral [' + numContrato +
                     '] != contrato buscado [' + contrato + '].');
        return;
      }

      var dataInst    = lerCampoDOM('Instalado em');
      var cancelEm    = lerCampoDOM('Cancelado em');
      var tipoContr   = lerCampoDOM('Tipo de contrato');
      var endereco    = lerCampoDOM('Endereço');
      var bairro      = lerCampoDOM('Bairro');
      var modalidade  = lerCampoDOM('Modalidade');
      var statusCtr   = lerCampoDOM('Status');

      // Captura valores brutos lidos do DOM pra diagnosticar parser
      r.debug.lidoContrato    = numContrato;
      r.debug.lidoInstaladoEm = dataInst;
      r.debug.lidoCanceladoEm = cancelEm;
      r.debug.lidoStatus      = statusCtr;

      if (numContrato) {
        r.contratos.push({
          numero: numContrato,
          tipo: tipoContr || '',
          dataInstalacao: dataInst || '',
          canceladoEm: cancelEm || '',
          endereco: endereco || '',
          bairro: bairro || '',
          modalidade: modalidade || '',
          status: statusCtr || ''
        });
        r.debug.fonte = 'DOM';
        r.debug.contratoCancelado = (cancelEm && cancelEm !== '-' && cancelEm !== '') ? cancelEm : '';
        if (statusCtr) r.debug.statusContrato = statusCtr;

        console.log('[DHP-NG] DOM contrato:', numContrato, '| instalado:', dataInst,
                    '| cancelado:', cancelEm, '| status:', statusCtr);

        var foiCancelado = cancelEm && cancelEm !== '-' && cancelEm !== '';
        if (foiCancelado) {
          r.instalada = false;
          r.resumo = 'Contrato cancelado em ' + cancelEm;
        } else if (statusCtr && /habilitad/i.test(statusCtr)) {
          r.instalada = true;
          if (dataInst && dataInst !== '-') r.dataInstalacao = dataInst;
        } else if (dataInst && dataInst !== '-') {
          r.instalada = true;
          r.dataInstalacao = dataInst;
        }
      }
    }
  }

  // ── Iniciar execução quando DOM estiver pronto ──────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', executar);
  } else {
    executar();
  }
})();
