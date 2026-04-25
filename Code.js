/*****
 * // Versao Atualizada 3.0
 * @fileoverview CRM Mobile Digital — Versão Corrigida
 * Correções aplicadas:
 * - Autenticação real no backend (validarLogin)
 * - Validação de CPF/CNPJ
 * - Busca de CEP movida para backend (UrlFetchApp)
 * - CONFIG com comentários por coluna
 * - Cache com prefixo consistente e limpeza rastreável
 * - Funções privadas com prefixo _ para clareza
 *
 * ── LOG DE ALTERAÇÕES ───────────────────────────────────────────────────
 * Atualizado em: 16/03/2026 | Auditoria: PERFIS_MENUS→Config.js, _getCidades()/_getTabela() com cache, _limparCache() unificada, LockService em salvarVenda/moverLeadAguardando/moverVendaFunil, getDashboard com cache, bug linha 3500 corrigido, doPost com webhook_secret, ternário morto removido em criarPedidoVeroHub
 * Atualizado em: 16/03/2026 | Fix: background hardcoded (#ddd) nos modais substituído por variáveis CSS
 * Atualizado em: 15/03/2026 | Fix: observacao adicionada em _construirLinhaDados (col L)
 * ────────────────────────────────────────────────────────────────────────
 */

var CONFIG = {
  SHEET_NAME:      '1 - Vendas',
  SPREADSHEET_ID:  '1H1qNgyNjmIYiZWT0wHwzANLf7yLggzYzBNVgAWCJ9lE',
  SHEET_USUARIOS:  'Usuarios',   // aba: A=usuario | B=senha | C=nome exibição
  SHEET_HISTORICO: 'Histórico',  // aba de arquivo — criada por criarAbaHistorico()
  CACHE_TTL:       300, // 5 min — era 60s; invalidado corretamente por _limparCache() após escritas
  CACHE_PREFIX:    'crm_v3_',   // prefixo v3 — invalida cache após reorganização de colunas
  MAX_RESULTS:     50,
  TOTAL_COLUNAS:   42,          // A (0) até AP (41) — sem buracos
  COLUNAS: {
    // ── Bloco 1: Venda (A–G) ────────────────────────────────────────
    CANAL:              0,  // A  - Canal de venda (PAP, META ADS, INDICAÇÃO, ATIVO, GOOGLE ADS)
    STATUS:             1,  // B  - Status do pedido
    PRE_STATUS:         2,  // C  - Pré-Status (EM NEGOCIACAO, AG DOC, etc.)
    DATA_ATIV:          3,  // D  - Data de ativação
    CONTRATO:           4,  // E  - Contrato / OS
    COD_CLI:            5,  // F  - Código do cliente no sistema Vero
    RESP:               6,  // G  - Responsável
    // ── Bloco 2: Instalação (H–L) ───────────────────────────────────
    AGENDA:             7,  // H  - Data agendamento
    TURNO:              8,  // I  - Turno da instalação
    INSTAL:             9,  // J  - Data instalação
    REAGENDAMENTOS:    10,  // K  - Contador de reagendamentos
    OBSERVACAO:        11,  // L  - Motivo Cancelamento / Observação
    // ── Bloco 3: Produto (M–S) ──────────────────────────────────────
    PRODUTO:           12,  // M  - Produto
    PLANO:             13,  // N  - Plano
    VALOR:             14,  // O  - Valor
    VENC:              15,  // P  - Vencimento
    FAT:               16,  // Q  - Pagamento/Faturamento
    LINHA_MOVEL:       17,  // R  - Linha Móvel
    PORTABILIDADE:     18,  // S  - Portabilidade (Sim/Não)
    // ── Bloco 4: Cliente (T–Z) ──────────────────────────────────────
    CLIENTE:           19,  // T  - Nome completo do cliente
    CPF:               20,  // U  - CPF ou CNPJ
    WHATS:             21,  // V  - WhatsApp
    TEL:               22,  // W  - Telefone ligação
    RG:                23,  // X  - RG
    NOME_MAE:          24,  // Y  - Nome da mãe
    DT_NASC:           25,  // Z  - Data de nascimento
    // ── Bloco 5: Endereço (AA–AI) ───────────────────────────────────
    CEP:               26,  // AA - CEP
    RUA:               27,  // AB - Logradouro
    NUM:               28,  // AC - Número
    COMPLEMENTO:       29,  // AD - Complemento
    BAIRRO:            30,  // AE - Bairro
    CIDADE:            31,  // AF - Cidade
    UF:                32,  // AG - Estado
    SISTEMA:           33,  // AH - Sistema
    SEGMENTACAO:       34,  // AI - Segmentação
    // ── Bloco 6: Automático (AJ–AP) ─────────────────────────────────
    VEROHUB:           35,  // AJ - Data blindagem VeroHub
    VEROHUB_PEDIDO:    36,  // AK - Número do pedido VeroHub
    VEROHUB_PEDIDO_DT: 37,  // AL - Data/hora do pedido VeroHub
    STATUS_PAP:        38,  // AM - Status Pagamento PAP
    BC_TAGS:           39,  // AN - BotConversa etiquetas (separadas por ' | ')
    BC_STATUS:         40,  // AO - BotConversa status atendimento (Aberto/Concluído)
    VIABILIDADE:       41   // AP - Resultado da consulta de viabilidade VeroHub
  }
};

// Fonte única da verdade para status — usada em validação no backend
var STATUS_LIST = [
  '1- Conferencia/Ativação',
  '2- Aguardando Instalação',
  '2- Aguardando Entrega',
  '3 - Finalizada/Instalada',
  '3- Aguardando Retirada',
  '4- Entregue',
  '5 - Finalizado',
  'Pendencia Vero',
  'Cancelado',
  'Cancelamento Técnico',
  'Cancelamento Comercial',
  'Churn',
  'Devolvido'
];





// ── MENSAGEM DO SISTEMA ───────────────────────────────────────────────────
// ============================================================================
// CONTEXTO 1 - CRM CENTRAL
// Busca, listagens, CRUD, views e rotas principais.
// ============================================================================
// Suspeita: helper legado sem uso claro na UI atual. Mantido por seguranca.
function getMensagemSistema() {
  try {
    return (typeof MENSAGEM_SISTEMA !== 'undefined') ? String(MENSAGEM_SISTEMA).trim() : '';
  } catch(e) { return ''; }
}

// ── BUSCA GLOBAL ──────────────────────────────────────────────────────────
// Busca por CPF (com ou sem formatação), nome parcial ou número de contrato
function buscarVendaGlobal(termo) {
  try {
    if (!termo || String(termo).trim().length < 2) return { dados: [], total: 0 };
    var sheet = _getSheet();
    var ult   = sheet.getLastRow();
    if (ult < 3) return { dados: [], total: 0 };
    var raw   = sheet.getRange(3, 1, ult - 2, CONFIG.TOTAL_COLUNAS).getValues();

    // normaliza o termo: remove pontos, traços, espaços extras, minúsculas
    var t     = String(termo).trim().toLowerCase();
    var tNum  = t.replace(/[^0-9]/g, ''); // só dígitos para comparar CPF

    var result = [];
    for (var i = raw.length - 1; i >= 0; i--) {
      var row     = raw[i];
      var cliente = String(row[CONFIG.COLUNAS.CLIENTE] || '').toLowerCase();
      var cpfRaw  = String(row[CONFIG.COLUNAS.CPF]     || '');
      var cpfNum  = cpfRaw.replace(/[^0-9]/g, '');
      var contrato= String(row[CONFIG.COLUNAS.CONTRATO]|| '').toLowerCase();
      if (!cliente && !cpfRaw) continue;

      var match = cliente.indexOf(t) > -1 ||
                  contrato.indexOf(t) > -1 ||
                  (tNum.length >= 3 && cpfNum.indexOf(tNum) > -1);
      if (!match) continue;
      result.push(_mapearLinha(row, i + 3));
      if (result.length >= 20) break; // máx 20 resultados
    }
    return { dados: result, total: result.length };
  } catch(e) {
    return { dados: [], total: 0, erro: e.message };
  }
}


// ── DOCUMENTOS — Google Drive ─────────────────────────────────────────────
var DOCS_FOLDER_ID = '1D3A5SbdXFjvzsTgp5Sthm_-zB531uGoR';

// ============================================================================
// CONTEXTO 1.1 - DOCUMENTOS E GOOGLE DRIVE
// ============================================================================
function getArquivosDrive() {
  try {
    var _forcarEscopo = DriveApp.getRootFolder(); // força escopo no token
    var token = ScriptApp.getOAuthToken();
    var url   = 'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent('"' + DOCS_FOLDER_ID + '" in parents and trashed=false') +
      '&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,owners)' +
      '&orderBy=name' +
      '&pageSize=100';

    var resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    if (code !== 200) {
      return { arquivos: [], erro: 'Erro HTTP ' + code + ': ' + resp.getContentText() };
    }

    var data     = JSON.parse(resp.getContentText());
    var arquivos = (data.files || []).map(function(f) {
      return {
        name:         f.name,
        mimeType:     f.mimeType,
        size:         parseInt(f.size) || 0,
        modifiedTime: f.modifiedTime || '',
        webViewLink:  f.webViewLink  || '',
        owner:        (f.owners && f.owners[0]) ? f.owners[0].displayName : ''
      };
    });

    return { arquivos: arquivos };
  } catch(e) {
    return { arquivos: [], erro: e.message };
  }
}


// ── FORÇAR AUTORIZAÇÃO DO DRIVE ───────────────────────────────────────────
// Execute esta função UMA VEZ manualmente no editor do Apps Script
// (menu Executar → autorizarDrive) para conceder permissão ao Drive
// Suspeita: rotina manual de setup/suporte. Nao chamada pela UI principal.
function autorizarDrive() {
  // Esta linha força o GAS a incluir o escopo do Drive no token OAuth
  var _forcarEscopo = DriveApp.getRootFolder();
  try {
    var token = ScriptApp.getOAuthToken();
    var url   = 'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent('"1D3A5SbdXFjvzsTgp5Sthm_-zB531uGoR" in parents and trashed=false') +
      '&pageSize=5&fields=files(name)';
    var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    var data = JSON.parse(resp.getContentText());
    Logger.log('✅ OK! Arquivos encontrados: ' + (data.files || []).length);
    Logger.log(JSON.stringify(data.files));
  } catch(e) {
    Logger.log('❌ Erro: ' + e.message);
  }
}


