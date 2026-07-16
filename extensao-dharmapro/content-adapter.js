// ══════════════════════════════════════════════════════════════════════════════
//  DharmaPro — Content Script para Vero Adapter
//  Roda em adapter.veronet.com.br (document_start)
//  Le params do hash da URL, faz login + consultas, devolve via window.opener
// ══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Extrair params do hash: #dhp?contrato=...&user=...&pass=...
  var hash = window.location.hash || '';
  if (hash.indexOf('#dhp?') !== 0) return;     // nao e consulta DharmaPro

  var params = new URLSearchParams(hash.substring(4)); // remove '#dhp'
  var contrato = params.get('contrato');
  var user = params.get('user');
  var pass = params.get('pass');
  if (!contrato || !user || !pass) return;

  // Limpa o hash para nao ficar visivel (seguranca)
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  var BASE = 'https://adapter.veronet.com.br/adapter/server/gateway';

  function enviar(dados) {
    dados.type = 'dhp_adapter_result';
    try {
      if (window.opener) window.opener.postMessage(dados, '*');
    } catch(x) {
      // opener pode ter sido destruido
    }
    // Fecha popup automaticamente apos enviar
    setTimeout(function() { window.close(); }, 600);
  }

  function erroFatal(msg) { enviar({ erro: msg }); }

  function fmtData(val) {
    if (!val) return '';
    var d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();
  }

  function esperar(ms) {
    return new Promise(function(res) { setTimeout(res, ms); });
  }

  function login() {
    return fetch(BASE + '/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'login=' + encodeURIComponent(user) + '&senha=' + encodeURIComponent(pass)
    });
  }

  // GET do contrato normalizado em { status, dados, corpoInvalido }.
  // `corpoInvalido` = HTTP 200 cujo corpo não é JSON de objeto — na prática é a
  // página de login devolvida quando a sessão não vale. Distinguir isso de um
  // 200 legítimo evita que um erro de sessão vire "contrato inexistente".
  async function buscarContrato(contratoLimpo) {
    var resp = await fetch(BASE + '/comercial/contratos/' + encodeURIComponent(contratoLimpo), {
      credentials: 'include'
    });
    var out = { status: resp.status, dados: null, corpoInvalido: false };
    if (resp.status === 200) {
      var txt = '';
      try { txt = await resp.text(); } catch (x) {}
      try {
        var j = JSON.parse(txt);
        if (j && typeof j === 'object') out.dados = j;
        else out.corpoInvalido = true;
      } catch (x) {
        out.corpoInvalido = true;
      }
    }
    return out;
  }

  async function executar() {
    try {
      // 1. Login
      var loginResp = await login();
      if (!loginResp.ok) {
        var errBody = '';
        try { errBody = await loginResp.text(); } catch(x) {}
        erroFatal('Login falhou (HTTP ' + loginResp.status + '). ' + errBody.substring(0, 300));
        return;
      }

      // 2. Buscar o contrato direto pelo ID (busca por contrato, não por CPF).
      // Elimina a ambiguidade multi-contrato: antes buscava o cliente por CPF e
      // pegava qualquer HABILITADO da lista; agora consulta exatamente o contrato
      // da venda. Só GET /comercial/contratos/{id} funciona (os padrões
      // /contratos/novo/{id}, ?id= e datatables retornam HTTP 500).
      var contratoLimpo = String(contrato).replace(/\D/g, '');
      var res = await buscarContrato(contratoLimpo);

      // HTTP 500 é AMBÍGUO no Adapter: é a resposta tanto pra contrato
      // inexistente quanto pra sessão que ainda não estabeleceu no servidor.
      // Com sessão fria (1ª consulta), o login acabou de acontecer e o gateway
      // responde 500 mesmo com o contrato existindo — o operador via um vermelho
      // "contrato não encontrado" e precisava clicar de novo pra acertar (na 2ª
      // vez a sessão já estava quente). Refaz o login e repete UMA vez antes de
      // concluir que o contrato não existe. Custo: só no caminho de falha.
      if (res.status === 500 || res.corpoInvalido) {
        await esperar(1200);
        var relogin = await login();
        if (relogin.ok) res = await buscarContrato(contratoLimpo);
      }

      var c;
      if (res.status === 200 && res.dados) {
        c = res.dados;
      } else if (res.corpoInvalido) {
        // Persistiu resposta não-JSON mesmo após re-login → sessão não estabelece.
        // Reportado como 5xx pra cair no retry transparente do CRM.
        erroFatal('Erro ao buscar contrato (HTTP 500 — sessão do Adapter não estabeleceu)');
        return;
      } else if (res.status === 404 || res.status === 500) {
        // Confirmado após re-login: o contrato realmente não existe.
        erroFatal('contrato_nao_encontrado');
        return;
      } else {
        erroFatal('Erro ao buscar contrato (HTTP ' + res.status + ')');
        return;
      }

      // 3. Processar o contrato consultado (sem loop — é exatamente um)
      var r = { instalada: false, dataInstalacao: '', dataAgendamento: '',
                resumo: '', contratos: [], aguardando: false };

      var cStatus = (c.status && typeof c.status === 'object') ? (c.status.descricao || '') : String(c.status || '');
      var cPlano  = (c.plano  && typeof c.plano  === 'object') ? (c.plano.nome || '')       : String(c.plano || '');
      var cStatusUp = cStatus.toUpperCase();

      // Mantém o campo `contratos` no payload por compat com o frontend.
      r.contratos.push({ id: c.id || '', plano: cPlano, status: cStatus });

      if (cStatusUp === 'CANCELADO') {
        var dtCanc = c.dataCancelamento || '';
        r.resumo = 'Contrato cancelado' + (dtCanc ? ' em ' + (typeof dtCanc === 'string' && dtCanc.indexOf('/') > -1 ? dtCanc.split(' ')[0] : fmtData(dtCanc)) : '');
        // CANCELADO é estado terminal — NÃO marca instalada.
        enviar(r);
        return;
      }

      if (cStatusUp === 'HABILITADO') {
        r.instalada = true;
        var dtHab = c.dataHabilitacao || c.dataUltimaHabilitacao || '';
        if (dtHab) r.dataInstalacao = (typeof dtHab === 'string' && dtHab.indexOf('/') > -1) ? dtHab.split(' ')[0] : fmtData(dtHab);
      }

      if (cStatusUp.indexOf('AGUARDANDO') > -1) {
        r.aguardando = true;
      }

      // 4. Agendamento — só busca quando aguardando instalação. Usa o cliente do
      // próprio payload do contrato (não precisa mais buscar cliente por CPF).
      if (!r.instalada && r.aguardando) {
        var clienteId = c.cliente && c.cliente.id ? c.cliente.id : '';
        if (clienteId) {
          // Payload padrao DataTables (servidor exige columns, order, search)
          var dtBody = JSON.stringify({
            draw: 1, start: 0, length: 50,
            columns: [{ data: null, name: '', searchable: true, orderable: false, search: { value: '', regex: false } }],
            order: [{ column: 0, dir: 'asc' }],
            search: { value: '', regex: false }
          });
          var agendadosResp = await fetch(
            BASE + '/comercial/atendimentos/novo/datatables?clienteId=' + clienteId + '&status=VISITA_AGENDADA',
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: dtBody
            }
          );
          var agendadosRaw = agendadosResp.ok ? await agendadosResp.json() : {};
          var agendados = agendadosRaw.data || agendadosRaw.content || (Array.isArray(agendadosRaw) ? agendadosRaw : []);

          // Heurística mantida: primeiro item com dataAgendamento.
          // Caveat: o endpoint datatables retorna idContrato null, então em
          // multi-contrato AGUARDANDO no mesmo cliente pode pegar o agendamento
          // do outro contrato. Edge case secundário, aceitável.
          for (var k = 0; k < agendados.length; k++) {
            var dtAg = agendados[k].dataAgendamento || '';
            if (dtAg) {
              r.dataAgendamento = (typeof dtAg === 'string' && dtAg.indexOf(' ') > -1) ? dtAg.split(' ')[0] : dtAg;
              break;
            }
          }
        }
      }

      if (r.instalada) r.resumo = 'Instalada' + (r.dataInstalacao ? ' em ' + r.dataInstalacao : '');
      else if (r.dataAgendamento) r.resumo = 'Agendada para ' + r.dataAgendamento;
      else if (r.aguardando) r.resumo = 'Aguardando Instalacao (sem agendamento)';
      else r.resumo = 'Sem contrato ativo';


      enviar(r);

    } catch (e) {
      erroFatal('Erro: ' + (e.message || String(e)));
    }
  }

  // Executa assim que possivel
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', executar);
  } else {
    executar();
  }
})();
