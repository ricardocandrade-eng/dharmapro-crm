/**
 * AlertasOpAPI.js — backend da página "Alertas Operacionais" (menu Sistema).
 *
 * Catálogo dos alertas do `disparo-grupo` (Flow 1 → grupo/DM via Evolution),
 * com status live consultado na n8n REST API pros cron-agendados. Inclui
 * também os 2 botões manuais do CRM que ralacionam com esse canal.
 *
 * Adicionada em 29/05/2026 a pedido do Ricardo — visão única dos alertas
 * pra saber o que está no ar, qual o texto, qual a periodicidade.
 *
 * Fontes:
 *   - Event-driven: hardcoded (AlertasGrupo.js / MetaAdsAPI.js)
 *   - Cron-agendado: n8n REST API com `N8N_API_KEY` em Script Properties
 *   - Destino resolvido: nome humano + apelido lido do `disparo-grupo` config
 *
 * Não cobre os triggers internos do GAS (08h diagnóstico Ads, 09h cruzamento
 * Vero, etc.) — só os alertas via WhatsApp do canal disparo-grupo.
 */

var CFG_ALERTAS_OP = {
  N8N_BASE_URL: 'https://n8n.ofertasverointernet.com.br/api/v1',
  CACHE_TTL_LIVE: 60,   // 1min — evita martelar o n8n em refresh
  CACHE_TTL_TEMPLATE: 300
};

/**
 * Catálogo estático dos alertas. ATENÇÃO: ordem da lista = ordem de
 * apresentação na UI. Adicionar/remover aqui se um alerta novo aparecer.
 */
