/**
 * AlertasGrupo.js — gateway único do DharmaPro para o canal de grupo WhatsApp
 *                   (disparo-grupo / Flow 1 no n8n).
 *
 * Todos os alertas operacionais que disparam mensagem no grupo Mobile Fibra |
 * Alta Performance chamam `enviarParaGrupoWhatsApp(texto)` aqui — nada chama
 * Evolution API diretamente. Documentação completa em
 * G:\Meu Drive\Projetos Claude\disparo-grupo\CLAUDE.md.
 */

var CFG_DISPARO_GRUPO = {
  WEBHOOK_URL:   'https://n8n.ofertasverointernet.com.br/webhook/group-msg-text',
  HEADER_TOKEN:  'X-Mobile-Token',
  PROP_TOKEN:    'N8N_GROUP_WEBHOOK_TOKEN',
  PROP_ULTIMO_PARCIAL_AUTO: 'ultimoEnvioParcialAuto',
  COOLDOWN_PARCIAL_MS: 5 * 60 * 1000,
  STATUS_AG_INSTALACAO: '2- Aguardando Instalação',
  STATUS_FINALIZADA:    '3 - Finalizada/Instalada'
};

/**
 * Envia uma mensagem ao destino via Flow 1 do n8n.
 *
 * @param {string} mensagem - Texto pronto pra envio.
 * @param {string} [destino] - Apelido do destino (default: omitido → Flow 1
 *                             resolve pra "default" = grupo principal).
 *                             Apelidos disponíveis: ver $env.DESTINOS_DISPONIVEIS
 *                             no container n8n do VPS. Atualmente:
 *                             - "default" → grupo Mobile Fibra | Alta Performance
 *                             - "ricardo" → DM do Ricardo (5532988015161)
 * @returns {boolean} true se HTTP 200, false caso contrário.
 */
