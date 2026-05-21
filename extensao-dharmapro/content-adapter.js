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

  async function executar() {
    try {
      // 1. Login
      var loginResp = await fetch(BASE + '/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'login=' + encodeURIComponent(user) + '&senha=' + encodeURIComponent(pass)
      });
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
      var contratoResp = await fetch(BASE + '/comercial/contratos/' + encodeURIComponent(contratoLimpo), {
        credentials: 'include'
      });

      var c;
      if (contratoResp.status === 200) {
        c = await contratoResp.json();
      } else if (contratoResp.status === 404 || contratoResp.status === 500) {
        // 500 = padrão do Adapter quando o contrato não existe (testado em produção)
        erroFatal('contrato_nao_encontrado');
        return;
      } else {
        erroFatal('Erro ao buscar contrato (HTTP ' + contratoResp.status + ')');
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
            if (dtAg) { r.dataAgendamento = dtAg; break; }
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