function _alertasCatalogoEstatico_() {
  return [
    // ── EVENT-DRIVEN (DharmaPro dispara em runtime) ────────────────────────
    {
      id: 'alerta1_parcial',
      numero: 1,
      nome: 'Parcial automática',
      icone: '🚀',
      tipo: 'event',
      gatilho: 'Transição de venda → "2 - Aguardando Instalação"',
      gatilhoHumano: 'A cada nova venda agendada',
      origem: 'DharmaPro — `_disparoAlertaParcial_` em AlertasGrupo.js',
      destinoApelido: 'default',
      destinoHumano: 'Grupo principal (Mobile Fibra | Alta Performance)',
      idempotencia: 'col `alerta_parcial_auto_enviado_em` na aba "1 - Vendas"',
      ativoCodigo: true,
      n8nWorkflowId: null,
      cron: null,
      amostraFn: '_amostraAlertaParcial',
      podeDisparar: false,
      disparoMotivo: 'Event-driven — só dispara em transição real de venda → 2.'
    },
    {
      id: 'alerta2_instalacao',
      numero: 2,
      nome: 'Instalação concluída',
      icone: '✅',
      tipo: 'event',
      gatilho: 'Transição de venda → "3 - Finalizada/Instalada"',
      gatilhoHumano: 'A cada instalação confirmada',
      origem: 'DharmaPro — `_disparoAlertaInstalacao_` em AlertasGrupo.js',
      destinoApelido: 'default',
      destinoHumano: 'Grupo principal (Mobile Fibra | Alta Performance)',
      idempotencia: 'col `alerta_instalacao_enviado_em` na aba "1 - Vendas"',
      ativoCodigo: true,
      n8nWorkflowId: null,
      cron: null,
      amostraFn: '_amostraAlertaInstalacao',
      podeDisparar: false,
      disparoMotivo: 'Event-driven — só dispara em transição real de venda → 3.'
    },
    {
      id: 'alerta5_lead_meta',
      numero: 5,
      nome: 'Lead novo Meta Ads',
      icone: '💬',
      tipo: 'event',
      gatilho: 'Lead recebido em `registrarLeadMetaAds` (após appendRow)',
      gatilhoHumano: 'A cada lead que entra pela Meta Ads / Botconversa',
      origem: 'DharmaPro — `_disparoAlertaLeadMeta_` em AlertasGrupo.js',
      destinoApelido: 'default',
      destinoHumano: 'Grupo principal (Mobile Fibra | Alta Performance)',
      idempotencia: 'col `alerta_grupo_enviado` na aba "Leads Meta Ads"',
      ativoCodigo: true,
      n8nWorkflowId: null,
      cron: null,
      amostraFn: '_amostraAlertaLeadMeta',
      podeDisparar: false,
      disparoMotivo: 'Event-driven — só dispara quando lead novo entra no CRM.'
    },

    // ── CRON-AGENDADO (n8n dispara) ────────────────────────────────────────
    {
      id: 'alerta3_verohub',
      numero: 3,
      nome: 'Blindagem VeroHub',
      icone: '🛡️',
      tipo: 'cron',
      cron: '0 12,18 * * 1-6',
      cronHumano: 'Seg–Sáb · 12h e 18h',
      origem: 'n8n workflow (sem código local — totalmente no n8n)',
      destinoApelido: 'default',
      destinoHumano: 'Grupo principal (Mobile Fibra | Alta Performance)',
      idempotencia: '—',
      n8nWorkflowId: 'ca602SNvhEsFxU4n',
      amostraFn: null,
      amostraMsg: 'Texto gerado dentro do workflow n8n (sem GAS). Pra ver, executar manualmente no editor n8n.',
      podeDisparar: false,
      disparoMotivo: 'Workflow puro do n8n — n8n public API não tem "execute now". Executar via n8n editor: workflow ca602SNvhEsFxU4n.'
    },
    {
      id: 'alerta4_sino_digest',
      numero: 4,
      nome: 'Sino digest 8h',
      icone: '🔔',
      tipo: 'cron',
      cron: '0 8 * * 1-6',
      cronHumano: 'Seg–Sáb · 8h',
      origem: 'n8n → endpoint DharmaPro `?action=notificacoes_pendentes`',
      destinoApelido: 'default',
      destinoHumano: 'Grupo principal (Mobile Fibra | Alta Performance)',
      idempotencia: '—',
      n8nWorkflowId: 'nDwft1P0rXYz3Bq1',
      amostraFn: '_amostraAlertaSinoDigest',
      podeDisparar: true,
      disparoFn: '_disparoAlerta4SinoDigestAgora',
      disparoConfirma: 'Vai mandar o digest do sino AGORA no grupo principal. Confirma?'
    },
    {
      id: 'alerta7_trafego',
      numero: 7,
      nome: 'Tráfego Pago',
      icone: '🌅',
      tipo: 'cron',
      cron: '0 8,14,20 * * *',
      cronHumano: 'Todo dia · 8h, 14h e 20h',
      origem: 'n8n → endpoint DharmaPro `?action=resumo_trafego`',
      destinoApelido: 'ricardo',
      destinoHumano: 'Grupo "Tráfego Pago | Vero Fibra Ricardo" (repurposed 28/05/2026)',
      idempotencia: '—',
      n8nWorkflowId: 'rZi4ZpL1Sj8tvcMz',
      amostraFn: '_amostraAlertaTrafego',
      podeDisparar: true,
      disparoFn: '_disparoAlerta7TrafegoAgora',
      disparoConfirma: 'Vai mandar o resumo de Tráfego AGORA no grupo "Tráfego Pago | Vero Fibra Ricardo". Confirma?'
    },
    {
      id: 'alerta8_leads_meta_digest',
      numero: 8,
      nome: 'Leads Meta digest agência',
      icone: '📊',
      tipo: 'cron',
      cron: '0 12,19 * * 1-6',
      cronHumano: 'Seg–Sáb · 12h e 19h',
      origem: 'n8n → endpoint DharmaPro `?action=leads_meta_hoje`',
      destinoApelido: 'agencia',
      destinoHumano: 'Grupo "Tráfego - Ricardo x Pedro" (agência)',
      idempotencia: '—',
      n8nWorkflowId: 'Hma953tRXhpmKbEq',
      amostraFn: '_amostraAlertaLeadsMetaDigest',
      observacao: 'Desativado pelo Ricardo em 28/05/2026 (workflow segue existindo, `active=false`).',
      podeDisparar: false,
      disparoMotivo: 'Workflow desativado intencionalmente. Pra reativar: n8n editor → workflow Hma953tRXhpmKbEq → toggle Active.'
    },

    // ── MANUAIS (botões no CRM) ────────────────────────────────────────────
    {
      id: 'manual_resumo_pap',
      numero: null,
      nome: '"📩 Enviar Resumo" — Pagamentos PAP',
      icone: '💵',
      tipo: 'manual',
      gatilho: 'Botão "📩 Enviar Resumo" na página Pagamentos PAP',
      gatilhoHumano: 'Sob demanda — clicado pelo admin após registrar pagamentos',
      origem: 'DharmaPro — `enviarResumoPAPAdmin` em Code.js (Evolution DM direto)',
      destinoApelido: '(bypass do Flow 1 — DM via Evolution direto)',
      destinoHumano: 'DM Ricardo (32988015161) — chip 4154 → Ricardo pessoal',
      idempotencia: '—',
      ativoCodigo: true,
      n8nWorkflowId: null,
      cron: null,
      amostraFn: '_amostraResumoPAP',
      podeDisparar: false,
      disparoMotivo: 'Disparo exige seleção de pagamentos pelo admin. Ir pra: Pagamentos PAP → marcar pagos → clicar 📩 Enviar Resumo.'
    },
    {
      id: 'manual_resumo_trafego',
      numero: null,
      nome: '`enviarResumoTrafegoAgora` — Resumo Tráfego sob demanda',
      icone: '📊',
      tipo: 'manual',
      gatilho: 'Função `enviarResumoTrafegoAgora` (sem botão UI hoje — só via editor ou pela própria página Alertas Op)',
      gatilhoHumano: 'Sob demanda — mesmo conteúdo do alerta 7 em qualquer hora',
      origem: 'DharmaPro — `enviarResumoTrafegoAgora` em MetaAdsAPI.js',
      destinoApelido: 'ricardo',
      destinoHumano: 'Grupo "Tráfego Pago | Vero Fibra Ricardo" (mesmo do alerta 7)',
      idempotencia: '—',
      ativoCodigo: true,
      n8nWorkflowId: null,
      cron: null,
      amostraFn: '_amostraAlertaTrafego',
      podeDisparar: true,
      disparoFn: '_disparoAlerta7TrafegoAgora',
      disparoConfirma: 'Vai mandar o resumo de Tráfego AGORA no grupo "Tráfego Pago | Vero Fibra Ricardo". Confirma?'
    }
  ];
}