function enviarParaGrupoWhatsApp(mensagem, destino) {
  if (typeof mensagem !== 'string' || !mensagem.trim()) {
    Logger.log('enviarParaGrupoWhatsApp: mensagem vazia, abortando');
    return false;
  }
  var token = PropertiesService.getScriptProperties().getProperty(CFG_DISPARO_GRUPO.PROP_TOKEN);
  if (!token) {
    Logger.log('enviarParaGrupoWhatsApp: ' + CFG_DISPARO_GRUPO.PROP_TOKEN + ' ausente em Script Properties');
    return false;
  }
  var body = { mensagem: mensagem };
  if (destino) {
    var apelido = String(destino).trim();
    if (apelido) body.destino = apelido;
  }
  try {
    var headers = {};
    headers[CFG_DISPARO_GRUPO.HEADER_TOKEN] = token;
    var resp = UrlFetchApp.fetch(CFG_DISPARO_GRUPO.WEBHOOK_URL, {
      method:             'post',
      contentType:        'application/json',
      headers:            headers,
      payload:            JSON.stringify(body),
      muteHttpExceptions: true,
      followRedirects:    true
    });
    var code = resp.getResponseCode();
    if (code !== 200) {
      Logger.log('enviarParaGrupoWhatsApp: HTTP ' + code + ' destino=' + (body.destino || 'default') + ' — ' + resp.getContentText().slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    Logger.log('enviarParaGrupoWhatsApp: exception ' + (e && e.message || e));
    return false;
  }
}

/**
 * Helper interno: registra timestamp em America/Sao_Paulo (ISO).
 */
function _agoraISOBrt_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Helper interno: garante idempotência via coluna marker na aba 1-Vendas.
 * @param {number} linhaNum - índice 1-based.
 * @param {string} colHeader - nome do header da coluna marker.
 * @returns {boolean} true se já foi enviado (a chamada deve abortar).
 */
function _alertaJaEnviado_(linhaNum, colHeader) {
  try {
    var sheet = _getSheet();
    var headers = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
    var col = headers.indexOf(colHeader);
    if (col < 0) return false; // coluna ainda não existe — trata como não-enviado
    var val = sheet.getRange(linhaNum, col + 1).getValue();
    return val !== '' && val !== null;
  } catch (e) {
    Logger.log('_alertaJaEnviado_ erro: ' + e.message);
    return false;
  }
}

function _marcarAlertaEnviado_(linhaNum, colHeader, valor) {
  try {
    var sheet = _getSheet();
    var headers = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
    var col = headers.indexOf(colHeader);
    if (col < 0) {
      Logger.log('_marcarAlertaEnviado_: coluna ' + colHeader + ' não encontrada — pulando marker');
      return;
    }
    sheet.getRange(linhaNum, col + 1).setValue(valor || _agoraISOBrt_());
  } catch (e) {
    Logger.log('_marcarAlertaEnviado_ erro: ' + e.message);
  }
}

/**
 * Hook único de transição de status — chamado de salvarVenda, moverVendaFunil
 * e moverLeadAguardando após gravação bem-sucedida.
 *
 * Roda em try/catch interno para NUNCA quebrar o caller (gravação da venda
 * é prioritária — alerta é colateral). Logs em caso de erro.
 *
 * @param {number} linhaNum - linha 1-based na aba 1-Vendas.
 * @param {string} statusAntigo - status pré-merge (vazio em cadastro novo).
 * @param {string} statusNovo - status final pós-merge.
 */
function _dispararAlertaTransicaoStatus_(linhaNum, statusAntigo, statusNovo) {
  try {
    statusAntigo = String(statusAntigo || '').trim();
    statusNovo   = String(statusNovo   || '').trim();
    if (statusAntigo === statusNovo) return; // sem transição
    if (!linhaNum || linhaNum < 3) return;

    // Alerta 2 — Instalação concluída (qualquer → 3 - Finalizada/Instalada).
    if (statusNovo === CFG_DISPARO_GRUPO.STATUS_FINALIZADA) {
      _disparoAlertaInstalacao_(linhaNum);
      return;
    }

    // Alerta 1 — Parcial automática (qualquer → 2 - Aguardando Instalação).
    if (statusNovo === CFG_DISPARO_GRUPO.STATUS_AG_INSTALACAO) {
      _disparoAlertaParcial_(linhaNum);
      return;
    }
  } catch (e) {
    Logger.log('_dispararAlertaTransicaoStatus_ erro: ' + (e && e.message || e));
  }
}

/**
 * Mostra Script Properties relevantes pra debugging. Roda no editor.
 */
/**
 * Stubs — implementação real chega em commits seguintes (Alertas 1 e 2).
 * Manter as funções declaradas evita ReferenceError se uma transição de
 * status acontece entre o deploy do helper e o deploy dos alertas.
 */
/**
 * Alerta 2 — Instalação concluída (transição → "3 - Finalizada/Instalada").
 *
 * Disparado por _dispararAlertaTransicaoStatus_ a partir de salvarVenda /
 * moverVendaFunil. Idempotência via col `alerta_instalacao_enviado_em`.
 * Não-bloqueante: try interno engole erros (alerta é colateral).
 */
function _disparoAlertaInstalacao_(linhaNum) {
  try {
    if (!linhaNum || linhaNum < 3) return;
    if (_alertaJaEnviado_(linhaNum, 'alerta_instalacao_enviado_em')) {
      Logger.log('_disparoAlertaInstalacao_: linha ' + linhaNum + ' já enviada — abortando');
      return;
    }
    var sheet = _getSheet();
    var c = CONFIG.COLUNAS;
    var row = sheet.getRange(linhaNum, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
    var cliente  = String(row[c.CLIENTE] || '').trim() || '—';
    var vendedor = String(row[c.RESP]    || '').trim() || '—';
    var planoRaw = String(row[c.PLANO]   || '').trim();
    // Remove sufixo "| R$ XX,XX" do plano (igual padrão em getValorPlano).
    var plano = planoRaw.replace(/\s*\|\s*R?\$?\s*[\d.,]+\s*$/, '').trim() || '—';
    var quando = Utilities.formatDate(new Date(), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH'h'mm");
    var msg =
      '✅ Instalação concluída\n' +
      '📅 ' + quando + '\n' +
      '👤 ' + cliente + '\n' +
      '👨‍💼 Vendido por ' + vendedor + '\n' +
      '🌐 ' + plano;
    var ok = enviarParaGrupoWhatsApp(msg);
    if (ok) {
      _marcarAlertaEnviado_(linhaNum, 'alerta_instalacao_enviado_em');
    } else {
      Logger.log('_disparoAlertaInstalacao_: envio falhou — marker NÃO atualizado');
    }
  } catch (e) {
    Logger.log('_disparoAlertaInstalacao_ erro: ' + (e && e.message || e));
  }
}
/**
 * Constrói o texto puro da "Parcial do dia" (sem HTML), espelhando a lógica
 * de exibirMensagemAguardandoWeb. Se `cidade` vier preenchida, insere a
 * linha `📍 <Cidade>` entre "Inst. em campo" e o bloco em branco do Funil.
 *
 * Se o getDashboard falhar, retorna null — caller deve abortar (não enviar
 * mensagem semivazia pro grupo).
 *
 * @param {string} [cidade]
 * @returns {string|null}
 */
function _construirTextoParcialDoDia(cidade) {
  try {
    var hoje          = new Date();
    var dataFormatada = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd/MM');
    var mesCorrente   = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'MM/yyyy');
    var d = getDashboard(null, null);
    if (!d || d.erro) {
      Logger.log('_construirTextoParcialDoDia: getDashboard erro: ' + (d && d.erro || 'sem retorno'));
      return null;
    }
    var funil  = d.funil || {};
    var quente = (funil['AG ACEITE']  || 0) + (funil['AG AUDITORIA']  || 0);
    var morno  = (funil['AG COMPROVANTE'] || 0) + (funil['AG DOC'] || 0);
    var frio   = (funil['EM NEGOCIACAO'] || 0) + (funil['AG QUALIDADE'] || 0);
    var totalFunil = quente + morno + frio;

    var linhaCidade = cidade ? ('📍 ' + String(cidade).trim() + '\n') : '';

    return (
      '🚀 *Parcial do dia:* ' + dataFormatada + '\n' +
      '🌐 ' + Math.round(d.fibraHoje || 0) + ' Fibras Ativadas\n' +
      '📱 ' + Math.round(d.movelHoje || 0) + ' Chips Ativados\n' +
      '👷‍♂️ ' + Math.round(d.emCampo  || 0) + ' Inst. em campo\n' +
      linhaCidade +
      '\n📊 *Funil de Vendas*: ' + totalFunil + '\n' +
      '🔥 ' + quente + ' Quente\n' +
      '🕑 ' + morno  + ' Morno\n' +
      '❄️ ' + frio   + ' Frio\n' +
      '\n🗓 *Consolidado:* ' + mesCorrente + '\n' +
      '👷🏻 ' + Math.round(d.instalacoesMes || 0) + ' Instalações (' + Math.round(d.tendenciaInstal || 0) + ')\n' +
      '📄 ' + Math.round(d.vendaBrutaMes  || 0) + ' Venda Bruta ('  + Math.round(d.tendenciaVendas || 0) + ')\n' +
      '🏷 ' + (d.vendaDU || 0).toFixed(2)   + ' Venda DU\n' +
      '💰 R$ ' + (d.ticketMedio || 0).toFixed(2) + ' Ticket Médio\n' +
      '⏳ ' + Math.round(d.backlog || 0) + ' Backlog\n' +
      '❌ ' + (d.cancelPct || 0).toFixed(1) + '% Canc. Comercial'
    ).trim();
  } catch (e) {
    Logger.log('_construirTextoParcialDoDia exception: ' + (e && e.message || e));
    return null;
  }
}

/**
 * Alerta 1 — Parcial automática (transição → "2- Aguardando Instalação").
 *
 * Cooldown one-way: NUNCA verifica timestamp do botão manual; sempre
 * dispara na transição. O botão manual é que vai consultar
 * `ultimoEnvioParcialAuto` antes de gerar o HTML.
 */
function _disparoAlertaParcial_(linhaNum) {
  try {
    if (!linhaNum || linhaNum < 3) return;
    if (_alertaJaEnviado_(linhaNum, 'alerta_parcial_auto_enviado_em')) {
      Logger.log('_disparoAlertaParcial_: linha ' + linhaNum + ' já enviada — abortando');
      return;
    }
    var sheet = _getSheet();
    var c = CONFIG.COLUNAS;
    var row = sheet.getRange(linhaNum, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
    var cidade = String(row[c.CIDADE] || '').trim();
    if (!cidade) {
      Logger.log('_disparoAlertaParcial_: cidade vazia na linha ' + linhaNum + ' (enviando parcial sem 📍)');
    }
    var texto = _construirTextoParcialDoDia(cidade);
    if (!texto) {
      Logger.log('_disparoAlertaParcial_: texto null — abortando');
      return;
    }
    var ok = enviarParaGrupoWhatsApp(texto);
    if (ok) {
      _marcarAlertaEnviado_(linhaNum, 'alerta_parcial_auto_enviado_em');
      PropertiesService.getScriptProperties().setProperty(
        CFG_DISPARO_GRUPO.PROP_ULTIMO_PARCIAL_AUTO, _agoraISOBrt_()
      );
    } else {
      Logger.log('_disparoAlertaParcial_: envio falhou — marker NÃO atualizado');
    }
  } catch (e) {
    Logger.log('_disparoAlertaParcial_ erro: ' + (e && e.message || e));
  }
}
/**
 * Conta leads de hoje na aba "Leads Meta Ads" (col A=data_entrada vs hoje em
 * America/Sao_Paulo). Tolerante a erro — retorna 0 se algo falhar.
 *
 * @param {Sheet} aba - referência da aba já obtida (evita re-lookup)
 * @returns {number}
 */
function _contarLeadsMetaHoje_(aba) {
  try {
    var ultRow = aba.getLastRow();
    if (ultRow < 2) return 0;
    var hojeKey = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    var col = aba.getRange(2, 1, ultRow - 1, 1).getValues();
    var count = 0;
    for (var i = 0; i < col.length; i++) {
      var v = col[i][0];
      if (v instanceof Date && Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd') === hojeKey) {
        count++;
      }
    }
    return count;
  } catch (e) {
    Logger.log('_contarLeadsMetaHoje_ erro: ' + (e && e.message || e));
    return 0;
  }
}

/**
 * Alerta 5 — Lead novo Meta Ads.
 *
 * Chamado por `registrarLeadMetaAds` em MetaAdsAPI.js após appendRow.
 * Mensagem inclui o nome do lead + contador acumulado do dia.
 * Idempotência: coluna `alerta_grupo_enviado` na aba "Leads Meta Ads" (TRUE
 * após sucesso). Não bloqueia o caller — falha de alerta nunca falha o lead.
 *
 * @param {number} linhaNum - linha 1-based na aba Leads Meta Ads (vinda de appendRow → getLastRow).
 * @param {string} nomeLead - payload.nome (pode vir vazio).
 */
function _disparoAlertaLeadMeta_(linhaNum, nomeLead) {
  try {
    if (!linhaNum || linhaNum < 2) return;
    var aba = _getSpreadsheet_().getSheetByName('Leads Meta Ads');
    if (!aba) {
      Logger.log('_disparoAlertaLeadMeta_: aba "Leads Meta Ads" não encontrada');
      return;
    }
    var headers = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
    var colMarker = headers.indexOf('alerta_grupo_enviado');
    if (colMarker < 0) {
      Logger.log('_disparoAlertaLeadMeta_: coluna alerta_grupo_enviado não existe (rodar _criarColunasAlertasGrupo)');
      return;
    }
    var jaEnviado = aba.getRange(linhaNum, colMarker + 1).getValue();
    if (jaEnviado === true || String(jaEnviado).toUpperCase() === 'TRUE') {
      Logger.log('_disparoAlertaLeadMeta_: linha ' + linhaNum + ' já marcada — abortando');
      return;
    }
    var nome = String(nomeLead || '').trim();
    // Contador inclui o lead atual (que JÁ foi appended antes deste hook).
    var total = _contarLeadsMetaHoje_(aba);
    var suf = total > 0 ? (' (#' + total + ')') : '';
    var msg = nome
      ? ('💬 Novo Lead Meta: ' + nome + suf)
      : ('💬 Novo Lead Meta' + suf);

    // Destinos: lê Script Property ALERTA5_DESTINOS (CSV); fallback 'default'.
    // Por padrão Alerta 5 vai só pro Mobile. Agência recebe via Alerta 8
    // (digest 12h+19h com total do dia). Permite ajustar sem deploy via
    // PropertiesService — ex: setar 'default,agencia' pra replicar pra ambos.
    var destinosRaw = PropertiesService.getScriptProperties().getProperty('ALERTA5_DESTINOS')
      || 'default';
    var destinos = destinosRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var algumOk = false;
    var falhas = [];
    for (var i = 0; i < destinos.length; i++) {
      var d = destinos[i];
      // 'default' = sem segundo arg (helper passa undefined; Flow 1 resolve default).
      var ok = (d === 'default')
        ? enviarParaGrupoWhatsApp(msg)
        : enviarParaGrupoWhatsApp(msg, d);
      if (ok) { algumOk = true; }
      else    { falhas.push(d); }
    }
    if (algumOk) {
      // Marca idempotência se PELO MENOS UM destino entregou — evita reenvio
      // em massa em retry quando 1 destino fica flaky.
      aba.getRange(linhaNum, colMarker + 1).setValue(true);
      if (falhas.length) {
        Logger.log('_disparoAlertaLeadMeta_: parcial — falhas em [' + falhas.join(',') + '] mas marker setado');
      }
    } else {
      Logger.log('_disparoAlertaLeadMeta_: TODOS os destinos falharam — marker NÃO setado (próxima execução tentará)');
    }
  } catch (e) {
    Logger.log('_disparoAlertaLeadMeta_ erro: ' + (e && e.message || e));
  }
}

/**
 * Endpoint público `?action=leads_meta_hoje` (Alerta 8 — digest 12h/19h agência).
 * Sem secret — agregados sem PII (apenas contadores).
 *
 * Schema:
 * {
 *   ok: true,
 *   gerado_em: '2026-05-19T12:00:00-03:00',
 *   leads: 12,
 *   conversoes: 2
 * }
 */
function _serveActionLeadsMetaHoje_() {
  try {
    var aba = _getSpreadsheet_().getSheetByName('Leads Meta Ads');
    if (!aba) return { ok: false, erro: 'aba_nao_encontrada', leads: 0, conversoes: 0 };
    // Reusa _contarLeadsEVendasHoje_ (MetaAdsAPI.js) — varre col A/I/K com TZ SP.
    var lv = _contarLeadsEVendasHoje_();
    return {
      ok:        true,
      gerado_em: _agoraISOBrt_(),
      leads:     lv.leads_hoje,
      conversoes: lv.vendas_hoje
    };
  } catch (e) {
    return { ok: false, erro: e && e.message || String(e), leads: 0, conversoes: 0 };
  }
}

/**
 * Endpoint público `?action=leads_meta_periodo&since=YYYY-MM-DD&until=YYYY-MM-DD`.
 * Sem secret — agregados sem PII (contadores + breakdown por campanha).
 * Filtro por `data_entrada` (col A). Datas inclusivas, TZ America/Sao_Paulo.
 * Cap de janela: 92 dias.
 *
 * Schema:
 * {
 *   ok: true, gerado_em, since, until, dias,
 *   total: { leads, convertidos, desqualificados, em_negociacao, pendentes, taxa_conv_pct },
 *   por_campanha: [ { utm_campaign, leads, convertidos, desq, em_nego, pendentes, cpl_proxy_conv } ],
 *   por_status:   { 'Converteu': N, 'Desqualificado': N, 'Em negociação': N, '(pendente)': N, ... },
 *   por_motivo_desq: { 'Preço alto': N, ... }
 * }
 */
function _serveActionLeadsMetaPeriodo_(params) {
  try {
    var since = String((params && params.since) || '').trim();
    var until = String((params && params.until) || '').trim();
    var re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(since) || !re.test(until)) {
      return { ok: false, erro: 'parametros_invalidos', detalhe: 'use since=YYYY-MM-DD&until=YYYY-MM-DD' };
    }
    var tz = 'America/Sao_Paulo';
    var dSince = new Date(since + 'T00:00:00-03:00');
    var dUntil = new Date(until + 'T23:59:59-03:00');
    if (isNaN(dSince) || isNaN(dUntil) || dSince > dUntil) {
      return { ok: false, erro: 'periodo_invalido' };
    }
    var dias = Math.round((dUntil - dSince) / 86400000) + 1;
    if (dias > 92) return { ok: false, erro: 'janela_excede_92_dias', dias: dias };

    var aba = _getSpreadsheet_().getSheetByName('Leads Meta Ads');
    if (!aba) return { ok: false, erro: 'aba_nao_encontrada' };
    var ult = aba.getLastRow();
    if (ult < 2) {
      return { ok: true, gerado_em: _agoraISOBrt_(), since: since, until: until, dias: dias,
               total: { leads: 0, convertidos: 0, desqualificados: 0, em_negociacao: 0, pendentes: 0, taxa_conv_pct: 0 },
               por_campanha: [], por_status: {}, por_motivo_desq: {} };
    }
    var raw = aba.getRange(2, 1, ult - 1, 12).getValues(); // A–L (sem PII relevante exposta abaixo)

    var camp = {};                   // utm_campaign → { leads, conv, desq, nego, pend }
    var porStatus = {};
    var porMotivo = {};
    var tot = 0, conv = 0, desq = 0, nego = 0, pend = 0;

    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      var dt = r[0];
      if (!(dt instanceof Date)) continue;
      if (dt < dSince || dt > dUntil) continue;

      tot++;
      var utm    = String(r[5] || '').trim() || '(sem campanha)';
      var status = String(r[8] || '').trim();
      var motivo = String(r[9] || '').trim();
      var key    = status || '(pendente)';
      porStatus[key] = (porStatus[key] || 0) + 1;

      var c = camp[utm] || (camp[utm] = { utm_campaign: utm, leads: 0, convertidos: 0, desq: 0, em_nego: 0, pendentes: 0 });
      c.leads++;

      if (status === 'Converteu')           { conv++; c.convertidos++; }
      else if (status === 'Desqualificado') { desq++; c.desq++; if (motivo) porMotivo[motivo] = (porMotivo[motivo] || 0) + 1; }
      else if (status === 'Em negociação')  { nego++; c.em_nego++; }
      else                                  { pend++; c.pendentes++; }
    }

    var arr = Object.keys(camp).map(function (k) { return camp[k]; })
                    .sort(function (a, b) { return b.leads - a.leads; });

    return {
      ok:        true,
      gerado_em: _agoraISOBrt_(),
      since:     since, until: until, dias: dias,
      total: {
        leads:           tot,
        convertidos:     conv,
        desqualificados: desq,
        em_negociacao:   nego,
        pendentes:       pend,
        taxa_conv_pct:   tot ? Math.round((conv / tot) * 1000) / 10 : 0,
      },
      por_campanha:    arr,
      por_status:      porStatus,
      por_motivo_desq: porMotivo,
    };
  } catch (e) {
    return { ok: false, erro: e && e.message || String(e) };
  }
}

/**
 * Endpoint público `?action=notificacoes_pendentes` (com secret).
 * Reusa `detectarAlertasAtivos` — mesma fonte do sino do CRM.
 *
 * Schema retornado (consumido pelo workflow n8n do Alerta 4):
 * {
 *   ok: true,
 *   gerado_em: '2026-05-19T08:00:00-03:00',
 *   total: 6,
 *   naoLidos: 6,
 *   alertas: [
 *     { tipo, icone, titulo, sub, severidade, id, destino },
 *     ...
 *   ]
 * }
 */
function _serveActionNotificacoesPendentes_() {
  try {
    var res = detectarAlertasAtivos(null);
    if (res && res.erro) {
      return { ok: false, erro: res.erro, alertas: [], total: 0, naoLidos: 0 };
    }
    return {
      ok:        true,
      gerado_em: _agoraISOBrt_(),
      total:     res && res.total    || 0,
      naoLidos:  res && res.naoLidos || 0,
      alertas:   (res && res.alertas || []).map(function (a) {
        return {
          tipo:       a.tipo,
          icone:      a.icone,
          titulo:     a.titulo,
          sub:        a.sub,
          severidade: a.severidade,
          id:         a.id,
          destino:    a.destino
        };
      })
    };
  } catch (e) {
    return { ok: false, erro: e && e.message || String(e), alertas: [], total: 0, naoLidos: 0 };
  }
}

function diagnosticarAlertasGrupo() {
  var props = PropertiesService.getScriptProperties();
  var tokenLen = (props.getProperty(CFG_DISPARO_GRUPO.PROP_TOKEN) || '').length;
  var ultimoParcial = props.getProperty(CFG_DISPARO_GRUPO.PROP_ULTIMO_PARCIAL_AUTO);
  Logger.log('=== Alertas Grupo: diagnóstico ===');
  Logger.log('Token presente: ' + (tokenLen ? 'SIM (' + tokenLen + ' chars)' : 'NÃO'));
  Logger.log('Webhook URL: ' + CFG_DISPARO_GRUPO.WEBHOOK_URL);
  Logger.log('Último envio parcial auto: ' + (ultimoParcial || '(nunca)'));
  Logger.log('Cooldown parcial: ' + (CFG_DISPARO_GRUPO.COOLDOWN_PARCIAL_MS / 1000) + 's');
  Logger.log('=== Teste de envio ===');
  var ok = enviarParaGrupoWhatsApp('🧪 Diagnóstico AlertasGrupo — ' +
    Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM HH:mm:ss'));
  Logger.log('Resultado: ' + (ok ? 'OK (mensagem enviada)' : 'FALHA (ver logs acima)'));
}
