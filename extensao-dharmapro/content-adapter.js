// ══════════════════════════════════════════════════════════════════════════════
//  DharmaPro — Content Script para Vero Adapter
//  Roda em adapter.veronet.com.br (document_start)
//  Le params do hash da URL, faz login + consultas, devolve via window.opener
// ══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Extrair params do hash: #dhp?cpf=...&user=...&pass=...
  var hash = window.location.hash || '';
  if (hash.indexOf('#dhp?') !== 0) return;     // nao e consulta DharmaPro

  var params = new URLSearchParams(hash.substring(4)); // remove '#dhp'
  var cpf  = params.get('cpf');
  var user = params.get('user');
  var pass = params.get('pass');
  if (!cpf || !user || !pass) return;

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
      var cli = lista[0];
      var clienteId = cli.IDCliente || cli.id || cli.clienteId || cli.codigo || '';

      // 3. Contratos
      var contratosResp = await fetch(BASE + '/comercial/contratos/cliente/' + clienteId, {
        credentials: 'include'
      });
      var contratosRaw = contratosResp.ok ? await contratosResp.json() : [];

      // Contratos podem vir como array ou objeto agrupado por status
      var contratos = [];
      if (Array.isArray(contratosRaw)) {
        contratos = contratosRaw;
      } else if (contratosRaw && typeof contratosRaw === 'object') {
        // Pode ser { data: [...] } ou { "HABILITADO": [...], "AGUARDANDO INSTALACAO": [...] }
        if (contratosRaw.data) {
          contratos = contratosRaw.data;
        } else if (contratosRaw.content) {
          contratos = contratosRaw.content;
        } else {
          // Objeto agrupado por status — ex: { "AGUARDANDO INSTALACAO": [{...}] }
          var keys = Object.keys(contratosRaw);
          for (var g = 0; g < keys.length; g++) {
            var grupo = contratosRaw[keys[g]];
            if (Array.isArray(grupo)) {
              for (var gi = 0; gi < grupo.length; gi++) {
                if (!grupo[gi].statusGrupo) grupo[gi].statusGrupo = keys[g];
                contratos.push(grupo[gi]);
              }
            }
          }
        }
      }

      // Payload padrao DataTables (servidor exige columns, order, search)
      var dtBody = JSON.stringify({
        draw: 1, start: 0, length: 50,
        columns: [{ data: null, name: '', searchable: true, orderable: false, search: { value: '', regex: false } }],
        order: [{ column: 0, dir: 'asc' }],
        search: { value: '', regex: false }
      });

      // 4. Atendimentos agendados
      var agendadosResp = await fetch(BASE + '/comercial/atendimentos/novo/datatables?clienteId=' + clienteId + '&status=VISITA_AGENDADA', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: dtBody
      });
      var agendadosRaw = agendadosResp.ok ? await agendadosResp.json() : {};
      var agendados = agendadosRaw.data || agendadosRaw.content || (Array.isArray(agendadosRaw) ? agendadosRaw : []);


      // 6. Processar — foco nos contratos ATIVOS (ignorar CANCELADO)
      var r = { instalada: false, dataInstalacao: '', dataAgendamento: '', resumo: '', contratos: [], aguardando: false };

      for (var i = 0; i < contratos.length; i++) {
        var c = contratos[i];
        var cStatus = (c.status && typeof c.status === 'object') ? (c.status.descricao || '') : String(c.status || '');
        var cPlano  = (c.plano  && typeof c.plano  === 'object') ? (c.plano.nome || '')       : String(c.plano || '');
        var cStatusUp = cStatus.toUpperCase();

        r.contratos.push({ id: c.id || '', plano: cPlano, status: cStatus });

        // Ignorar contratos cancelados
        if (cStatusUp === 'CANCELADO') continue;

        if (cStatusUp === 'HABILITADO') {
          r.instalada = true;
          // Pegar data de habilitacao do contrato se disponivel
          var dtHab = c.dataHabilitacao || c.dataUltimaHabilitacao || '';
          if (dtHab) r.dataInstalacao = (typeof dtHab === 'string' && dtHab.indexOf('/') > -1) ? dtHab.split(' ')[0] : fmtData(dtHab);
        }
        if (cStatusUp.indexOf('AGUARDANDO') > -1) r.aguardando = true;
      }

      // Se nao esta instalada, verificar agendamentos (visitas agendadas)
      if (!r.instalada) {
        for (var k = 0; k < agendados.length; k++) {
          var a = agendados[k];
          var dtAg = a.dataAgendamento || '';
          if (dtAg) {
            r.dataAgendamento = dtAg;
            break;
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