/**
 * Endpoint principal — consumido pelo frontend.
 * Retorna o catálogo enriquecido com status live (pra cron-based).
 */
function getAlertasOperacionais() {
  var catalogo = _alertasCatalogoEstatico_();
  var n8nStatus = _alertasN8nStatus_(catalogo);
  return catalogo.map(function (a) {
    var res = {
      id: a.id,
      numero: a.numero,
      nome: a.nome,
      icone: a.icone,
      tipo: a.tipo,
      gatilho: a.gatilho || a.cron || '—',
      gatilhoHumano: a.gatilhoHumano || a.cronHumano || '—',
      origem: a.origem,
      destinoApelido: a.destinoApelido,
      destinoHumano: a.destinoHumano,
      idempotencia: a.idempotencia,
      n8nWorkflowId: a.n8nWorkflowId,
      observacao: a.observacao || null,
      podeDisparar: !!a.podeDisparar,
      disparoConfirma: a.disparoConfirma || null,
      disparoMotivo: a.disparoMotivo || null
    };
    // Status: cron → n8n; event/manual → ativo no código
    if (a.tipo === 'cron') {
      var st = n8nStatus[a.n8nWorkflowId];
      if (st) {
        res.ativo = st.active;
        res.statusOrigem = 'n8n live';
        res.n8nNome = st.name;
      } else {
        res.ativo = null;
        res.statusOrigem = 'n8n indisponível';
      }
    } else {
      res.ativo = a.ativoCodigo !== false;
      res.statusOrigem = 'código (event-driven sempre ativo)';
    }
    return res;
  });
}