// ── ARQUIVAR VENDA — copia dados para aba "Arquivo" e limpa a linha ──────
function arquivarVenda(linha) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(le) {
    return { sucesso: false, mensagem: '⚠️ Sistema ocupado. Tente novamente.' };
  }
  try {
    linha = parseInt(linha);
    if (!linha || linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };

    var sheet = _getSheet();
    var ult   = sheet.getLastRow();
    if (linha > ult) return { sucesso: false, mensagem: 'Linha não encontrada.' };

    var c = CONFIG.COLUNAS;
    var row = sheet.getRange(linha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];

    // Dados para a aba Arquivo
    var nome  = row[c.CLIENTE] || '';
    var cpf   = row[c.CPF]    || '';
    var whats = row[c.WHATS]  || '';
    var plano = row[c.PLANO]  || '';
    var valor = row[c.VALOR]  || '';
    var tz    = Session.getScriptTimeZone();
    var dataExclusao = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');

    // Grava na aba Arquivo
    var ss = _getSpreadsheet_();
    var abaArquivo = ss.getSheetByName('Arquivo');
    if (!abaArquivo) {
      abaArquivo = ss.insertSheet('Arquivo');
      abaArquivo.getRange(1, 1, 1, 6).setValues([['NOME', 'CPF', 'WHATSAPP', 'PLANO', 'VALOR', 'DATA DE EXCLUSÃO']]);
      abaArquivo.getRange(1, 1, 1, 6).setFontWeight('bold');
    }
    abaArquivo.appendRow([nome, cpf, whats, plano, valor, dataExclusao]);

    // Remove a linha da aba principal (sem deixar buraco)
    sheet.deleteRow(linha);

    // Limpa cache
    _limparCache();

    Logger.log('Venda arquivada: linha=' + linha + ' | cliente=' + nome);
    return { sucesso: true, mensagem: '✅ Venda de ' + nome + ' arquivada com sucesso!' };
  } catch(e) {
    Logger.log('Erro em arquivarVenda: ' + e);
    return { sucesso: false, mensagem: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Mantém compatibilidade com código antigo
function excluirVenda(linha) {
  return arquivarVenda(linha);
}


// ── VEROHUB — salva data de blindagem na col VEROHUB ────────────────────
// ============================================================================
// CONTEXTO 1.2 - VEROHUB E INTEGRACOES OPERACIONAIS
// ============================================================================
function salvarVeroHub(linha, data) {
  try {
    linha = parseInt(linha);
    if (!linha || linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };
    var sheet = _getSheet();
    sheet.getRange(linha, CONFIG.COLUNAS.VEROHUB + 1).setValue(data || '');
    _limparCacheListaCompleta();
    return { sucesso: true };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  }
}


// ── AGENDAMENTO — salva data de agendamento na col H ────────────────────
// salvarAgendamento mantido para compatibilidade — redireciona para versão com contador
function salvarAgendamento(linha, data) {
  return salvarAgendamentoComContador(linha, data);
}


// ── VEROHUB PEDIDO — salva data manual na col VEROHUB ──────────────────
function salvarVeroHubPedidoManual(linha, data) {
  try {
    linha = parseInt(linha);
    if (!linha || linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };
    var tz = Session.getScriptTimeZone();
    var horaEdit = Utilities.formatDate(new Date(), tz, 'HH:mm');
    var sheet = _getSheet();
    sheet.getRange(linha, CONFIG.COLUNAS.VEROHUB + 1).setValue(data || '');
    _limparCacheListaCompleta();
    return { sucesso: true, horaEdit: horaEdit };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  }
}

// ── TURNO — salva turno na col TURNO ────────────────────────────────────
function salvarTurno(linha, turno) {
  try {
    linha = parseInt(linha);
    if (!linha || linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };
    var sheet = _getSheet();
    sheet.getRange(linha, CONFIG.COLUNAS.TURNO + 1).setValue(turno || '');
    _limparCacheListaCompleta();
    return { sucesso: true };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  }
}

// ── AGENDAMENTO — salva data + incrementa contador de reagendamentos ────
function salvarAgendamentoComContador(linha, data) {
  try {
    linha = parseInt(linha);
    if (!linha || linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };
    var sheet = _getSheet();

    var c = CONFIG.COLUNAS;
    // Lê agenda anterior — pode ser Date ou string
    var agendaRaw = sheet.getRange(linha, c.AGENDA + 1).getValue();
    var tinhaAgenda = false;
    if (agendaRaw) {
      if (agendaRaw instanceof Date) {
        tinhaAgenda = !isNaN(agendaRaw.getTime());
      } else {
        tinhaAgenda = String(agendaRaw).trim() !== '';
      }
    }

    // Grava nova data
    sheet.getRange(linha, c.AGENDA + 1).setValue(data || '');

    // Contador de reagendamentos
    var contAtual = parseInt(sheet.getRange(linha, c.REAGENDAMENTOS + 1).getValue()) || 0;
    if (tinhaAgenda && data) {
      contAtual = contAtual + 1;
      sheet.getRange(linha, c.REAGENDAMENTOS + 1).setValue(contAtual);
    }

    _limparCacheListaCompleta();
    return { sucesso: true, reagendamentos: contAtual };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  }
}


// ── VEROHUB — salva número e data/hora do pedido ────────────────────────
function salvarPedidoVeroHub(linha, numeroPedido, dataHoraPedido) {
  try {
    linha = parseInt(linha);
    if (!linha || linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };
    if (!dataHoraPedido) {
      var tz = Session.getScriptTimeZone();
      dataHoraPedido = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
    }
    var c = CONFIG.COLUNAS;
    var sheet = _getSheet();
    sheet.getRange(linha, c.VEROHUB_PEDIDO    + 1).setValue(numeroPedido   || '');
    sheet.getRange(linha, c.VEROHUB_PEDIDO_DT + 1).setValue(dataHoraPedido || '');
    _limparCacheListaCompleta();
    return { sucesso: true, numeroPedido: numeroPedido, dataHoraPedido: dataHoraPedido };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  }
}



// ── VEROHUB — retorna URL base do script ─────────────────────────────────────
function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

// ── VEROHUB — salvar/ler token de autenticação ───────────────────────────────
function salvarTokenVeroHub(token) {
  try {
    if (!token || String(token).trim().length < 10)
      return { sucesso: false, mensagem: 'Token inválido.' };
    PropertiesService.getUserProperties().setProperty('verohub_bearer_token', String(token).trim());
    return { sucesso: true };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  }
}

function getStatusTokenVeroHub() {
  try {
    var token = PropertiesService.getUserProperties().getProperty('verohub_bearer_token') || '';
    return { token: token ? token.substring(0,10) + '...' : '', configurado: token.length > 10 };
  } catch(e) {
    return { configurado: false, token: '' };
  }
}

function _getTokenVeroHub() {
  return PropertiesService.getUserProperties().getProperty('verohub_bearer_token') || '';
}


// ── VEROHUB — cria novo pedido via UrlFetchApp (sem CORS) ────────────────────
// Recebe: { linha, csrfToken, nome, phone, cpf, emailPfx }
// O csrfToken é capturado pelo browser e passado aqui para autenticar os requests
function criarPedidoVeroHub(dados) {
  try {
    var linha     = parseInt(dados.linha);
    var csrf      = String(dados.csrfToken || _getTokenVeroHub() || '').trim();
    var nome      = String(dados.nome      || '').trim();
    var phone     = String(dados.phone     || '').replace(/\D/g, '');
    var cpf       = String(dados.cpf       || '').replace(/\D/g, '');
    var emailPfx  = String(dados.emailPfx  || cpf || 'cliente').trim();

    if (!csrf)  return { sucesso: false, mensagem: 'CSRF token ausente. Faça login no VeroHub.' };
    if (!nome)  return { sucesso: false, mensagem: 'Nome do cliente não informado.' };
    if (!phone) return { sucesso: false, mensagem: 'Telefone não informado.' };

    var BASE    = 'https://hub.veronet.com.br';
    var headers = {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf
    };
    var opts = { muteHttpExceptions: true, headers: headers };

    // ── 1. Duplicar ou criar novo pedido ──────────────────────────────────
    var bodyLead = JSON.stringify({
      name:                nome,
      phone:               phone,
      email_prefix:        emailPfx,
      custom_email_domain: 'gmail.com',
      seller_id:           335
    });
    var r1 = UrlFetchApp.fetch(BASE + '/api/sales',
      Object.assign({}, opts, { method: 'post', payload: bodyLead })
    );
    var d1 = JSON.parse(r1.getContentText());
    var novoId = d1.id;
    if (!novoId) return { sucesso: false, mensagem: 'Falha ao criar pedido: ' + r1.getContentText().substring(0, 200) };

    // ── 2. create_lead ────────────────────────────────────────────────────
    UrlFetchApp.fetch(BASE + '/api/sales/create_lead/' + novoId,
      Object.assign({}, opts, { method: 'put', payload: '{}' }));

    // ── 3. Confirmar endereço ─────────────────────────────────────────────
    UrlFetchApp.fetch(BASE + '/api/sales/' + novoId,
      Object.assign({}, opts, { method: 'put', payload: '{}' }));

    // ── 4. Confirmar plano ────────────────────────────────────────────────
    UrlFetchApp.fetch(BASE + '/api/sales/' + novoId + '/update_plan',
      Object.assign({}, opts, { method: 'put', payload: '{}' }));

    // ── 5. Dados pessoais ─────────────────────────────────────────────────
    if (cpf) {
      UrlFetchApp.fetch(BASE + '/api/sales/' + novoId + '/update_personal_data_pf',
        Object.assign({}, opts, { method: 'put', payload: JSON.stringify({ cpf: cpf }) }));
    }

    // ── 6. Análise de crédito ─────────────────────────────────────────────
    UrlFetchApp.fetch(BASE + '/api/sale/' + novoId + '/credit_analisys',
      Object.assign({}, opts, { method: 'post', payload: '{}' }));

    // ── 7. Salvar na planilha ─────────────────────────────────────────────
    var tz     = Session.getScriptTimeZone();
    var agora  = new Date();
    var dtHora = Utilities.formatDate(agora, tz, 'dd/MM/yyyy HH:mm');

    if (linha >= 3) {
      var c = CONFIG.COLUNAS;
      var sheet = _getSheet();
      sheet.getRange(linha, c.VEROHUB_PEDIDO    + 1).setValue(String(novoId));
      sheet.getRange(linha, c.VEROHUB_PEDIDO_DT + 1).setValue(dtHora);
      _limparCacheListaCompleta();
    }

    return {
      sucesso:         true,
      numeroPedido:    String(novoId),
      dataHoraPedido:  dtHora
    };

  } catch(e) {
    Logger.log('Erro criarPedidoVeroHub: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}


// ── VEROHUB — salva resultado de viabilidade na linha da venda ───────────────
// Recebe: linha (int), viabilidade (string), network (string)
function salvarViabilidadeVenda(linha, viabilidade, network) {
  try {
    linha = parseInt(linha);
    if (linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };
    var valor = String(viabilidade || '').trim();
    if (network) valor += ' | ' + String(network).trim();
    _getSheet().getRange(linha, CONFIG.COLUNAS.VIABILIDADE + 1).setValue(valor);
    _limparCacheListaCompleta();
    return { sucesso: true };
  } catch(e) {
    Logger.log('Erro salvarViabilidadeVenda: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}


// ── VEROHUB — consulta viabilidade de endereço (sem criar pedido) ────────────
// Recebe: { cep, numero, csrfToken? }
// Retorna: { sucesso, viabilidade, network, detalhes }
function consultarViabilidadeVero(dados) {
  try {
    var cep    = String(dados.cep    || '').replace(/\D/g, '');
    var numero = String(dados.numero || '').trim();
    var csrf   = String(dados.csrfToken || _getTokenVeroHub() || '').trim();

    if (!csrf)   return { sucesso: false, mensagem: 'CSRF token ausente. Faça login no VeroHub.' };
    if (cep.length !== 8) return { sucesso: false, mensagem: 'CEP inválido. Informe 8 dígitos.' };
    if (!numero) return { sucesso: false, mensagem: 'Número do endereço não informado.' };

    var BASE    = 'https://hub.veronet.com.br';
    var headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
    var opts    = { muteHttpExceptions: true, headers: headers, method: 'get' };

    var endpoint = BASE + '/api/check_availability/zipcode/' + cep + '/' + encodeURIComponent(numero);
    var r = UrlFetchApp.fetch(endpoint, opts);
    var body = r.getContentText();

    if (r.getResponseCode() !== 200) {
      return { sucesso: false, mensagem: 'Erro ao consultar viabilidade (HTTP ' + r.getResponseCode() + ').' };
    }

    var d = JSON.parse(body);

    // Interpreta o resultado — estrutura baseada no frontend do VeroHub
    var aprovada   = false;
    var network    = '';
    var detalhes   = d;

    if (d.viability) {
      aprovada = !!(d.viability.availability || d.viability.mpe_availability);
      network  = d.viability.availability_message || d.availability_message || '';
    } else if (d.hasOwnProperty('availability')) {
      aprovada = !!d.availability;
      network  = d.availability_message || d.network || '';
    }

    return {
      sucesso:     true,
      viabilidade: aprovada ? 'Aprovada' : 'Reprovada',
      network:     network,
      detalhes:    detalhes
    };

  } catch(e) {
    Logger.log('Erro consultarViabilidadeVero: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}


// ── ADAPTER — consulta status de instalação no Vero Adapter ────────────────
// A consulta roda no browser do usuário (VPN necessária).
// O backend só salva credenciais e atualiza a planilha.

function salvarCredenciaisAdapter(user, pass) {
  PropertiesService.getScriptProperties().setProperties({
    'adapter_user': String(user),
    'adapter_pass': String(pass)
  });
  return { sucesso: true };
}

function getCredenciaisAdapter() {
  var props = PropertiesService.getScriptProperties();
  var user  = props.getProperty('adapter_user') || '';
  var pass  = props.getProperty('adapter_pass') || '';
  if (!user) return { sucesso: false };
  return { sucesso: true, user: user, pass: pass };
}

// Atualiza a venda na planilha após confirmação do usuário
function atualizarVendaComAdapter(dados) {
  try {
    var linha = parseInt(dados.linha);
    if (linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };

    var sheet = _getSheet();

    if (dados.instalada) {
      sheet.getRange(linha, CONFIG.COLUNAS.STATUS + 1).setValue('3 - Finalizada/Instalada');
      if (dados.dataInstalacao) {
        sheet.getRange(linha, CONFIG.COLUNAS.INSTAL + 1).setValue(dados.dataInstalacao);
      }
    }
    if (dados.dataAgendamento) {
      sheet.getRange(linha, CONFIG.COLUNAS.AGENDA + 1).setValue(dados.dataAgendamento);
    }

    _limparCacheListaCompleta();

    // Notificação PAP quando instalação confirmada
    if (dados.instalada) {
      try {
        var c      = CONFIG.COLUNAS;
        var rowPAP = sheet.getRange(linha, 1, 1, c.CLIENTE + 1).getValues()[0];
        if (rowPAP[c.CANAL] === 'PAP') {
          var vPAP = _papBuscarSubscriberVendedor(null, rowPAP[c.RESP]);
          if (vPAP && vPAP.subscriberId) {
            _papNotificarVendedorPAP('instalada', vPAP.subscriberId, {
              pap_nome_cliente: String(rowPAP[c.CLIENTE] || ''),
              pap_plano:        String(rowPAP[c.PLANO]   || ''),
              pap_status:       '3 - Finalizada/Instalada'
            });
          }
        }
      } catch(ne) { Logger.log('atualizarVendaComAdapter notif: ' + ne.message); }
    }

    return { sucesso: true };
  } catch(e) {
    Logger.log('Erro atualizarVendaComAdapter: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}


// ── NG BILLING — consulta status de instalação no NG (Wing Framework) ──────
// Mesma lógica do Adapter: backend salva credenciais, extensão faz a consulta.

function salvarCredenciaisNG(user, pass) {
  PropertiesService.getScriptProperties().setProperties({
    'ng_user': String(user),
    'ng_pass': String(pass)
  });
  return { sucesso: true };
}

function getCredenciaisNG() {
  var props = PropertiesService.getScriptProperties();
  var user  = props.getProperty('ng_user') || '';
  var pass  = props.getProperty('ng_pass') || '';
  if (!user) return { sucesso: false };
  return { sucesso: true, user: user, pass: pass };
}

function atualizarVendaComNG(dados) {
  try {
    var linha = parseInt(dados.linha);
    if (linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };

    var sheet = _getSheet();

    if (dados.instalada) {
      sheet.getRange(linha, CONFIG.COLUNAS.STATUS + 1).setValue('3 - Finalizada/Instalada');
      if (dados.dataInstalacao) {
        sheet.getRange(linha, CONFIG.COLUNAS.INSTAL + 1).setValue(dados.dataInstalacao);
      }
    }
    if (dados.dataAgendamento) {
      sheet.getRange(linha, CONFIG.COLUNAS.AGENDA + 1).setValue(dados.dataAgendamento);
    }

    _limparCacheListaCompleta();

    // Notificação PAP quando instalação confirmada
    if (dados.instalada) {
      try {
        var c      = CONFIG.COLUNAS;
        var rowPAP = sheet.getRange(linha, 1, 1, c.CLIENTE + 1).getValues()[0];
        if (rowPAP[c.CANAL] === 'PAP') {
          var vPAP = _papBuscarSubscriberVendedor(null, rowPAP[c.RESP]);
          if (vPAP && vPAP.subscriberId) {
            _papNotificarVendedorPAP('instalada', vPAP.subscriberId, {
              pap_nome_cliente: String(rowPAP[c.CLIENTE] || ''),
              pap_plano:        String(rowPAP[c.PLANO]   || ''),
              pap_status:       '3 - Finalizada/Instalada'
            });
          }
        }
      } catch(ne) { Logger.log('atualizarVendaComNG notif: ' + ne.message); }
    }

    return { sucesso: true };
  } catch(e) {
    Logger.log('Erro atualizarVendaComNG: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}


// ── SINCRONIZAÇÃO INICIAL — vendas p1 + contratos numa só chamada ─────────
function getSincronizacaoInicial() {
  try {
    var sheet  = _getSheet();
    var ultima = sheet.getLastRow();
    var total  = ultima - 2;
    var tz     = Session.getScriptTimeZone();
    if (total <= 0) return { vendas: { dados: [], total: 0 }, contratos: [] };
    var raw = sheet.getRange(3, 1, total, CONFIG.TOTAL_COLUNAS).getValues();

    // ── Contratos (para Cruzamento Vero) ─────────────────────────────────
    var contratos = [];
    for (var i = 0; i < raw.length; i++) {
      var r  = raw[i];
      var ct = String(r[6] || '').trim().replace(/\.0$/, '');
      if (!ct) continue;
      var fmtD = function(v) {
        if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        if (typeof v === 'number') { var d = new Date(Math.round((v-25569)*86400*1000)); return isNaN(d)?'':Utilities.formatDate(d,tz,'yyyy-MM-dd'); }
        return String(v||'');
      };
      contratos.push({ linha: i+3, contrato: ct, status: String(r[2]||'').trim(),
        cliente: String(r[14]||'').trim(), produto: String(r[1]||'').trim(),
        dataAtiv: fmtD(r[3]), instal: fmtD(r[9]) });
    }

    // ── Vendas com mapper leve — apenas as últimas 500 linhas (sort desc) ──
    // Coleta todas as linhas com dado (para calcular totalGeral)
    var todasVendas = [];
    for (var j = 0; j < raw.length; j++) {
      var row = raw[j];
      var cli = row[CONFIG.COLUNAS.CLIENTE] ? String(row[CONFIG.COLUNAS.CLIENTE]) : '';
      var cpf = row[CONFIG.COLUNAS.CPF]     ? String(row[CONFIG.COLUNAS.CPF])     : '';
      var ctr = row[CONFIG.COLUNAS.CONTRATO]? String(row[CONFIG.COLUNAS.CONTRATO]).trim().replace(/\.0$/,'') : '';
      if (!cli && !cpf && !ctr) continue;
      todasVendas.push(j + 3); // guarda somente o número da linha por enquanto
    }

    // Sort desc: linha maior = registro mais recente = aparece primeiro
    todasVendas.sort(function(a, b) { return b - a; });
    var totalGeral = todasVendas.length;

    // Mapeia somente as primeiras 500 (as mais recentes)
    var vendas    = [];
    var limiteSync = 500;
    var temMaisSync = totalGeral > limiteSync;
    var linhasParaMapear = todasVendas.slice(0, limiteSync);
    for (var v = 0; v < linhasParaMapear.length; v++) {
      var idxRaw = linhasParaMapear[v] - 3; // converte linha sheet → índice array (base 0)
      vendas.push(_mapearLinhaLista(raw[idxRaw], linhasParaMapear[v], tz));
    }

    // Aquece o cache do servidor — próxima abertura da Lista já é instantânea
    try { _cachePutChunked(CONFIG.CACHE_PREFIX + 'lista_v3', { dados: vendas, totalGeral: totalGeral, temMais: temMaisSync }, 300); } catch(ce) {}

    Logger.log('getSincronizacaoInicial: ' + vendas.length + ' vendas (de ' + totalGeral + '), ' + contratos.length + ' contratos');

    return { vendas: { dados: vendas, total: vendas.length, totalGeral: totalGeral, temMais: temMaisSync }, contratos: contratos };
  } catch(e) {
    Logger.log('getSincronizacaoInicial ERRO: ' + e.message);
    return { vendas: { dados: [], total: 0 }, contratos: [], erro: e.message };
  }
}

// ── CRUZAMENTO VERO — retorna só contrato+status de toda a planilha ──────────
// ─── CRUZAMENTO VERO — retorna só contrato+status de toda a planilha ──────────
function getContratosParaCruzamento() {
  try {
    var sheet = _getSheet();
    var ultima = sheet.getLastRow();
    
    Logger.log('getContratosParaCruzamento: última linha = ' + ultima);
    
    if (ultima < 3) {
      Logger.log('getContratosParaCruzamento: planilha vazia');
      return { dados: [] };
    }

    var total = ultima - 2;
    var raw   = sheet.getRange(3, 1, total, CONFIG.TOTAL_COLUNAS).getValues();

    var tz   = Session.getScriptTimeZone();
    var dados = [];

    Logger.log('getContratosParaCruzamento: processando ' + raw.length + ' linhas');

    var c = CONFIG.COLUNAS;
    for (var i = 0; i < raw.length; i++) {
      var row = raw[i];

      var contratoRaw = row[c.CONTRATO];
      var contrato = String(contratoRaw || '').trim().replace(/\.0$/, '');
      if (!contrato) continue;

      var status  = String(row[c.STATUS]  || '').trim();
      var cliente = String(row[c.CLIENTE] || '').trim();
      var produto = String(row[c.PRODUTO] || '').trim();

      var dAtivRaw = row[c.DATA_ATIV];
      var dataAtiv = '';
      if (dAtivRaw instanceof Date && !isNaN(dAtivRaw)) {
        dataAtiv = Utilities.formatDate(dAtivRaw, tz, 'yyyy-MM-dd');
      } else if (typeof dAtivRaw === 'number') {
        // Converte serial do Excel para data
        var d = new Date(Math.round((dAtivRaw - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) {
          dataAtiv = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
        }
      } else {
        dataAtiv = String(dAtivRaw || '');
      }
      
      var dInstalRaw = row[c.INSTAL];
      var instal = '';
      if (dInstalRaw instanceof Date && !isNaN(dInstalRaw)) {
        instal = Utilities.formatDate(dInstalRaw, tz, 'yyyy-MM-dd');
      } else if (typeof dInstalRaw === 'number') {
        var d = new Date(Math.round((dInstalRaw - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) {
          instal = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
        }
      } else {
        instal = String(dInstalRaw || '');
      }

      dados.push({
        linha:    i + 3,
        contrato: contrato,
        status:   status,
        cliente:  cliente,
        produto:  produto,
        dataAtiv: dataAtiv,
        instal:   instal
      });
    }

    Logger.log('getContratosParaCruzamento: retornando ' + dados.length + ' contratos');
    
    // Log dos primeiros 3 registros para debug
    if (dados.length > 0) {
      Logger.log('Exemplo 1: ' + JSON.stringify(dados[0]));
      if (dados.length > 1) Logger.log('Exemplo 2: ' + JSON.stringify(dados[1]));
      if (dados.length > 2) Logger.log('Exemplo 3: ' + JSON.stringify(dados[2]));
    }

    return { dados: dados };
    
  } catch(e) {
    Logger.log('getContratosParaCruzamento ERRO: ' + e.message + ' | Stack: ' + e.stack);
    return { dados: [], erro: e.message };
  }
}

// ============================================================================
// CONTEXTO 1.3 - ROTAS WEB E ENTRADA DO APP
// ============================================================================
function doGet(e) {
  // Receber token via URL (?vhtoken=...) — salva e carrega o DharmaPro com flag
  var vhOk = 'false';
  if (e && e.parameter && e.parameter.vhtoken) {
    var token = String(e.parameter.vhtoken).trim();
    if (token.length > 10) {
      PropertiesService.getUserProperties().setProperty('verohub_bearer_token', token);
      vhOk = 'true';
    }
  }

  // View mobile — servida quando ?view=mobile está na URL
  var view = (e && e.parameter && e.parameter.view) ? e.parameter.view : '';

  // ── PWA: Manifest (Android/Chrome) ────────────────────────────────────────
  // Acessado automaticamente pelo browser ao carregar Mobile.html.
  // Permite instalar o CRM como app na tela inicial do celular.
  if (view === 'manifest') {
    var appUrl = ScriptApp.getService().getUrl();
    var manifest = {
      name: 'DharmaPro CRM',
      short_name: 'DharmaPro',
      description: 'CRM interno da equipe',
      start_url: appUrl + '?view=mobile',
      display: 'standalone',
      background_color: '#0d0f14',
      theme_color: '#0d0f14',
      orientation: 'portrait-primary',
      lang: 'pt-BR',
      icons: [
        {
          src: 'https://ui-avatars.com/api/?name=DP&background=141720&color=e63e6d&size=192&bold=true&format=png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: 'https://ui-avatars.com/api/?name=DP&background=141720&color=e63e6d&size=512&bold=true&format=png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    };
    return ContentService
      .createTextOutput(JSON.stringify(manifest))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── Área do Parceiro PAP ──────────────────────────────────────────────────
  if (view === 'parceiros') {
    return HtmlService.createTemplateFromFile('Parceiros')
      .evaluate()
      .setTitle('Área do Parceiro')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  }

  if (view === 'mobile') {
    // Login server-side: valida credenciais no doGet e injeta userData no template.
    // Elimina dependência de google.script.run para autenticação no browser mobile.
    var mUser = (e && e.parameter && e.parameter.u) ? String(e.parameter.u).trim() : '';
    var mPass = (e && e.parameter && e.parameter.p) ? String(e.parameter.p) : '';

    var mAuth = { autorizado: false, mensagem: '' };
    if (mUser && mPass) {
      try { mAuth = validarLogin(mUser, mPass); }
      catch(ex) { mAuth = { autorizado: false, mensagem: 'Erro interno. Tente novamente.' }; }
    }

    var initUser;
    if (mAuth.autorizado) {
      initUser = JSON.stringify({
        autorizado: true,
        nome:    mAuth.nome    || mUser,
        foto:    mAuth.foto    || '',
        perfil:  mAuth.perfil  || 'backoffice',
        menus:   mAuth.menus   || [],
        usuario: mUser
      });
    } else {
      initUser = JSON.stringify({
        autorizado: false,
        mensagem: (mUser || mPass) ? (mAuth.mensagem || 'Credenciais inválidas.') : ''
      });
    }

    // Injeta dados do dashboard no template para abertura instantânea.
    // getDashboard é cache hit (warmup mantém quente) — retorna em <200ms.
    // Se não houver cache ainda, retorna '{}' e o mobile fará a chamada normal.
    var initDash = '{}';
    if (mAuth.autorizado) {
      try {
        var hoje   = new Date();
        var dashData = getDashboard(hoje.getMonth() + 1, hoje.getFullYear());
        if (dashData && !dashData.erro) initDash = JSON.stringify(dashData);
      } catch(de) { /* silencioso — fallback para chamada normal no client */ }
    }

    var tmpl = HtmlService.createTemplateFromFile('Mobile');
    tmpl.initUser = initUser;
    tmpl.initDash = initDash;
    return tmpl.evaluate()
      .setTitle('DharmaPro Mobile')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  }

  // Página principal desktop — sem template variables (VH_OK é lido da URL pelo JS)
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CRM - Mobile Digital')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Página HTML de captura do token VeroHub
// Acessada via ?page=token — roda no browser do usuário,
// faz fetch do VeroHub (tem o cookie!), exibe o token para copiar
// Suspeita: legado sem rota ativa no doGet atual. Validar antes de remover.
function _getTokenPageHtml() {
  return '<!DOCTYPE html><html><head>' +
  '<meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>VeroHub — Conectar DharmaPro</title>' +
  '<style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:sans-serif;background:#0d0f14;color:#e4e8f5;' +
      'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}' +
    '.card{background:#141720;border:1px solid #252a3a;border-radius:16px;' +
      'padding:32px;width:100%;max-width:480px;text-align:center}' +
    '.logo{font-size:40px;margin-bottom:16px}' +
    'h1{font-size:20px;font-weight:800;margin-bottom:6px}' +
    'p{font-size:13px;color:#7a82a0;margin-bottom:24px;line-height:1.6}' +
    '.spinner{width:44px;height:44px;border:3px solid #252a3a;' +
      'border-top-color:#e63e6d;border-radius:50%;' +
      'animation:spin .8s linear infinite;margin:0 auto 16px}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '.token-box{background:#1c2030;border:1px solid #353d58;border-radius:10px;' +
      'padding:14px 16px;font-family:monospace;font-size:12px;' +
      'color:#4f9eff;word-break:break-all;margin-bottom:16px;text-align:left}' +
    '.btn{display:block;width:100%;padding:13px;background:#e63e6d;' +
      'border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:700;' +
      'cursor:pointer;transition:background .15s}' +
    '.btn:hover{background:#c73260}' +
    '.btn-secondary{background:transparent;border:1px solid #252a3a;' +
      'color:#7a82a0;margin-top:10px}' +
    '.btn-secondary:hover{background:#1c2030;color:#e4e8f5}' +
    '.ok{color:#22d98a;font-size:28px;margin-bottom:12px}' +
    '.err{color:#e63e6d}' +
    '.step{font-size:11px;color:#7a82a0;font-family:monospace;margin-bottom:20px}' +
  '</style></head><body>' +
  '<div class="card" id="card">' +
    '<div class="logo">🟠</div>' +
    '<h1>Conectar VeroHub</h1>' +
    '<p>Esta página captura automaticamente seu token de acesso ao VeroHub.</p>' +
    '<div class="spinner" id="spin"></div>' +
    '<p id="msg">Conectando ao VeroHub...</p>' +
  '</div>' +
  '<script>' +
  '(function(){' +
    'var card=document.getElementById("card");' +
    'var msg=document.getElementById("msg");' +
    'var spin=document.getElementById("spin");' +
    // Fazer fetch do VeroHub com credenciais (cookie de sessão)
    'fetch("https://hub.veronet.com.br/sales/new",{credentials:"include"})' +
    '.then(function(r){' +
      'if(r.url.indexOf("login")>-1||r.status===401||r.status===403)' +
        'throw new Error("Você não está logado no VeroHub. Faça login e tente novamente.");' +
      'return r.text();' +
    '})' +
    '.then(function(html){' +
      'var m=html.match(/id="csrf_token"[^>]*value="([^"]+)"/);' +
      'if(!m||m[1].length<10) throw new Error("Token não encontrado. Recarregue a página.");' +
      'var token=m[1];' +
      'spin.style.display="none";' +
      'card.innerHTML=' +
        '"<div class=\"ok\">✅</div>" +' +
        '"<h1>Token capturado!</h1>" +' +
        '"<p class=\"step\">Copie o token abaixo e cole nas<br>Configurações do DharmaPro</p>" +' +
        '"<div class=\"token-box\" id=\"tok\">" + token + "</div>" +' +
        '"<button class=\"btn\" onclick=\"copiar()\">📋 Copiar Token</button>" +' +
        '"<button class=\"btn btn-secondary\" onclick=\"window.close()\">Fechar esta aba</button>";' +
      'window._token=token;' +
    '})' +
    '.catch(function(e){' +
      'spin.style.display="none";' +
      'msg.innerHTML="<span class=\"err\">❌ "+e.message+"</span>";' +
    '});' +
    'function copiar(){' +
      'var t=window._token||"";' +
      'if(!t) return;' +
      'if(navigator.clipboard){' +
        'navigator.clipboard.writeText(t).then(function(){' +
          'var b=document.querySelector(".btn");' +
          'if(b){b.textContent="✅ Copiado!";b.style.background="#22d98a";}' +
        '});' +
      '} else {' +
        'var ta=document.createElement("textarea");' +
        'ta.value=t;document.body.appendChild(ta);' +
        'ta.select();document.execCommand("copy");' +
        'document.body.removeChild(ta);' +
        'var b=document.querySelector(".btn");' +
        'if(b){b.textContent="✅ Copiado!";b.style.background="#22d98a";}' +
      '}' +
    '}' +
    'window.copiar=copiar;' +
  '})();' +
  '<\/script></body></html>';
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── WEBHOOK — BotConversa (doPost) ───────────────────────────────────────
// Para ativar: defina a propriedade 'webhook_secret' no Apps Script:
//   PropertiesService.getScriptProperties().setProperty('webhook_secret','SEU_SEGREDO')
// Configure o mesmo segredo no BotConversa como header ou campo no payload.
function doPost(e) {
  try {
    var SECRET = PropertiesService.getScriptProperties().getProperty('webhook_secret') || '';
    var payload = {};
    try { payload = JSON.parse(e.postData.contents); } catch(pe) {}

    // ── Roteador PAP: ações do mini site Parceiros.html ──────────────────────
    // Payloads PAP têm campo 'action' e NÃO têm 'webhook_secret' (não são BotConversa)
    if (payload.action && payload.secret === undefined) {
      return _routePAP(payload);
    }

    // ── Roteador Meta Ads: leads enviados pela Renata via n8n ────────────────
    // Identificados por utm_source ou utm_campaign (sem 'action', sem 'secret')
    if ((payload.utm_source || payload.utm_campaign) && payload.secret === undefined) {
      var linhaMetaAds = registrarLeadMetaAds(payload);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, modulo: 'meta_ads', linha: linhaMetaAds }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Validação do segredo — rejeita requisições sem token correto
    if (SECRET && payload.secret !== SECRET) {
      return ContentService
        .createTextOutput(JSON.stringify({ erro: 'Não autorizado.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Mapeamento de campos do BotConversa para colunas do CRM
    var sheet    = _getSheet();
    var tz       = Session.getScriptTimeZone();
    var agora    = new Date();
    var dataAtiv = Utilities.formatDate(agora, tz, 'dd/MM/yyyy');

    var linha = new Array(CONFIG.TOTAL_COLUNAS).fill('');
    linha[CONFIG.COLUNAS.CANAL]    = 'LEAD';
    linha[CONFIG.COLUNAS.PRODUTO]  = String(payload.produto  || '').trim();
    linha[CONFIG.COLUNAS.STATUS]   = '1- Conferencia/Ativação';
    linha[CONFIG.COLUNAS.DATA_ATIV]= dataAtiv;
    linha[CONFIG.COLUNAS.CLIENTE]  = String(payload.nome     || '').trim();
    linha[CONFIG.COLUNAS.WHATS]    = String(payload.whatsapp || payload.telefone || '').replace(/\D/g,'');
    linha[CONFIG.COLUNAS.CPF]      = String(payload.cpf      || '').trim();
    linha[CONFIG.COLUNAS.CEP]      = String(payload.cep      || '').replace(/\D/g,'');
    linha[CONFIG.COLUNAS.RESP]     = String(payload.resp     || '').trim();
    linha[CONFIG.COLUNAS.OBSERVACAO] = String(payload.obs    || '').trim();
    linha[CONFIG.COLUNAS.PRE_STATUS] = 'EM NEGOCIACAO';

    // Insere na próxima linha disponível
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ultima     = sheet.getLastRow();
      var novaLinha  = Math.max(3, ultima + 1);
      sheet.getRange(novaLinha, 1, 1, linha.length).setValues([linha]);
      _limparCache();
    } finally {
      lock.releaseLock();
    }

    Logger.log('doPost webhook: lead inserido — ' + linha[CONFIG.COLUNAS.CLIENTE]);
    return ContentService
      .createTextOutput(JSON.stringify({ sucesso: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(e) {
    Logger.log('doPost erro: ' + e.message);
    return ContentService
      .createTextOutput(JSON.stringify({ erro: e.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── AUTENTICAÇÃO REAL ─────────────────────────────────────────────────────

// Converte string para hash SHA-256 (hex) usando Utilities do GAS
function _sha256(texto) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    texto,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    var hex = (b < 0 ? b + 256 : b).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Retorna true se o usuário está bloqueado por tentativas excessivas
function _loginBloqueado(u) {
  return CacheService.getScriptCache().get('auth_lock_' + u) !== null;
}

// Registra uma falha de login. Após 5 falhas em 15 min → bloqueia por 30 min
function _registrarFalhaLogin(u) {
  var cache    = CacheService.getScriptCache();
  var countKey = 'auth_fail_' + u;
  var count    = parseInt(cache.get(countKey) || '0', 10) + 1;
  if (count >= 5) {
    cache.put('auth_lock_' + u, '1', 1800); // bloqueio: 30 min
    cache.remove(countKey);
  } else {
    cache.put(countKey, String(count), 900); // janela de tentativas: 15 min
  }
}

// Limpa bloqueio e contador de falhas (sucesso no login ou desbloqueio manual)
function _limparFalhasLogin(u) {
  var cache = CacheService.getScriptCache();
  cache.remove('auth_lock_' + u);
  cache.remove('auth_fail_' + u);
}

// Desbloqueio manual — rode no editor Apps Script se necessário:
// selecione "desbloquearLogin" → Executar → informe o usuário nos logs
function desbloquearLogin(usuario) {
  var u = String(usuario || '').trim().toLowerCase();
  if (!u) return 'Informe o nome de usuário.';
  _limparFalhasLogin(u);
  return 'Desbloqueado: ' + u;
}

// Gera hashes SHA-256 das senhas atuais — rode UMA VEZ no editor Apps Script
// para obter os valores a colar em Config.js (campo senhaHash).
// Após migrar todos os usuários, remova o campo "senha" do Config.js.
// Para gerar hashes das senhas:
// 1. Edite a lista abaixo preenchendo as senhas reais de cada usuário
// 2. Selecione "gerarHashesSenhas" → ▶ Executar
// 3. O log aparece no PAINEL INFERIOR do editor (aba "Registro de execução")
// 4. Copie cada senhaHash para Config.js
// 5. Apague as senhas desta função antes de fazer o deploy
function gerarHashesSenhas() {
  var senhas = [
    { usuario: 'Joysse.Coelho',   senha: '' }, // ← cole a senha aqui
    { usuario: 'Ricardo.Andrade', senha: '' }, // ← cole a senha aqui
    { usuario: 'Tuany.Rodrigues', senha: '' }, // ← cole a senha aqui
    { usuario: 'Vanessa.Andrade', senha: '' }, // ← cole a senha aqui
  ];
  var linhas = ['=== HASHES GERADOS ==='];
  senhas.forEach(function(s) {
    if (s.senha) {
      linhas.push(s.usuario + '  →  \'' + _sha256(s.senha) + '\'');
    } else {
      linhas.push(s.usuario + '  →  SENHA EM BRANCO (preencha acima)');
    }
  });
  var resultado = linhas.join('\n');
  console.log(resultado);
  Logger.log(resultado);
}

// ============================================================================
// CONTEXTO 1.4 - AUTENTICACAO E ACESSO
// ============================================================================
function validarLogin(usuario, senha) {
  try {
    if (!usuario || !senha) {
      return { autorizado: false, mensagem: 'Preencha usuário e senha.' };
    }

    var u = usuario.trim().toLowerCase();

    // Rate limiting: bloqueia após 5 tentativas erradas em 15 min
    if (_loginBloqueado(u)) {
      return { autorizado: false, mensagem: 'Acesso bloqueado temporariamente. Tente novamente em 30 minutos.' };
    }

    var senhaHash = _sha256(senha);

    // Menus definidos em Config.js (PERFIS_MENUS) — fonte única de verdade
    for (var i = 0; i < USUARIOS.length; i++) {
      var reg = USUARIOS[i];
      if (String(reg.usuario).trim().toLowerCase() !== u) continue;

      // Prioridade de verificação de senha:
      // 1. PropertiesService (senha alterada pelo próprio usuário — tem precedência)
      // 2. senhaHash em Config.js (hash SHA-256 — padrão)
      // 3. senha em Config.js (texto puro — legado, suporte à migração)
      var hashSalvo = PropertiesService.getScriptProperties().getProperty('pwd_' + u);
      var senhaOk = hashSalvo
        ? hashSalvo === senhaHash
        : reg.senhaHash
          ? reg.senhaHash === senhaHash
          : String(reg.senha) === senha;

      if (senhaOk) {
        _limparFalhasLogin(u);
        var perfil = reg.perfil || 'backoffice';
        var menus  = (typeof PERFIS_MENUS !== 'undefined' && PERFIS_MENUS[perfil])
                       ? PERFIS_MENUS[perfil]
                       : ['dash','formulario','lista','funil','leads','indicacao','docs','cruzamento','tickets','novaVenda','config'];
        return {
          autorizado: true,
          nome:       reg.nome   || reg.usuario,
          foto:       reg.foto   || '',
          perfil:     perfil,
          menus:      menus
        };
      }
      break; // usuário encontrado, senha errada — não continua o loop
    }

    _registrarFalhaLogin(u);
    return { autorizado: false, mensagem: 'Usuário ou senha incorretos.' };
  } catch (erro) {
    Logger.log('Erro em validarLogin: ' + erro);
    return { autorizado: false, mensagem: 'Erro ao validar. Tente novamente.' };
  }
}

// Permite que o próprio usuário troque sua senha dentro do sistema.
// Armazena o novo hash no PropertiesService (tem precedência sobre Config.js).
function alterarSenha(usuario, senhaAtual, senhaNova) {
  try {
    if (!usuario || !senhaAtual || !senhaNova) {
      return { ok: false, mensagem: 'Preencha todos os campos.' };
    }
    if (senhaNova.length < 6) {
      return { ok: false, mensagem: 'A nova senha deve ter pelo menos 6 caracteres.' };
    }

    // Valida a senha atual reutilizando a lógica de login
    var verificacao = validarLogin(usuario, senhaAtual);
    if (!verificacao.autorizado) {
      return { ok: false, mensagem: 'Senha atual incorreta.' };
    }

    var u         = String(usuario).trim().toLowerCase();
    var novoHash  = _sha256(senhaNova);
    PropertiesService.getScriptProperties().setProperty('pwd_' + u, novoHash);

    return { ok: true, mensagem: 'Senha alterada com sucesso.' };
  } catch (erro) {
    Logger.log('Erro em alterarSenha: ' + erro);
    return { ok: false, mensagem: 'Erro ao alterar senha. Tente novamente.' };
  }
}


// ─── DIAGNÓSTICO CEP (rode uma vez no editor Apps Script para testar) ────────
// Vá em: Apps Script → selecione "diagnosticoCEP" → clique ▶ Executar
// Veja o resultado em: Visualizar → Registros de execução
// Suspeita: rotina manual de suporte/infra. Nao chamada pela UI atual.
function diagnosticoCEP() {
  var CEP_TESTE = '01310100'; // Avenida Paulista — troque pelo seu CEP se quiser

  Logger.log('=== DIAGNÓSTICO CEP ===');
  Logger.log('CEP testado: ' + CEP_TESTE);

  // Teste 1: BrasilAPI
  try {
    var r1 = UrlFetchApp.fetch('https://brasilapi.com.br/api/cep/v1/' + CEP_TESTE, { muteHttpExceptions: true });
    Logger.log('[BrasilAPI] HTTP ' + r1.getResponseCode() + ' → ' + r1.getContentText().substring(0, 200));
  } catch (e) {
    Logger.log('[BrasilAPI] EXCEÇÃO: ' + e.message);
  }

  // Teste 2: ViaCEP
  try {
    var r2 = UrlFetchApp.fetch('https://viacep.com.br/ws/' + CEP_TESTE + '/json/', { muteHttpExceptions: true });
    Logger.log('[ViaCEP]    HTTP ' + r2.getResponseCode() + ' → ' + r2.getContentText().substring(0, 200));
  } catch (e) {
    Logger.log('[ViaCEP]    EXCEÇÃO: ' + e.message);
  }

  // Teste 3: chama a função real e loga o retorno completo
  try {
    var resultado = buscarCEPBackend(CEP_TESTE, 'Fibra Alone');
    Logger.log('[buscarCEPBackend] Retorno: ' + JSON.stringify(resultado));
  } catch (e) {
    Logger.log('[buscarCEPBackend] EXCEÇÃO: ' + e.message);
  }
}




// ─── LISTA DE RESPONSÁVEIS (aba "3 - PAP", coluna S) ──────────────────────
// ============================================================================
// CONTEXTO 1.5 - PAP E BOTCONVERSA
// ============================================================================
function getResponsaveis() {
  try {
    var cache    = CacheService.getScriptCache();
    var cacheKey = CONFIG.CACHE_PREFIX + 'responsaveis_v1';
    try {
      var cached = cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch(ce) {}

    var ss   = _getSpreadsheet_();
    var sh   = ss.getSheetByName('3 - PAP');
    if (!sh) return { erro: true, mensagem: 'Aba "3 - PAP" não encontrada.' };

    var ultimaLinha = sh.getLastRow();
    if (ultimaLinha < 5) return { erro: false, lista: [] };

    // Lê coluna S a partir de S5 (linha 5 = índice 5, quantidade = ultimaLinha - 4)
    var raw  = sh.getRange(5, 19, ultimaLinha - 4, 1).getValues(); // col S = coluna 19, início linha 5
    var lista = [];
    raw.forEach(function(row) {
      var nome = String(row[0] || '').trim();
      if (nome && lista.indexOf(nome) === -1) lista.push(nome);
    });
    lista.sort(function(a, b) { return a.localeCompare(b, 'pt-BR'); });

    var retorno = { erro: false, lista: lista };
    try { cache.put(cacheKey, JSON.stringify(retorno), 300); } catch(ce) {}
    Logger.log('getResponsaveis: ' + lista.length + ' encontrados.');
    return retorno;
  } catch(e) {
    Logger.log('getResponsaveis erro: ' + e);
    return { erro: true, mensagem: e.message };
  }
}


// ─── BOTCONVERSA — INTEGRAÇÃO ──────────────────────────────────────────────
// Base URL: https://backend.botconversa.com.br/api/v1/webhook
// Autenticação: header 'api-key'
// Limite: 600 RPM

// Configura a chave de API (executar UMA VEZ no editor Apps Script)
function configurarBotConversa() {
  PropertiesService.getScriptProperties()
    .setProperty('botconversa_api_key', '12f06fd2-c949-4923-8c2c-2a30dec207a5');
  Logger.log('Chave BotConversa configurada.');
}

// Configura os IDs dos fluxos BotConversa para notificações PAP.
// Executar UMA VEZ no editor Apps Script após criar os 5 fluxos no BotConversa.
// pvRecebida  : ID do fluxo "PAP - Pré-Venda Recebida"
// pvAprovada  : ID do fluxo "PAP - Pré-Venda Aprovada"
// pvRejeitada : ID do fluxo "PAP - Pré-Venda Rejeitada"
// aguardando  : ID do fluxo "PAP - Aguardando Instalação"
// instalada   : ID do fluxo "PAP - Instalada"
// Suspeita: configuracao manual. Nao ha chamada pela UI atual.
function configurarFluxosPAP(pvRecebida, pvAprovada, pvRejeitada, aguardando, instalada) {
  PropertiesService.getScriptProperties().setProperties({
    'bc_flow_pap_pv_recebida'          : String(pvRecebida  || ''),
    'bc_flow_pap_pv_aprovada'          : String(pvAprovada  || ''),
    'bc_flow_pap_pv_rejeitada'         : String(pvRejeitada || ''),
    'bc_flow_pap_aguardando_instalacao': String(aguardando  || ''),
    'bc_flow_pap_instalada'            : String(instalada   || '')
  });
  Logger.log('Fluxos PAP configurados: recebida=' + pvRecebida + ' aprovada=' + pvAprovada +
             ' rejeitada=' + pvRejeitada + ' aguardando=' + aguardando + ' instalada=' + instalada);
}

// Lista os fluxos disponíveis na conta (cache 5 min)
function getBotConversaFlows() {
  try {
    var cache    = CacheService.getScriptCache();
    var cacheKey = CONFIG.CACHE_PREFIX + 'bc_flows_v1';
    try {
      var hit = cache.get(cacheKey);
      if (hit) return JSON.parse(hit);
    } catch(ce) {}

    var apiKey = PropertiesService.getScriptProperties().getProperty('botconversa_api_key') || '';
    if (!apiKey) return { erro: true, mensagem: 'Chave BotConversa não configurada. Execute configurarBotConversa() no editor.' };

    var resp = UrlFetchApp.fetch(
      'https://backend.botconversa.com.br/api/v1/webhook/flows/',
      { method: 'get', headers: { 'api-key': apiKey }, muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) {
      return { erro: true, mensagem: 'BotConversa retornou HTTP ' + resp.getResponseCode() };
    }
    var lista = JSON.parse(resp.getContentText());
    var retorno = { erro: false, lista: lista };
    try { cache.put(cacheKey, JSON.stringify(retorno), 300); } catch(ce) {}
    Logger.log('getBotConversaFlows: ' + lista.length + ' fluxos.');
    return retorno;
  } catch(e) {
    Logger.log('getBotConversaFlows erro: ' + e.message);
    return { erro: true, mensagem: e.message };
  }
}

// Busca o subscriber_id pelo número de telefone (helper privado)
function _bcGetSubscriberPorTelefone(telefone) {
  try {
    var fone = String(telefone).replace(/\D/g, '');
    if (fone.length < 8) return null;
    // BotConversa armazena com DDI; CRM guarda sem "+55" → adiciona se necessário
    if (fone.length <= 11 && fone.substring(0, 2) !== '55') {
      fone = '55' + fone;
    }
    var apiKey = PropertiesService.getScriptProperties().getProperty('botconversa_api_key') || '';
    if (!apiKey) return null;
    var resp = UrlFetchApp.fetch(
      'https://backend.botconversa.com.br/api/v1/webhook/subscriber/get_by_phone/' + fone + '/',
      { method: 'get', headers: { 'api-key': apiKey }, muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return null;
    return JSON.parse(resp.getContentText()).id || null;
  } catch(e) {
    Logger.log('_bcGetSubscriberPorTelefone erro: ' + e.message);
    return null;
  }
}

// Envia um fluxo para um subscriber já identificado (helper privado)
// extraCampos: objeto opcional com campos adicionais mesclados no payload (ex: variáveis PAP)
function _bcEnviarFluxo(subscriberId, flowId, extraCampos) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('botconversa_api_key') || '';
    if (!apiKey) return { sucesso: false, mensagem: 'Chave BotConversa não configurada.' };
    var body = { flow: parseInt(flowId) };
    if (extraCampos) {
      Object.keys(extraCampos).forEach(function(k) { body[k] = extraCampos[k]; });
    }
    var resp = UrlFetchApp.fetch(
      'https://backend.botconversa.com.br/api/v1/webhook/subscriber/' + subscriberId + '/send_flow/',
      {
        method         : 'post',
        contentType    : 'application/json',
        headers        : { 'api-key': apiKey },
        payload        : JSON.stringify(body),
        muteHttpExceptions: true
      }
    );
    var code = resp.getResponseCode();
    if (code === 200 || code === 201) return { sucesso: true, mensagem: 'Fluxo disparado com sucesso!' };
    var msg = '';
    try { msg = JSON.parse(resp.getContentText()).error_message || ''; } catch(e2) {}
    return { sucesso: false, mensagem: 'Erro BotConversa (' + code + ')' + (msg ? ': ' + msg : '') };
  } catch(e) {
    Logger.log('_bcEnviarFluxo erro: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}

// Dispara fluxo para o cliente de uma venda — payload: { linha, flowId }
function dispararFluxoCliente(payload) {
  try {
    var sheet = _getSheet();
    if (!sheet) return { sucesso: false, mensagem: 'Planilha não encontrada.' };
    var linha = parseInt(payload.linha);
    if (!linha || linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };
    var whats = String(sheet.getRange(linha, CONFIG.COLUNAS.WHATS + 1).getValue() || '').trim();
    if (!whats) return { sucesso: false, mensagem: 'Cliente sem WhatsApp cadastrado.' };
    var sid = _bcGetSubscriberPorTelefone(whats);
    if (!sid) return { sucesso: false, mensagem: 'Contato não encontrado no BotConversa.' };
    return _bcEnviarFluxo(sid, payload.flowId);
  } catch(e) {
    Logger.log('dispararFluxoCliente erro: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}

// Dispara fluxo para um responsável — payload: { nomeResp, flowId }
// Lookup do WhatsApp na aba '3 - PAP': col S = nome, col U = whatsapp
function dispararFluxoResponsavel(payload) {
  try {
    var sh = _getSpreadsheet_().getSheetByName('3 - PAP');
    if (!sh) return { sucesso: false, mensagem: 'Aba "3 - PAP" não encontrada.' };
    var ultimaLinha = sh.getLastRow();
    if (ultimaLinha < 5) return { sucesso: false, mensagem: 'Sem dados na aba PAP.' };
    var raw       = sh.getRange(5, 19, ultimaLinha - 4, 3).getValues(); // cols S, T, U
    var nomeBusca = String(payload.nomeResp || '').trim().toLowerCase();
    var whatsResp = '';
    for (var i = 0; i < raw.length; i++) {
      if (String(raw[i][0] || '').trim().toLowerCase() === nomeBusca) {
        whatsResp = String(raw[i][2] || '').trim(); // col U = índice 2
        break;
      }
    }
    if (!whatsResp) return { sucesso: false, mensagem: 'WhatsApp do responsável não encontrado na aba PAP.' };
    var sid = _bcGetSubscriberPorTelefone(whatsResp);
    if (!sid) return { sucesso: false, mensagem: 'Responsável não encontrado no BotConversa.' };
    return _bcEnviarFluxo(sid, payload.flowId);
  } catch(e) {
    Logger.log('dispararFluxoResponsavel erro: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}

// Sincroniza etiquetas e status de atendimento do BotConversa para a planilha.
// Grava nas colunas AT (BC_TAGS) e AU (BC_STATUS) de cada linha com WhatsApp.
// Processa LOTE_MAX linhas por execução com cursor persistente (PropertiesService)
// para não esgotar a cota de bandwidth do UrlFetchApp.
// forcar=true ignora o gate de 30 min e reseta o cursor (varredura completa).
function sincronizarTagsBotConversa(forcar) {
  try {
    var LOTE_MAX = 100; // chamadas por execução (100 × ~300ms ≈ 30–40s, seguro em 6 min)
    var DELAY_MS = 250; // pausa entre cada chamada HTTP (≈ 240 req/min < 600 RPM)

    var props  = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty('botconversa_api_key') || '';
    if (!apiKey) return { sucesso: false, mensagem: 'Chave BotConversa não configurada.' };

    // ── Gate de 30 minutos ────────────────────────────────────────────────
    if (!forcar) {
      var ultimoSync = parseInt(props.getProperty('bc_tags_ultimo_sync') || '0');
      var agora      = Date.now();
      if (ultimoSync && (agora - ultimoSync) < 30 * 60 * 1000) {
        Logger.log('sincronizarTagsBotConversa: skip (sync há ' + Math.round((agora - ultimoSync)/60000) + ' min)');
        return { sucesso: true, atualizados: 0, skip: true };
      }
    }

    var sheet       = _getSheet();
    var ultimaLinha = sheet.getLastRow();
    if (ultimaLinha < 3) return { sucesso: true, atualizados: 0 };

    var colWhats    = CONFIG.COLUNAS.WHATS + 1;     // 1-based → P = 16
    var colTags     = CONFIG.COLUNAS.BC_TAGS + 1;   // AT = 46
    var colStatus   = CONFIG.COLUNAS.BC_STATUS + 1; // AU = 47
    var totalLinhas = ultimaLinha - 2;               // total de linhas de dados

    // Lê toda a coluna WhatsApp de uma vez (1 chamada barata) e coleta
    // os índices 0-based que têm telefone válido (≥ 8 dígitos).
    var JANELA   = 500;
    var todosW   = sheet.getRange(3, colWhats, totalLinhas, 1).getValues();
    var idxComFone = [];
    for (var k = 0; k < todosW.length; k++) {
      if (String(todosW[k][0] || '').replace(/\D/g, '').length >= 8) idxComFone.push(k);
    }
    if (idxComFone.length === 0) {
      Logger.log('sincronizarTagsBotConversa: nenhuma linha com WhatsApp encontrada.');
      return { sucesso: true, atualizados: 0, semFone: totalLinhas };
    }

    // Janela: últimos JANELA entre os que têm fone, invertidos → mais recentes primeiro
    var janela      = idxComFone.slice(-JANELA).reverse();
    var totalJanela = janela.length;

    // Cursor aponta para posição dentro de janela[] (0-based)
    var cursorJ = forcar ? 0 : parseInt(props.getProperty('bc_tags_cursor') || '0');
    if (cursorJ >= totalJanela) cursorJ = 0;

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) {
      return { sucesso: false, mensagem: 'Planilha em uso. Tente novamente em instantes.' };
    }

    var atualizados = 0;
    var naoAchado   = 0;
    var erros       = 0;
    var chamadas    = 0;
    var baseUrl     = 'https://backend.botconversa.com.br/api/v1/webhook/subscriber/get_by_phone/';
    var headers     = { 'api-key': apiKey };
    var j           = cursorJ; // posição dentro de janela[]
    var amostraFone = '';

    while (j < totalJanela && chamadas < LOTE_MAX) {
      var absIdx  = janela[j];          // índice 0-based dentro de todosW
      var foneRaw = String(todosW[absIdx][0] || '').replace(/\D/g, '');

      // Normaliza DDI (+55 se ausente)
      if (foneRaw.length <= 11 && foneRaw.substring(0, 2) !== '55') {
        foneRaw = '55' + foneRaw;
      }
      if (!amostraFone) amostraFone = foneRaw;

      try {
        var resp = UrlFetchApp.fetch(baseUrl + foneRaw + '/', {
          method: 'get', headers: headers, muteHttpExceptions: true
        });
        chamadas++;
        var httpCode = resp.getResponseCode();

        if (httpCode === 200) {
          var sub        = JSON.parse(resp.getContentText());
          var tags       = (sub.tags && sub.tags.length) ? sub.tags.join(' | ') : '';
          // Loga objeto completo para diagnóstico (apenas os 5 primeiros)
          if (atualizados < 5) {
            Logger.log('BC subscriber raw: ' + JSON.stringify(sub) + ' | fone=' + foneRaw);
          }
          var status     = sub.live_chat ? 'Aberto' : 'Concluído';
          var linhaSheet = absIdx + 3; // linha real na planilha (dados começam na row 3)
          sheet.getRange(linhaSheet, colTags).setValue(tags);
          sheet.getRange(linhaSheet, colStatus).setValue(status);
          atualizados++;
        } else {
          if (naoAchado < 3) {
            Logger.log('BC nao-200: HTTP ' + httpCode + ' fone=' + foneRaw +
                       ' resp=' + resp.getContentText().substring(0, 120));
          }
          naoAchado++;
        }
      } catch(fe) {
        Logger.log('sincronizarTagsBotConversa erro idx ' + absIdx + ': ' + fe.message);
        erros++;
        Utilities.sleep(500);
      }

      Utilities.sleep(DELAY_MS);
      j++;
    }

    lock.releaseLock();

    // Cursor: avança; reinicia quando termina a janela
    var novoCursorJ = (j >= totalJanela) ? 0 : j;
    props.setProperty('bc_tags_cursor',      String(novoCursorJ));
    props.setProperty('bc_tags_ultimo_sync', String(Date.now()));

    if (atualizados > 0) _limparCacheListaV3();

    Logger.log('sincronizarTagsBotConversa: janela=' + totalJanela + ' comFone' +
               ' lote [' + cursorJ + '-' + (j-1) + ']' +
               ' | atualizados=' + atualizados +
               ' naoAchado=' + naoAchado +
               ' erros=' + erros +
               ' | amostraFone=' + (amostraFone || '(nenhum)') +
               ' | próximo cursor=' + novoCursorJ);

    return { sucesso: true, atualizados: atualizados,
             naoAchado: naoAchado, erros: erros,
             cursor: novoCursorJ, totalJanela: totalJanela };

  } catch(e) {
    Logger.log('sincronizarTagsBotConversa erro geral: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}

// ─── PAGAMENTOS PAP ────────────────────────────────────────────────────────
// Coluna AM (CONFIG.COLUNAS.STATUS_PAP, 1-based = 39) = Status Pagamento PAP ("Em Aberto" / "Pago")
// Filtros: Produto=FIBRA ALONE/COMBO, Canal=PAP, Status=3 - Finalizada/Instalada, PAP=Em Aberto
function getPagamentosPAP() {
  try {
  var ss      = _getSpreadsheet_();
    var sheet   = _getSheet();
    var shPAP   = ss.getSheetByName('3 - PAP');
    var ultimaLinha = sheet.getLastRow();
    if (ultimaLinha < 3) return { dados: [], total: 0 };

    // Lê aba 3 - PAP: colunas S-Z (19-26) para montar mapa vendedor→chave pix
    var mapaPAP = {}; // nome vendedor → { chavePix, whatsapp }
    if (shPAP) {
      var ultimaPAP = shPAP.getLastRow();
      if (ultimaPAP >= 2) {
        // Col S=19(vendedor) T=20(idbot) U=21(whatsapp) V=22(dataCad) W=23(cpf) X=24(chavePix)
        var rawPAP = shPAP.getRange(2, 19, ultimaPAP - 1, 8).getValues();
        rawPAP.forEach(function(r) {
          var vendedor  = String(r[0] || '').trim();
          var whatsapp  = String(r[2] || '').trim();
          var chavePix  = String(r[5] || '').trim(); // col X = índice 5 dentro do range
          if (vendedor) mapaPAP[vendedor.toUpperCase()] = { chavePix: chavePix, whatsapp: whatsapp };
        });
      }
    }
    Logger.log('getPagamentosPAP: mapa PAP com ' + Object.keys(mapaPAP).length + ' vendedores');

    var totalDados = ultimaLinha - 2;
    var raw = sheet.getRange(3, 1, totalDados, CONFIG.TOTAL_COLUNAS).getValues();
    var tz  = Session.getScriptTimeZone();

    var resultado = [];
    var totalValor = 0;
    var porVendedor = {};

    for (var i = 0; i < raw.length; i++) {
      var row      = raw[i];
      var c2 = CONFIG.COLUNAS;
      var canal     = String(row[c2.CANAL]       || '').trim().toUpperCase();
      var produto   = String(row[c2.PRODUTO]     || '').trim().toUpperCase();
      var status    = String(row[c2.STATUS]      || '').trim();
      var statusPAP = String(row[c2.STATUS_PAP]  || '').trim().toUpperCase();

      // Filtros
      if (canal !== 'PAP') continue;
      var prodNorm = produto.normalize('NFD').replace(/[̀-ͯ]/g,'');
      if (prodNorm !== 'FIBRA ALONE' && prodNorm !== 'FIBRA COMBO') continue;
      if (status !== '3 - Finalizada/Instalada') continue;
      if (statusPAP.normalize('NFD').replace(/[\u0300-\u036f]/g,'') !== 'EM ABERTO') continue;

      var cliente  = String(row[c2.CLIENTE]  || '').trim();
      var resp     = String(row[c2.RESP]     || '').trim();
      var contrato = String(row[c2.CONTRATO] || '').trim();
      var plano    = String(row[c2.PLANO]    || '').trim();
      var valor    = parseFloat(row[c2.VALOR]) || 0;

      var dInstal = row[c2.INSTAL];
      var dataInstalStr = (dInstal instanceof Date && !isNaN(dInstal))
        ? Utilities.formatDate(dInstal, tz, 'dd/MM/yyyy') : String(dInstal || '');

      // Busca chave pix pelo nome do responsável
      var respKey   = resp.toUpperCase();
      var infoPAP   = mapaPAP[respKey] || { chavePix: '', whatsapp: '' };

      // Comissão fixa R$100 (conforme planilha)
      var comissao = 100;

      totalValor += comissao;
      if (!porVendedor[resp]) porVendedor[resp] = { nome: resp, total: 0, qtd: 0, chavePix: infoPAP.chavePix };
      porVendedor[resp].total += comissao;
      porVendedor[resp].qtd++;

      resultado.push({
        linha:       i + 3,
        cliente:     cliente,
        resp:        resp,
        contrato:    contrato,
        produto:     produto,
        plano:       plano,
        valor:       valor,
        comissao:    comissao,
        dataInstal:  dataInstalStr,
        chavePix:    infoPAP.chavePix,
        whatsapp:    infoPAP.whatsapp,
        statusPAP:   statusPAP
      });
    }

    // Ordena por vendedor depois por data
    resultado.sort(function(a,b) { return a.resp.localeCompare(b.resp, 'pt-BR'); });

    // Converte porVendedor para array ordenado por total desc
    var resumo = Object.values ? Object.values(porVendedor) : Object.keys(porVendedor).map(function(k){ return porVendedor[k]; });
    resumo.sort(function(a,b) { return b.total - a.total; });

    Logger.log('getPagamentosPAP: ' + resultado.length + ' pagamentos, total R$' + totalValor);
    return {
      dados:       resultado,
      total:       resultado.length,
      totalValor:  totalValor,
      resumo:      resumo
    };
  } catch(e) {
    Logger.log('Erro getPagamentosPAP: ' + e);
    return { dados: [], total: 0, totalValor: 0, resumo: [], erro: e.message };
  }
}


// Salva apenas o Status Pagamento PAP
function salvarStatusPAP(linha, novoStatus) {
  try {
    var sheet = _getSheet();
    sheet.getRange(linha, CONFIG.COLUNAS.STATUS_PAP + 1).setValue(novoStatus || '');
    _limparCacheListaCompleta();
    Logger.log('salvarStatusPAP: linha ' + linha + ' = "' + novoStatus + '"');
    return { sucesso: true };
  } catch(e) {
    Logger.log('Erro salvarStatusPAP: ' + e);
    return { sucesso: false, mensagem: e.message };
  }
}

// Marca uma venda como paga
function marcarPagoPAP(linha) {
  try {
    var sheet = _getSheet();
    sheet.getRange(linha, CONFIG.COLUNAS.STATUS_PAP + 1).setValue('Pago');
    _limparCacheListaCompleta();
    Logger.log('marcarPagoPAP: linha ' + linha + ' marcada como Pago.');
    return { sucesso: true };
  } catch(e) {
    Logger.log('Erro marcarPagoPAP: ' + e);
    return { sucesso: false, mensagem: e.message };
  }
}

// Marca pago + envia mensagem de comissão ao vendedor via BotConversa
// payload: { linha, mensagem, whatsapp }
function marcarPagoENotificarPAP(payload) {
  var resultado = { sucesso: false, pagamento: false, notificacao: false, mensagem: '' };
  try {
    // 1) Marca como Pago na planilha
    var sheet = _getSheet();
    sheet.getRange(payload.linha, CONFIG.COLUNAS.STATUS_PAP + 1).setValue('Pago');
    _limparCacheListaCompleta();
    resultado.pagamento = true;
    Logger.log('marcarPagoENotificarPAP: linha ' + payload.linha + ' marcada como Pago.');

    // 2) Envia mensagem via BotConversa
    var whats = String(payload.whatsapp || '').trim();
    if (!whats) {
      resultado.sucesso = true;
      resultado.mensagem = 'Pagamento registrado, mas vendedor sem WhatsApp cadastrado.';
      return resultado;
    }
    var sid = _bcGetSubscriberPorTelefone(whats);
    if (!sid) {
      resultado.sucesso = true;
      resultado.mensagem = 'Pagamento registrado, mas vendedor não encontrado no BotConversa.';
      return resultado;
    }
    var resMsg = _bcEnviarMensagemTexto(sid, payload.mensagem);
    resultado.notificacao = resMsg.sucesso;
    resultado.sucesso = true;
    resultado.mensagem = resMsg.sucesso
      ? 'Pagamento registrado e vendedor notificado!'
      : 'Pagamento registrado, mas falha ao notificar: ' + (resMsg.mensagem || '');
    return resultado;
  } catch(e) {
    Logger.log('marcarPagoENotificarPAP erro: ' + e.message);
    resultado.mensagem = e.message;
    return resultado;
  }
}

// Envia mensagem de texto direta para um subscriber do BotConversa (helper privado)
function _bcEnviarMensagemTexto(subscriberId, texto) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('botconversa_api_key') || '';
    if (!apiKey) return { sucesso: false, mensagem: 'Chave BotConversa não configurada.' };
    var resp = UrlFetchApp.fetch(
      'https://backend.botconversa.com.br/api/v1/webhook/subscriber/' + subscriberId + '/send_message/',
      {
        method         : 'post',
        contentType    : 'application/json',
        headers        : { 'api-key': apiKey },
        payload        : JSON.stringify({ type: 'text', value: texto }),
        muteHttpExceptions: true
      }
    );
    var code = resp.getResponseCode();
    if (code === 200 || code === 201) return { sucesso: true };
    var msg = '';
    try { msg = JSON.parse(resp.getContentText()).error_message || ''; } catch(e2) {}
    return { sucesso: false, mensagem: 'BotConversa HTTP ' + code + (msg ? ': ' + msg : '') };
  } catch(e) {
    Logger.log('_bcEnviarMensagemTexto erro: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}

// Envia resumo consolidado dos pagamentos PAP para o número do admin
// payload: { resumoTexto } — texto montado no frontend
function enviarResumoPAPAdmin(resumoTexto) {
  try {
    var ADMIN_WHATS = '5532991534154'; // +55 32 99153-4154
    var sid = _bcGetSubscriberPorTelefone(ADMIN_WHATS);
    if (!sid) return { sucesso: false, mensagem: 'Número admin não encontrado no BotConversa.' };
    return _bcEnviarMensagemTexto(sid, resumoTexto);
  } catch(e) {
    Logger.log('enviarResumoPAPAdmin erro: ' + e.message);
    return { sucesso: false, mensagem: e.message };
  }
}

// ─── LEADS — TRATAMENTO DE LEADS (KANBAN) ─────────────────────────────────
// Retorna vendas FIBRA ALONE/COMBO + STATUS 1- Conferencia/Ativação
// Classifica pela coluna D (pré-venda) em Quente/Morno/Frio
// Também inclui as que já estão em 2- Aguardando Instalação (coluna destino)
function getVendasLeads() {
  try {
    // ── Cache com chunks (suporta JSON > 100KB) ────────────────────────
    var CACHE_KEY = CONFIG.CACHE_PREFIX + 'leads_v2';
    var cached = _cacheGetChunked(CACHE_KEY);
    if (cached && Array.isArray(cached.dados) && cached.dados.length > 0) {
      Logger.log('getVendasLeads cache hit: ' + cached.dados.length);
      return cached;
    }

    var sheet       = _getSheet();
    var ultimaLinha = sheet.getLastRow();
    Logger.log('getVendasLeads: ultima linha = ' + ultimaLinha);
    if (ultimaLinha < 3) return { dados: [], total: 0 };

    var PRE_VENDA_QUENTE = { 'AG ACEITE': true, 'AG AUDITORIA': true };
    var PRE_VENDA_MORNO  = { 'AG COMPROVANTE': true, 'AG DOC': true };
    var PRE_VENDA_FRIO   = { 'EM NEGOCIACAO': true, 'AG QUALIDADE': true };
    var STATUS_CONF      = '1- Conferencia/Ativação';
    var STATUS_AGU       = '2- Aguardando Instalação';
    var PRODUTOS_FIBRA   = { 'FIBRA ALONE': true, 'FIBRA COMBO': true };
    var STATUS_LEADS     = {};
    STATUS_LEADS[STATUS_CONF] = true;
    STATUS_LEADS[STATUS_AGU]  = true;

    var LIMITE = 200; // últimas 200 de cada temperatura
    var tz     = Session.getScriptTimeZone();

    // ── FASE 1: PRE-SCAN — lê apenas a coluna de status configurada ──────
    var cf = CONFIG.COLUNAS;
    var colStatus = cf.STATUS + 1;
    var primeiraLinhaDados = 3;
    var totalLinhas = ultimaLinha - primeiraLinhaDados + 1;
    var statusValsFast = sheet.getRange(primeiraLinhaDados, colStatus, totalLinhas, 1).getValues();
    var produtoValsFast = sheet.getRange(primeiraLinhaDados, cf.PRODUTO + 1, totalLinhas, 1).getValues();
    var preStatusValsFast = sheet.getRange(primeiraLinhaDados, cf.PRE_STATUS + 1, totalLinhas, 1).getValues();
    var contadoresFast = { quente: 0, morno: 0, frio: 0, aguardando: 0 };
    var linhasSelecionadasFast = [];
    var temperaturasPorLinhaFast = {};

    for (var idxFast = statusValsFast.length - 1; idxFast >= 0; idxFast--) {
      var statusFast = String(statusValsFast[idxFast][0] || '').trim();
      if (!STATUS_LEADS[statusFast]) continue;

      var produtoFast = _normalizarTexto(produtoValsFast[idxFast][0]);
      if (!PRODUTOS_FIBRA[produtoFast]) continue;

      var preStatusFast = _normalizarTexto(preStatusValsFast[idxFast][0]);
      var temperaturaFast = null;

      if (statusFast === STATUS_CONF) {
        if (PRE_VENDA_QUENTE[preStatusFast]) {
          if (contadoresFast.quente >= LIMITE) continue;
          temperaturaFast = 'quente';
          contadoresFast.quente++;
        } else if (PRE_VENDA_MORNO[preStatusFast]) {
          if (contadoresFast.morno >= LIMITE) continue;
          temperaturaFast = 'morno';
          contadoresFast.morno++;
        } else if (PRE_VENDA_FRIO[preStatusFast] || preStatusFast === 'EM NEGOCIACAO') {
          if (contadoresFast.frio >= LIMITE) continue;
          temperaturaFast = 'frio';
          contadoresFast.frio++;
        } else {
          continue;
        }
      } else if (statusFast === STATUS_AGU) {
        if (contadoresFast.aguardando >= LIMITE) continue;
        temperaturaFast = 'aguardando';
        contadoresFast.aguardando++;
      } else {
        continue;
      }

      var linhaSheetFast = primeiraLinhaDados + idxFast;
      linhasSelecionadasFast.push(linhaSheetFast);
      temperaturasPorLinhaFast[linhaSheetFast] = temperaturaFast;

      if (contadoresFast.quente     >= LIMITE &&
          contadoresFast.morno      >= LIMITE &&
          contadoresFast.frio       >= LIMITE &&
          contadoresFast.aguardando >= LIMITE) break;
    }

    Logger.log('getVendasLeads fast-select: ' + linhasSelecionadasFast.length + ' linhas');
    if (linhasSelecionadasFast.length === 0) return { dados: [], total: 0 };

    var linhasAscFast = linhasSelecionadasFast.slice().sort(function(a, b) { return a - b; });
    var blocosFast = _agruparBlocos(linhasAscFast, 8);
    var colunasLeadsFast = _getMaxColunaLida([cf.WHATS]);
    var registrosFast = _lerBlocos(sheet, blocosFast, colunasLeadsFast);
    var mapaFast = {};
    for (var rf = 0; rf < registrosFast.length; rf++) {
      mapaFast[registrosFast[rf].linhaSheet] = registrosFast[rf].row;
    }

    var resultadoFast = [];
    for (var lf = 0; lf < linhasSelecionadasFast.length; lf++) {
      var linhaFast = linhasSelecionadasFast[lf];
      var rowFast = mapaFast[linhaFast];
      if (!rowFast) continue;

      var clienteFast = String(rowFast[cf.CLIENTE] || '').trim();
      var cpfFast     = String(rowFast[cf.CPF]     || '').trim();
      if (!clienteFast && !cpfFast) continue;

      var dAtivFast = rowFast[cf.DATA_ATIV];
      var dataAtivStrFast = (dAtivFast instanceof Date && !isNaN(dAtivFast))
        ? Utilities.formatDate(dAtivFast, tz, 'dd/MM/yyyy') : '';

      var dAgFast = rowFast[cf.AGENDA];
      var agendaStrFast = (dAgFast instanceof Date && !isNaN(dAgFast))
        ? Utilities.formatDate(dAgFast, tz, 'dd/MM/yyyy') : (dAgFast ? String(dAgFast) : '');

      resultadoFast.push({
        linha:       linhaFast,
        status:      String(rowFast[cf.STATUS] || '').trim(),
        temperatura: temperaturasPorLinhaFast[linhaFast] || '',
        preStatus:   String(rowFast[cf.PRE_STATUS] || '').trim(),
        cliente:     clienteFast,
        cpf:         cpfFast,
        produto:     String(rowFast[cf.PRODUTO]  || '').trim(),
        plano:       String(rowFast[cf.PLANO]    || '').trim(),
        resp:        String(rowFast[cf.RESP]     || '').trim(),
        whats:       String(rowFast[cf.WHATS]    || '').trim(),
        dataAtiv:    dataAtivStrFast,
        agenda:      agendaStrFast,
        turno:       String(rowFast[cf.TURNO]    || '').trim(),
        codCli:      String(rowFast[cf.COD_CLI]  || '').trim(),
        contrato:    String(rowFast[cf.CONTRATO] || '').trim()
      });
    }

    Logger.log('getVendasLeads fast: ' + resultadoFast.length + ' registros. Q=' +
      contadoresFast.quente + ' M=' + contadoresFast.morno +
      ' F=' + contadoresFast.frio + ' Ag=' + contadoresFast.aguardando);

    var retornoFast = { dados: resultadoFast, total: resultadoFast.length };
    _cachePutChunked(CACHE_KEY, retornoFast, 300);
    return retornoFast;
  } catch(e) {
    Logger.log('Erro em getVendasLeads: ' + e);
    return { dados: [], total: 0, erro: e.message };
  }
}

// Mover lead para 2- Aguardando Instalação com campos extras
function moverLeadAguardando(payload) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(le) {
    return { sucesso: false, mensagem: '⚠️ Sistema ocupado. Tente novamente.' };
  }
  var sheet     = null;
  var linha     = null;
  var resultado = { sucesso: false };
  try {
    sheet = _getSheet();
    if (!sheet) return { sucesso: false, mensagem: 'Planilha não encontrada.' };

    linha = parseInt(payload.linha);
    var c = CONFIG.COLUNAS;

    sheet.getRange(linha, c.STATUS    + 1).setValue('2- Aguardando Instalação');
    if (payload.agenda)   sheet.getRange(linha, c.AGENDA    + 1).setValue(payload.agenda);
    if (payload.turno)    sheet.getRange(linha, c.TURNO     + 1).setValue(payload.turno);
    if (payload.contrato) sheet.getRange(linha, c.CONTRATO  + 1).setValue(payload.contrato);
    if (payload.obs)      sheet.getRange(linha, c.OBSERVACAO + 1).setValue(payload.obs);

    _limparCache();

    Logger.log('moverLeadAguardando: linha ' + linha + ' movida.');
    resultado = { sucesso: true };
  } catch(e) {
    Logger.log('Erro em moverLeadAguardando: ' + e);
    resultado = { sucesso: false, mensagem: e.message };
  } finally {
    lock.releaseLock();
  }

  // Notificação PAP fora do lock
  if (resultado.sucesso && sheet && linha) {
    try {
      var c      = CONFIG.COLUNAS;
      var rowPAP = sheet.getRange(linha, 1, 1, c.CLIENTE + 1).getValues()[0];
      if (rowPAP[c.CANAL] === 'PAP') {
        var vPAP = _papBuscarSubscriberVendedor(null, rowPAP[c.RESP]);
        if (vPAP && vPAP.subscriberId) {
          _papNotificarVendedorPAP('aguardando_instalacao', vPAP.subscriberId, {
            pap_nome_cliente: String(rowPAP[c.CLIENTE] || ''),
            pap_plano:        String(rowPAP[c.PLANO]   || ''),
            pap_agenda:       (function(v){ if(!v) return ''; var d = new Date(v); return isNaN(d)?String(v):Utilities.formatDate(d,Session.getScriptTimeZone(),'dd/MM/yyyy'); })(rowPAP[c.AGENDA]),
            pap_turno:        String(rowPAP[c.TURNO]   || ''),
            pap_status:       '2- Aguardando Instalação'
          });
        }
      }
    } catch(ne) { Logger.log('moverLeadAguardando notif: ' + ne.message); }
  }

  return resultado;
}

// Limpa cache do kanban de leads
function limparCacheLeads() {
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'leads_v1');
  Logger.log('Cache leads removido.');
}

// ─── CONSULTA DE OFERTAS (BOTÃO FLUTUANTE DO CRM) ─────────────────────────
// Retorna lista de cidades disponíveis
function getCidadesOfertas() {
  try {
    var dados = _getCidades();
    if (!dados || !dados.length) return { erro: true, mensagem: 'Aba CIDADES não encontrada.' };
    var cidades = [];
    for (var i = 1; i < dados.length; i++) {
      var nome = String(dados[i][6] || '').trim();
      if (nome) cidades.push(nome);
    }
    cidades.sort(function(a, b) { return a.localeCompare(b, 'pt-BR'); });
    var unicas = cidades.filter(function(v, i, arr) { return arr.indexOf(v) === i; });
    return { erro: false, cidades: unicas };
  } catch(e) {
    return { erro: true, mensagem: e.message };
  }
}

// Retorna todas as ofertas de uma cidade (todos os produtos/categorias)
function getOfertasCidade(cidade) {
  try {
    var dadosCid = _getCidades();
    var dadosTab = _getTabela();
    if (!dadosCid || !dadosCid.length || !dadosTab || !dadosTab.length)
      return { erro: true, mensagem: 'Abas CIDADES ou TABELA não encontradas.' };
    var cidNorm  = _normalizarTexto(cidade);
    var linhaCid = null;
    for (var ci = 0; ci < dadosCid.length; ci++) {
      if (_normalizarTexto(dadosCid[ci][6]) === cidNorm) { linhaCid = dadosCid[ci]; break; }
    }
    if (!linhaCid) return { erro: true, mensagem: 'Cidade não encontrada.' };

    var sistema    = String(linhaCid[2] || '').trim();
    var segmentacao= String(linhaCid[3] || '').trim();
    var telMovel   = String(linhaCid[8] || 'Não informado').trim();
    var comboMesh  = String(linhaCid[9] || 'Não informado').trim();
    var roku       = String(linhaCid[10]|| 'Não informado').trim();

    var cabecalho= dadosTab[1].map(function(h) { return _normalizarTexto(h); });
    var colIdx   = cabecalho.indexOf(_normalizarTexto(segmentacao));
    if (colIdx === -1) return { erro: true, mensagem: 'Segmentação "' + segmentacao + '" não encontrada na TABELA.' };

    // Monta grupos de categorias com seus planos
    var grupos = [];
    var catAtual = null;
    var planosAtual = [];

    for (var ti = 2; ti < dadosTab.length; ti++) {
      var nomePlano = String(dadosTab[ti][0] || '').trim();
      var cat       = String(dadosTab[ti][1] || '').trim();
      var valRaw    = dadosTab[ti][colIdx];
      if (!nomePlano || valRaw === '' || valRaw === null || valRaw === 0) continue;

      var valNum    = parseFloat(valRaw) || 0;
      if (valNum === 0) continue;

      // Valor final: móvel não desconta, fibra desconta R$10 (boleto)
      var ehMovel   = cat.toUpperCase().indexOf('MOVEL') > -1 || cat.toUpperCase().indexOf('MÓVEL') > -1;
      var valFinal  = ehMovel ? valNum : valNum - 10;

      if (cat !== catAtual) {
        if (catAtual !== null) grupos.push({ categoria: catAtual, planos: planosAtual });
        catAtual   = cat;
        planosAtual= [];
      }
      planosAtual.push({ nome: nomePlano, valor: valFinal.toFixed(2).replace('.', ',') });
    }
    if (catAtual !== null) grupos.push({ categoria: catAtual, planos: planosAtual });

    return {
      erro:       false,
      cidade:     cidade.toUpperCase(),
      sistema:    sistema,
      segmentacao:segmentacao,
      telMovel:   telMovel,
      comboMesh:  comboMesh,
      roku:       roku,
      grupos:     grupos
    };
  } catch(e) {
    Logger.log('getOfertasCidade erro: ' + e);
    return { erro: true, mensagem: e.message };
  }
}

// ─── BUSCA SOMENTE ENDEREÇO (sem cruzar CIDADES/TABELA — resposta rápida) ──
// Suspeita: legado de CEP simplificado. buscarCEPBackend cobre o fluxo atual.
function buscarSomenteEndereco(cep) {
  try {
    var limpo = (cep || '').toString().replace(/\D/g, '');
    Logger.log('[CEP] Input: "' + cep + '" → limpo: "' + limpo + '" (len=' + limpo.length + ')');

    if (limpo.length !== 8) {
      return { erro: true, mensagem: 'CEP deve ter 8 dígitos (recebido: ' + limpo.length + ').' };
    }

    var data = null;
    var http1 = 0, http2 = 0;

    // Tentativa 1: BrasilAPI
    try {
      var url1 = 'https://brasilapi.com.br/api/cep/v1/' + limpo;
      Logger.log('[CEP] Chamando BrasilAPI: ' + url1);
      var r1 = UrlFetchApp.fetch(url1, { muteHttpExceptions: true });
      http1 = r1.getResponseCode();
      var body1 = r1.getContentText();
      Logger.log('[CEP] BrasilAPI HTTP ' + http1 + ' → ' + body1.substring(0, 150));

      if (http1 === 200) {
        var j1 = JSON.parse(body1);
        // BrasilAPI pode retornar 200 com body de erro em alguns casos
        if (j1 && j1.city) {
          data = {
            logradouro: j1.street        || '',
            bairro:     j1.neighborhood  || '',
            cidade:     j1.city          || '',
            uf:         j1.state         || ''
          };
          Logger.log('[CEP] BrasilAPI OK → cidade: ' + data.cidade);
        } else {
          Logger.log('[CEP] BrasilAPI 200 mas sem campo city. Body: ' + body1.substring(0, 200));
        }
      }
    } catch (e1) {
      Logger.log('[CEP] BrasilAPI EXCECAO: ' + e1.message);
    }

    // Tentativa 2: ViaCEP
    if (!data) {
      try {
        var url2 = 'https://viacep.com.br/ws/' + limpo + '/json/';
        Logger.log('[CEP] Chamando ViaCEP: ' + url2);
        var r2 = UrlFetchApp.fetch(url2, { muteHttpExceptions: true });
        http2 = r2.getResponseCode();
        var body2 = r2.getContentText();
        Logger.log('[CEP] ViaCEP HTTP ' + http2 + ' → ' + body2.substring(0, 150));

        if (http2 === 200) {
          var j2 = JSON.parse(body2);
          if (j2 && !j2.erro) {
            data = {
              logradouro: j2.logradouro || '',
              bairro:     j2.bairro     || '',
              cidade:     j2.localidade || '',
              uf:         j2.uf         || ''
            };
            Logger.log('[CEP] ViaCEP OK → cidade: ' + data.cidade);
          } else {
            Logger.log('[CEP] ViaCEP retornou erro no JSON: ' + body2.substring(0, 100));
          }
        }
      } catch (e2) {
        Logger.log('[CEP] ViaCEP EXCECAO: ' + e2.message);
      }
    }

    if (!data) {
      var msg = 'CEP ' + limpo + ' nao encontrado (BrasilAPI HTTP ' + http1 + ' | ViaCEP HTTP ' + http2 + '). Verifique os logs.';
      Logger.log('[CEP] FALHOU: ' + msg);
      return { erro: true, mensagem: msg };
    }

    // Lookup de sistema na aba CIDADES (com cache)
    var sistema = '';
    try {
      var cidNorm2 = _normalizarTexto(data.cidade);
      var rowsCid  = _getCidades();
      for (var i = 0; i < rowsCid.length; i++) {
        if (_normalizarTexto(rowsCid[i][6]) === cidNorm2) {
          sistema = rowsCid[i][2] || '';
          Logger.log('[CEP] Sistema encontrado: ' + sistema);
          break;
        }
      }
      if (!sistema) Logger.log('[CEP] Cidade "' + cidNorm2 + '" nao encontrada na aba CIDADES.');
    } catch (e3) {
      Logger.log('[CEP] Erro no lookup CIDADES: ' + e3.message);
    }

    var resultado = {
      erro:       false,
      logradouro: data.logradouro.toUpperCase(),
      bairro:     data.bairro.toUpperCase(),
      cidade:     data.cidade.toUpperCase(),
      uf:         data.uf.toUpperCase(),
      sistema:    sistema
    };
    Logger.log('[CEP] Retornando: ' + JSON.stringify(resultado));
    return resultado;

  } catch (e) {
    Logger.log('[CEP] ERRO GERAL: ' + e.message);
    return { erro: true, mensagem: 'Erro interno: ' + e.message };
  }
}

// ─── LOOKUP DE SISTEMA POR CIDADE (sem UrlFetchApp — só lê a planilha) ──────
// ============================================================================
// CONTEXTO 1.6 - CEP, CIDADES, OFERTAS E NOVA VENDA
// ============================================================================
function getSistemaPorCidade(cidade) {
  try {
    var cidNorm = _normalizarTexto(cidade);
    var rows    = _getCidades();
    for (var i = 0; i < rows.length; i++) {
      if (_normalizarTexto(rows[i][6]) === cidNorm) return rows[i][2] || '';
    }
    return '';
  } catch(e) {
    Logger.log('getSistemaPorCidade erro: ' + e);
    return '';
  }
}

// ─── NOVA VENDA — serve o HTML do formulário standalone ───────────────────
function getNovaVendaHtml() {
  return HtmlService.createHtmlOutputFromFile('Nova_venda').getContent();
}

// ─── SEGMENTAÇÃO POR CIDADE ────────────────────────────────────────────────
// Retorna a segmentação (col AA) com base na cidade (aba CIDADES, col[3])
function getSegmentacaoPorCidade(cidade) {
  try {
    var cidNorm = _normalizarTexto(cidade);
    var rows    = _getCidades();
    for (var i = 0; i < rows.length; i++) {
      if (_normalizarTexto(rows[i][6]) === cidNorm) return rows[i][3] || '';
    }
    return '';
  } catch(e) {
    Logger.log('getSegmentacaoPorCidade erro: ' + e);
    return '';
  }
}

// ─── PLANOS POR CIDADE+PRODUTO (sem UrlFetchApp — recebe cidade já preenchida) ─
// Chamado pelo onProdutoChange quando o endereço já foi preenchido pelo browser
function getPlanosPorCidadeProduto(cidade, produto) {
  try {
    var dadosCid = _getCidades();
    var dadosTab = _getTabela();
    if (!dadosCid || !dadosCid.length || !dadosTab || !dadosTab.length)
      return { erro: true, mensagem: 'Abas CIDADES ou TABELA não encontradas.' };

    var cidNorm  = _normalizarTexto(cidade);
    var linhaCid = null;
    for (var ci = 0; ci < dadosCid.length; ci++) {
      if (_normalizarTexto(dadosCid[ci][6]) === cidNorm) { linhaCid = dadosCid[ci]; break; }
    }
    if (!linhaCid) return { erro: false, cidade: cidade, planos: [], mensagem: 'Cidade não mapeada em CIDADES.' };

    var segmentacao = linhaCid[3] || '';
    var segNorm     = _normalizarTexto(segmentacao);
    var cabecalho   = dadosTab[1].map(function(h) { return _normalizarTexto(h); });
    var colIdx      = cabecalho.indexOf(segNorm);
    if (colIdx === -1) return { erro: false, cidade: cidade, planos: [], mensagem: 'Segmentação "' + segmentacao + '" não encontrada na TABELA.' };

    var buscaMovel = produto && (
      produto.toUpperCase().indexOf('MÓVEL') > -1 ||
      produto.toUpperCase().indexOf('MOVEL') > -1
    );
    var planos   = [];
    var catAtual = '';

    for (var ti = 2; ti < dadosTab.length; ti++) {
      var nome   = String(dadosTab[ti][0]).trim();
      var cat    = String(dadosTab[ti][1]).trim();
      var valRaw = dadosTab[ti][colIdx];
      if (!nome || valRaw === '' || valRaw === null) continue;

      var ehMovel = cat.toUpperCase().indexOf('MÓVEL') > -1 || cat.toUpperCase().indexOf('MOVEL') > -1;
      if (buscaMovel && !ehMovel) continue;
      if (!buscaMovel && ehMovel) continue;

      if (_normalizarTexto(cat) !== _normalizarTexto(catAtual)) {
        catAtual = cat;
        planos.push('▶️ ' + cat.toUpperCase() + ' ◀️');
      }
      var valNum = parseFloat(valRaw);
      planos.push(nome + ' | ' + (!isNaN(valNum) ? valNum.toFixed(2).replace('.', ',') : '0,00'));
    }

    return { erro: false, cidade: cidade.toUpperCase(), planos: planos };
  } catch(e) {
    Logger.log('getPlanosPorCidadeProduto erro: ' + e);
    return { erro: true, mensagem: 'Erro interno: ' + e.message };
  }
}

// ─── CEP + PLANOS POR CIDADE (chamada separada, após produto selecionado) ──
// Substitui buscarCEPBackend — retorna endereço E lista de planos da cidade,
// cruzando as abas CIDADES e TABELA exatamente como o script onEditInstalavel faz.

function buscarCEPBackend(cep, produto) {
  try {
    var limpo = (cep || '').replace(/\D/g, '');
    if (limpo.length !== 8) {
      return { erro: true, mensagem: 'CEP deve ter 8 dígitos.' };
    }

    var data = null;
    var logErros = [];

    // 1ª tentativa: BrasilAPI (mais estável)
    try {
      var r1 = UrlFetchApp.fetch(
        'https://brasilapi.com.br/api/cep/v1/' + limpo,
        { muteHttpExceptions: true }
      );
      var code1 = r1.getResponseCode();
      Logger.log('BrasilAPI HTTP: ' + code1 + ' → ' + r1.getContentText().substring(0, 100));
      if (code1 === 200) {
        var j1 = JSON.parse(r1.getContentText());
        if (j1.city) { // BrasilAPI retorna city mesmo para CEPs sem logradouro
          data = {
            logradouro: j1.street        || '',
            bairro:     j1.neighborhood  || '',
            cidade:     j1.city          || '',
            uf:         j1.state         || ''
          };
        } else {
          logErros.push('BrasilAPI: resposta sem cidade (CEP de caixa postal?)');
        }
      } else {
        logErros.push('BrasilAPI: HTTP ' + code1);
      }
    } catch (e1) {
      logErros.push('BrasilAPI: excecao - ' + e1.message);
      Logger.log('BrasilAPI excecao: ' + e1);
    }

    // 2ª tentativa: ViaCEP
    if (!data) {
      try {
        var r2 = UrlFetchApp.fetch(
          'https://viacep.com.br/ws/' + limpo + '/json/',
          { muteHttpExceptions: true }
        );
        var code2 = r2.getResponseCode();
        Logger.log('ViaCEP HTTP: ' + code2 + ' → ' + r2.getContentText().substring(0, 100));
        if (code2 === 200) {
          var j2 = JSON.parse(r2.getContentText());
          if (!j2.erro) {
            data = {
              logradouro: j2.logradouro || '',
              bairro:     j2.bairro     || '',
              cidade:     j2.localidade || '',
              uf:         j2.uf         || ''
            };
          } else {
            logErros.push('ViaCEP: CEP invalido segundo a API');
          }
        } else {
          logErros.push('ViaCEP: HTTP ' + code2);
        }
      } catch (e2) {
        logErros.push('ViaCEP: excecao - ' + e2.message);
        Logger.log('ViaCEP excecao: ' + e2);
      }
    }

    if (!data) {
      var msgErro = 'CEP ' + limpo + ' nao encontrado. Detalhes: ' + logErros.join(' | ');
      Logger.log(msgErro);
      return { erro: true, mensagem: msgErro };
    }

    var cidadeNorm  = _normalizarTexto(data.cidade);
    var sistema     = '';
    var segmentacao = '';
    var regional    = '';
    var cluster     = '';
    var planos      = [];

    // Cruza CIDADES e TABELA via cache — evita leituras duplicadas
    var dadosCid = _getCidades();
    var linhaCid = null;
    for (var ci = 0; ci < dadosCid.length; ci++) {
      if (_normalizarTexto(dadosCid[ci][6]) === cidadeNorm) { linhaCid = dadosCid[ci]; break; }
    }

    if (linhaCid) {
      sistema     = linhaCid[2] || '';
      segmentacao = linhaCid[3] || '';
      regional    = linhaCid[4] || '';
      cluster     = linhaCid[5] || '';

      var dadosTab  = _getTabela();
      var segNorm   = _normalizarTexto(segmentacao);
      var cabecalho = dadosTab[1].map(function (h) { return _normalizarTexto(h); });
      var colIdx    = cabecalho.indexOf(segNorm);

      if (colIdx !== -1) {
        var buscaMovel = produto && (
          produto.toUpperCase().indexOf('MÓVEL') > -1 ||
          produto.toUpperCase().indexOf('MOVEL') > -1
        );
        var catAtual = '';

        for (var ti = 2; ti < dadosTab.length; ti++) {
          var nome    = String(dadosTab[ti][0]).trim();
          var cat     = String(dadosTab[ti][1]).trim();
          var valRaw  = dadosTab[ti][colIdx];

          if (!nome || valRaw === '' || valRaw === null) continue;

          var ehMovel = cat.toUpperCase().indexOf('MÓVEL') > -1 ||
                        cat.toUpperCase().indexOf('MOVEL') > -1;

          if (buscaMovel && !ehMovel) continue;
          if (!buscaMovel && ehMovel) continue;

          if (_normalizarTexto(cat) !== _normalizarTexto(catAtual)) {
            catAtual = cat;
            planos.push('▶️ ' + cat.toUpperCase() + ' ◀️');
          }

          var valNum = parseFloat(valRaw);
          planos.push(nome + ' | ' + (!isNaN(valNum) ? valNum.toFixed(2).replace('.', ',') : '0,00'));
        }
      }
    }

    return {
      erro:       false,
      logradouro: data.logradouro.toUpperCase(),
      bairro:     data.bairro.toUpperCase(),
      cidade:     data.cidade.toUpperCase(),
      uf:         data.uf.toUpperCase(),
      sistema:    sistema,
      segmentacao: segmentacao,
      regional:   regional,
      cluster:    cluster,
      planos:     planos   // Array de strings — cabeçalhos ▶️ e planos "Nome | 99,90"
    };

  } catch (erro) {
    Logger.log('Erro em buscarCEPBackend: ' + erro);
    return { erro: true, mensagem: 'Erro interno: ' + erro.message };
  }
}

// Normaliza texto para comparação (remove acentos, trim, maiúsculo)
// ── Cache de abas auxiliares ───────────────────────────────────────────────
// Evita múltiplas leituras completas da aba CIDADES/TABELA por requisição.
// TTL 10 min — invalidado automaticamente por _limparCache().
function _getCidades() {
  var cache = CacheService.getScriptCache();
  var key   = CONFIG.CACHE_PREFIX + 'cidades_v1';
  try {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch(e) {}
  var rows = _getSpreadsheet_()
               .getSheetByName('CIDADES').getDataRange().getValues();
  try {
    var json = JSON.stringify(rows);
    if (json.length < 95000) cache.put(key, json, 600);
  } catch(e) {}
  return rows;
}

function _getTabela() {
  var cache = CacheService.getScriptCache();
  var key   = CONFIG.CACHE_PREFIX + 'tabela_v1';
  try {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch(e) {}
  var rows = _getSpreadsheet_()
               .getSheetByName('TABELA').getDataRange().getValues();
  try {
    var json = JSON.stringify(rows);
    if (json.length < 95000) cache.put(key, json, 600);
  } catch(e) {}
  return rows;
}

// ─── LEITURA ───────────────────────────────────────────────────────────────

// ============================================================================
// CONTEXTO 1.7 - LEITURA, LISTAGENS E FUNIL DO CRM
// ============================================================================
function getVendasPaginadas(pagina, filtro, opcoes) {
  try {
    pagina = pagina || 1;
    filtro = (filtro || '').toString().trim();
    if (typeof opcoes === 'string') { try { opcoes = JSON.parse(opcoes); } catch(e) { opcoes = {}; } }
    opcoes = opcoes || {};

    // Suporte a paginação por offset (frontend usa offset em vez de pagina p/ load-more)
    var limite = opcoes.limite ? Math.min(parseInt(opcoes.limite) || 500, 1000) : 500;
    var offset = opcoes.offset ? Math.max(parseInt(opcoes.offset) || 0, 0)     : 0;

    var sheet       = _getSheet();
    var ultimaLinha = sheet.getLastRow();
    if (ultimaLinha < 3) {
      return { dados: [], total: 0, totalGeral: 0, pagina: 1, temMais: false };
    }

    // ── CACHE HIT (somente offset=0, sem filtro de texto) ────────────────────
    var CACHE_KEY_LISTA = CONFIG.CACHE_PREFIX + 'lista_v3';
    if (offset === 0 && !filtro) {
      var cachedLista = _cacheGetChunked(CACHE_KEY_LISTA);
      if (cachedLista && Array.isArray(cachedLista.dados) && cachedLista.dados.length > 0) {
        Logger.log('getVendasPaginadas CACHE HIT: ' + cachedLista.dados.length + ' registros, totalGeral=' + cachedLista.totalGeral);
        return {
          dados:      cachedLista.dados,
          total:      cachedLista.dados.length,
          totalGeral: cachedLista.totalGeral || cachedLista.dados.length,
          pagina:     1,
          temMais:    !!(cachedLista.temMais)
        };
      }
    }

    var tz = Session.getScriptTimeZone();

    // ���─ FASE 1: Pre-scan coluna CLIENTE (col O = 15, 1-based) ────────────────
    // Lê apenas 1 coluna (3800 células) em vez de 43 colunas (163 400 células)
    var COL_CLIENTE = CONFIG.COLUNAS.CLIENTE + 1; // 0-based → 1-based
    var linhasNaoVazias = _preScanColuna(sheet, ultimaLinha, COL_CLIENTE, function(v) {
      return v !== '' && v !== null && v !== undefined;
    });

    var totalGeral = linhasNaoVazias.length;

    // Ordena desc: linha maior = registro mais recente = aparece primeiro
    linhasNaoVazias.sort(function(a, b) { return b - a; });

    // ── FASE 2: Fatia por offset + limite ────────────────────────────────────
    var linhasSlice = linhasNaoVazias.slice(offset, offset + limite);
    var temMais     = offset + limite < totalGeral;

    if (linhasSlice.length === 0) {
      return { dados: [], total: 0, totalGeral: totalGeral, pagina: pagina, temMais: false };
    }

    // ── FASE 3: Lê somente os blocos necessários via _lerBlocos ─────────────
    // _agruparBlocos exige array crescente
    var linhasAsc = linhasSlice.slice().sort(function(a, b) { return a - b; });
    var blocos    = _agruparBlocos(linhasAsc, 8);
    var lidos     = _lerBlocos(sheet, blocos, 47);

    // Mapa linhaSheet → row para acesso em O(1)
    var mapaLinhas = {};
    for (var m = 0; m < lidos.length; m++) {
      mapaLinhas[lidos[m].linhaSheet] = lidos[m].row;
    }

    // ── FASE 4: Mapeia na ordem desc (linhasSlice já está em ordem desc) ─────
    var vendas = [];
    for (var k = 0; k < linhasSlice.length; k++) {
      var numLinha = linhasSlice[k];
      var row = mapaLinhas[numLinha];
      if (!row) continue;
      vendas.push(_mapearLinhaLista(row, numLinha, tz));
    }

    // ── Salva no cache (somente offset=0, sem filtro, TTL 90s) ───────────────
    if (offset === 0 && !filtro) {
      _cachePutChunked(CACHE_KEY_LISTA, { dados: vendas, totalGeral: totalGeral, temMais: temMais }, 300);
      Logger.log('getVendasPaginadas: cache gravado (' + vendas.length + ' de ' + totalGeral + ' registros)');
    }

    Logger.log('getVendasPaginadas: offset=' + offset + ' limite=' + limite + ' retornando=' + vendas.length + ' totalGeral=' + totalGeral);

    return {
      dados:      vendas,
      total:      vendas.length,
      totalGeral: totalGeral,
      pagina:     pagina,
      temMais:    temMais
    };

  } catch (erro) {
    Logger.log('ERRO em getVendasPaginadas: ' + erro);
    return { dados: [], total: 0, totalGeral: 0, pagina: 1, temMais: false, erro: erro.message };
  }
}

function getVendaPorLinha(numeroLinha) {
  try {
    var sheet = _getSheet();
    var dados = sheet.getRange(numeroLinha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
    return _mapearLinha(dados, numeroLinha);
  } catch (erro) {
    throw new Error('Erro ao buscar venda: ' + erro.message);
  }
}

// ─── SALVAR / ATUALIZAR ────────────────────────────────────────────────────

function salvarVenda(dados) {
  // LockService: impede race condition com múltiplos usuários simultâneos
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(le) {
    return { sucesso: false, mensagem: '⚠️ Sistema ocupado. Tente novamente em instantes.' };
  }
  var resultado = { sucesso: false };
  var _papLinha  = null; // linha da venda PAP para notificar após lock
  try {
    Logger.log('salvarVenda recebido: linhaReferencia=' + dados.linhaReferencia + ' | cliente=' + dados.cliente + ' | status=' + dados.status);
    dados.cliente = String(dados.cliente || '');
    if (!dados.cliente.trim()) {
      throw new Error('Nome do cliente é obrigatório!');
    }
    if (!dados.status) {
      throw new Error('Status é obrigatório!');
    }
    if (STATUS_LIST.indexOf(dados.status) === -1) {
      throw new Error('Status inválido recebido: "' + dados.status + '"');
    }
    dados.cpf = String(dados.cpf || '');
    if (dados.cpf.trim() !== '') {
      var cpfLimpo = dados.cpf.replace(/\D/g, '');
      if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) {
        throw new Error('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.');
      }
    }

    var sheet      = _getSheet();
    var linhaDados = _construirLinhaDados(dados);

    // ── ARQUIVAR VENDA: se pré-status = "ARQUIVAR VENDA", arquiva e limpa ──
    if (dados.preStatus === 'ARQUIVAR VENDA' && dados.linhaReferencia && dados.linhaReferencia !== '') {
      var linhaArq = parseInt(dados.linhaReferencia);
      if (isNaN(linhaArq) || linhaArq < 3) throw new Error('Linha de referência inválida!');
      lock.releaseLock();
      var resArq = arquivarVenda(linhaArq);
      return resArq;
    }

    if (dados.linhaReferencia && dados.linhaReferencia !== '') {
      var linhaNum = parseInt(dados.linhaReferencia);
      if (isNaN(linhaNum) || linhaNum < 3) throw new Error('Linha de referência inválida!');
      sheet.getRange(linhaNum, 1, 1, linhaDados.length).setValues([linhaDados]);
      _limparCache();
      // Capturar linha para notificação PAP fora do lock
      if (dados.status === '2- Aguardando Instalação' || dados.status === '3 - Finalizada/Instalada') {
        _papLinha = linhaNum;
      }
      resultado = { sucesso: true, linha: linhaNum, mensagem: '✅ ' + dados.cliente.trim() + ' atualizado com sucesso!' };
    } else {
      var ultimaSheet = sheet.getLastRow();
      var novaLinha;
      if (ultimaSheet < 3) {
        novaLinha = 3;
      } else {
        var colStatus = sheet.getRange(3, CONFIG.COLUNAS.STATUS + 1, ultimaSheet - 2, 1).getValues();
        var ultimaReal = 0;
        for (var r = colStatus.length - 1; r >= 0; r--) {
          if (colStatus[r][0] !== '' && colStatus[r][0] !== null && colStatus[r][0] !== undefined) {
            ultimaReal = r;
            break;
          }
        }
        novaLinha = ultimaReal + 3 + 1;
      }
      Logger.log('salvarVenda: nova linha = ' + novaLinha + ' (lastRow=' + ultimaSheet + ')');
      sheet.getRange(novaLinha, 1, 1, linhaDados.length).setValues([linhaDados]);
      _limparCache();
      resultado = { sucesso: true, linha: novaLinha, mensagem: '✅ ' + dados.cliente.trim() + ' cadastrado com sucesso!' };
    }

  } catch (erro) {
    resultado = { sucesso: false, mensagem: '❌ ' + erro.message };
  } finally {
    lock.releaseLock();
  }

  // Notificação PAP fora do lock (chamada HTTP não pode ocorrer dentro do lock)
  if (resultado.sucesso && _papLinha) {
    try {
      var c      = CONFIG.COLUNAS;
      var numCols = c.CLIENTE + 1; // lê até col T (CLIENTE=19)
      var rowPAP = _getSheet().getRange(_papLinha, 1, 1, numCols).getValues()[0];
      if (rowPAP[c.CANAL] === 'PAP') {
        var evPAP = (dados.status === '3 - Finalizada/Instalada') ? 'instalada' : 'aguardando_instalacao';
        var vPAP  = _papBuscarSubscriberVendedor(null, rowPAP[c.RESP]);
        if (vPAP && vPAP.subscriberId) {
          _papNotificarVendedorPAP(evPAP, vPAP.subscriberId, {
            pap_nome_cliente: String(rowPAP[c.CLIENTE] || ''),
            pap_plano:        String(rowPAP[c.PLANO]   || ''),
            pap_agenda:       (function(v){ if(!v) return ''; var d = new Date(v); return isNaN(d)?String(v):Utilities.formatDate(d,Session.getScriptTimeZone(),'dd/MM/yyyy'); })(rowPAP[c.AGENDA]),
            pap_turno:        String(rowPAP[c.TURNO]   || ''),
            pap_status:       dados.status
          });
        }
      }
    } catch (ne) { Logger.log('salvarVenda PAP notif: ' + ne.message); }
  }

  return resultado;
}




// ─── DADOS DO FUNIL DE INSTALAÇÕES ────────────────────────────────────────
// Retorna TODAS as vendas dos 3 status do funil (sem paginação)

// Limpa cache do funil (rode no editor para forçar recarga)
function limparCacheFunil() {
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'funil_v2_meta');
  Logger.log('Cache do funil removido.');
}

function getVendasFunil() {
  try {
    // ── Cache com chunks (suporta JSON > 100KB) ────────────────────────
    var CACHE_KEY = CONFIG.CACHE_PREFIX + 'funil_v2';
    var cached = _cacheGetChunked(CACHE_KEY);
    if (cached && Array.isArray(cached.dados) && cached.dados.length > 0) {
      Logger.log('getVendasFunil cache hit: ' + cached.dados.length + ' registros');
      return cached;
    }

    var sheet       = _getSheet();
    var ultimaLinha = sheet.getLastRow();
    if (ultimaLinha < 3) return { dados: [], total: 0 };

    var statusFunil = {
      '2- Aguardando Instalação': true,
      '3 - Finalizada/Instalada': true,
      'Pendencia Vero':           true
    };
    var LIMITES = {
      '2- Aguardando Instalação': 150,
      '3 - Finalizada/Instalada': 9999, // sem limite — mostra total do mês atual
      'Pendencia Vero':           150
    };
    var agora    = new Date();
    var mesAtual = agora.getMonth() + 1;
    var anoAtual = agora.getFullYear();
    var tz       = Session.getScriptTimeZone();
    var cf       = CONFIG.COLUNAS;
    var colStatus = cf.STATUS + 1;
    var primeiraLinhaDados = 3;
    var totalLinhas = ultimaLinha - primeiraLinhaDados + 1;
    var statusValsFast = sheet.getRange(primeiraLinhaDados, colStatus, totalLinhas, 1).getValues();
    var instalValsFast = sheet.getRange(primeiraLinhaDados, cf.INSTAL + 1, totalLinhas, 1).getValues();
    var linhasSelecionadasFast = [];
    var contadoresFast = {
      '2- Aguardando Instalação': 0,
      '3 - Finalizada/Instalada': 0,
      'Pendencia Vero':           0
    };

    for (var idxFast = statusValsFast.length - 1; idxFast >= 0; idxFast--) {
      var statusFast = String(statusValsFast[idxFast][0] || '').trim();
      if (!statusFunil[statusFast]) continue;

      if (statusFast === '3 - Finalizada/Instalada') {
        var dInstalFast = _parseDataFlex(instalValsFast[idxFast][0]);
        if (!dInstalFast ||
            dInstalFast.getMonth() + 1 !== mesAtual ||
            dInstalFast.getFullYear() !== anoAtual) {
          continue;
        }
      } else if (contadoresFast[statusFast] >= (LIMITES[statusFast] || 150)) {
        continue;
      }

      var linhaSheetFast = primeiraLinhaDados + idxFast;
      linhasSelecionadasFast.push(linhaSheetFast);
      contadoresFast[statusFast]++;
    }

    Logger.log('getVendasFunil fast-select: ' + linhasSelecionadasFast.length + ' linhas');
    if (linhasSelecionadasFast.length === 0) return { dados: [], total: 0 };

    var linhasAscFast = linhasSelecionadasFast.slice().sort(function(a, b) { return a - b; });
    var blocosFast = _agruparBlocos(linhasAscFast, 8);
    var colunasFunilFast = _getMaxColunaLida([cf.WHATS]);
    var registrosFast = _lerBlocos(sheet, blocosFast, colunasFunilFast);
    var mapaFast = {};
    for (var rf = 0; rf < registrosFast.length; rf++) {
      mapaFast[registrosFast[rf].linhaSheet] = registrosFast[rf].row;
    }

    var resultadoFast = [];
    for (var lf = 0; lf < linhasSelecionadasFast.length; lf++) {
      var linhaFast = linhasSelecionadasFast[lf];
      var rowFast = mapaFast[linhaFast];
      if (!rowFast) continue;

      var clienteFast = String(rowFast[cf.CLIENTE] || '').trim();
      var cpfFast     = String(rowFast[cf.CPF]     || '').trim();
      if (!clienteFast && !cpfFast) continue;

      var dAtivFast = rowFast[cf.DATA_ATIV];
      var dataAtivStrFast = (dAtivFast instanceof Date && !isNaN(dAtivFast))
        ? Utilities.formatDate(dAtivFast, tz, 'dd/MM/yyyy') : '';

      var dAgFast = rowFast[cf.AGENDA];
      var agendaStrFast = (dAgFast instanceof Date && !isNaN(dAgFast))
        ? Utilities.formatDate(dAgFast, tz, 'dd/MM/yyyy') : (dAgFast ? String(dAgFast) : '');

      var dInsFast = rowFast[cf.INSTAL];
      var instalStrFast = (dInsFast instanceof Date && !isNaN(dInsFast))
        ? Utilities.formatDate(dInsFast, tz, 'dd/MM/yyyy') : (dInsFast ? String(dInsFast) : '');

      resultadoFast.push({
        linha:     linhaFast,
        status:    String(rowFast[cf.STATUS]    || '').trim(),
        cliente:   clienteFast,
        produto:   String(rowFast[cf.PRODUTO]   || '').trim(),
        plano:     String(rowFast[cf.PLANO]     || '').trim(),
        resp:      String(rowFast[cf.RESP]      || '').trim(),
        whats:     String(rowFast[cf.WHATS]     || '').trim(),
        codCli:    String(rowFast[cf.COD_CLI]   || '').trim(),
        contrato:  String(rowFast[cf.CONTRATO]  || '').trim(),
        dataAtiv:  dataAtivStrFast,
        agenda:    agendaStrFast,
        turno:     String(rowFast[cf.TURNO]     || '').trim(),
        instal:    instalStrFast,
        preStatus: String(rowFast[cf.PRE_STATUS] || '').trim()
      });
    }

    Logger.log('getVendasFunil fast: ' + resultadoFast.length + ' registros. Ag=' +
      contadoresFast['2- Aguardando Instalação'] + ' Fin=' +
      contadoresFast['3 - Finalizada/Instalada'] + ' Pen=' + contadoresFast['Pendencia Vero']);

    var retornoFast = { dados: resultadoFast, total: resultadoFast.length };
    _cachePutChunked(CACHE_KEY, retornoFast, 300);
    return retornoFast;

  } catch (e) {
    Logger.log('Erro em getVendasFunil: ' + e.toString());
    return { dados: [], total: 0, erro: e.message };
  }
}

// ─── MOVER VENDA NO FUNIL ──────────────────────────────────────────────────
// Atualiza status + campo extra (data de instalação ou observação)
function moverVendaFunil(payload) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(le) {
    return { sucesso: false, mensagem: '⚠️ Sistema ocupado. Tente novamente.' };
  }
  var sheet      = null;
  var linha      = null;
  var novoStatus = payload.novoStatus;
  var resultado  = { sucesso: false };
  try {
    sheet = _getSheet();
    if (!sheet) return { sucesso: false, mensagem: 'Planilha não encontrada.' };

    linha          = parseInt(payload.linha);
    var campoExtra = payload.campoExtra;  // 'instal' ou 'observacao'
    var valorExtra = payload.valorExtra;

    var statusValidos = [
      '2- Aguardando Instalação',
      '3 - Finalizada/Instalada',
      'Pendencia Vero'
    ];
    if (statusValidos.indexOf(novoStatus) === -1) {
      return { sucesso: false, mensagem: 'Status inválido para o funil.' };
    }

    // Atualiza status (coluna C = índice 2 = coluna 3)
    sheet.getRange(linha, CONFIG.COLUNAS.STATUS + 1).setValue(novoStatus);

    // Atualiza campo extra conforme destino
    if (campoExtra === 'instal' && valorExtra) {
      var partesData = String(valorExtra).split('-');
      var dataInstal = (partesData.length === 3)
        ? new Date(parseInt(partesData[0]), parseInt(partesData[1]) - 1, parseInt(partesData[2]))
        : valorExtra;
      sheet.getRange(linha, CONFIG.COLUNAS.INSTAL + 1).setValue(dataInstal);
    }
    if (campoExtra === 'observacao' && valorExtra) {
      sheet.getRange(linha, CONFIG.COLUNAS.OBSERVACAO + 1).setValue(valorExtra);
    }

    _limparCache();

    Logger.log('Funil: linha ' + linha + ' movida para "' + novoStatus + '"' +
               (campoExtra ? ' | ' + campoExtra + ': ' + valorExtra : ''));

    resultado = { sucesso: true };

  } catch (e) {
    Logger.log('Erro em moverVendaFunil: ' + e);
    resultado = { sucesso: false, mensagem: e.message };
  } finally {
    lock.releaseLock();
  }

  // Notificação PAP fora do lock (apenas status 2 e 3)
  if (resultado.sucesso && sheet && linha &&
      (novoStatus === '2- Aguardando Instalação' || novoStatus === '3 - Finalizada/Instalada')) {
    try {
      var c      = CONFIG.COLUNAS;
      var rowPAP = sheet.getRange(linha, 1, 1, c.CLIENTE + 1).getValues()[0];
      if (rowPAP[c.CANAL] === 'PAP') {
        var vPAP  = _papBuscarSubscriberVendedor(null, rowPAP[c.RESP]);
        if (vPAP && vPAP.subscriberId) {
          var evPAP = (novoStatus === '3 - Finalizada/Instalada') ? 'instalada' : 'aguardando_instalacao';
          _papNotificarVendedorPAP(evPAP, vPAP.subscriberId, {
            pap_nome_cliente: String(rowPAP[c.CLIENTE] || ''),
            pap_plano:        String(rowPAP[c.PLANO]   || ''),
            pap_agenda:       (function(v){ if(!v) return ''; var d = new Date(v); return isNaN(d)?String(v):Utilities.formatDate(d,Session.getScriptTimeZone(),'dd/MM/yyyy'); })(rowPAP[c.AGENDA]),
            pap_turno:        String(rowPAP[c.TURNO]   || ''),
            pap_status:       novoStatus
          });
        }
      }
    } catch(ne) { Logger.log('moverVendaFunil notif: ' + ne.message); }
  }

  return resultado;
}

// ─── FUNÇÕES PRIVADAS ──────────────────────────────────────────────────────
function _getSpreadsheet_() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  var scriptProps = PropertiesService.getScriptProperties();
  var fallbackId = String(
    (CONFIG && CONFIG.SPREADSHEET_ID) ||
    scriptProps.getProperty('CRM_SPREADSHEET_ID') ||
    ''
  ).trim();

  if (!fallbackId) {
    throw new Error(
      'Planilha do CRM nao encontrada. Configure CRM_SPREADSHEET_ID nas propriedades do script ou publique o projeto vinculado a planilha correta.'
    );
  }

  try {
    return SpreadsheetApp.openById(fallbackId);
  } catch (e) {
    throw new Error(
      'Nao foi possivel abrir a planilha do CRM (' + fallbackId + '). Verifique se ela existe e se a conta do deploy tem acesso.'
    );
  }
}

function _getSheet() {
  var ss    = _getSpreadsheet_();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('Planilha "' + CONFIG.SHEET_NAME + '" não encontrada!');
  return sheet;
}


// Grava dados no cache dividindo em pedaços de ~90KB (limite do GAS = 100KB por chave)
function _cachePutChunked(baseKey, data, ttl) {
  try {
    var cache = CacheService.getScriptCache();
    var json  = JSON.stringify(data);
    var CHUNK = 90000;
    var total = Math.ceil(json.length / CHUNK);
    for (var i = 0; i < total; i++) {
      cache.put(baseKey + '_' + i, json.substring(i * CHUNK, (i + 1) * CHUNK), ttl);
    }
    cache.put(baseKey + '_meta', JSON.stringify({ chunks: total }), ttl);
  } catch(e) { Logger.log('_cachePutChunked erro: ' + e); }
}

// Lê dados do cache reunindo os pedaços gravados por _cachePutChunked
function _cacheGetChunked(baseKey) {
  try {
    var cache   = CacheService.getScriptCache();
    var metaRaw = cache.get(baseKey + '_meta');
    if (!metaRaw) return null;
    var meta    = JSON.parse(metaRaw);
    if (!meta || !meta.chunks) return null;
    var parts   = [];
    for (var i = 0; i < meta.chunks; i++) {
      var part = cache.get(baseKey + '_' + i);
      if (part === null) return null;
      parts.push(part);
    }
    return JSON.parse(parts.join(''));
  } catch(e) { Logger.log('_cacheGetChunked erro: ' + e); return null; }
}

// Pre-scan: lê apenas UMA coluna da planilha e retorna as linhas (1-based) que passam no filtro
function _preScanColuna(sheet, ultimaLinha, coluna, filtroFn) {
  if (ultimaLinha < 2) return [];
  var valores = sheet.getRange(2, coluna, ultimaLinha - 1, 1).getValues();
  var resultado = [];
  for (var i = 0; i < valores.length; i++) {
    if (filtroFn(valores[i][0])) {
      resultado.push(i + 2); // i+2 porque começa na linha 2
    }
  }
  return resultado;
}

function _getMaxColunaLida(indices) {
  var maior = 0;
  for (var i = 0; i < indices.length; i++) {
    if (indices[i] > maior) maior = indices[i];
  }
  return maior + 1; // 0-based -> 1-based
}

function _normalizarTexto(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function _parseDataFlex(valor) {
  if (valor instanceof Date && !isNaN(valor)) return valor;
  if (typeof valor === 'number' && valor > 0) {
    var dNum = new Date(Math.round((valor - 25569) * 86400 * 1000));
    return isNaN(dNum) ? null : dNum;
  }
  var txt = String(valor || '').trim();
  if (!txt) return null;
  var partes = txt.split('/');
  if (partes.length === 3) {
    var dBr = new Date(parseInt(partes[2], 10), parseInt(partes[1], 10) - 1, parseInt(partes[0], 10));
    return isNaN(dBr) ? null : dBr;
  }
  var d = new Date(txt);
  return isNaN(d) ? null : d;
}

// Agrupa linhas próximas em blocos contíguos (para leitura eficiente em batch)
// Ex: [5,6,7, 20,21, 50] com gap=8 → [{inicio:5, fim:7}, {inicio:20, fim:21}, {inicio:50, fim:50}]
function _agruparBlocos(linhas, gap) {
  if (!linhas || linhas.length === 0) return [];
  var sorted = linhas.slice().sort(function(a, b) { return a - b; });
  var blocos = [];
  var inicio = sorted[0];
  var fim    = sorted[0];
  for (var i = 1; i < sorted.length; i++) {
    if (sorted[i] - fim <= gap) {
      fim = sorted[i];
    } else {
      blocos.push({ inicio: inicio, fim: fim });
      inicio = sorted[i];
      fim    = sorted[i];
    }
  }
  blocos.push({ inicio: inicio, fim: fim });
  return blocos;
}

// Lê apenas os blocos necessários da planilha (evita ler a planilha inteira)
function _lerBlocos(sheet, blocos, numColunas) {
  if (!blocos || blocos.length === 0) return [];
  var maxCols = Math.max(1, Math.min(numColunas || CONFIG.TOTAL_COLUNAS, sheet.getMaxColumns()));

  var menorLinha = blocos[0].inicio;
  var maiorLinha = blocos[0].fim;
  var totalLinhasBlocos = 0;
  for (var i = 0; i < blocos.length; i++) {
    var item = blocos[i];
    totalLinhasBlocos += (item.fim - item.inicio + 1);
    if (item.inicio < menorLinha) menorLinha = item.inicio;
    if (item.fim > maiorLinha) maiorLinha = item.fim;
  }

  var spanTotal = maiorLinha - menorLinha + 1;
  var leituraContiguaVale = spanTotal <= 800 || spanTotal <= Math.ceil(totalLinhasBlocos * 1.6);
  var registros = [];

  if (leituraContiguaVale) {
    var dadosSpan = sheet.getRange(menorLinha, 1, spanTotal, maxCols).getValues();
    for (var s = 0; s < dadosSpan.length; s++) {
      registros.push({ linhaSheet: menorLinha + s, row: dadosSpan[s] });
    }
    return registros;
  }

  for (var b = 0; b < blocos.length; b++) {
    var bloco = blocos[b];
    var numLinhas = bloco.fim - bloco.inicio + 1;
    var dados = sheet.getRange(bloco.inicio, 1, numLinhas, maxCols).getValues();
    for (var r = 0; r < dados.length; r++) {
      registros.push({ linhaSheet: bloco.inicio + r, row: dados[r] });
    }
  }
  return registros;
}

// Limpa especificamente o cache da lista completa (usado após edições e drag do board)
function _limparCacheListaCompleta() {
  try {
    var cache = CacheService.getScriptCache();
    var base  = CONFIG.CACHE_PREFIX + 'lista_completa';
    cache.remove(base + '_meta');
    for (var i = 0; i < 20; i++) { cache.remove(base + '_' + i); }

  } catch(e) { Logger.log('_limparCacheListaCompleta erro: ' + e); }
}

// Remove todos os chunks do cache chunked da lista principal (lista_v3)
function _limparCacheListaV3() {
  var cache  = CacheService.getScriptCache();
  var prefix = CONFIG.CACHE_PREFIX + 'lista_v3';
  try {
    var metaRaw = cache.get(prefix + '_meta');
    var keys    = [prefix + '_meta'];
    if (metaRaw) {
      var meta = JSON.parse(metaRaw);
      if (meta && meta.total) {
        for (var i = 0; i < meta.total; i++) keys.push(prefix + '_' + i);
      }
    }
    cache.removeAll(keys);
    Logger.log('_limparCacheListaV3: ' + keys.length + ' chaves removidas.');
  } catch(e) { Logger.log('_limparCacheListaV3 erro: ' + e); }
}


// ── REPARO: preenche Sistema (col Z) e Segmentação (col AA) vazios ────────────
// Executa UMA vez manualmente no editor Apps Script.
// Lê a cidade de cada linha e busca sistema/segmentação na aba CIDADES.
// Só sobrescreve células VAZIAS — não toca em valores já preenchidos.
function repararSistemaSegmentacao() {
  var sheet    = _getSheet();
  var ultLinha = sheet.getLastRow();
  if (ultLinha < 3) { Logger.log('Nenhuma venda encontrada.'); return; }

  var dados    = sheet.getRange(3, 1, ultLinha - 2, CONFIG.TOTAL_COLUNAS).getValues();
  var cidades  = _getCidades();
  var c        = CONFIG.COLUNAS;

  // Monta mapa cidade normalizada → { sistema, segmentacao }
  var mapaCidades = {};
  for (var ci = 0; ci < cidades.length; ci++) {
    var chave = _normalizarTexto(cidades[ci][6]);
    if (chave) mapaCidades[chave] = { sistema: cidades[ci][2] || '', segmentacao: cidades[ci][3] || '' };
  }

  var corrigidos = 0;
  for (var i = 0; i < dados.length; i++) {
    var linha    = dados[i];
    var cidade   = _normalizarTexto(String(linha[c.CIDADE] || ''));
    var sistema  = String(linha[c.SISTEMA] || '').trim();
    var segm     = String(linha[c.SEGMENTACAO] || '').trim();

    if (!cidade) continue;                    // linha sem cidade — pula
    if (sistema && segm) continue;            // ambos já preenchidos — pula
    var lookup = mapaCidades[cidade];
    if (!lookup) continue;                    // cidade não mapeada — pula

    var linhaSheet = i + 3;
    if (!sistema && lookup.sistema)   sheet.getRange(linhaSheet, c.SISTEMA + 1).setValue(lookup.sistema);
    if (!segm    && lookup.segmentacao) sheet.getRange(linhaSheet, 27).setValue(lookup.segmentacao);
    corrigidos++;
  }

  _limparCache();
  var msg = 'repararSistemaSegmentacao: ' + corrigidos + ' linha(s) corrigida(s) de ' + dados.length + ' total.';
  Logger.log(msg);
  _getSpreadsheet_().toast(msg, '✅ Reparo concluído', 10);
}


// ── VALIDAÇÃO DE STATUS POR TIPO (onEdit) ────────────────────────────────────
// Dispara quando o usuário edita a coluna de Status na aba "1 - Vendas".
// Verifica se o status escolhido é permitido para o produto da linha.
// Instalar: Extensões → Apps Script → Gatilhos → onEdit → Ao editar

var _STATUS_MOVEL = [
  '1- Conferencia/Ativação',
  '2- Aguardando Entrega',
  '3- Aguardando Retirada',
  '4- Entregue',
  '5 - Finalizado',
  'Pendencia Vero',
  'Cancelado',
  'Cancelamento Técnico',
  'Cancelamento Comercial',
  'Churn',
  'Devolvido'
];

var _STATUS_FIBRA = [
  '1- Conferencia/Ativação',
  '2- Aguardando Instalação',
  '3 - Finalizada/Instalada',
  'Pendencia Vero',
  'Cancelado',
  'Cancelamento Técnico',
  'Cancelamento Comercial',
  'Churn',
  'Devolvido'
];

function onEdit(e) {
  if (!e || !e.range) return;

  var range = e.range;
  var sheet = range.getSheet();

  // Só atua na aba de vendas
  if (sheet.getName() !== CONFIG.SHEET_NAME) return;

  // Só atua na coluna de status configurada
  if (range.getColumn() !== (CONFIG.COLUNAS.STATUS + 1)) return;

  // Ignora linha de cabeçalho
  var row = range.getRow();
  if (row < 3) return;

  var novoStatus = String(range.getValue()).trim();
  if (!novoStatus) return;

  // Lê o produto configurado da mesma linha
  var tipo = String(sheet.getRange(row, CONFIG.COLUNAS.PRODUTO + 1).getValue()).trim();

  var isMovel = /móvel alone|móvel combo|movel alone|movel combo/i.test(tipo);
  var isFibra = /fibra alone|fibra combo/i.test(tipo);

  // Se não for nem Móvel nem Fibra, não valida
  if (!isMovel && !isFibra) return;

  var permitidos = isMovel ? _STATUS_MOVEL : _STATUS_FIBRA;
  var tipoLabel  = isMovel ? 'Móvel' : 'Fibra';

  if (permitidos.indexOf(novoStatus) === -1) {
    range.clearContent();
  _getSpreadsheet_().toast(
      'Permitidos: ' + permitidos.join(' | '),
      '⚠️ Status inválido para ' + tipoLabel,
      8
    );
  }
}

function _limparCache() {
  var cache = CacheService.getScriptCache();
  // Remove todos os caches conhecidos de uma vez
  var toRemove = [
    CONFIG.CACHE_PREFIX + 'funil_v2_meta',
    CONFIG.CACHE_PREFIX + 'leads_v1_meta',
    CONFIG.CACHE_PREFIX + 'responsaveis_v1',
    CONFIG.CACHE_PREFIX + 'cidades_v1',
    CONFIG.CACHE_PREFIX + 'tabela_v1',
    CONFIG.CACHE_PREFIX + 'keys'
  ];
  // Invalida dashboards dos últimos 3 meses (cache simples)
  var hoje = new Date();
  for (var m = 0; m <= 2; m++) {
    var d = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1);
    toRemove.push(CONFIG.CACHE_PREFIX + 'dash_' + (d.getMonth()+1) + '_' + d.getFullYear());
  }
  try { cache.removeAll(toRemove); } catch(e) { Logger.log('_limparCache removeAll erro: ' + e); }
  _limparCacheListaCompleta();
  _limparCacheListaV3(); // garante limpeza do cache chunked da lista principal
}

// Função pública — chamada pelo botão 🔄 do frontend para forçar recarga da planilha
function limparCacheCompleto() {
  try {
    _limparCache();
    return { sucesso: true };
  } catch(e) {
    Logger.log('limparCacheCompleto erro: ' + e);
    return { sucesso: false, erro: e.message };
  }
}

// Versão otimizada para listagens — recebe timezone explícito (evita Session.getScriptTimeZone() repetido)
function _valorListaSemDuplicar(plano, valor) {
  var planoTxt = String(plano || '').trim();
  var valorTxt = String(valor || '').trim();
  if (!planoTxt || !valorTxt) return valorTxt;

  var planoNorm = planoTxt.replace(/\s+/g, ' ').replace(/R\$\s*/gi, '').trim();
  var valorNorm = valorTxt.replace(/\s+/g, ' ').replace(/R\$\s*/gi, '').trim();
  return planoNorm.indexOf(valorNorm) !== -1 ? '' : valorTxt;
}

function _mapearLinhaLista(row, numeroLinha, tz) {
  var c = CONFIG.COLUNAS;
  var clienteLegado = _normalizarCamposClienteLegado(row, c);
  return {
    linha:       numeroLinha,
    canal:       row[c.CANAL]        || '',
    produto:     row[c.PRODUTO]      || '',
    status:      row[c.STATUS]       || '',
    dataAtiv:    (row[c.DATA_ATIV] instanceof Date) ? Utilities.formatDate(row[c.DATA_ATIV], tz, 'dd/MM/yyyy') : (row[c.DATA_ATIV] || ''),
    codCli:      row[c.COD_CLI]      || '',
    contrato:    String(row[c.CONTRATO] || '').trim().replace(/\.0$/, ''),
    agenda:      (row[c.AGENDA] instanceof Date) ? Utilities.formatDate(row[c.AGENDA], tz, 'dd/MM/yyyy') : (row[c.AGENDA] || ''),
    turno:       row[c.TURNO]        || '',
    instal:      (row[c.INSTAL] instanceof Date) ? Utilities.formatDate(row[c.INSTAL], tz, 'dd/MM/yyyy') : (row[c.INSTAL] || ''),
    resp:        row[c.RESP]         || '',
    cpf:         (function(v) {
      var s = String(v || '').trim().replace(/[^0-9\/\.\-]/g, '');
      if (!s) return '';
      var soDigitos = s.replace(/\D/g, '');
      if (soDigitos.length > 0 && soDigitos === s) {
        if (soDigitos.length <= 11) return soDigitos.padStart(11, '0');
        if (soDigitos.length <= 14) return soDigitos.padStart(14, '0');
      }
      return s;
    })(row[c.CPF]),
    cliente:     row[c.CLIENTE]      || '',
    whats:       row[c.WHATS]        || '',
    tel:         row[c.TEL]          || '',
    cep:         row[c.CEP]          || '',
    rua:         row[c.RUA]          || '',
    num:         row[c.NUM]          || '',
    complemento: row[c.COMPLEMENTO]  || '',
    bairro:      row[c.BAIRRO]       || '',
    cidade:      row[c.CIDADE]       || '',
    uf:          row[c.UF]           || '',
    sistema:     row[c.SISTEMA]      || '',
    venc:        row[c.VENC]         || '',
    fat:         row[c.FAT]          || '',
    plano:       row[c.PLANO]        || '',
    valor:       _valorListaSemDuplicar(row[c.PLANO], row[c.VALOR]),
    linhaMovel:    row[c.LINHA_MOVEL]    || '',
    portabilidade: row[c.PORTABILIDADE] || '',
    observacao:  row[c.OBSERVACAO]   || '',
    verohub:     (function(v) {
      if (!v) return '';
      if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'dd/MM/yyyy');
      return String(v).trim();
    })(row[c.VEROHUB]),
    statusPAP:        String(row[c.STATUS_PAP]        || ''),
    verohubPedido:    String(row[c.VEROHUB_PEDIDO]    || '').trim(),
    verohubPedidoDt:  String(row[c.VEROHUB_PEDIDO_DT] || '').trim(),
    segmentacao:      String(row[c.SEGMENTACAO]        || '').trim(),
    preStatus:        String(row[c.PRE_STATUS]         || ''),
    bcTags:           String(row[c.BC_TAGS]            || '').trim(),
    bcStatus:         String(row[c.BC_STATUS]          || '').trim(),
    nomeMae:          clienteLegado.nomeMae,
    dtNasc:           clienteLegado.dtNasc,
    rg:               clienteLegado.rg,
    mapsLink:         '',
    reagendamentos:   parseInt(row[c.REAGENDAMENTOS]) || 0,
    viabilidade:      String(row[c.VIABILIDADE]        || '').trim()
  };
}

function _mapearLinha(row, numeroLinha) {
  var c = CONFIG.COLUNAS;
  var clienteLegado = _normalizarCamposClienteLegado(row, c);
  return {
    linha:       numeroLinha,
    canal:       row[c.CANAL]        || '',
    produto:     row[c.PRODUTO]      || '',
    status:      row[c.STATUS]       || '',
    dataAtiv:    _formatarData(row[c.DATA_ATIV]),
    codCli:      row[c.COD_CLI]      || '',
    contrato:    String(row[c.CONTRATO] || '').trim().replace(/\.0$/, ''),
    agenda:      _formatarData(row[c.AGENDA]),
    turno:       row[c.TURNO]        || '',
    instal:      _formatarData(row[c.INSTAL]),
    resp:        row[c.RESP]         || '',
    cpf:         (function(v) {
      var s = String(v || '').trim().replace(/[^0-9\/\.\-]/g, '');
      if (!s) return '';
      // Se só dígitos, faz padding: CPF=11, CNPJ=14
      var soDigitos = s.replace(/\D/g, '');
      if (soDigitos.length > 0 && soDigitos === s) {
        if (soDigitos.length <= 11) return soDigitos.padStart(11, '0');
        if (soDigitos.length <= 14) return soDigitos.padStart(14, '0');
      }
      return s;
    })(row[c.CPF]),
    cliente:     row[c.CLIENTE]      || '',
    whats:       row[c.WHATS]        || '',
    tel:         row[c.TEL]          || '',
    cep:         row[c.CEP]          || '',
    rua:         row[c.RUA]          || '',
    num:         row[c.NUM]          || '',
    complemento: row[c.COMPLEMENTO]  || '',
    bairro:      row[c.BAIRRO]       || '',
    cidade:      row[c.CIDADE]       || '',
    uf:          row[c.UF]           || '',
    sistema:     row[c.SISTEMA]      || '',
    venc:        row[c.VENC]         || '',
    fat:         row[c.FAT]          || '',
    plano:       row[c.PLANO]        || '',
    valor:       _valorListaSemDuplicar(row[c.PLANO], row[c.VALOR]),
    linhaMovel:    row[c.LINHA_MOVEL]    || '',
    portabilidade: row[c.PORTABILIDADE] || '',
    observacao:  row[c.OBSERVACAO]   || '',  // L  - Motivo Cancelamento / Observação
    verohub:     (function(v) {
      if (!v) return '';
      if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      return String(v).trim();
    })(row[c.VEROHUB]),  // AP - Data blindagem VeroHub
    statusPAP:        String(row[c.STATUS_PAP]        || ''),
    verohubPedido:    String(row[c.VEROHUB_PEDIDO]    || '').trim(),
    verohubPedidoDt:  String(row[c.VEROHUB_PEDIDO_DT] || '').trim(),
    segmentacao:      String(row[c.SEGMENTACAO]        || '').trim(),
    preStatus:        String(row[c.PRE_STATUS]         || ''),
    bcTags:           String(row[c.BC_TAGS]            || '').trim(),
    bcStatus:         String(row[c.BC_STATUS]          || '').trim(),
    nomeMae:          clienteLegado.nomeMae,
    dtNasc:           clienteLegado.dtNasc,
    rg:               clienteLegado.rg,
    mapsLink:         '',
    reagendamentos:   parseInt(row[c.REAGENDAMENTOS]) || 0,
    viabilidade:      String(row[c.VIABILIDADE]        || '').trim()
  };
}

function _construirLinhaDados(d) {
  var linha = new Array(CONFIG.TOTAL_COLUNAS).fill('');
  var c = CONFIG.COLUNAS;
  linha[c.CANAL]       = d.canal       || '';
  linha[c.PRODUTO]     = d.produto     || '';
  linha[c.STATUS]      = d.status      || '';
  linha[c.DATA_ATIV]   = d.dataAtiv    || '';
  linha[c.COD_CLI]     = d.codCli      || '';
  linha[c.CONTRATO]    = d.contrato    || '';
  linha[c.AGENDA]      = d.agenda      || '';
  linha[c.TURNO]       = d.turno       || '';
  linha[c.INSTAL]      = d.instal      || '';
  linha[c.OBSERVACAO]  = d.observacao  || '';  // L  - Observação
  linha[c.RESP]        = d.resp        || '';
  linha[c.CPF]         = d.cpf         || '';
  linha[c.CLIENTE]     = d.cliente     || '';
  linha[c.WHATS]       = d.whats       || '';
  linha[c.TEL]         = d.tel         || '';
  linha[c.CEP]         = d.cep         || '';
  linha[c.RUA]         = d.rua         || '';
  linha[c.NUM]         = d.num         || '';
  linha[c.COMPLEMENTO] = d.complemento || '';
  linha[c.BAIRRO]      = d.bairro      || '';
  linha[c.CIDADE]      = d.cidade      || '';
  linha[c.UF]          = d.uf          || '';
  linha[c.SISTEMA]     = d.sistema     || '';
  linha[c.VENC]        = d.venc        || '';
  linha[c.FAT]         = d.fat         || '';
  linha[c.PLANO]       = d.plano       || '';
  linha[c.VALOR]       = d.valor       || '';
  linha[c.LINHA_MOVEL]   = d.linhaMovel    || '';
  linha[c.PORTABILIDADE] = d.portabilidade || '';
  linha[c.PRE_STATUS]        = d.preStatus        || '';
  linha[c.RG]                = d.rg                || '';
  linha[c.NOME_MAE]          = d.nomeMae           || '';
  linha[c.DT_NASC]           = _formatarDataNascimento(d.dtNasc, 'dd/MM/yyyy');
  linha[c.SEGMENTACAO]       = d.segmentacao       || '';
  linha[c.REAGENDAMENTOS]    = d.reagendamentos    || '';
  linha[c.STATUS_PAP]        = d.statusPAP         || 'Em Aberto';
  linha[c.VEROHUB_PEDIDO]    = d.verohubPedido     || '';
  linha[c.VEROHUB_PEDIDO_DT] = d.verohubPedidoDt   || '';
  return linha;
}

function _formatarData(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return valor.toString();
}

function _formatarDataNascimento(valor, formato) {
  if (!valor) return '';

  var tz = Session.getScriptTimeZone();
  var out = formato || 'yyyy-MM-dd';

  if (valor instanceof Date && !isNaN(valor)) {
    return Utilities.formatDate(valor, tz, out);
  }

  var txt = String(valor).trim();
  if (!txt) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) {
    if (out === 'yyyy-MM-dd') return txt;
    var pIso = txt.split('-');
    return pIso[2] + '/' + pIso[1] + '/' + pIso[0];
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(txt)) {
    if (out === 'dd/MM/yyyy') return txt;
    var pBr = txt.split('/');
    return pBr[2] + '-' + pBr[1] + '-' + pBr[0];
  }

  var dt = new Date(txt);
  if (!isNaN(dt)) {
    return Utilities.formatDate(dt, tz, out);
  }

  return txt;
}

function _normalizarCamposClienteLegado(row, c) {
  var rgRaw = String(row[c.RG] || '').trim();
  var nomeMaeRaw = String(row[c.NOME_MAE] || '').trim();
  var dtNascRaw = row[c.DT_NASC];

  var dtNascIso = _formatarDataNascimento(dtNascRaw, 'yyyy-MM-dd');
  var nomeMaeEhData = !!_formatarDataNascimento(nomeMaeRaw, 'yyyy-MM-dd');
  var rgPareceNome = /[A-Za-zÀ-ÿ]/.test(rgRaw);
  var dtNascPareceRg = /^\d{5,20}$/.test(String(dtNascRaw || '').trim());

  if (rgPareceNome && nomeMaeEhData && dtNascPareceRg) {
    return {
      rg: String(dtNascRaw || '').trim(),
      nomeMae: rgRaw,
      dtNasc: _formatarDataNascimento(nomeMaeRaw, 'yyyy-MM-dd')
    };
  }

  return {
    rg: rgRaw,
    nomeMae: nomeMaeRaw,
    dtNasc: dtNascIso
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  DASHBOARD — getDashboard(mes, ano)
//  mes/ano: inteiros. Se null, usa mês/ano atual.
// ══════════════════════════════════════════════════════════════════════════
// ============================================================================
// CONTEXTO 1.8 - DASHBOARD E RESUMOS OPERACIONAIS
// ============================================================================
function getDashboard(mes, ano) {
  try {
    var hoje   = new Date();
    var mesRef = mes  || (hoje.getMonth() + 1);
    var anoRef = ano  || hoje.getFullYear();
    var ehHoje = (mesRef === hoje.getMonth() + 1 && anoRef === hoje.getFullYear());

    // Cache simples (dashboard JSON é pequeno — nunca excede 100KB)
    // TTL 5 min mês atual, 10 min meses anteriores
    // O _warmupScript recalcula automaticamente quando expira — usuário nunca espera
    var cache    = CacheService.getScriptCache();
    var cacheKey = CONFIG.CACHE_PREFIX + 'dash_' + mesRef + '_' + anoRef;
    var cacheTTL = ehHoje ? 300 : 600;
    try {
      var hit = cache.get(cacheKey);
      if (hit) {
        Logger.log('getDashboard cache hit: ' + mesRef + '/' + anoRef);
        return JSON.parse(hit);
      }
    } catch(ce) {}

    var sheet    = _getSheet();
    var tz       = Session.getScriptTimeZone();
    var cfg      = DASHBOARD_CONFIG;

    // ── Lê planilha completa (43 colunas) ─────────────────────────────────
    var ultima = sheet.getLastRow();
    if (ultima < 3) return { erro: false, vazio: true };
    var raw = sheet.getRange(3, 1, ultima - 2, CONFIG.TOTAL_COLUNAS).getValues();

    // ── Helpers ────────────────────────────────────────────────────────────
    function isMesAno(d) {
      if (!d || !(d instanceof Date) || isNaN(d)) return false;
      return (d.getMonth() + 1) === mesRef && d.getFullYear() === anoRef;
    }
    function isHoje(d) {
      if (!d || !(d instanceof Date) || isNaN(d)) return false;
      var hd = new Date(hoje); hd.setHours(0,0,0,0);
      var dd = new Date(d);    dd.setHours(0,0,0,0);
      return dd.getTime() === hd.getTime();
    }
    function toDate(v) {
      if (v instanceof Date && !isNaN(v)) return v;
      if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000));
      return null;
    }
    function isFibra(p) {
      var s = String(p||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      return s === 'FIBRA ALONE' || s === 'FIBRA COMBO';
    }
    function isMovel(p) {
      var s = String(p||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      return s === 'MOVEL ALONE' || s === 'MOVEL COMBO';
    }

    // ── Dias úteis (sem domingos e feriados) ───────────────────────────────
    var feriadosSet = {};
    (cfg.FERIADOS || []).forEach(function(f) { feriadosSet[f] = true; });
    function isDiaUtil(d) {
      if (d.getDay() === 0) return false; // domingo
      var key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      return !feriadosSet[key];
    }
    function diasUteisMes(m, a) {
      var total = 0;
      var d = new Date(a, m - 1, 1);
      while (d.getMonth() + 1 === m) {
        if (isDiaUtil(d)) total++;
        d.setDate(d.getDate() + 1);
      }
      return total;
    }
    function diasUteisAte(dataFim, m, a) {
      var total = 0;
      var d = new Date(a, m - 1, 1);
      var fim = new Date(dataFim); fim.setHours(23,59,59,0);
      while (d <= fim && d.getMonth() + 1 === m) {
        if (isDiaUtil(d)) total++;
        d.setDate(d.getDate() + 1);
      }
      return total;
    }
    var duMes    = diasUteisMes(mesRef, anoRef);
    var duPassados = ehHoje ? diasUteisAte(hoje, mesRef, anoRef) : duMes;

    // ── Acumuladores ───────────────────────────────────────────────────────
    var fibraHoje = 0, movelHoje = 0;
    var fibraHojeCanal = {};
    var instalacoesMes = 0, vendaBrutaMes = 0, instaladasDaVendaBrutaMes = 0;
    var cancelComercialMes = 0, ticketSoma = 0, ticketQtd = 0;
    var backlog = 0, pendenciaVero = 0;
    var agendadosHoje = 0, instaladosHoje = 0, pendenciadoHoje = 0;
    var finalizadoMes = 0, entregueMes = 0, aguardandoEntregaMes = 0;
    var vendaBrutaCanal = {}, instalacaoCanal = {};
    var planoCount = {}, cidadeCount = {};
    var instalacoesMesAnt = 0;
    var rankingHoje      = {};
    var rankingMes       = {}; // venda bruta do mês por responsável
    var rankingMesAnt    = {}; // venda bruta do mês anterior por responsável
    var rankingInstalMes = {}; // instalações finalizadas do mês por responsável
    var funil = { 'EM NEGOCIACAO': 0, 'AG COMPROVANTE': 0, 'AG DOC': 0,
                  'AG ACEITE': 0, 'AG AUDITORIA': 0, 'AG QUALIDADE': 0,
                  'CRUZAMENTO DE CA': 0 };

    // Mês anterior
    var mesAnt = mesRef === 1 ? 12 : mesRef - 1;
    var anoAnt = mesRef === 1 ? anoRef - 1 : anoRef;

    var c = CONFIG.COLUNAS;
    for (var i = 0; i < raw.length; i++) {
      var row     = raw[i];
      var canal   = String(row[c.CANAL]     || '').trim();
      var produto = String(row[c.PRODUTO]   || '').trim();
      var status  = String(row[c.STATUS]    || '').trim();
      var dAtiv   = toDate(row[c.DATA_ATIV]);
      var dInstal = toDate(row[c.INSTAL]);
      var dAgenda = toDate(row[c.AGENDA]);
      var resp    = String(row[c.RESP]      || '').trim();
      var cidade  = String(row[c.CIDADE]    || '').trim();
      var plano   = String(row[c.PLANO]     || '').trim();
      var valor   = parseFloat(row[c.VALOR]) || 0;
      var colD    = String(row[c.DATA_ATIV] || '').trim().toUpperCase()
                      .normalize('NFD').replace(/[\u0300-\u036f]/g,'');

      // ── HOJE (fixos) ───────────────────────��────────────────────────────
      if (ehHoje) {
        // Fibra/Movel hoje: col B=Fibra, col C=Ag.Instalação ou Finalizada, col D=hoje
        var isVendaHoje = isFibra(produto) &&
          (status === '2- Aguardando Instalação' || status === '3 - Finalizada/Instalada') &&
          isHoje(dAtiv);
        if (isVendaHoje) {
          fibraHoje++;
          fibraHojeCanal[canal] = (fibraHojeCanal[canal] || 0) + 1;
        }
        // Móvel hoje: statuses ativos de móvel com data de ativação = hoje
        if (isMovel(produto) &&
          (status === '1- Conferencia/Ativação' || status === '2- Aguardando Entrega' ||
           status === '3- Aguardando Retirada'  || status === '4- Entregue' ||
           status === '5 - Finalizado') &&
          isHoje(dAtiv)) {
          movelHoje++;
        }
        // Ranking de hoje
        var prodNormR = produto.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        var isFibraRank = prodNormR === 'FIBRA ALONE' || prodNormR === 'FIBRA COMBO';
        var isAgInstalRank = status === '2- Aguardando Instalação' || status === '3 - Finalizada/Instalada';
        if (isFibraRank && isAgInstalRank && isHoje(dAtiv)) {
          if (resp) rankingHoje[resp] = (rankingHoje[resp] || 0) + 1;
        }
        // Agenda do dia
        if (isHoje(dAgenda)) agendadosHoje++;
        if (isHoje(dInstal) && status === '3 - Finalizada/Instalada') instaladosHoje++;
        if (isHoje(dInstal) && status === 'Pendencia Vero') pendenciadoHoje++;
      }

      // ── MÊS DE REFERÊNCIA ───────────────────────────────────────────────
      // Venda bruta: col B=Fibra, col C=Ag.Instalação ou Finalizada, col D=mês ref
      var isVendaMes = isFibra(produto) &&
        (status === '2- Aguardando Instalação' || status === '3 - Finalizada/Instalada') &&
        isMesAno(dAtiv);
      if (isVendaMes) {
        vendaBrutaMes++;
        vendaBrutaCanal[canal] = (vendaBrutaCanal[canal] || 0) + 1;
        if (resp) rankingMes[resp] = (rankingMes[resp] || 0) + 1;
        if (status === '3 - Finalizada/Instalada') instaladasDaVendaBrutaMes++;
      }
      // Venda bruta mês anterior por responsável
      var isVendaMesAnt = isFibra(produto) &&
        (status === '2- Aguardando Instalação' || status === '3 - Finalizada/Instalada') &&
        dAtiv && (dAtiv.getMonth()+1) === mesAnt && dAtiv.getFullYear() === anoAnt;
      if (isVendaMesAnt && resp) rankingMesAnt[resp] = (rankingMesAnt[resp] || 0) + 1;

      // Instalações do mês: usa col J (data instalação)
      if (status === '3 - Finalizada/Instalada' && isMesAno(dInstal)) {
        if (isFibra(produto)) {
          instalacoesMes++;
          instalacaoCanal[canal] = (instalacaoCanal[canal] || 0) + 1;
          ticketSoma += valor; ticketQtd++;
          if (plano) planoCount[plano] = (planoCount[plano] || 0) + 1;
          if (cidade) cidadeCount[cidade] = (cidadeCount[cidade] || 0) + 1;
          if (resp) rankingInstalMes[resp] = (rankingInstalMes[resp] || 0) + 1;
        }
      }

      // Cancelamento comercial do mês (col J)
      if (status === 'Cancelamento Comercial' && isMesAno(dInstal)) cancelComercialMes++;

      // Status Chips (col D = data ativação)
      if (status === '5 - Finalizado'     && isMesAno(dAtiv)) finalizadoMes++;
      if (status === '4 - Entregue'        && isMesAno(dAtiv)) entregueMes++;
      if (status === '2- Aguardando Entrega' && isMesAno(dAtiv)) aguardandoEntregaMes++;

      // Backlog e Pendência Vero (qualquer mês)
      if (status === '2- Aguardando Instalação' && isFibra(produto)) backlog++;
      if (status === 'Pendencia Vero') pendenciaVero++;

      // Funil de leads: status 1- Conferencia/Ativação, col AK = pré-status
      if (status === '1- Conferencia/Ativação' && (isFibra(produto))) {
        var pv = String(row[c.PRE_STATUS] || '').trim().toUpperCase()
                   .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        if      (pv === 'EM NEGOCIACAO')    funil['EM NEGOCIACAO']++;
        else if (pv === 'AG COMPROVANTE')   funil['AG COMPROVANTE']++;
        else if (pv === 'AG DOC')           funil['AG DOC']++;
        else if (pv === 'AG ACEITE')        funil['AG ACEITE']++;
        else if (pv === 'AG AUDITORIA')     funil['AG AUDITORIA']++;
        else if (pv === 'AG QUALIDADE')     funil['AG QUALIDADE']++;
        else if (pv.indexOf('CRUZAMENTO') > -1) funil['CRUZAMENTO DE CA']++;
      }

      // Instalações mês anterior (col J, fibra)
      if (status === '3 - Finalizada/Instalada' && isFibra(produto)) {
        var dI = toDate(row[c.INSTAL]);
        if (dI && (dI.getMonth() + 1) === mesAnt && dI.getFullYear() === anoAnt) {
          instalacoesMesAnt++;
        }
      }
    }

    // ── Cálculos derivados ─────────────────────────────────────────────────
    var ticketMedio    = ticketQtd > 0 ? ticketSoma / ticketQtd : 0;
    var receitaAtual   = instalacoesMes * ticketMedio * cfg.FATOR_VERO;
    var metaReceita    = cfg.META_VERO * ticketMedio;
    var cancelPct      = instalacoesMes > 0 ? (cancelComercialMes / instalacoesMes) * 100 : 0;
    var aproveitamento = vendaBrutaMes  > 0 ? (instalacoesMes / vendaBrutaMes) * 100 : 0;

    // Tendência (projeção linear, dias úteis)
    var tendenciaInstal  = duPassados > 0 ? Math.round((instalacoesMes / duPassados) * duMes) : 0;
    var tendenciaVendas  = duPassados > 0 ? Math.round((vendaBrutaMes   / duPassados) * duMes) : 0;
    var tendenciaReceita = tendenciaVendas * cfg.FATOR_VERO * ticketMedio;
    var metaPct          = cfg.META_VERO > 0 ? (tendenciaInstal / cfg.META_VERO) * 100 : 0;
    var bonusVero        = instalacoesMes > cfg.META_VERO ? cfg.BONUS_VERO : 0;

    // Em campo = agendados - instalados - pendenciados
    var emCampo = Math.max(0, agendadosHoje - instaladosHoje - pendenciadoHoje);

    // Ranking: ordenar por contagem desc
    var rankingArr = Object.keys(rankingHoje).map(function(k) {
      return { nome: k, qtd: rankingHoje[k] };
    }).sort(function(a, b) { return b.qtd - a.qtd; });

    // Canal venda bruta: array ordenado
    var canalVendaArr = Object.keys(vendaBrutaCanal).map(function(k) {
      return { canal: k, qtd: vendaBrutaCanal[k] };
    }).sort(function(a, b) { return b.qtd - a.qtd; });

    // Canal instalação: array ordenado
    var canalInstalArr = Object.keys(instalacaoCanal).map(function(k) {
      return { canal: k, qtd: instalacaoCanal[k] };
    }).sort(function(a, b) { return b.qtd - a.qtd; });

    // Plano mais vendido
    var planoTop = '', planoTopQtd = 0;
    Object.keys(planoCount).forEach(function(k) {
      if (planoCount[k] > planoTopQtd) { planoTop = k; planoTopQtd = planoCount[k]; }
    });
    var planoPct = instalacoesMes > 0 ? (planoTopQtd / instalacoesMes) * 100 : 0;

    // Cidade mais vendida
    var cidadeTop = '', cidadeTopQtd = 0;
    Object.keys(cidadeCount).forEach(function(k) {
      if (cidadeCount[k] > cidadeTopQtd) { cidadeTop = k; cidadeTopQtd = cidadeCount[k]; }
    });
    var cidadePct = instalacoesMes > 0 ? (cidadeTopQtd / instalacoesMes) * 100 : 0;

    // Fibra hoje por canal (para a tabela)
    var fibraHojeCanalArr = Object.keys(fibraHojeCanal).map(function(k) {
      return { canal: k, qtd: fibraHojeCanal[k] };
    }).sort(function(a, b) { return b.qtd - a.qtd; });

    Logger.log('getDashboard: ' + mesRef + '/' + anoRef +
      ' inst=' + instalacoesMes + ' venda=' + vendaBrutaMes +
      ' ticket=' + ticketMedio.toFixed(2));

    return {
      erro: false,
      mes: mesRef, ano: anoRef,
      config: { metaVero: cfg.META_VERO, fatorVero: cfg.FATOR_VERO, bonusVero: cfg.BONUS_VERO },

      // Hoje
      fibraHoje: fibraHoje,
      movelHoje: movelHoje,
      fibraEmConferencia: funil['EM NEGOCIACAO'] + funil['AG COMPROVANTE'] + funil['AG DOC'] +
                          funil['AG ACEITE'] + funil['AG AUDITORIA'] + funil['AG QUALIDADE'],
      fibraHojePorCanal:  fibraHojeCanalArr,
      rankingHoje:        rankingArr,
      rankingMes:         Object.keys(rankingMes).map(function(k) {
        return { nome: k, qtd: rankingMes[k] };
      }).sort(function(a, b) { return b.qtd - a.qtd; }),
      rankingMesAnt:      Object.keys(rankingMesAnt).map(function(k) {
        return { nome: k, qtd: rankingMesAnt[k] };
      }).sort(function(a, b) { return b.qtd - a.qtd; }),
      rankingInstalMes:   Object.keys(rankingInstalMes).map(function(k) {
        return { nome: k, qtd: rankingInstalMes[k] };
      }).sort(function(a, b) { return b.qtd - a.qtd; }),
      agendadosHoje:      agendadosHoje,
      instaladosHoje:     instaladosHoje,
      emCampo:            emCampo,
      pendenciadoHoje:    pendenciadoHoje,

      // Mês
      instalacoesMes:     instalacoesMes,
      instaladasDaVendaBrutaMes: instaladasDaVendaBrutaMes,
      backlog:            backlog,
      projecaoBacklog:    instalacoesMes + backlog,
      vendaBrutaMes:      vendaBrutaMes,
      vendaDU:            duPassados > 0 ? vendaBrutaMes / duPassados : 0,
      tendenciaVendas:    tendenciaVendas,
      tendenciaInstal:    tendenciaInstal,
      tendenciaReceita:   tendenciaReceita,
      metaPct:            metaPct,
      ticketMedio:        ticketMedio,
      receitaAtual:       receitaAtual,
      metaReceita:        metaReceita,
      cancelComercialMes: cancelComercialMes,
      cancelPct:          cancelPct,
      pendenciaVero:      pendenciaVero,
      bonusVero:          bonusVero,
      aproveitamento:     aproveitamento,

      // Status Chips
      finalizadoMes:       finalizadoMes,
      entregueMes:         entregueMes,
      aguardandoEntregaMes:aguardandoEntregaMes,

      // Funil
      funil: funil,

      // Canais
      canalVenda:   canalVendaArr,
      canalInstal:  canalInstalArr,
      instalacoesMesAnt: instalacoesMesAnt,

      // Rankings
      planoTop: planoTop, planoTopPct: planoPct,
      cidadeTop: cidadeTop, cidadeTopPct: cidadePct,

      // Meta/config
      duMes: duMes, duPassados: duPassados
    };

    // Salva no cache simples (dashboard JSON é pequeno, bem abaixo de 100KB)
    try {
      var jsonDash = JSON.stringify(retorno);
      cache.put(cacheKey, jsonDash, cacheTTL);
    } catch(ce) { Logger.log('getDashboard cache save erro: ' + ce); }

    return retorno;

  } catch(e) {
    Logger.log('getDashboard erro: ' + e + ' | ' + e.stack);
    return { erro: true, mensagem: e.message };
  }
}

// Serve o HTML do Dashboard para injeção inline no sistema
function getDocsHtml() {
  return HtmlService.createHtmlOutputFromFile('Docs').getContent();
}

function getExtratoHtml() {
  return HtmlService.createHtmlOutputFromFile('Extrato').getContent();
}

function getDashboardHtml() {
  return HtmlService.createHtmlOutputFromFile('Dashboard').getContent();
}

function getFilaPAPHtml() {
  return HtmlService.createHtmlOutputFromFile('FilaPAP').getContent();
}

function getPainelAdsHtml() {
  return HtmlService.createHtmlOutputFromFile('PainelAds').getContent();
}

// Retorna HTML do dashboard já com dados embutidos — apenas 1 roundtrip
// Suspeita: helper opcional sem uso claro na UI atual. Mantido por seguranca.
function getDashboardComDados(mes, ano) {
  var html  = HtmlService.createHtmlOutputFromFile('Dashboard').getContent();
  var dados = getDashboard(mes, ano);
  var json  = JSON.stringify(dados);
  // Injeta os dados antes do </body> para o dashboard renderizar imediatamente
  var script = '<script>window.__DASH_DATA__ = ' + json + ';<\/script>';
  return html.replace('</body>', script + '</body>');
}


// ─── DIAGNÓSTICO DASHBOARD (rode no editor Apps Script para testar) ──────────
// Vá em: Apps Script → selecione "diagnosticoDashboard" → clique ▶ Executar
// Veja o resultado em: Visualizar → Registros de execução
// Suspeita: rotina manual de suporte/infra. Nao chamada pela UI atual.
function diagnosticoDashboard() {
  var ss     = _getSpreadsheet_();
  var sheet  = ss.getSheetByName('1 - Vendas');
  var tz     = ss.getSpreadsheetTimeZone();
  var hoje   = new Date();
  var hStr   = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');

  Logger.log('=== DIAGNÓSTICO DASHBOARD ===');
  Logger.log('Hoje: ' + hStr);

  var ultima = sheet.getLastRow();
  var raw    = sheet.getRange(3, 1, ultima - 2, CONFIG.TOTAL_COLUNAS).getValues();

  var contTotal    = 0;
  var contHojeFibra = 0;
  var contProblema  = 0;

  for (var i = 0; i < raw.length; i++) {
    var row     = raw[i];
    var cd = CONFIG.COLUNAS;
    var produto = String(row[cd.PRODUTO]   || '').trim();
    var status  = String(row[cd.STATUS]    || '').trim();
    var dAtivRaw = row[cd.DATA_ATIV];
    var dAtiv    = null;

    // Tenta converter para Date
    if (dAtivRaw instanceof Date && !isNaN(dAtivRaw)) {
      dAtiv = dAtivRaw;
    } else if (typeof dAtivRaw === 'number') {
      dAtiv = new Date(Math.round((dAtivRaw - 25569) * 86400 * 1000));
    }

    var prodNorm = produto.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    var isFibra  = prodNorm === 'FIBRA ALONE' || prodNorm === 'FIBRA COMBO';

    if (!isFibra) continue; // só interessa Fibra

    contTotal++;

    var dAtivStr = dAtiv ? Utilities.formatDate(dAtiv, tz, 'yyyy-MM-dd') : '(não é data: ' + typeof dAtivRaw + ' = "' + dAtivRaw + '")';
    var isHoje   = dAtivStr === hStr;

    if (isHoje) contHojeFibra++;

    // Loga todas as linhas Fibra com col D próxima de hoje
    if (isHoje || (dAtiv && Math.abs(dAtiv - hoje) < 3 * 86400000)) {
      Logger.log(
        'Linha ' + (i + 3) +
        ' | Produto: ' + produto +
        ' | Status: ' + status +
        ' | Col D raw: ' + dAtivRaw +
        ' | Col D tipo: ' + typeof dAtivRaw +
        ' | Col D parseada: ' + dAtivStr +
        ' | É hoje: ' + isHoje
      );
    }

    if (!dAtiv) contProblema++;
  }

  Logger.log('--- RESULTADO ---');
  Logger.log('Total linhas Fibra: '        + contTotal);
  Logger.log('Fibra com col D = hoje: '    + contHojeFibra);
  Logger.log('Fibra com col D inválida: '  + contProblema);
  Logger.log('=== FIM ===');
}

// ══════════════════════════════════════════════════════════════════════════
//  INDICAÇÕES — Leitura e gravação na aba "#Lead Indicação"
//  Atualizado em: 12/03/2026 17:45 | Corrigido: CONFIG_INDICACOES não existia
// ══════════════════════════════════════════════════════════════════════════

var _ABA_IND = '#Lead Indicação';

// ============================================================================
// CONTEXTO 1.9 - INDICACOES
// ============================================================================
function getIndicacoes() {
  try {
    var sh = _getSpreadsheet_().getSheetByName(_ABA_IND);
    if (!sh) return { dados: [], erro: 'Aba "' + _ABA_IND + '" não encontrada.' };
    var ult = sh.getLastRow();
    if (ult < 2) return { dados: [] };
    var tz  = Session.getScriptTimeZone();
    var raw = sh.getRange(2, 1, ult - 1, 14).getValues();
    var dados = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!String(r[2]||'').trim() && !String(r[4]||'').trim()) continue;
      var fmtD = function(v) {
        if (!v) return '';
        if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'dd/MM/yyyy');
        if (typeof v === 'number' && v > 0) { var d = new Date(Math.round((v-25569)*86400*1000)); return isNaN(d)?'':Utilities.formatDate(d,tz,'dd/MM/yyyy'); }
        return String(v).trim();
      };
      dados.push({
        linha:         i + 2,
        data:          fmtD(r[1]),
        nomeIndicado:  String(r[2]  || '').trim(),
        telIndicado:   String(r[3]  || '').trim(),
        nomeIndicador: String(r[4]  || '').trim(),
        telIndicador:  String(r[5]  || '').trim(),
        tipoPix:       String(r[6]  || '').trim(),
        chavePix:      String(r[7]  || '').trim(),
        statusAtend:   String(r[8]  || '').trim(),
        status:        String(r[9]  || '').trim(),
        contrato:      String(r[10] || '').trim().replace(/\.0$/,''),
        dataInstal:    fmtD(r[11]),
        statusPgto:    String(r[12] || '').trim(),
        dataPgto:      fmtD(r[13])
      });
    }
    dados.reverse();
    return { dados: dados };
  } catch(e) {
    Logger.log('getIndicacoes ERRO: ' + e.message);
    return { dados: [], erro: e.message };
  }
}

function salvarIndicacao(payload) {
  try {
    var sh   = _getSpreadsheet_().getSheetByName(_ABA_IND);
    if (!sh) return { sucesso: false, erro: 'Aba "' + _ABA_IND + '" não encontrada.' };
    var tz   = Session.getScriptTimeZone();
    var hoje = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
    sh.appendRow([
      'CRM Web', hoje,
      payload.nomeIndicado  || '', payload.telIndicado   || '',
      payload.nomeIndicador || '', payload.telIndicador  || '',
      payload.tipoPix       || '', payload.chavePix      || '',
      payload.statusAtend   || '', payload.status        || '',
      '', '',
      payload.statusPgto    || '', ''
    ]);
    return { sucesso: true };
  } catch(e) {
    Logger.log('salvarIndicacao ERRO: ' + e.message);
    return { sucesso: false, erro: e.message };
  }
}

// Atualiza Status Pagamento (col M = coluna 13) de uma linha da aba Indicações
function atualizarStatusPgtoInd(linha, novoStatus) {
  try {
    var sh = _getSpreadsheet_().getSheetByName(_ABA_IND);
    if (!sh) return { sucesso: false, erro: 'Aba não encontrada.' };
    sh.getRange(linha, 13).setValue(novoStatus || '');
    return { sucesso: true };
  } catch(e) {
    Logger.log('atualizarStatusPgtoInd ERRO: ' + e.message);
    return { sucesso: false, erro: e.message };
  }
}

// Atualiza Data Pagamento (col N = coluna 14) de uma linha da aba Indicações
function atualizarDataPgtoInd(linha, dataBR) {
  try {
    var sh = _getSpreadsheet_().getSheetByName(_ABA_IND);
    if (!sh) return { sucesso: false, erro: 'Aba não encontrada.' };
    sh.getRange(linha, 14).setValue(dataBR || '');
    return { sucesso: true };
  } catch(e) {
    Logger.log('atualizarDataPgtoInd ERRO: ' + e.message);
    return { sucesso: false, erro: e.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  TRAVA VEROHUB — Bloqueio às 12h e 17h para perfil Backoffice
// ══════════════════════════════════════════════════════════════════════════════

var TRAVA_KEY = 'verohub_trava_pedido';

// Retorna vendas com VeroHub vencido (col AP < hoje) ou sem data.
// Ignora status finalizados/cancelados.
function getVendasVeroHubVencidas() {
  try {
    var sheet  = _getSheet();
    var ultima = sheet.getLastRow();
    if (ultima < 3) return { dados: [] };

    var raw  = sheet.getRange(3, 1, ultima - 2, CONFIG.TOTAL_COLUNAS).getValues();
    var tz   = Session.getScriptTimeZone();
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    var ignorar = ['Cancelado','Cancelamento Técnico','Cancelamento Comercial',
                   'Churn','Devolvido','5 - Finalizado'];
    var pendentes = [];

    for (var i = 0; i < raw.length; i++) {
      var row     = raw[i];
      var cliente = String(row[CONFIG.COLUNAS.CLIENTE] || '').trim();
      if (!cliente) continue;

      var status = String(row[CONFIG.COLUNAS.STATUS] || '').trim();
      if (ignorar.indexOf(status) > -1) continue;

      var vhRaw  = row[CONFIG.COLUNAS.VEROHUB];
      var vhDate = null;
      if (vhRaw instanceof Date && !isNaN(vhRaw)) {
        vhDate = new Date(vhRaw); vhDate.setHours(0,0,0,0);
      } else if (typeof vhRaw === 'number' && vhRaw > 0) {
        vhDate = new Date(Math.round((vhRaw - 25569) * 86400 * 1000));
        vhDate.setHours(0,0,0,0);
      } else if (typeof vhRaw === 'string' && vhRaw.trim()) {
        var p = new Date(vhRaw.trim());
        if (!isNaN(p)) { vhDate = p; vhDate.setHours(0,0,0,0); }
      }

      if (vhDate && vhDate >= hoje) continue; // data OK, pula

      pendentes.push({
        linha:   i + 3,
        cpf:     String(row[CONFIG.COLUNAS.CPF] || '').trim() || '—',
        cliente: cliente,
        verohub: vhDate ? Utilities.formatDate(vhDate, tz, 'dd/MM/yyyy') : 'Sem data'
      });
    }
    return { dados: pendentes };
  } catch(e) {
    Logger.log('getVendasVeroHubVencidas ERRO: ' + e.message);
    return { dados: [], erro: e.message };
  }
}

// Backoffice registra pedido de desbloqueio no PropertiesService.
function solicitarDesbloqueioBo(nomeSolicitante) {
  try {
    var pedido = {
      solicitante: String(nomeSolicitante || 'Backoffice'),
      ts:     new Date().getTime(),
      status: 'pendente'
    };
    PropertiesService.getScriptProperties().setProperty(TRAVA_KEY, JSON.stringify(pedido));
    return { sucesso: true };
  } catch(e) { return { sucesso: false, erro: e.message }; }
}

// Supervisor / Admin aprova o desbloqueio.
function aprovarDesbloqueioBO() {
  try {
    var props  = PropertiesService.getScriptProperties();
    var raw    = props.getProperty(TRAVA_KEY);
    if (!raw) return { sucesso: false, mensagem: 'Nenhum pedido pendente.' };
    var pedido      = JSON.parse(raw);
    pedido.status     = 'aprovado';
    pedido.aprovadoTs = new Date().getTime();
    props.setProperty(TRAVA_KEY, JSON.stringify(pedido));
    return { sucesso: true };
  } catch(e) { return { sucesso: false, erro: e.message }; }
}

// Retorna status atual do pedido (usado pelo polling).
function getStatusDesbloqueio() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(TRAVA_KEY);
    if (!raw) return { status: 'nenhum' };
    var p = JSON.parse(raw);
    return { status: p.status || 'nenhum', solicitante: p.solicitante || '',
             ts: p.ts || 0, aprovadoTs: p.aprovadoTs || 0 };
  } catch(e) { return { status: 'nenhum' }; }
}

// Limpa o pedido após desbloqueio consumido pelo backoffice.
function limparPedidoDesbloqueio() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(TRAVA_KEY);
    return { sucesso: true };
  } catch(e) { return { sucesso: false }; }
}

// ── WEB WRAPPERS: PARCIAL E AGENDA ───────────────────────────
/**
 * Retorna HTML do parcial de vendas para o modal no CRM Web.
 */
function exibirMensagemAguardandoWeb() {
  try {
    var hoje         = new Date();
    var dataFormatada= Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'dd/MM');
    var mesCorrente  = Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'MM/yyyy');

    // Usa getDashboard() para garantir dados do mês vigente calculados ao vivo
    var d = getDashboard(null, null);
    if (!d || d.erro) return '<div style="padding:12px;color:red;">Erro ao calcular dados: ' + (d && d.erro ? d.erro : 'tente novamente') + '</div>';

    // Funil a partir dos dados calculados pelo getDashboard
    var funil   = d.funil || {};
    var quente  = (funil['AG ACEITE']  || 0) + (funil['AG AUDITORIA']  || 0);
    var morno   = (funil['AG COMPROVANTE'] || 0) + (funil['AG DOC'] || 0);
    var frio    = (funil['EM NEGOCIACAO'] || 0) + (funil['AG QUALIDADE'] || 0);
    var totalFunil = quente + morno + frio;

    var mensagem =
      '🚀 *Parcial do dia:* ' + dataFormatada + '\n' +
      '🌐 ' + Math.round(d.fibraHoje || 0) + ' Fibras Ativadas\n' +
      '📱 ' + Math.round(d.movelHoje || 0) + ' Chips Ativados\n' +
      '👷‍♂️ ' + Math.round(d.emCampo  || 0) + ' Inst. em campo\n' +
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
      '❌ ' + (d.cancelPct || 0).toFixed(1) + '% Canc. Comercial';

    return '<pre id="texto" style="white-space:pre-wrap;font-size:13px;line-height:1.6;font-family:monospace;background:var(--surface2,#1e1e2e);color:var(--text,#cdd6f4);padding:12px;border-radius:6px;border:1px solid var(--border,#313244);">' + mensagem.trim() + '</pre>'
      + '<button onclick="navigator.clipboard.writeText(document.getElementById(\'texto\').innerText).then(function(){var b=this;b.innerText=\'✅ Copiado!\';setTimeout(function(){b.innerText=\'📋 Copiar WhatsApp\'},2500)}.bind(this))" style="width:100%;margin-top:10px;background:#25d366;color:#fff;border:none;padding:12px;border-radius:6px;cursor:pointer;font-weight:700;font-size:13px;">📋 Copiar WhatsApp</button>';
  } catch(e) {
    return '<div style="padding:12px;color:red;">❌ Erro: ' + e.message + '</div>';
  }
}

/**
 * Retorna HTML da agenda do dia para o modal no CRM Web.
 */
function exibirAgendamentosDoDiaWeb() {
  var ss        = _getSpreadsheet_();
  var dashboard = ss.getSheetByName('2 - Dashboard');
  var abaVendas = ss.getSheetByName('1 - Vendas');

  if (!dashboard || !abaVendas) return '<div style="padding:12px;color:red;">Abas não encontradas.</div>';

  var totalInstalacoes = Math.round(_num(dashboard.getRange('K6').getValue()));
  var instalado        = Math.round(_num(dashboard.getRange('K7').getValue()));
  var pendenciado      = Math.round(_num(dashboard.getRange('K10').getValue()));
  var emCampo          = Math.round(_num(dashboard.getRange('K8').getValue()));

  var ultimaLinha = abaVendas.getLastRow();
  var listaAguardando = '';
  var listaFinalizados = '';

  if (ultimaLinha >= 3) {
    var ca = CONFIG.COLUNAS;
    var dados   = abaVendas.getRange(3, 1, ultimaLinha - 2, CONFIG.TOTAL_COLUNAS).getValues();
    var hojeData = new Date();
    hojeData.setHours(0,0,0,0);

    dados.forEach(function(linha) {
      var status           = linha[ca.STATUS];
      var dataAgendamento  = linha[ca.AGENDA];
      var dataFinalizada   = linha[ca.INSTAL];
      var nomeCompleto     = String(linha[ca.CLIENTE]).trim();
      var partes           = nomeCompleto.split(' ');
      var nomeCurto        = partes.length > 1 ? partes[0] + ' ' + partes[partes.length - 1] : partes[0];

      if (status === '2- Aguardando Instalação' && dataAgendamento instanceof Date) {
        var dtAged = new Date(dataAgendamento); dtAged.setHours(0,0,0,0);
        if (dtAged.getTime() === hojeData.getTime()) listaAguardando += '• ' + nomeCurto + '\n';
      }
      if (status === '3 - Finalizada/Instalada' && dataFinalizada instanceof Date) {
        var dtFin = new Date(dataFinalizada); dtFin.setHours(0,0,0,0);
        if (dtFin.getTime() === hojeData.getTime()) listaFinalizados += '• ' + nomeCurto + '\n';
      }
    });
  }

  var msgAguardando  = listaAguardando  || 'Nenhum agendado.\n';
  var msgFinalizados = listaFinalizados || 'Nenhuma instalada ainda.\n';

  var hoje       = new Date();
  var dataHoje   = Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'dd/MM');
  var horaAgora  = Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'HH:mm');

  var mensagem = '📅 *AGENDA ' + dataHoje + '*\n📊 Total: ' + totalInstalacoes + '\n✅ Instalado: ' + instalado + '\n👷‍♂️ Em Campo: ' + emCampo + '\n⚠️ Pendenciado: ' + pendenciado + '\n\n⏳ *AG INSTALAÇÃO*\n' + msgAguardando + '\n✅ *INSTALADAS*\n' + msgFinalizados + '\n⏰ Atualizado: ' + horaAgora;

  return '<pre id="texto2" style="white-space:pre-wrap;font-size:13px;line-height:1.6;font-family:monospace;background:var(--surface2,#1e1e2e);color:var(--text,#cdd6f4);padding:12px;border-radius:6px;border:1px solid var(--border,#313244);">' + mensagem.trim() + '</pre>'
    + '<button onclick="navigator.clipboard.writeText(document.getElementById(\'texto2\').innerText).then(function(){var b=this;b.innerText=\'✅ Copiado!\';setTimeout(function(){b.innerText=\'📋 Copiar\'},2500)}.bind(this))" style="width:100%;margin-top:10px;background:#1a8fe3;color:#fff;border:none;padding:12px;border-radius:6px;cursor:pointer;font-weight:700;font-size:13px;">📋 Copiar</button>';
}

function _num(v) { return isNaN(parseFloat(v)) ? 0 : parseFloat(v); }

// ═════════════════════════════════════════���════════════════════════════════
//  TICKETS — Persistência via PropertiesService
//  Atualizado em: 12/03/2026 | Criação: funções getTickets e salvarTickets
// ══════════════════════════════════════════════════════════════════════════
var TICKETS_KEY = 'dharmapro_tickets';

// ============================================================================
// CONTEXTO 1.10 - TICKETS E ANEXOS
// ============================================================================
function getTickets() {
  try {
    var props = PropertiesService.getScriptProperties();
    return props.getProperty(TICKETS_KEY) || '[]';
  } catch(e) {
    return '[]';
  }
}

function salvarTickets(json) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(TICKETS_KEY, json);
    return { sucesso: true };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  }
}

// ── TICKETS — Upload de print para Google Drive ─────────────────────────
var TICKETS_PRINTS_FOLDER = 'DharmaPro_Tickets_Prints';

function _getTicketsPrintsFolder() {
  var folders = DriveApp.getFoldersByName(TICKETS_PRINTS_FOLDER);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(TICKETS_PRINTS_FOLDER);
}

function uploadPrintTicket(ticketId, base64Data, nomeArquivo, mimeType) {
  try {
    if (!base64Data || !ticketId) return { sucesso: false, mensagem: 'Dados inválidos.' };
    mimeType = mimeType || 'image/png';
    nomeArquivo = nomeArquivo || (ticketId + '_' + Date.now() + '.png');
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, nomeArquivo);
    var folder = _getTicketsPrintsFolder();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileId = file.getId();
    return {
      sucesso: true,
      print: {
        id: fileId,
        nome: nomeArquivo,
        url: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800',
        viewUrl: 'https://drive.google.com/file/d/' + fileId + '/view'
      }
    };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  }
}

function deletePrintTicket(fileId) {
  try {
    if (!fileId) return { sucesso: false };
    DriveApp.getFileById(fileId).setTrashed(true);
    return { sucesso: true };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  }
}


// ══════════════════════════════════════════════════════════════════════════
//  WARMUP — Anti-cold-start
//
//  O Google Apps Script "dorme" o servidor após alguns minutos sem uso.
//  A próxima chamada paga um custo de cold start de 1–3 segundos antes de
//  executar qualquer lógica — é a principal causa de lentidão percebida.
//
//  Solução: configurar um Time-based trigger para chamar _warmupScript()
//  a cada 1 minuto. A função é intencionalmente leve (só lê propriedades),
//  suficiente para manter o servidor aquecido sem consumir quota relevante.
//
//  COMO ATIVAR (faça UMA VEZ no editor do Apps Script):
//    1. Abra o editor → menu Executar → "configurarTriggerWarmup"
//    2. Autorize se solicitado
//    3. Confirme em Acionadores (ícone de relógio) que o trigger apareceu
//
//  Para remover: execute "removerTriggerWarmup" ou delete manualmente
//  em Projeto → Acionadores.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Função mantida pelo trigger de 1 minuto.
 * Mantém o servidor aquecido E pré-carrega o cache do dashboard do mês atual.
 * O dashboard usa cache.put() simples com TTL 300s — verificamos a mesma chave
 * para só recalcular quando o cache expirou de verdade (a cada ~5 min).
 */
// ============================================================================
// CONTEXTO 2.0 - PERFORMANCE E MANUTENCAO OPERACIONAL
// ============================================================================
function _warmupScript() {
  try {
    var hoje  = new Date();
    var mes   = hoje.getMonth() + 1;
    var ano   = hoje.getFullYear();
    var cache = CacheService.getScriptCache();
    var key   = CONFIG.CACHE_PREFIX + 'dash_' + mes + '_' + ano;

    // cache.get() bate exatamente com o cache.put() feito em getDashboard
    // Só recalcula quando o cache expirou (a cada ~5 min, não todo minuto)
    if (!cache.get(key)) {
      getDashboard(mes, ano);
      Logger.log('_warmupScript: dashboard ' + mes + '/' + ano + ' recalculado e cacheado.');
    }
  } catch(e) {
    Logger.log('_warmupScript erro: ' + e.message);
  }
}

/**
 * Cria o Time-based trigger que chama _warmupScript() a cada minuto.
 * Execute esta função UMA VEZ manualmente no editor do Apps Script.
 * Verifica se já existe antes de criar um duplicado.
 */
// Suspeita: rotina operacional manual. Nao ha chamada pela UI atual.
function configurarTriggerWarmup() {
  var FUNC = '_warmupScript';
  var triggers = ScriptApp.getProjectTriggers();

  // Evita duplicata
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === FUNC) {
      Logger.log('configurarTriggerWarmup: trigger já existe. Nenhuma ação necessária.');
      return 'Trigger já configurado.';
    }
  }

  ScriptApp.newTrigger(FUNC)
    .timeBased()
    .everyMinutes(1)
    .create();

  Logger.log('configurarTriggerWarmup: trigger criado com sucesso (1 min).');
  return 'Trigger de warmup criado com sucesso!';
}

/**
 * Remove o trigger de warmup caso queira desativar.
 */
// Suspeita: rotina operacional manual. Nao ha chamada pela UI atual.
function removerTriggerWarmup() {
  var FUNC = '_warmupScript';
  var triggers = ScriptApp.getProjectTriggers();
  var removidos = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === FUNC) {
      ScriptApp.deleteTrigger(triggers[i]);
      removidos++;
    }
  }
  Logger.log('removerTriggerWarmup: ' + removidos + ' trigger(s) removido(s).');
  return removidos > 0 ? 'Trigger removido.' : 'Nenhum trigger encontrado.';
}

// ══════════════════════════════════════════════════════════════════════════════
// ASSERTIVA LOCALIZE — Consulta cadastral por CPF
// Docs: https://integracao.assertivasolucoes.com.br/v3/doc/
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Executar UMA VEZ no editor do Apps Script para salvar as credenciais.
 * Ex: configurarAssertiva('meuClientId', 'meuClientSecret')
 */
function configurarAssertiva(clientId, clientSecret) {
  if (!clientId || !clientSecret) throw new Error('Informe clientId e clientSecret.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('assertiva_client_id',     clientId);
  props.setProperty('assertiva_client_secret',  clientSecret);
  Logger.log('Assertiva: credenciais salvas com sucesso.');
  return 'OK';
}

/**
 * Obtém token OAuth2 da Assertiva (cache 50s — token expira em 60s).
 */
function _getTokenAssertiva() {
  var cache    = CacheService.getScriptCache();
  var cacheKey = CONFIG.CACHE_PREFIX + 'assertiva_token';
  var cached   = cache.get(cacheKey);
  if (cached) return cached;

  var props  = PropertiesService.getScriptProperties();
  var id     = props.getProperty('assertiva_client_id');
  var secret = props.getProperty('assertiva_client_secret');
  if (!id || !secret) throw new Error('Credenciais Assertiva não configuradas. Execute configurarAssertiva() no editor.');

  var resp = UrlFetchApp.fetch('https://api.assertivasolucoes.com.br/oauth2/v3/token', {
    method:             'post',
    contentType:        'application/x-www-form-urlencoded',
    payload:            'grant_type=client_credentials',
    headers:            { 'Authorization': 'Basic ' + Utilities.base64Encode(id + ':' + secret) },
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  if (code !== 200) {
    var body = resp.getContentText();
    Logger.log('Assertiva token erro HTTP ' + code + ': ' + body);
    throw new Error('Falha ao obter token Assertiva (HTTP ' + code + ').');
  }

  var token = JSON.parse(resp.getContentText()).access_token;
  cache.put(cacheKey, token, 50);
  return token;
}

/**
 * Consulta dados cadastrais por CPF via Assertiva Localize.
 * Chamável pelo frontend: google.script.run.consultarAssertivaCPF(cpf)
 */
function consultarAssertivaCNPJ(cnpj) {
  try {
    var limpo = (cnpj || '').replace(/\D/g, '');
    if (limpo.length !== 14) return { erro: true, mensagem: 'CNPJ deve ter 14 dígitos.' };

    var token = _getTokenAssertiva();

    var resp = UrlFetchApp.fetch(
      'https://api.assertivasolucoes.com.br/localize/v3/cnpj?cnpj=' + limpo + '&idFinalidade=2',
      {
        method:             'get',
        headers:            { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      }
    );

    var code = resp.getResponseCode();
    var body = JSON.parse(resp.getContentText());

    if (code !== 200) {
      var msg = (body && body.mensagem) || (body && body.alerta) || ('HTTP ' + code);
      Logger.log('Assertiva CNPJ erro: ' + code + ' — ' + resp.getContentText().substring(0, 300));
      return { erro: true, mensagem: 'Erro Assertiva: ' + msg };
    }

    var r   = (body && body.resposta) || {};
    var cad = r.dadosCadastrais || r.dadosCadastraisPJ || r || {};

    return {
      erro: false,
      protocolo: (body.cabecalho && body.cabecalho.protocolo) || '',
      dados: {
        cnpj:               cad.cnpj || limpo,
        nome:               cad.razaoSocial || cad.nomeFantasia || cad.nome || '',
        nomeFantasia:       cad.nomeFantasia || '',
        situacaoCadastral:  cad.situacaoCadastral || ''
      }
    };

  } catch (ex) {
    Logger.log('consultarAssertivaCNPJ erro: ' + ex);
    return { erro: true, mensagem: ex.message || 'Erro desconhecido.' };
  }
}

// ============================================================================
// CONTEXTO 2.1 - ASSERTIVA
// ============================================================================
function consultarAssertivaCPF(cpf) {
  try {
    var limpo = (cpf || '').replace(/\D/g, '');
    if (limpo.length !== 11) return { erro: true, mensagem: 'CPF deve ter 11 dígitos.' };

    var token = _getTokenAssertiva();

    var resp = UrlFetchApp.fetch(
      'https://api.assertivasolucoes.com.br/localize/v3/cpf?cpf=' + limpo + '&idFinalidade=2',
      {
        method:             'get',
        headers:            { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      }
    );

    var code = resp.getResponseCode();
    var body = JSON.parse(resp.getContentText());

    if (code !== 200) {
      var msg = (body && body.mensagem) || (body && body.alerta) || ('HTTP ' + code);
      Logger.log('Assertiva consulta erro: ' + code + ' — ' + resp.getContentText().substring(0, 300));
      return { erro: true, mensagem: 'Erro Assertiva: ' + msg };
    }

    var r = (body && body.resposta) || {};
    var cad = r.dadosCadastrais || r.dadosCadastraisPF || r || {};

    var telefones = [];
    if (Array.isArray(r.telefones)) {
      for (var t = 0; t < r.telefones.length; t++) {
        var tel = r.telefones[t];
        telefones.push({
          numero:    (tel.ddd || '') + (tel.numero || tel.telefone || ''),
          tipo:      tel.tipo || '',
          operadora: tel.operadora || ''
        });
      }
    }

    var enderecos = [];
    if (Array.isArray(r.enderecos)) {
      for (var e = 0; e < r.enderecos.length; e++) {
        var end = r.enderecos[e];
        enderecos.push({
          cep:          end.cep || '',
          logradouro:   end.logradouro || '',
          numero:       end.numero || '',
          complemento:  end.complemento || '',
          bairro:       end.bairro || '',
          cidade:       end.cidade || end.municipio || '',
          uf:           end.uf || end.siglaUf || ''
        });
      }
    }

    var emails = [];
    if (Array.isArray(r.emails)) {
      for (var m = 0; m < r.emails.length; m++) {
        var em = r.emails[m];
        emails.push(typeof em === 'string' ? em : (em.email || ''));
      }
    }

    return {
      erro: false,
      protocolo: (body.cabecalho && body.cabecalho.protocolo) || '',
      dados: {
        cpf:                cad.cpf || limpo,
        nome:               cad.nome || '',
        sexo:               cad.sexo || '',
        dataNascimento:     cad.dataNascimento || '',
        idade:              cad.idade || '',
        nomeMae:            cad.maeNome || cad.nomeMae || '',
        situacaoCadastral:  cad.situacaoCadastral || '',
        obitoProvavel:      cad.obitoProvavel || false,
        telefones:          telefones,
        enderecos:          enderecos,
        emails:             emails
      }
    };

  } catch (ex) {
    Logger.log('consultarAssertivaCPF erro: ' + ex);
    return { erro: true, mensagem: ex.message || 'Erro desconhecido.' };
  }
}

/**
 * Consulta dados cadastrais por telefone via Assertiva Localize.
 * Chamável pelo frontend: google.script.run.consultarAssertivaTelefone(telefone)
 */
function consultarAssertivaTelefone(telefone) {
  try {
    var limpo = (telefone || '').replace(/\D/g, '');
    if (limpo.length < 10 || limpo.length > 11)
      return { erro: true, mensagem: 'Telefone deve ter 10 ou 11 dígitos (com DDD).' };

    var token = _getTokenAssertiva();

    var resp = UrlFetchApp.fetch(
      'https://api.assertivasolucoes.com.br/localize/v3/telefone?telefone=' + limpo + '&idFinalidade=2',
      {
        method:             'get',
        headers:            { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      }
    );

    var code    = resp.getResponseCode();
    var rawText = resp.getContentText();
    var body    = JSON.parse(rawText);

    Logger.log('Assertiva Telefone RAW [' + code + ']: ' + rawText.substring(0, 800));

    if (code !== 200) {
      var msg = (body && body.mensagem) || (body && body.alerta) || ('HTTP ' + code);
      return { erro: true, mensagem: 'Erro Assertiva: ' + msg };
    }

    var resposta = (body && body.resposta) || {};
    var lista = Array.isArray(resposta) ? resposta :
                (Array.isArray(resposta.pessoaFisica) ? resposta.pessoaFisica :
                (Array.isArray(resposta.pessoas) ? resposta.pessoas :
                (resposta.dadosCadastrais ? [resposta] : [])));

    var pessoas = [];
    for (var i = 0; i < lista.length; i++) {
      var r = lista[i];
      pessoas.push({
        nome:           r.nome           || '',
        cpf:            r.cpf            || '',
        dataNascimento: r.dataNascimento  || '',
        nomeMae:        r.nomeMae        || '',
        cidade:         r.cidade         || '',
        uf:             r.uf             || ''
      });
    }

    return {
      erro:      false,
      protocolo: (body.cabecalho && body.cabecalho.protocolo) || '',
      pessoas:   pessoas
    };

  } catch (ex) {
    Logger.log('consultarAssertivaTelefone erro: ' + ex);
    return { erro: true, mensagem: ex.message || 'Erro desconhecido.' };
  }
}

/**
 * Consulta dados cadastrais por nome via Assertiva Localize.
 * Chamável pelo frontend: google.script.run.consultarAssertivaNome(nome)
 */
function consultarAssertivaNome(nome) {
  try {
    var limpo = (nome || '').trim();
    if (limpo.length < 5)
      return { erro: true, mensagem: 'Informe ao menos 5 caracteres do nome.' };

    var token = _getTokenAssertiva();

    var resp = UrlFetchApp.fetch(
      'https://api.assertivasolucoes.com.br/localize/v3/nome?nome=' + encodeURIComponent(limpo) + '&idFinalidade=2',
      {
        method:             'get',
        headers:            { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      }
    );

    var code    = resp.getResponseCode();
    var rawText = resp.getContentText();
    var body    = JSON.parse(rawText);

    Logger.log('Assertiva Nome RAW [' + code + ']: ' + rawText.substring(0, 800));

    if (code !== 200) {
      var msg = (body && body.mensagem) || (body && body.alerta) || ('HTTP ' + code);
      return { erro: true, mensagem: 'Erro Assertiva: ' + msg };
    }

    var resposta = (body && body.resposta) || {};
    var lista = Array.isArray(resposta) ? resposta :
                (Array.isArray(resposta.pessoaFisica) ? resposta.pessoaFisica :
                (Array.isArray(resposta.pessoas) ? resposta.pessoas :
                (resposta.dadosCadastrais ? [resposta] : [])));

    var pessoas = [];
    for (var i = 0; i < lista.length; i++) {
      var r = lista[i];
      pessoas.push({
        nome:           r.nome           || '',
        cpf:            r.cpf            || '',
        dataNascimento: r.dataNascimento  || '',
        nomeMae:        r.nomeMae        || '',
        cidade:         r.cidade         || '',
        uf:             r.uf             || ''
      });
    }

    return {
      erro:      false,
      protocolo: (body.cabecalho && body.cabecalho.protocolo) || '',
      pessoas:   pessoas
    };

  } catch (ex) {
    Logger.log('consultarAssertivaNome erro: ' + ex);
    return { erro: true, mensagem: ex.message || 'Erro desconhecido.' };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXTRATO MENSAL — Persistência no Google Drive
//  Pasta: "DharmaPro - Extratos" (criada automaticamente na raiz do Drive)
// ══════════════════════════════════════════════════════════════════════════════

// ============================================================================
// CONTEXTO 2.2 - EXTRATO MENSAL E ARQUIVOS DE FECHAMENTO
// ============================================================================
function _epGetPasta() {
  var it = DriveApp.getFoldersByName('DharmaPro - Extratos');
  return it.hasNext() ? it.next() : DriveApp.createFolder('DharmaPro - Extratos');
}

// Salva (ou substitui) um extrato como JSON no Drive
function epSalvarExtrato(jsonStr, nomeArq) {
  try {
    var pasta = _epGetPasta();
    // Apaga versão anterior com mesmo nome, se existir
    var existing = pasta.getFilesByName(nomeArq);
    while (existing.hasNext()) existing.next().setTrashed(true);
    pasta.createFile(nomeArq, jsonStr, MimeType.PLAIN_TEXT);
    return { ok: true };
  } catch (e) {
    Logger.log('epSalvarExtrato erro: ' + e);
    return { ok: false, mensagem: e.message };
  }
}

// Lista todos os extratos salvos no Drive (mais recente primeiro)
function epListarExtratos() {
  try {
    var pasta   = _epGetPasta();
    var files   = pasta.getFiles();
    var res     = [];
    while (files.hasNext()) {
      var f = files.next();
      if (f.getName().match(/^Extrato_.*\.json$/)) {
        res.push({
          id:     f.getId(),
          nome:   f.getName(),
          criado: f.getDateCreated().toISOString()
        });
      }
    }
    res.sort(function(a, b) { return a.criado < b.criado ? 1 : -1; });
    return { ok: true, arquivos: res };
  } catch (e) {
    Logger.log('epListarExtratos erro: ' + e);
    return { ok: false, mensagem: e.message, arquivos: [] };
  }
}

// Carrega o JSON de um extrato pelo ID do arquivo no Drive
function epCarregarExtrato(fileId) {
  try {
    var conteudo = DriveApp.getFileById(fileId).getBlob().getDataAsString();
    return { ok: true, dados: conteudo };
  } catch (e) {
    Logger.log('epCarregarExtrato erro: ' + e);
    return { ok: false, mensagem: e.message };
  }
}

// Apaga um extrato do Drive pelo ID
function epApagarExtratoDrive(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return { ok: true };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}


// ══════════════════════════════════════════════════════════════════════════
//  MIGRAÇÃO DE COLUNAS — rodar UMA VEZ após reorganização
//  ATENÇÃO: testar em CÓPIA da planilha antes de rodar na original.
//  Remapeia os dados do layout antigo (59 colunas com buracos) para
//  o novo layout compacto (42 colunas, A–AP, sem buracos).
// ══════════════════════════════════════════════════════════════════════════
function migrarColunas() {
  var MAPA = [
    // [índice_antigo, índice_novo]
    [0,0],   // CANAL         A→A
    [2,1],   // STATUS        C→B
    [36,2],  // PRE_STATUS    AK→C
    [3,3],   // DATA_ATIV     D→D
    [6,4],   // CONTRATO      G→E
    [5,5],   // COD_CLI       F→F
    [12,6],  // RESP          M→G
    [7,7],   // AGENDA        H→H
    [8,8],   // TURNO         I→I
    [9,9],   // INSTAL        J→J
    [10,10], // REAGENDAMENTOS K→K
    [11,11], // OBSERVACAO    L→L
    [1,12],  // PRODUTO       B→M
    [33,13], // PLANO         AH→N
    [35,14], // VALOR         AJ→O
    [29,15], // VENC          AD→P
    [30,16], // FAT           AE→Q
    [37,17], // LINHA_MOVEL   AL→R
    [40,18], // PORTABILIDADE AO→S
    [14,19], // CLIENTE       O→T
    [13,20], // CPF           N→U
    [15,21], // WHATS         P→V
    [16,22], // TEL           Q→W
    [47,23], // NOME_MAE      AV→X
    [48,24], // DT_NASC       AW→Y
    [49,25], // RG            AX→Z
    [17,26], // CEP           R→AA
    [18,27], // RUA           S→AB
    [19,28], // NUM           T→AC
    [20,29], // COMPLEMENTO   U→AD
    [21,30], // BAIRRO        V→AE
    [22,31], // CIDADE        W→AF
    [23,32], // UF            X→AG
    [25,33], // SISTEMA       Z→AH
    [26,34], // SEGMENTACAO   AA→AI
    [41,35], // VEROHUB       AP→AJ
    [43,36], // VEROHUB_PEDIDO AR→AK
    [44,37], // VEROHUB_PEDIDO_DT AS→AL
    [42,38], // STATUS_PAP    AQ→AM
    [45,39], // BC_TAGS       AT→AN
    [46,40], // BC_STATUS     AU→AO
    [51,41]  // VIABILIDADE   AZ→AP
  ];

  var sheet = _getSpreadsheet_().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return 'Aba "' + CONFIG.SHEET_NAME + '" não encontrada.';

  var totalLinhas = sheet.getLastRow();
  if (totalLinhas < 1) return 'Planilha vazia — nada a migrar.';

  var totalColsAtual = sheet.getLastColumn();
  var dados = sheet.getRange(1, 1, totalLinhas, totalColsAtual).getValues();

  var novosDados = dados.map(function(row) {
    var nova = new Array(CONFIG.TOTAL_COLUNAS).fill('');
    MAPA.forEach(function(par) {
      nova[par[1]] = (par[0] < row.length) ? row[par[0]] : '';
    });
    return nova;
  });

  sheet.getRange(1, 1, totalLinhas, CONFIG.TOTAL_COLUNAS).setValues(novosDados);

  // Apaga colunas excedentes (além da col AP = coluna 42)
  var maxCol = sheet.getMaxColumns();
  if (maxCol > CONFIG.TOTAL_COLUNAS) {
    sheet.deleteColumns(CONFIG.TOTAL_COLUNAS + 1, maxCol - CONFIG.TOTAL_COLUNAS);
  }

  var msg = 'migrarColunas() OK — ' + (totalLinhas - 2) + ' linhas de dados remapeadas para ' + CONFIG.TOTAL_COLUNAS + ' colunas.';
  Logger.log(msg);
  return msg;
}
