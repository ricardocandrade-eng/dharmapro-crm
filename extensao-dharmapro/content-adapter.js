// ══════════════════════════════════════════════════════════════════════════════
//  DharmaPro — Content Script para Vero Adapter
//  Roda automaticamente em adapter.veronet.com.br
//  Detecta params dhp_adapter_* na URL, faz as consultas e devolve via postMessage
// ══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Adapter usa hash routing (#/login?params), entao os params podem estar no hash
  var searchStr = window.location.search;
  var hashStr   = window.location.hash;
  // Tentar extrair params do hash (ex: #/login?dhp_adapter_cpf=...)
  var hashQ = hashStr.indexOf('?') > -1 ? hashStr.substring(hashStr.indexOf('?')) : '';
  var params = new URLSearchParams(searchStr || hashQ);
  var cpf    = params.get('dhp_adapter_cpf');
  var user   = params.get('dhp_adapter_user');
  var pass   = params.get('dhp_adapter_pass');

  // So executa se veio do DharmaPro (tem os params)
  if (!cpf || !user || !pass) return;

  var BASE = 'https://adapter.veronet.com.br/adapter/server/gateway';

  function enviar(dados) {
    dados.type = 'dhp_adapter_result';
    if (window.opener) {
      window.opener.postMessage(dados, '*');
    }
  }

  function erroFatal(msg) {
    enviar({ erro: msg });
  }

  function fmtData(val) {
    if (!val) return '';
    var d = new Date(val);
    if (isNaN(d.getTime())) return '';
    var dd = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    return dd + '/' + mm + '/' + d.getFullYear();
  }

  async function executar() {
    try {
      // 1. Login
      var loginResp = await fetch(BASE + '/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Authorization': 'Basic ' + btoa(user + ':' + pass) }
      });
      if (!loginResp.ok) {
        erroFatal('Falha no login (HTTP ' + loginResp.status + ')');
        return;
      }

      // 2. Buscar cliente por CPF
      var cpfLimpo = cpf.replace(/\D/g, '');
      var clienteResp = await fetch(BASE + '/comercial/clientes/novo/datatables?cpf=' + cpfLimpo, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draw: 1, start: 0, length: 10 })
      });
      if (!clienteResp.ok) {
        erroFatal('Erro ao buscar cliente (HTTP ' + clienteResp.status + ')');
        return;
      }
      var clienteData = await clienteResp.json();
      var lista = clienteData.data || clienteData.content || [];
      if (!lista.length) {
        erroFatal('CPF nao encontrado no Adapter.');
        return;
      }
      var cliente = lista[0];
      var clienteId = cliente.id;

      // 3. Contratos
      var contratosResp = await fetch(BASE + '/comercial/contratos/cliente/' + clienteId, {
        credentials: 'include'
      });
      var contratosData = contratosResp.ok ? await contratosResp.json() : [];
      var contratos = Array.isArray(contratosData) ? contratosData : (contratosData.data || contratosData.content || []);

      // 4. Atendimentos agendados
      var agendadosResp = await fetch(BASE + '/comercial/atendimentos/novo/datatables?clienteId=' + clienteId + '&status=VISITA_AGENDADA', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draw: 1, start: 0, length: 50 })
      });
      var agendadosData = agendadosResp.ok ? await agendadosResp.json() : {};
      var agendados = agendadosData.data || agendadosData.content || [];

      // 5. Atendimentos solucionados
      var solucionadosResp = await fetch(BASE + '/comercial/atendimentos/novo/datatables?clienteId=' + clienteId + '&status=SOLUCIONADO', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draw: 1, start: 0, length: 50 })
      });
      var solucionadosData = solucionadosResp.ok ? await solucionadosResp.json() : {};
      var solucionados = solucionadosData.data || solucionadosData.content || [];

      // 6. Processar resultado
      var resultado = {
        instalada: false,
        dataInstalacao: '',
        dataAgendamento: '',
        resumo: '',
        contratos: []
      };

      // Mapear contratos
      for (var i = 0; i < contratos.length; i++) {
        var c = contratos[i];
        resultado.contratos.push({
          id: c.id || c.contrato || '',
          plano: c.plano || c.descricao || c.produto || '',
          status: c.status || ''
        });
        if (c.status && c.status.toUpperCase() === 'HABILITADO') {
          resultado.instalada = true;
        }
      }

      // Verificar solucionados (fechamento = data de instalacao)
      for (var j = 0; j < solucionados.length; j++) {
        var s = solucionados[j];
        var dtFech = s.fechamento || s.dataFechamento || s.dataConclusao || '';
        if (dtFech) {
          resultado.instalada = true;
          resultado.dataInstalacao = fmtData(dtFech);
          break;
        }
      }

      // Verificar agendamentos pendentes
      if (!resultado.instalada) {
        for (var k = 0; k < agendados.length; k++) {
          var a = agendados[k];
          var dtAg = a.agendamento || a.dataAgendamento || a.dataVisita || '';
          var dtFechAg = a.fechamento || a.dataFechamento || '';
          if (dtFechAg) {
            resultado.instalada = true;
            resultado.dataInstalacao = fmtData(dtFechAg);
          } else if (dtAg) {
            resultado.dataAgendamento = fmtData(dtAg);
          }
        }
      }

      // Resumo
      if (resultado.instalada) {
        resultado.resumo = 'Instalada' + (resultado.dataInstalacao ? ' em ' + resultado.dataInstalacao : '');
      } else if (resultado.dataAgendamento) {
        resultado.resumo = 'Agendada para ' + resultado.dataAgendamento;
      } else {
        resultado.resumo = 'Sem instalacao ou agendamento';
      }

      enviar(resultado);

    } catch (e) {
      erroFatal('Erro: ' + (e.message || String(e)));
    }
  }

  // Aguarda um instante para a pagina carregar, depois executa
  setTimeout(executar, 500);
})();