/**
 * Gera o texto de amostra real de UM alerta específico, on demand.
 * Chamado pelo botão "Gerar amostra" do card no frontend.
 */
function gerarAmostraAlertaOp(alertaId) {
  var catalogo = _alertasCatalogoEstatico_();
  var alvo = null;
  for (var i = 0; i < catalogo.length; i++) {
    if (catalogo[i].id === alertaId) { alvo = catalogo[i]; break; }
  }
  if (!alvo) return { ok: false, mensagem: 'Alerta não encontrado: ' + alertaId };

  if (alvo.amostraMsg) {
    return { ok: true, texto: alvo.amostraMsg, isPlaceholder: true };
  }
  if (!alvo.amostraFn || typeof this[alvo.amostraFn] !== 'function') {
    // Tenta resolver via globalThis (V8 GAS aceita)
    var fn = (typeof globalThis !== 'undefined') ? globalThis[alvo.amostraFn] : null;
    if (!fn) return { ok: false, mensagem: 'Função de amostra não encontrada: ' + alvo.amostraFn };
    try { return { ok: true, texto: fn() }; }
    catch (e) { return { ok: false, mensagem: e.message }; }
  }
  try {
    return { ok: true, texto: this[alvo.amostraFn]() };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

/**
 * Consulta n8n REST API pra status `active` dos workflows referenciados
 * no catálogo. Cache curto (60s) pra evitar martelar o n8n a cada
 * page-refresh. Retorna `{ workflowId: { active, name } }`.
 */
function _alertasN8nStatus_(catalogo) {
  var cache = CacheService.getScriptCache();
  var ck = 'alertas_op_n8n_status_v1';
  try {
    var hit = cache.get(ck);
    if (hit) return JSON.parse(hit);
  } catch (e) {}

  var ids = catalogo
    .filter(function (a) { return a.n8nWorkflowId; })
    .map(function (a) { return a.n8nWorkflowId; });
  var out = {};

  var apiKey = PropertiesService.getScriptProperties().getProperty('N8N_API_KEY');
  if (!apiKey) {
    Logger.log('_alertasN8nStatus_: N8N_API_KEY ausente — rodar _setN8nApiKey() no editor.');
    return out;
  }

  for (var i = 0; i < ids.length; i++) {
    try {
      var resp = UrlFetchApp.fetch(
        CFG_ALERTAS_OP.N8N_BASE_URL + '/workflows/' + ids[i],
        { method: 'get', headers: { 'X-N8N-API-KEY': apiKey }, muteHttpExceptions: true }
      );
      if (resp.getResponseCode() === 200) {
        var d = JSON.parse(resp.getContentText());
        out[ids[i]] = { active: !!d.active, name: d.name };
      }
    } catch (e) {
      Logger.log('_alertasN8nStatus_: erro em ' + ids[i] + ': ' + e.message);
    }
  }

  try { cache.put(ck, JSON.stringify(out), CFG_ALERTAS_OP.CACHE_TTL_LIVE); } catch (e) {}
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
// GERADORES DE AMOSTRA REAL (chamam as funções de produção)
// ══════════════════════════════════════════════════════════════════════════

function _amostraAlertaParcial() {
  var txt = (typeof _construirTextoParcialDoDia === 'function')
    ? _construirTextoParcialDoDia(null)
    : null;
  return txt || '[ Não foi possível gerar — _construirTextoParcialDoDia retornou null. ]';
}

function _amostraAlertaInstalacao() {
  // Pega a venda instalada mais recente
  try {
    var sheet = _getSheet();
    var c = CONFIG.COLUNAS;
    var ultRow = sheet.getLastRow();
    if (ultRow < 3) return '[ Sem vendas no histórico. ]';
    var range = sheet.getRange(3, 1, ultRow - 2, CONFIG.TOTAL_COLUNAS).getValues();
    var venda = null;
    for (var i = range.length - 1; i >= 0; i--) {
      var status = String(range[i][c.STATUS] || '').trim();
      if (status === '3 - Finalizada/Instalada') { venda = range[i]; break; }
    }
    if (!venda) return '[ Nenhuma venda em "3 - Finalizada/Instalada" encontrada. ]';
    var cliente  = String(venda[c.CLIENTE] || '').trim() || '—';
    var vendedor = String(venda[c.RESP]    || '').trim() || '—';
    var planoRaw = String(venda[c.PLANO]   || '').trim();
    var plano = planoRaw.replace(/\s*\|\s*R?\$?\s*[\d.,]+\s*$/, '').trim() || '—';
    var quando = Utilities.formatDate(new Date(), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH'h'mm");
    return '✅ Instalação concluída\n' +
           '📅 ' + quando + '\n' +
           '👤 ' + cliente + '\n' +
           '👨‍💼 Vendido por ' + vendedor + '\n' +
           '🌐 ' + plano;
  } catch (e) {
    return '[ Erro ao gerar amostra: ' + e.message + ' ]';
  }
}

function _amostraAlertaLeadMeta() {
  // Pega o último lead da aba "Leads Meta Ads"
  try {
    var ss = _getSpreadsheet_();
    var aba = ss.getSheetByName('Leads Meta Ads');
    if (!aba) return '[ Aba "Leads Meta Ads" não encontrada. ]';
    var ultRow = aba.getLastRow();
    if (ultRow < 2) return '[ Sem leads no histórico. ]';
    var lead = aba.getRange(ultRow, 1, 1, 6).getValues()[0];
    var nome = String(lead[2] || '').trim();
    var leadsHoje = _contarLeadsMetaHoje_ ? _contarLeadsMetaHoje_(aba) : 0;
    var suf = leadsHoje > 0 ? (' (#' + leadsHoje + ')') : '';
    return nome
      ? '💬 Novo Lead Meta: ' + nome + suf
      : '💬 Novo Lead Meta' + suf;
  } catch (e) {
    return '[ Erro ao gerar amostra: ' + e.message + ' ]';
  }
}

function _amostraAlertaSinoDigest() {
  // O workflow n8n chama detectarAlertasAtivos via endpoint. Replicamos local.
  try {
    if (typeof detectarAlertasAtivos !== 'function') {
      return '[ detectarAlertasAtivos indisponível. ]';
    }
    var alertas = detectarAlertasAtivos(null);
    if (!alertas || !alertas.length) return '[ Nenhum alerta ativo agora. ]';
    var hora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH:mm');
    var linhas = ['🔔 *Sino digest — ' + hora + '*', ''];
    alertas.slice(0, 8).forEach(function (a) {
      linhas.push((a.icone || '•') + ' ' + (a.titulo || a.tipo) + (a.sub ? ' · ' + a.sub : ''));
    });
    if (alertas.length > 8) linhas.push('… +' + (alertas.length - 8) + ' não mostrados');
    return linhas.join('\n');
  } catch (e) {
    return '[ Erro ao gerar amostra: ' + e.message + ' ]';
  }
}

function _amostraAlertaTrafego() {
  // Mesmo formato do enviarResumoTrafegoAgora — chama getResumoTrafegoHoje + monta
  try {
    if (typeof getResumoTrafegoHoje !== 'function') {
      return '[ getResumoTrafegoHoje indisponível. ]';
    }
    var d = getResumoTrafegoHoje();
    if (!d || d.ok === false) return '[ Resumo de tráfego indisponível. ]';
    var hora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM HH:mm');
    var inv = d.investimento || {};
    var ent = d.entrega || {};
    var res = d.resultado || {};
    var ven = d.vendas || {};
    var meta = d.meta || {};
    var campanhas = (meta.campanhas_ativas || []).slice(0, 5);
    function brl(n) { return 'R$ ' + (parseFloat(n) || 0).toFixed(2).replace('.', ','); }
    function num(n) { return String(parseInt(n) || 0); }
    function pct(n) { return ((parseFloat(n) || 0)).toFixed(1) + '%'; }
    return '📊 *Tráfego Pago — Resumo* (' + hora + ')\n' +
           '💰 Gasto hoje: ' + brl(inv.gasto_hoje) +
             (inv.previsto_dia > 0 ? ' / previsto ' + brl(inv.previsto_dia) : '') + '\n' +
           '👁 Impr: ' + num(ent.impressoes) + ' · Alcance: ' + num(ent.alcance) +
             ' · Cliques: ' + num(ent.cliques) + '\n' +
           '📈 CTR: ' + pct(ent.ctr_pct) + ' · CPC: ' + brl(ent.cpc) + '\n' +
           '🎯 Leads hoje: ' + num(res.leads_hoje) + ' · CPL: ' + brl(res.cpl) + '\n' +
           '✅ Vendas hoje: ' + num(ven.convertidas_hoje) + '\n' +
           '📣 Campanhas ativas (' + campanhas.length + '): ' + (campanhas.join(' · ') || '—') + '\n' +
           '🏦 Contas: ' + ((meta.contas || []).join(' + ') || '—');
  } catch (e) {
    return '[ Erro ao gerar amostra: ' + e.message + ' ]';
  }
}

function _amostraAlertaLeadsMetaDigest() {
  // Replica o workflow n8n Alerta 8 — formato curto.
  try {
    var ss = _getSpreadsheet_();
    var aba = ss.getSheetByName('Leads Meta Ads');
    if (!aba) return '[ Aba "Leads Meta Ads" não encontrada. ]';
    var leads = _contarLeadsMetaHoje_ ? _contarLeadsMetaHoje_(aba) : 0;
    var conv  = 0; // workflow lê de algum lugar — simplificação: mostra 0 por enquanto
    var hora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH') + 'h';
    var leadsLabel = leads + ' lead' + (leads === 1 ? '' : 's') + ' Meta';
    var convLabel  = conv  + ' convers' + (conv === 1 ? 'ão' : 'ões');
    return '📊 ' + leadsLabel + ' · ' + convLabel + ' — hoje ' + hora;
  } catch (e) {
    return '[ Erro ao gerar amostra: ' + e.message + ' ]';
  }
}

function _amostraResumoPAP() {
  // Replica o formato do botão "📩 Enviar Resumo" do Pagamentos PAP.
  // O texto é montado no frontend; aqui geramos um exemplo plausível com
  // dados reais dos últimos pagamentos via getPagamentosPAP.
  try {
    if (typeof getPagamentosPAP !== 'function') return '[ getPagamentosPAP indisponível. ]';
    var dados = getPagamentosPAP();
    var amostra = (dados.dados || []).slice(0, 3);
    if (!amostra.length) return '[ Sem pagamentos disponíveis pra amostra. ]';
    var linhas = ['💰 *Resumo de Pagamentos PAP*', ''];
    var total = 0;
    amostra.forEach(function (p) {
      linhas.push('👤 ' + (p.vendedor || '—') + ' — ' + (p.cliente || '—'));
      linhas.push('💵 R$ ' + (parseFloat(p.comissao) || 0).toFixed(2).replace('.', ','));
      linhas.push('');
      total += parseFloat(p.comissao) || 0;
    });
    linhas.push('💰 *Total: R$ ' + total.toFixed(2).replace('.', ',') + '*');
    linhas.push('📝 Qtd: ' + amostra.length + ' pagamento' + (amostra.length > 1 ? 's' : ''));
    return linhas.join('\n');
  } catch (e) {
    return '[ Erro ao gerar amostra: ' + e.message + ' ]';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// DISPARO MANUAL — endpoint público + funções por alerta
// ══════════════════════════════════════════════════════════════════════════

/**
 * Endpoint público — dispara o alerta on demand.
 * Chamado pelo botão "🚀 Disparar agora" do frontend.
 * Retorna { ok, mensagem }.
 */
function dispararAlertaOpAgora(alertaId) {
  var catalogo = _alertasCatalogoEstatico_();
  var alvo = null;
  for (var i = 0; i < catalogo.length; i++) {
    if (catalogo[i].id === alertaId) { alvo = catalogo[i]; break; }
  }
  if (!alvo) return { ok: false, mensagem: 'Alerta não encontrado: ' + alertaId };
  if (!alvo.podeDisparar) {
    return { ok: false, mensagem: alvo.disparoMotivo || 'Esse alerta não pode ser disparado manualmente.' };
  }
  if (!alvo.disparoFn) {
    return { ok: false, mensagem: 'Função de disparo não configurada no catálogo.' };
  }
  var fn = (typeof globalThis !== 'undefined') ? globalThis[alvo.disparoFn] : null;
  if (typeof fn !== 'function') {
    return { ok: false, mensagem: 'Função de disparo não encontrada: ' + alvo.disparoFn };
  }
  try {
    var res = fn();
    return res || { ok: false, mensagem: 'Função retornou vazio.' };
  } catch (e) {
    Logger.log('dispararAlertaOpAgora erro [' + alertaId + ']: ' + e.message);
    return { ok: false, mensagem: e.message };
  }
}

/**
 * Alerta 7 / Manual Tráfego — reusa enviarResumoTrafegoAgora.
 * Vai pro grupo "Tráfego Pago | Vero Fibra Ricardo" via apelido `ricardo`.
 */
function _disparoAlerta7TrafegoAgora() {
  if (typeof enviarResumoTrafegoAgora !== 'function') {
    return { ok: false, mensagem: 'enviarResumoTrafegoAgora indisponível em MetaAdsAPI.js' };
  }
  var res = enviarResumoTrafegoAgora();
  return {
    ok: !!(res && res.ok),
    mensagem: (res && res.ok)
      ? 'Resumo de Tráfego enviado pro grupo. ✅'
      : ('Falha no envio: ' + ((res && res.mensagem) || 'sem detalhes'))
  };
}

/**
 * Alerta 4 (Sino digest 8h) — replica o que o workflow nDwft1P0rXYz3Bq1 faz,
 * só que disparado on demand no horário atual.
 */
function _disparoAlerta4SinoDigestAgora() {
  var txt = _amostraAlertaSinoDigest();
  if (!txt) return { ok: false, mensagem: 'Não foi possível gerar o texto.' };
  // Se a função de amostra retornou um placeholder de erro [ ... ], aborta.
  if (txt.charAt(0) === '[') return { ok: false, mensagem: 'Texto inválido: ' + txt };
  if (typeof enviarParaGrupoWhatsApp !== 'function') {
    return { ok: false, mensagem: 'enviarParaGrupoWhatsApp indisponível.' };
  }
  var ok = enviarParaGrupoWhatsApp(txt);
  return {
    ok: !!ok,
    mensagem: ok
      ? 'Sino digest enviado pro grupo principal. ✅'
      : 'Falha no envio pro Flow 1 (ver logs do n8n / Apps Script).'
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Injeção da view (HTML servida pelo frontend)
// ══════════════════════════════════════════════════════════════════════════

function getAlertasOperacionaisHtml() {
  return HtmlService.createHtmlOutputFromFile('AlertasOp').getContent();
}
