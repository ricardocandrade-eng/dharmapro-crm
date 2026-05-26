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
 * Atualizado em: 11/05/2026 | Fix getDashboard: parseFloat de VALOR agora suporta formato BR ("R$ 89,90"); fallback extrai preço do nome do plano; ticketQtd só conta linhas com valor > 0 (evita ticket médio distorcido por linhas sem preço)
 * Atualizado em: 16/03/2026 | Auditoria: PERFIS_MENUS→Config.js, _getCidades()/_getTabela() com cache, _limparCache() unificada, LockService em salvarVenda/moverLeadAguardando/moverVendaFunil, getDashboard com cache, bug linha 3500 corrigido, doPost com webhook_secret, ternário morto removido em criarPedidoVeroHub
 * Atualizado em: 16/03/2026 | Fix: background hardcoded (#ddd) nos modais substituído por variáveis CSS
 * Atualizado em: 15/03/2026 | Fix: observacao adicionada em _construirLinhaDados (col L)
 * ────────────────────────────────────────────────────────────────────────
 */

var CONFIG = {
  SHEET_NAME:      '1 - Vendas',
  SHEET_VINCULOS_VENDAS: 'Vinculos Vendas',
  SPREADSHEET_ID:  '1H1qNgyNjmIYiZWT0wHwzANLf7yLggzYzBNVgAWCJ9lE',
  SHEET_USUARIOS:  'Usuarios',   // aba: A=usuario | B=senha | C=nome exibição
  SHEET_HISTORICO: 'Histórico',  // aba de arquivo — criada por criarAbaHistorico()
  CACHE_TTL:       300, // 5 min — era 60s; invalidado corretamente por _limparCache() após escritas
  CACHE_PREFIX:    'crm_v3_',   // prefixo v3 — invalida cache após reorganização de colunas
  MAX_RESULTS:     50,
  TOTAL_COLUNAS:   64,          // A (0) até BL (63) — Fase 3 financeiro (AU-BL append). Colunas físicas criadas por fase3AddColunas (21/05).
  TABELA_JSON_FILE_ID: '1wB9jncB_eBhGnBE-OpiZZ5UfVnvmv-ro',  // _getTabela() lê deste JSON no Drive (substitui aba TABELA)
  CIDADES_JSON_FILE_ID: '17CQ8KmZdyUtgQChPFC2b7pq2tsU6riV1',  // _getCidadesJson() lê do JSON no Drive (substitui aba CIDADES)
  CODIGOS_VERO_JSON_FILE_ID: '',  // _getCodigosVero() — vazio = fallback p/ busca por nome 'planos_vero_codigos.json'
  PONTUACAO_JSON_FILE_ID: '1txC2mYqj0kh_L9O7s1_7gCR9hVv9t5gy',  // _getPontuacaoPlanos() (Módulo Financeiro §11.9) — fixado 21/05 via financeiroSetupFase2
  CARTAS_META_JSON_FILE_ID: '1zkTm2bA6ClHITnY_VvCDlGUOzGXb-mRp',  // _getCartasMetaPap() (Módulo Financeiro §4.2) — fixado 21/05 via financeiroSetupFase2
  VEROHUB_CODIGOS_JSON_FILE_ID: '',  // _getVerohubCodigos() — vazio = fallback p/ busca por nome 'verohub_codigos_cidades.json' (sweep VeroHub: código por cidade)
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
    VIABILIDADE:       41,  // AP - Resultado da consulta de viabilidade VeroHub
    CRIADO_EM:         42,  // AQ - Data/hora do lançamento da venda (imutável após criação)
    VERO_STATUS:       43,  // AR - Resultado do cruzamento Vero: 🟢 (match) | 🟡 (só CRM)
    CRIADO_POR:        44,  // AS - Nome do usuário que registrou a venda (imutável após criação)
    FORMA_PAGAMENTO:   45,  // AT - 'BOLETO' ou 'RECORRENTE' (obrigatório em cadastro novo; legado pode estar vazio)
    // ── Bloco 7: Financeiro (AU–BL) — Módulo Financeiro Fase 3 (§5) ─────────
    // Snapshots (no save, idempotente): COD_PLANO, PONTOS_VENDA, PONTOS_MOVEL, MES_COMPETENCIA.
    // Live (import extrato/inadimplência/SAFRA): demais. _construirLinhaDados PRESERVA todas em edição.
    COD_PLANO:         46,  // AU - Código numérico do plano na Vero (reverse-lookup planos_vero_codigos)
    PONTOS_VENDA:      47,  // AV - Pontos BL da Fibra (pontuacao_planos × segmentação)
    PONTOS_MOVEL:      48,  // AW - Pontos do Móvel combo (multiplica por fator; NÃO é R$)
    MES_COMPETENCIA:   49,  // AX - YYYY-MM, vintage por instalação (§11.1)
    ESTRELAS_NO_MES:   50,  // AY - Tier de estrela resolvido no fechamento (cartas_meta_pap)
    FATOR_APLICADO:    51,  // AZ - Fator que a Vero efetivamente usou (import extrato)
    RECEITA_PREVISTA:  52,  // BA - PONTOS × FATOR (calc/projeção)
    RECEITA_REALIZADA: 53,  // BB - Do extrato mensal (pode ter desconto/multa)
    STATUS_ADIMPL_90D: 54,  // BC - EM_DIA / INADIMPLENTE_90D / ADIMPLENTE_90D_LIBERADO
    STATUS_CHURN:      55,  // BD - ATIVO / CHURN_VOLUNTARIO / CHURN_INVOLUNTARIO / CANCELADO_COMERCIAL
    STATUS_SUSPENSAO:  56,  // BE - NORMAL / SUSPENSO_<dias>
    FAIXA_RISCO:       57,  // BF - 1-6 (relatório inadimplência)
    NEVER_PAID:        58,  // BG - bool (relatório inadimplência)
    AGING_DIAS:        59,  // BH - dias em atraso da fatura mais antiga
    ULTIMO_REFRESH_RISCO: 60, // BI - timestamp do último refresh profundo
    ORIGEM_CONTRATO_VERO: 61, // BJ - HUB / ADP / ADAPTER / NG / SIMETRA
    MES_REF_VENDA:     62,  // BK - M0 / M-1 / M-2 ... vintage reportado pela Vero
    CLASSIFICACAO_CLUSTER: 63 // BL - Segmentação reportada pela Vero (pode divergir do CRM)
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
    _atualizarVendaNoCache_(linha); // Fase 5b
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
    _atualizarVendaNoCache_(linha); // Fase 5b
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
    _atualizarVendaNoCache_(linha); // Fase 5b
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

    _atualizarVendaNoCache_(linha); // Fase 5b
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
    _atualizarVendaNoCache_(linha); // Fase 5b
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
      _atualizarVendaNoCache_(linha); // Fase 5b
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
    _atualizarVendaNoCache_(linha); // Fase 5b
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
        // Normaliza para DD/MM/YYYY (consistente com _construirLinhaDados)
        sheet.getRange(linha, CONFIG.COLUNAS.INSTAL + 1).setValue(_formatarDataNascimento(dados.dataInstalacao, 'dd/MM/yyyy'));
      }
    }
    if (dados.dataAgendamento) {
      sheet.getRange(linha, CONFIG.COLUNAS.AGENDA + 1).setValue(_formatarDataNascimento(dados.dataAgendamento, 'dd/MM/yyyy'));
    }

    _atualizarVendaNoCache_(linha); // Fase 5b: update fino (var é `linha`, não linhaNum)

    // Notificação PAP quando instalação confirmada
    if (dados.instalada) {
      try {
        var c      = CONFIG.COLUNAS;
        var rowPAP = sheet.getRange(linha, 1, 1, c.CLIENTE + 1).getValues()[0];
        if (rowPAP[c.CANAL] === 'PAP') {
          var vPAP = _papBuscarSubscriberVendedor(null, rowPAP[c.RESP]);
          if (vPAP && vPAP.subscriberId && dados.notificarVendedor !== false) {
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
        sheet.getRange(linha, CONFIG.COLUNAS.INSTAL + 1).setValue(_formatarDataNascimento(dados.dataInstalacao, 'dd/MM/yyyy'));
      }
    }
    if (dados.dataAgendamento) {
      sheet.getRange(linha, CONFIG.COLUNAS.AGENDA + 1).setValue(_formatarDataNascimento(dados.dataAgendamento, 'dd/MM/yyyy'));
    }

    _atualizarVendaNoCache_(linha); // Fase 5b: update fino (var é `linha`, não linhaNum)

    // Notificação PAP quando instalação confirmada
    if (dados.instalada) {
      try {
        var c      = CONFIG.COLUNAS;
        var rowPAP = sheet.getRange(linha, 1, 1, c.CLIENTE + 1).getValues()[0];
        if (rowPAP[c.CANAL] === 'PAP') {
          var vPAP = _papBuscarSubscriberVendedor(null, rowPAP[c.RESP]);
          if (vPAP && vPAP.subscriberId && dados.notificarVendedor !== false) {
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


// ── LOG DE CONSULTAS DE INSTALAÇÃO (Fase 1.0 — diagnóstico NG/Adapter) ────
// Grava cada evento das consultas NG/Adapter na aba "Log Consultas Instalacao"
// para análise de falhas. Fire-and-forget: erro no log nunca bloqueia a UX
// da consulta (chamada pelo frontend é assíncrona sem handlers de falha).
//
// Eventos esperados: iniciado | sucesso | erro_extensao | timeout_frontend
//                    | retry | sem_credenciais | erro_backend | popup_bloqueado
// Categorias (quando há erro): auth | cpf_nao_encontrado | timeout_extensao
//                              | timeout_frontend | http_4xx | http_5xx
//                              | rede | popup_bloqueado | sem_credenciais
//                              | outro
// ── BUSCA DE VENDAS PARA O MODO VARREDURA ─────────────────────────────────
// Retorna lista enxuta de vendas que se qualificam pra diagnóstico em lote
// das consultas NG/Adapter. Vai direto na planilha (sem passar pela paginação
// do frontend), permitindo varrer base maior que as 500 mais recentes.
//
// Filtros aceitos:
//   sistemas: array ['NG', 'Adapter', 'ambos'] — match após normalização de SISTEMA
//   statuses: array de strings ('2','3', etc) — match no primeiro caractere de STATUS
//   max:      número, default 100, cap 500
//
// Já filtra CPF válido (11 dígitos) — vendas com CNPJ/lixo não voltam.
// Ordem: mais recentes primeiro (de trás pra frente na planilha).
function getVendasParaVarredura(filtros) {
  try {
    filtros = filtros || {};
    var sistemas = (filtros.sistemas && filtros.sistemas.length) ? filtros.sistemas : ['ambos'];
    var statuses = (filtros.statuses && filtros.statuses.length) ? filtros.statuses.map(String) : ['2'];
    var max      = Math.max(1, Math.min(500, Number(filtros.max) || 100));

    // Mapping de filtros UI (chave curta) → status exato no Sheets.
    // Necessário porque .charAt(0) === '2' pegava tanto '2- Aguardando Instalação'
    // quanto '2- Aguardando Entrega' (este último é parte Móvel de combos, irrelevante
    // pra consulta de instalação no NG/Adapter).
    var _STATUS_VARREDURA_MAP = {
      '2': '2- Aguardando Instalação',
      '3': '3 - Finalizada/Instalada'
    };
    var statusesExatos = statuses.map(function(s) {
      return _STATUS_VARREDURA_MAP[s] || s;
    });

    var sheet = _getSheet();
    var c = CONFIG.COLUNAS;
    var ultima = sheet.getLastRow();
    var total  = ultima - 2;
    if (total <= 0) return { vendas: [], total: 0 };

    var raw = sheet.getRange(3, 1, total, CONFIG.TOTAL_COLUNAS).getValues();
    var resultado = [];
    var aceitaAmbos = sistemas.indexOf('ambos') !== -1;

    for (var i = raw.length - 1; i >= 0 && resultado.length < max; i--) {
      var row = raw[i];
      var cpf = String(row[c.CPF] || '').trim();
      if (!cpf) continue;
      var cpfDigitos = cpf.replace(/\D/g, '');
      if (cpfDigitos.length !== 11) continue;

      var statusStr = String(row[c.STATUS] || '').trim();
      // Match exato no nome do status — não mais por primeiro caractere
      if (statusesExatos.indexOf(statusStr) === -1) continue;

      var sistemaRaw = String(row[c.SISTEMA] || '').trim().toUpperCase();
      // Normaliza: qualquer coisa que comece com "NG" vira NG; senão Adapter
      var sistema = sistemaRaw.indexOf('NG') === 0 ? 'NG' : 'Adapter';

      // Lookup do fallback via cidade (rede neutra → ambos sistemas operam)
      var cidade = String(row[c.CIDADE] || '').trim();
      var sistemaFallback = null;
      try {
        if (cidade) sistemaFallback = getSistemaFallbackPorCidade(cidade);
      } catch(e) {}

      // Filtro de sistema: inclui se:
      //   - filtro=ambos → sempre
      //   - filtro=NG    → sistema=NG OU sistema=Adapter com fallback=NG (ambígua)
      //   - filtro=Adapter → sistema=Adapter OU sistema=NG com fallback=Adapter (ambígua)
      if (!aceitaAmbos) {
        var passa = false;
        if (sistemas.indexOf(sistema) !== -1) passa = true;
        else if (sistemaFallback && sistemas.indexOf(sistemaFallback) !== -1) passa = true;
        if (!passa) continue;
      }

      resultado.push({
        linha:   i + 3,
        cpf:     cpf,
        // Consulta NG/Adapter passou a buscar por contrato (não por CPF) — a Varredura
        // troca _paginaAtual por esta lista, então o contrato precisa vir junto.
        contrato: String(row[c.CONTRATO] || '').trim().replace(/\.0$/, ''),
        sistema: sistema,
        sistemaFallback: sistemaFallback, // null se cidade não é ambígua
        cidade:  cidade,
        status:  statusStr,
        cliente: String(row[c.CLIENTE] || '').trim()
      });
    }

    return { vendas: resultado, total: resultado.length };
  } catch(e) {
    Logger.log('getVendasParaVarredura: ' + e.message);
    return { vendas: [], total: 0, erro: e.message };
  }
}


function logConsultaInstalacao(dados) {
  try {
    if (!dados) return { sucesso: false, mensagem: 'Payload vazio.' };
    var ss = _getSpreadsheet_();
    if (!ss) return { sucesso: false, mensagem: 'Spreadsheet indisponivel.' };
    var sheet = ss.getSheetByName('Log Consultas Instalacao');
    if (!sheet) return { sucesso: false, mensagem: 'Aba de log nao existe — rodar _criarAbaLogConsultasInstalacao.' };

    sheet.appendRow([
      new Date(),                                       // Timestamp
      String(dados.usuario   || ''),                    // Usuário
      String(dados.sistema   || ''),                    // Sistema (NG/Adapter)
      Number(dados.linha) || '',                        // Linha
      String(dados.cpf       || ''),                    // CPF
      String(dados.evento    || ''),                    // Evento
      String(dados.categoria || ''),                    // Categoria
      Number(dados.ms) || '',                           // Tempo (ms)
      String(dados.mensagem  || '').substring(0, 500)   // Mensagem
    ]);
    return { sucesso: true };
  } catch(e) {
    Logger.log('logConsultaInstalacao falhou: ' + e.message);
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

    // ── Decora com vínculos (necessário para agrupamento combo no frontend) ──
    try {
      var vinculosMapS = _getVinculosVendasMap_();
      // Mapa linha → row para as 500 linhas mapeadas
      var mapaLinhasS = {};
      for (var vl = 0; vl < linhasParaMapear.length; vl++) {
        mapaLinhasS[linhasParaMapear[vl]] = raw[linhasParaMapear[vl] - 3];
      }
      // Adiciona linhas filha (Móvel) que talvez não estejam entre as 500
      for (var vl2 = 0; vl2 < linhasParaMapear.length; vl2++) {
        var filhosS = vinculosMapS.filhasPorMae[linhasParaMapear[vl2]] || [];
        for (var fs = 0; fs < filhosS.length; fs++) {
          var flinha = filhosS[fs].vendaFilhaLinha;
          var fidx   = flinha - 3;
          if (fidx >= 0 && fidx < raw.length && !mapaLinhasS[flinha]) {
            mapaLinhasS[flinha] = raw[fidx];
          }
        }
      }
      // Resumos para todas as linhas conhecidas
      var mapaResumoS = {};
      var linhasS = Object.keys(mapaLinhasS);
      for (var lr = 0; lr < linhasS.length; lr++) {
        var lNum = parseInt(linhasS[lr], 10);
        if (!isNaN(lNum)) mapaResumoS[lNum] = _resumirVendaVinculada_(_mapearLinhaLista(mapaLinhasS[lNum], lNum, tz));
      }
      for (var vd = 0; vd < vendas.length; vd++) {
        vendas[vd] = _decorarVendaComVinculos_(vendas[vd], vinculosMapS, mapaResumoS);
      }
    } catch(ve) { Logger.log('getSincronizacaoInicial vinculos erro: ' + ve); }

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

      // Valores atuais dos campos sobrescreviveis (para montar o diff do
      // cruzamento — planilha como fonte da verdade). Aditivo: consumidores
      // antigos ignoram esses campos novos.
      var codCli     = String(row[c.COD_CLI]    || '').trim().replace(/\.0$/, '');
      var cidade     = String(row[c.CIDADE]     || '').trim();
      var observacao = String(row[c.OBSERVACAO] || '').trim();
      var valor      = _normalizarValorParaNumero_(row[c.VALOR]);
      var plano      = String(row[c.PLANO]      || '').trim();

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
        instal:   instal,
        codCli:     codCli,
        cidade:     cidade,
        observacao: observacao,
        valor:      valor,
        plano:      plano
      });
    }

    Logger.log('getContratosParaCruzamento: retornando ' + dados.length + ' contratos');

    // Log dos primeiros 3 registros para debug
    if (dados.length > 0) {
      Logger.log('Exemplo 1: ' + JSON.stringify(dados[0]));
      if (dados.length > 1) Logger.log('Exemplo 2: ' + JSON.stringify(dados[1]));
      if (dados.length > 2) Logger.log('Exemplo 3: ' + JSON.stringify(dados[2]));
    }

    // Mapa flat codigo Vero -> {nome_crm, conf} para o cruzamento sobrescrever PLANO.
    // Aditivo: se o JSON de codigos faltar, vem {} e o plano simplesmente nao e' corrigido.
    return { dados: dados, codigosVero: _getCodigosVeroMapaFlat_() };
    
  } catch(e) {
    Logger.log('getContratosParaCruzamento ERRO: ' + e.message + ' | Stack: ' + e.stack);
    return { dados: [], erro: e.message };
  }
}

// Modo legado (parcial): grava apenas as linhas em `resultados`.
// Mantido para compatibilidade — wipe-and-replace e' a chamada nova.
function salvarResultadoCruzamento(resultados) {
  if (!resultados || !resultados.length) return { sucesso: true, atualizados: 0 };
  var sheet = _getSheet();
  var col = CONFIG.COLUNAS.VERO_STATUS + 1;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(e) { return { sucesso: false, mensagem: 'Sistema ocupado' }; }
  try {
    resultados.forEach(function(r) {
      if (!r || !r.linha || r.linha < 3) return;
      sheet.getRange(r.linha, col).setValue(r.veroStatus || '');
    });
    SpreadsheetApp.flush();
    _limparCache();
    return { sucesso: true, atualizados: resultados.length };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Modo wipe-and-replace: escreve a coluna VERO_STATUS inteira em um unico
// setValues — qualquer linha fora de `resultados` fica em branco.
// Usado pelo pipeline de import (Gmail auto + botao na UI) para refletir
// SEMPRE o estado do ultimo relatorio Vero, sem residuos de imports anteriores.
function aplicarVeroStatusCompleto(resultados) {
  var sheet = _getSheet();
  var col = CONFIG.COLUNAS.VERO_STATUS + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return { sucesso: true, atualizados: 0 };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch(e) { return { sucesso: false, mensagem: 'Sistema ocupado' }; }
  try {
    var totalLinhas = lastRow - 2; // linhas 3..lastRow
    var valores = new Array(totalLinhas);
    for (var i = 0; i < totalLinhas; i++) valores[i] = [''];

    (resultados || []).forEach(function(r) {
      if (!r || !r.linha || r.linha < 3 || r.linha > lastRow) return;
      var idx = r.linha - 3;
      valores[idx] = [r.veroStatus || ''];
    });

    sheet.getRange(3, col, totalLinhas, 1).setValues(valores);
    SpreadsheetApp.flush();
    _limparCache();
    return { sucesso: true, atualizados: (resultados || []).length, linhasTotais: totalLinhas };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ── Sobrescrita de dados do CRM a partir do relatorio Vero ────────────────
// Planilha = fonte da verdade. Recebe correcoes JA FILTRADAS pelo frontend
// (so campos com valor na planilha e que diferem do CRM). Grava apenas as
// celulas mapeadas — preserva STATUS e qualquer coluna nao-mapeada. O match
// (por contrato) ja foi feito antes; aqui aplica por numero de linha.
//   - Datas (DATA_ATIV, INSTAL) -> DD/MM/YYYY
//   - VALOR -> numero (_normalizarValorParaNumero_)
//   - CIDADE -> dispara relookup de SISTEMA + SEGMENTACAO pela cidade
//   - OBSERVACAO_APPEND -> anexa linha idempotente (nao substitui anotacao do BKO)
// correcoes = [{ linha, campos: { COD_CLI, INSTAL, VALOR, CIDADE, DATA_ATIV, OBSERVACAO_APPEND } }]
function aplicarCorrecaoVero(correcoes) {
  if (!correcoes || !correcoes.length) return { sucesso: true, atualizados: 0, celulas: 0 };
  var sheet = _getSheet();
  var c = CONFIG.COLUNAS;
  var lastRow = sheet.getLastRow();

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch(e) { return { sucesso: false, mensagem: 'Sistema ocupado' }; }
  try {
    var linhasAfetadas = 0;
    var celulasAfetadas = 0;

    (correcoes || []).forEach(function(corr) {
      if (!corr || !corr.linha || corr.linha < 3 || corr.linha > lastRow) return;
      var campos = corr.campos || {};
      var linha = corr.linha;
      var mexeu = false;

      // COD_CLI (F)
      if (campos.COD_CLI !== undefined && campos.COD_CLI !== null && String(campos.COD_CLI).trim() !== '') {
        sheet.getRange(linha, c.COD_CLI + 1).setValue(String(campos.COD_CLI).trim());
        celulasAfetadas++; mexeu = true;
      }
      // DATA_ATIV (D)
      if (campos.DATA_ATIV) {
        var dAtiv = _formatarDataNascimento(campos.DATA_ATIV, 'dd/MM/yyyy');
        if (dAtiv) { sheet.getRange(linha, c.DATA_ATIV + 1).setValue(dAtiv); celulasAfetadas++; mexeu = true; }
      }
      // INSTAL (J)
      if (campos.INSTAL) {
        var dInst = _formatarDataNascimento(campos.INSTAL, 'dd/MM/yyyy');
        if (dInst) { sheet.getRange(linha, c.INSTAL + 1).setValue(dInst); celulasAfetadas++; mexeu = true; }
      }
      // VALOR (O)
      if (campos.VALOR !== undefined && campos.VALOR !== null && campos.VALOR !== '') {
        var valNum = _normalizarValorParaNumero_(campos.VALOR);
        if (valNum !== '') { sheet.getRange(linha, c.VALOR + 1).setValue(valNum); celulasAfetadas++; mexeu = true; }
      }
      // PLANO (N) — nome canonico do CRM resolvido via codigo Vero (alta/media)
      if (campos.PLANO !== undefined && campos.PLANO !== null && String(campos.PLANO).trim() !== '') {
        sheet.getRange(linha, c.PLANO + 1).setValue(String(campos.PLANO).trim());
        celulasAfetadas++; mexeu = true;
      }
      // CIDADE (AF) + relookup SISTEMA (AH) / SEGMENTACAO (AI)
      if (campos.CIDADE !== undefined && campos.CIDADE !== null && String(campos.CIDADE).trim() !== '') {
        var novaCidade = String(campos.CIDADE).trim();
        sheet.getRange(linha, c.CIDADE + 1).setValue(novaCidade);
        celulasAfetadas++; mexeu = true;
        try {
          var sis = getSistemaPorCidade(novaCidade);
          if (sis) { sheet.getRange(linha, c.SISTEMA + 1).setValue(sis); celulasAfetadas++; }
          var seg = getSegmentacaoPorCidade(novaCidade);
          if (seg) { sheet.getRange(linha, c.SEGMENTACAO + 1).setValue(seg); celulasAfetadas++; }
        } catch (eLook) {
          Logger.log('aplicarCorrecaoVero relookup cidade falhou (linha ' + linha + '): ' + eLook.message);
        }
      }
      // OBSERVACAO (L) — append idempotente
      if (campos.OBSERVACAO_APPEND && String(campos.OBSERVACAO_APPEND).trim() !== '') {
        var linhaNova = String(campos.OBSERVACAO_APPEND).trim();
        var atual = String(sheet.getRange(linha, c.OBSERVACAO + 1).getValue() || '').trim();
        if (atual.indexOf(linhaNova) === -1) {
          sheet.getRange(linha, c.OBSERVACAO + 1).setValue(atual ? (atual + '\n' + linhaNova) : linhaNova);
          celulasAfetadas++; mexeu = true;
        }
      }

      if (mexeu) linhasAfetadas++;
    });

    SpreadsheetApp.flush();
    _limparCache();
    return { sucesso: true, atualizados: linhasAfetadas, celulas: celulasAfetadas };
  } catch (e) {
    Logger.log('aplicarCorrecaoVero ERRO: ' + e.message + ' | ' + e.stack);
    return { sucesso: false, mensagem: e.message };
  } finally {
    lock.releaseLock();
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

  // ── API pública: planos/cidades (consumidores externos — ofertasverointernet, Renata) ─
  // Fonte da verdade dos planos da Vero — mesmo JSON do Drive (`planos_vero.json`)
  // já consumido internamente pelo CRM via `_getTabela()` (cache 600s).
  // Sem secret: dados públicos (preços de plano + cidades com cobertura).
  var action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'planos') {
    var cidade  = (e.parameter.cidade  || '').trim();
    var produto = (e.parameter.produto || '').trim().toUpperCase();
    // produto=FIBRA captura FIBRA_ALONE + FIBRA_COMBO via prefixo (idem MOVEL).
    // FIBRA_ALONE / FIBRA_COMBO / MOVEL_ALONE / MOVEL_COMBO explícitos seguem como filtro exato.
    var forma = (e.parameter.forma || 'BOLETO').toUpperCase();
    return ContentService
      .createTextOutput(JSON.stringify(_serveActionPlanos_(cidade, produto, forma)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (action === 'cidades') {
    return ContentService
      .createTextOutput(JSON.stringify(_serveActionCidades_()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── disparo-grupo: digest leads Meta (Alerta 8, schedule 12h/19h n8n) ─────
  // Sem secret — agregados (total de leads + total de conversões hoje).
  if (action === 'leads_meta_hoje') {
    try {
      return ContentService
        .createTextOutput(JSON.stringify(_serveActionLeadsMetaHoje_()))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, erro: err && err.message || String(err) }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── disparo-grupo: resumo do tráfego pago (Alerta 7, schedule 8/14/20h n8n) ─
  // Sem secret — agregados públicos (gasto + impressões + leads + vendas).
  // Reusa MetaAdsAPI.getResumoTrafegoHoje() pra centralizar lógica Meta API.
  if (action === 'resumo_trafego') {
    try {
      return ContentService
        .createTextOutput(JSON.stringify(getResumoTrafegoHoje()))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, erro: err && err.message || String(err) }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── disparo-grupo: digest do sino (Alerta 4, schedule 8h n8n) ─────────────
  // Reusa detectarAlertasAtivos (mesma fonte do sino do CRM). Exige token
  // (dados operacionais — não públicos). Reusa N8N_GROUP_WEBHOOK_TOKEN que já
  // está em PropertiesService aqui e em $env do container n8n no VPS.
  if (action === 'notificacoes_pendentes') {
    var secretRecebido = (e.parameter.secret || '').trim();
    var secretValido = PropertiesService.getScriptProperties().getProperty('N8N_GROUP_WEBHOOK_TOKEN');
    if (!secretValido || secretRecebido !== secretValido) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, erro: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService
      .createTextOutput(JSON.stringify(_serveActionNotificacoesPendentes_()))
      .setMimeType(ContentService.MimeType.JSON);
  }

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

  // Página principal desktop
  var desktopTmpl = HtmlService.createTemplateFromFile('Index');
  desktopTmpl.APP_BUILD_LABEL = getAppBuildLabel();
  return desktopTmpl
    .evaluate()
    .setTitle('CRM - Mobile Digital')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getAppBuildLabel() {
  var props = PropertiesService.getScriptProperties();
  var scriptedLabel = props.getProperty('APP_BUILD_LABEL');
  if (typeof DEPLOY_DATE !== 'undefined' && DEPLOY_DATE) return 'build ' + String(DEPLOY_DATE);
  if (scriptedLabel) return String(scriptedLabel);
  return 'build indisponivel';
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

    // ── WA Pessoal: validação por secret próprio (independente do webhook_secret global) ──
    if (payload.action === 'wa_pessoal_update') {
      if (payload.secret !== CFG_WA_PESSOAL.WA_PESSOAL_SECRET) {
        return ContentService
          .createTextOutput(JSON.stringify({ erro: 'wa_pessoal: secret inválido' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var resultWa = _handleWaPessoalUpdate_(payload);
      return ContentService
        .createTextOutput(JSON.stringify(resultWa))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'wa_pessoal_next_pending') {
      if (payload.secret !== CFG_WA_PESSOAL.WA_PESSOAL_SECRET) {
        return ContentService
          .createTextOutput(JSON.stringify({ erro: 'wa_pessoal: secret inválido' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var resultNext = _handleWaPessoalNextPending_(payload);
      return ContentService
        .createTextOutput(JSON.stringify(resultNext))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'wa_pessoal_mark_respondeu') {
      if (payload.secret !== CFG_WA_PESSOAL.WA_PESSOAL_SECRET) {
        return ContentService
          .createTextOutput(JSON.stringify({ erro: 'wa_pessoal: secret inválido' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var resultResp = _handleWaPessoalMarkRespondeu_(payload);
      return ContentService
        .createTextOutput(JSON.stringify(resultResp))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'wa_pessoal_check_dispatch') {
      if (payload.secret !== CFG_WA_PESSOAL.WA_PESSOAL_SECRET) {
        return ContentService
          .createTextOutput(JSON.stringify({ erro: 'wa_pessoal: secret inválido' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var resultDisp = _handleWaPessoalCheckDispatch_(payload);
      return ContentService
        .createTextOutput(JSON.stringify(resultDisp))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Roteador PAP: ações do mini site Parceiros.html ──────────────────────
    // Payloads PAP têm campo 'action' e NÃO têm 'webhook_secret' (não são BotConversa)
    if (payload.action && payload.secret === undefined) {
      return _routePAP(payload);
    }

    // ── Roteador Meta Ads: leads do Botconversa (com secret) ou Renata/n8n (sem secret) ──
    // Identificados por utm_source ou utm_campaign. Botconversa envia secret + utm_campaign.
    if (payload.utm_source || payload.utm_campaign) {
      if (SECRET && payload.secret && payload.secret !== SECRET) {
        return ContentService
          .createTextOutput(JSON.stringify({ erro: 'Não autorizado.' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
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

    // Claude Ads Bridge — atualiza o cockpit de Ads dentro do DharmaPro
    if (payload.action === 'claude_ads_bridge_upsert') {
      if (payload.mode === 'list_decisions') {
        return ContentService
          .createTextOutput(JSON.stringify(listarClaudeAdsActionDecisions()))
          .setMimeType(ContentService.MimeType.JSON);
      }

      if (!payload.bridge || payload.bridge.crm_mode !== 'cockpit_ads') {
        return ContentService
          .createTextOutput(JSON.stringify({ erro: 'Payload de bridge inválido.' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      PropertiesService.getScriptProperties().setProperty(
        'CLAUDE_ADS_BRIDGE_JSON',
        JSON.stringify(payload.bridge)
      );
      PropertiesService.getScriptProperties().setProperty(
        'CLAUDE_ADS_BRIDGE_UPDATED_AT',
        new Date().toISOString()
      );

      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, modulo: 'claude_ads_bridge' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'claude_ads_action_decision_list') {
      return ContentService
        .createTextOutput(JSON.stringify(listarClaudeAdsActionDecisions()))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'claude_ads_action_decision_upsert') {
      var actor = payload.actor || 'webhook';
      var result = registrarClaudeAdsActionDecision(actor, payload.decision || {});
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Mapeamento de campos do BotConversa para colunas do CRM
    var sheet    = _getSheet();
    var tz       = Session.getScriptTimeZone();
    var agora    = new Date();
    var dataAtiv = Utilities.formatDate(agora, tz, 'dd/MM/yyyy');

    // Sprint 2.6: monta dados via _construirLinhaDados (mesma normalização
    // que salvarVenda usa). Se CEP veio no payload, busca cidade/rua/bairro/uf
    // server-side; _construirLinhaDados então auto-preenche Sistema/Segmentacao
    // via getSistemaPorCidade/getSegmentacaoPorCidade. Vendas via webhook
    // nascem completas, sem depender do operador editar depois.
    var cepLimpo = String(payload.cep || '').replace(/\D/g, '');
    var endereco = {};
    if (cepLimpo.length === 8) {
      try {
        var cepRes = buscarCEPBackend(cepLimpo);
        if (cepRes && !cepRes.erro) {
          endereco = {
            rua:    cepRes.logradouro || '',
            bairro: cepRes.bairro     || '',
            cidade: cepRes.cidade     || '',
            uf:     cepRes.uf         || ''
          };
        } else {
          Logger.log('doPost: buscarCEPBackend falhou para ' + cepLimpo + ': ' + (cepRes && cepRes.mensagem || 'sem detalhes'));
        }
      } catch (eCep) {
        Logger.log('doPost: excecao buscarCEPBackend: ' + (eCep && eCep.message || eCep));
      }
    }

    // Sprint Integridade (21/05/2026) — INV-12: webhook BotConversa NUNCA cria
    // combo. Combo exige Móvel vinculado, que o webhook não fornece — deixaria
    // a Fibra Combo órfã. Se vier produto combo, rebaixa para "Fibra Alone"
    // (o operador converte em combo depois pelo CRM, que cria o Móvel atômico).
    var produtoWebhook = String(payload.produto || '').trim();
    if (_comboEhCombo_(produtoWebhook)) {
      Logger.log('doPost webhook: produto combo "' + produtoWebhook + '" rebaixado para "Fibra Alone" (INV-12).');
      produtoWebhook = 'Fibra Alone';
    }

    var dadosWebhook = {
      canal:       String(payload.canal || 'META ADS').trim(),
      produto:     produtoWebhook,
      status:      '1- Conferencia/Ativação',
      dataAtiv:    dataAtiv,
      cliente:     String(payload.nome || '').trim(),
      whats:       String(payload.whatsapp || payload.telefone || '').replace(/\D/g, ''),
      cpf:         String(payload.cpf || '').trim(),
      cep:         cepLimpo,
      rua:         endereco.rua    || '',
      bairro:      endereco.bairro || '',
      cidade:      endereco.cidade || '',
      uf:          endereco.uf     || '',
      resp:        String(payload.resp || '').trim(),
      observacao:  String(payload.obs  || '').trim(),
      preStatus:   'EM NEGOCIACAO'
    };

    var linha = _construirLinhaDados(dadosWebhook);

    // Insere na próxima linha com dados reais (ignora linhas em branco formatadas)
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
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
      Logger.log('doPost webhook: nova linha = ' + novaLinha + ' (lastRow=' + ultimaSheet + ')');
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

// Lê usuários da aba Usuarios da planilha. Retorna [] em qualquer erro.
function _getUsuariosSheet_() {
  try {
    var ss    = _getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.SHEET_USUARIOS);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    return data.map(function(r) {
      return {
        usuario:   String(r[0]).trim(),
        senhaHash: String(r[1]).trim(),
        nome:      String(r[2]).trim(),
        perfil:    String(r[3]).trim() || 'backoffice',
        foto:      String(r[4]).trim(),
        ativo:     r[5] === true || String(r[5]).toLowerCase() === 'true'
      };
    }).filter(function(u) { return u.usuario !== ''; });
  } catch(e) {
    Logger.log('_getUsuariosSheet_ erro: ' + e.message);
    return [];
  }
}

// Retorna PERFIS_MENUS vigente: PropertiesService (editado via CRM) ou Config.js (padrão).
function _getPerfilMenus_() {
  try {
    var json = PropertiesService.getScriptProperties().getProperty('PERFIS_MENUS_JSON');
    if (json) return JSON.parse(json);
  } catch(e) {
    Logger.log('_getPerfilMenus_ parse erro: ' + e.message);
  }
  return PERFIS_MENUS;
}

// Retorna PERFIS_MENUS vigente para o frontend (leitura pública após login).
function getPerfilMenus(adminUsuario) {
  try {
    _assertAdmin_(adminUsuario);
    return { ok: true, data: _getPerfilMenus_() };
  } catch(e) {
    return { ok: false, mensagem: e.message };
  }
}

// Salva PERFIS_MENUS customizado no PropertiesService.
// perfilMenus = { admin: [...], supervisor: [...], backoffice: [...] }
function salvarPerfilMenus(adminUsuario, perfilMenus) {
  try {
    _assertAdmin_(adminUsuario);
    var perfisValidos = ['admin', 'supervisor', 'backoffice'];
    perfisValidos.forEach(function(p) {
      if (!Array.isArray(perfilMenus[p])) throw new Error('Perfil "' + p + '" inválido ou ausente.');
    });
    PropertiesService.getScriptProperties().setProperty('PERFIS_MENUS_JSON', JSON.stringify(perfilMenus));
    return { ok: true, mensagem: 'Permissões salvas com sucesso.' };
  } catch(e) {
    Logger.log('salvarPerfilMenus erro: ' + e.message);
    return { ok: false, mensagem: e.message };
  }
}

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

    // Fonte primária: planilha Usuarios. Fallback: Config.js
    var todosList = _getUsuariosSheet_();
    if (!todosList || todosList.length === 0) todosList = USUARIOS;

    for (var i = 0; i < todosList.length; i++) {
      var reg = todosList[i];
      if (reg.ativo === false) continue; // ignora usuários inativos (apenas na planilha)
      if (String(reg.usuario).trim().toLowerCase() !== u) continue;

      // Prioridade de verificação de senha:
      // 1. PropertiesService (senha alterada pelo próprio usuário — tem precedência)
      // 2. senhaHash no registro (planilha ou Config.js)
      // 3. senha em Config.js (texto puro — legado, suporte à migração)
      var hashSalvo = PropertiesService.getScriptProperties().getProperty('pwd_' + u);
      var senhaOk = hashSalvo
        ? hashSalvo === senhaHash
        : reg.senhaHash
          ? reg.senhaHash === senhaHash
          : String(reg.senha || '') === senha;

      if (senhaOk) {
        _limparFalhasLogin(u);
        var perfil     = reg.perfil || 'backoffice';
        var perfilMap  = _getPerfilMenus_();
        var menus      = (perfilMap && perfilMap[perfil])
                           ? perfilMap[perfil]
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

// ─── REMOVIDO (Performance Lista de Vendas — 19/05/2026) ──────────────────
// `sincronizarTagsBotConversa` foi removida porque rodava em paralelo ao
// carregamento da Lista de Vendas, fazia até 100 chamadas HTTP em série
// (~30s), gravava célula-a-célula com setValue, e ao final invalidava o
// cache da Lista forçando um segundo reload. Era o maior gargalo percebido
// pelos usuários (~30s do total de 45s de "carregamento" da Lista).
//
// Os campos BC_TAGS / BC_STATUS no payload da Lista foram zerados
// (`_mapearLinhaLista`) e o badge visual no card foi removido (`JS.html`).
// As colunas AN/AO na planilha continuam existindo (vazias) até a Fase 6b.
//
// Stub mantido apenas para o caso de algum acionamento legado:
function sincronizarTagsBotConversa(forcar) {
  return { sucesso: true, atualizados: 0, skip: true,
           mensagem: 'sincronizarTagsBotConversa removida em 19/05/2026 — ver Code.js histórico.' };
}

// ─── PAGAMENTOS PAP ────────────────────────────────────────────────────────
// Coluna AM (CONFIG.COLUNAS.STATUS_PAP, 1-based = 39) = Status Pagamento PAP ("Em Aberto" / "Pago")
// Filtros: Produto=FIBRA ALONE/COMBO, Canal=PAP, Status=3 - Finalizada/Instalada, PAP=Em Aberto
//
// Configuração por vendedor (aba "3 - PAP"):
//   col AA (idx 8 no range S–AB) = Forma de Pagamento  → "Valor do Plano" | "Valor Fixo"
//   col AB (idx 9 no range S–AB) = Periodicidade       → "Diário" | "Mensal (20)"
// Vendedor sem Forma definida ou com valor desconhecido → omitido da lista.
function getPagamentosPAP() {
  try {
  var ss      = _getSpreadsheet_();
    var sheet   = _getSheet();
    var shPAP   = ss.getSheetByName('3 - PAP');
    var ultimaLinha = sheet.getLastRow();
    if (ultimaLinha < 3) {
      return {
        dados: [], total: 0, totalValor: 0, resumo: [],
        diario: { dados: [], totalValor: 0, resumo: [] },
        mensal: { dados: [], totalValor: 0, resumo: [] }
      };
    }

    // Lê aba 3 - PAP: colunas S-AB (19-28) para montar mapa vendedor→config
    var mapaPAP = {}; // nome vendedor → { chavePix, whatsapp, formaPgto, periodicidade }
    if (shPAP) {
      var ultimaPAP = shPAP.getLastRow();
      if (ultimaPAP >= 2) {
        // Col S=19(vendedor) T=20(idbot) U=21(whatsapp) V=22(dataCad) W=23(cpf)
        // X=24(chavePix) Y=25 Z=26 AA=27(formaPgto) AB=28(periodicidade)
        var rawPAP = shPAP.getRange(2, 19, ultimaPAP - 1, 10).getValues();
        rawPAP.forEach(function(r) {
          var vendedor      = String(r[0] || '').trim();
          var whatsapp      = String(r[2] || '').trim();
          var chavePix      = String(r[5] || '').trim();
          var formaPgto     = String(r[8] || '').trim();
          var periodicidade = String(r[9] || '').trim();
          if (vendedor) {
            mapaPAP[vendedor.toUpperCase()] = {
              chavePix: chavePix,
              whatsapp: whatsapp,
              formaPgto: formaPgto,
              periodicidade: periodicidade
            };
          }
        });
      }
    }
    Logger.log('getPagamentosPAP: mapa PAP com ' + Object.keys(mapaPAP).length + ' vendedores');

    var totalDados = ultimaLinha - 2;
    var raw = sheet.getRange(3, 1, totalDados, CONFIG.TOTAL_COLUNAS).getValues();
    var tz  = Session.getScriptTimeZone();

    var resultado = [];
    var totalValor = 0;
    var porVendedor = {};   // chave: secao + '|' + nome
    var stripDiacritics = function(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); };

    for (var i = 0; i < raw.length; i++) {
      var row      = raw[i];
      var c2 = CONFIG.COLUNAS;
      var canal     = String(row[c2.CANAL]       || '').trim().toUpperCase();
      var produto   = String(row[c2.PRODUTO]     || '').trim().toUpperCase();
      var status    = String(row[c2.STATUS]      || '').trim();
      var statusPAP = String(row[c2.STATUS_PAP]  || '').trim().toUpperCase();

      // Filtros
      if (canal !== 'PAP') continue;
      var prodNorm = stripDiacritics(produto);
      if (prodNorm !== 'FIBRA ALONE' && prodNorm !== 'FIBRA COMBO') continue;
      if (status !== '3 - Finalizada/Instalada') continue;
      if (stripDiacritics(statusPAP) !== 'EM ABERTO') continue;

      var cliente  = String(row[c2.CLIENTE]  || '').trim();
      var resp     = String(row[c2.RESP]     || '').trim();
      var contrato = String(row[c2.CONTRATO] || '').trim();
      var plano    = String(row[c2.PLANO]    || '').trim();
      var valor    = parseFloat(row[c2.VALOR]) || 0;

      var dInstal = row[c2.INSTAL];
      var dataInstalStr = (dInstal instanceof Date && !isNaN(dInstal))
        ? Utilities.formatDate(dInstal, tz, 'dd/MM/yyyy') : String(dInstal || '');

      // Busca config do vendedor; sem cadastro em 3 - PAP → omitir
      var respKey = resp.toUpperCase();
      var infoPAP = mapaPAP[respKey];
      if (!infoPAP) continue;

      // Calcula comissão a partir da Forma de Pagamento
      var fNorm = stripDiacritics(infoPAP.formaPgto.toUpperCase());
      var comissao;
      if (fNorm === 'VALOR DO PLANO')      comissao = valor;
      else if (fNorm === 'VALOR FIXO')     comissao = 100;
      else continue; // forma vazia/desconhecida → não exibir até configurar

      // Determina seção a partir da Periodicidade
      var pNorm = stripDiacritics(infoPAP.periodicidade.toUpperCase());
      var secao;
      if (pNorm === 'DIARIO')                  secao = 'diario';
      else if (pNorm.indexOf('MENSAL') === 0)  secao = 'mensal';
      else continue; // periodicidade desconhecida → não exibir

      totalValor += comissao;
      var chaveResumo = secao + '|' + resp;
      if (!porVendedor[chaveResumo]) {
        porVendedor[chaveResumo] = {
          nome: resp, total: 0, qtd: 0,
          chavePix: infoPAP.chavePix,
          secao: secao,
          formaPgto: infoPAP.formaPgto,
          periodicidade: infoPAP.periodicidade
        };
      }
      porVendedor[chaveResumo].total += comissao;
      porVendedor[chaveResumo].qtd++;

      resultado.push({
        linha:         i + 3,
        cliente:       cliente,
        resp:          resp,
        contrato:      contrato,
        produto:       produto,
        plano:         plano,
        valor:         valor,
        comissao:      comissao,
        dataInstal:    dataInstalStr,
        chavePix:      infoPAP.chavePix,
        whatsapp:      infoPAP.whatsapp,
        statusPAP:     statusPAP,
        formaPgto:     infoPAP.formaPgto,
        periodicidade: infoPAP.periodicidade,
        secao:         secao
      });
    }

    // Ordena por vendedor depois por data
    resultado.sort(function(a,b) { return a.resp.localeCompare(b.resp, 'pt-BR'); });

    // Resumo flat (compat retro: alguns clientes podem ler `resumo` direto)
    var resumoFlat = Object.keys(porVendedor).map(function(k){ return porVendedor[k]; });
    resumoFlat.sort(function(a,b) { return b.total - a.total; });

    // Quebra em diário / mensal
    var bySecao = function(sec) {
      var dados      = resultado.filter(function(r){ return r.secao === sec; });
      var totalSec   = dados.reduce(function(s,r){ return s + r.comissao; }, 0);
      var resumoSec  = resumoFlat.filter(function(r){ return r.secao === sec; });
      return { dados: dados, totalValor: totalSec, resumo: resumoSec };
    };

    Logger.log('getPagamentosPAP: ' + resultado.length + ' pagamentos, total R$' + totalValor);
    return {
      dados:       resultado,
      total:       resultado.length,
      totalValor:  totalValor,
      resumo:      resumoFlat,
      diario:      bySecao('diario'),
      mensal:      bySecao('mensal')
    };
  } catch(e) {
    Logger.log('Erro getPagamentosPAP: ' + e);
    return {
      dados: [], total: 0, totalValor: 0, resumo: [], erro: e.message,
      diario: { dados: [], totalValor: 0, resumo: [] },
      mensal: { dados: [], totalValor: 0, resumo: [] }
    };
  }
}


// Salva apenas o Status Pagamento PAP
function salvarStatusPAP(linha, novoStatus) {
  try {
    var sheet = _getSheet();
    sheet.getRange(linha, CONFIG.COLUNAS.STATUS_PAP + 1).setValue(novoStatus || '');
    _atualizarVendaNoCache_(linha); // Fase 5b
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
    _atualizarVendaNoCache_(linha); // Fase 5b
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
    _atualizarVendaNoCache_(payload.linha); // Fase 5b — var é payload.linha
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

    // Le estado atual para validacao de transicao
    var rowAtual    = sheet.getRange(linha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
    var vendaAtual  = _mapearLinha(rowAtual, linha);
    var statusAnt   = vendaAtual.status || '';
    var agendaNorm  = payload.agenda   ? _formatarDataNascimento(payload.agenda, 'dd/MM/yyyy') : (vendaAtual.agenda || '');
    var contrato    = payload.contrato || vendaAtual.contrato || '';
    var turno       = payload.turno    || vendaAtual.turno    || '';

    var errTrans = _validarTransicaoStatusServer_(statusAnt, '2- Aguardando Instalação', {
      dataAtiv: vendaAtual.dataAtiv, contrato: contrato,
      agenda:   agendaNorm,          turno:    turno,
      instal:   vendaAtual.instal,   sistema:  vendaAtual.sistema
    });
    if (errTrans) {
      return { sucesso: false, mensagem: errTrans + ' Use o painel lateral (✏️ Editar) para completar.' };
    }

    // Sprint Integridade (21/05/2026) — INV-01: não deixa Fibra Combo órfã
    // virar operacional (status 2) sem o Móvel vinculado.
    var errCombo = _validarComboIntegridade_(vendaAtual.produto, vendaAtual.produto, statusAnt, '2- Aguardando Instalação', linha);
    if (errCombo) return { sucesso: false, mensagem: errCombo };

    sheet.getRange(linha, c.STATUS    + 1).setValue('2- Aguardando Instalação');
    if (payload.agenda)   sheet.getRange(linha, c.AGENDA    + 1).setValue(agendaNorm);
    if (payload.turno)    sheet.getRange(linha, c.TURNO     + 1).setValue(payload.turno);
    if (payload.contrato) sheet.getRange(linha, c.CONTRATO  + 1).setValue(payload.contrato);
    if (payload.obs)      sheet.getRange(linha, c.OBSERVACAO + 1).setValue(payload.obs);

    // Funil 20/05: update fino — a venda entra no funil (status 2). _atualizarVendaNoCache_
    // cuida da Lista E do board (funil_v2). Antes invalidava tudo via _limparCache().
    _limparCacheSemLista();
    _atualizarVendaNoCache_(linha);

    Logger.log('moverLeadAguardando: linha ' + linha + ' movida.');
    resultado = { sucesso: true };
  } catch(e) {
    Logger.log('Erro em moverLeadAguardando: ' + e);
    resultado = { sucesso: false, mensagem: e.message };
  } finally {
    lock.releaseLock();
  }

  // Notificação PAP fora do lock — só em transição real (lead não estava em 2)
  if (resultado.sucesso && sheet && linha &&
      String((typeof statusAnt !== 'undefined' ? statusAnt : '')).trim() !== '2- Aguardando Instalação') {
    try {
      var c      = CONFIG.COLUNAS;
      var rowPAP = sheet.getRange(linha, 1, 1, c.CLIENTE + 1).getValues()[0];
      if (rowPAP[c.CANAL] === 'PAP') {
        var vPAP = _papBuscarSubscriberVendedor(null, rowPAP[c.RESP]);
        if (vPAP && vPAP.subscriberId && payload.notificarVendedor !== false) {
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

  // disparo-grupo: Alerta 1 (transição → "2- Aguardando Instalação").
  if (resultado.sucesso && linha) {
    try {
      var _statAnt = (typeof statusAnt !== 'undefined') ? statusAnt : '';
      _dispararAlertaTransicaoStatus_(linha, _statAnt, '2- Aguardando Instalação');
    } catch (eAlerta) { Logger.log('Alerta leadAguardando — erro: ' + (eAlerta && eAlerta.message || eAlerta)); }
  }

  // Meta Ads (Fase 3): entra em status 2 → marca lead "Converteu" se canal META ADS.
  if (resultado.sucesso && linha) {
    try { _reconciliarVendaMetaAdsAposSave_(linha); }
    catch (eMA) { Logger.log('Reconciliacao Meta Ads (leadAguardando) — erro: ' + (eMA && eMA.message || eMA)); }
  }

  return resultado;
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

    // Coluna pareada com sufixo "_REC" no header (Rev4 do JSON, 12/05/2026).
    // Fallback: se col REC não existir, usa Boleto - 10 para Fibra, Boleto para Móvel
    // (comportamento da Rev3, mantido como segurança até o JSON ser atualizado).
    var colIdxRec = cabecalho.indexOf(_normalizarTexto(segmentacao + '_REC'));

    // PUBLICAR (col 8): planos com PUBLICAR=false ficam fora do Mapa de Ofertas
    // (ex: planos Móvel internos, Oferta Verão descontinuada na Rev7). Compat:
    // se a coluna não existir (Rev1 e anteriores), não aplica filtro.
    var colPublicar = cabecalho.indexOf(_normalizarTexto('PUBLICAR'));

    // Monta grupos de categorias com seus planos (boleto + recorrente lado a lado)
    var grupos = [];
    var catAtual = null;
    var planosAtual = [];
    var resolverCodigo = _criarResolvedorCodigos_(cidade);

    function _parseValor_(v) {
      if (v === '' || v === null || v === undefined) return 0;
      var s = String(v).replace(/[^0-9.,]/g, '').replace(',', '.');
      return parseFloat(s) || 0;
    }

    for (var ti = 2; ti < dadosTab.length; ti++) {
      var nomePlano = String(dadosTab[ti][0] || '').trim();
      var cat       = String(dadosTab[ti][1] || '').trim();
      var valRaw    = dadosTab[ti][colIdx];
      if (!nomePlano || valRaw === '' || valRaw === null || valRaw === 0) continue;

      // Pular planos com PUBLICAR=false (mantém linha no JSON p/ histórico mas
      // não exibe no Mapa de Ofertas). Rev7 (17/05/2026). Guard: ignorar para
      // Móvel — esses planos têm PUBLICAR=false historicamente (semântica de
      // "não publicar na LP"), mas devem aparecer no Mapa do CRM.
      var ehMovelCat = cat.toUpperCase().indexOf('MOVEL') > -1 || cat.toUpperCase().indexOf('MÓVEL') > -1;
      if (!ehMovelCat && colPublicar > -1) {
        var pub = dadosTab[ti][colPublicar];
        if (pub !== true && pub !== 'SIM') continue;
      }

      var valBol = _parseValor_(valRaw);
      if (valBol === 0) continue;

      var ehMovel = cat.toUpperCase().indexOf('MOVEL') > -1 || cat.toUpperCase().indexOf('MÓVEL') > -1;
      var valRec;
      if (colIdxRec > -1) {
        valRec = _parseValor_(dadosTab[ti][colIdxRec]);
        if (valRec === 0) valRec = ehMovel ? valBol : (valBol - 10); // fallback se REC vier vazio
      } else {
        valRec = ehMovel ? valBol : (valBol - 10); // sem col REC: deduz como antes
      }

      if (cat !== catAtual) {
        if (catAtual !== null) grupos.push({ categoria: catAtual, planos: planosAtual });
        catAtual   = cat;
        planosAtual= [];
      }
      planosAtual.push({
        nome:            nomePlano,
        valorBoleto:     valBol.toFixed(2).replace('.', ','),
        valorRecorrente: valRec.toFixed(2).replace('.', ','),
        // 'valor' mantido por backward-compat: alias para o recorrente
        // (era o comportamento da Rev3 com hardcode -10).
        valor:           valRec.toFixed(2).replace('.', ','),
        // codigo Vero resolvido por (nome, cidade). null se não determinístico.
        codigo:          resolverCodigo(nomePlano)
      });
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
    // Fonte primária: JSON no Drive (cidades_vero.json)
    var c = _acharCidadeJson(cidade);
    if (c && c.sistema) return c.sistema;

    // Fallback: aba CIDADES do Sheets (legado, até CIDADES_JSON_FILE_ID estar configurado)
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

// Sistema secundário (fallback) — só retorna pra cidades em rede neutra com
// presença confirmada em ambos sistemas (NG + Adapter). Caso contrário, null.
// Usado pelo auto-fallback nas consultas NG/Adapter no frontend.
function getSistemaFallbackPorCidade(cidade) {
  try {
    var c = _acharCidadeJson(cidade);
    return (c && c.sistemaFallback) ? c.sistemaFallback : null;
  } catch(e) {
    Logger.log('getSistemaFallbackPorCidade erro: ' + e);
    return null;
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
    // Fonte primária: JSON no Drive
    var c = _acharCidadeJson(cidade);
    if (c && c.segmentacao) return c.segmentacao;

    // Fallback: aba CIDADES do Sheets
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

// ─── VALOR DE UM PLANO POR CIDADE + FORMA DE PAGAMENTO ─────────────────────
// Sprint 3 (12/05/2026): retorna o valor exato do plano considerando se é
// boleto ou recorrente. Frontend chama em duas situações:
//   1. ao trocar a Forma de Pagamento no select (recalcula valor)
//   2. ao trocar de plano com Forma já selecionada (preenche valor)
//   plano: aceita "Nome do Plano" puro OU "Nome | R$ XX,XX" (parser tolerante)
//   cidade: nome da cidade (mesma normalização de getSistemaPorCidade)
//   forma: 'BOLETO' ou 'RECORRENTE' (default 'RECORRENTE' se vier vazio/desconhecido)
// Retorna: { erro: boolean, valor: number, mensagem?: string }
function getValorPlano(plano, cidade, forma) {
  try {
    var dadosTab = _getTabela();
    var dadosCid = _getCidades();
    if (!dadosTab || !dadosTab.length || !dadosCid || !dadosCid.length) {
      return { erro: true, mensagem: 'TABELA ou CIDADES indisponíveis.' };
    }

    // Resolve segmentação pela cidade
    var cidNorm  = _normalizarTexto(cidade);
    var segmentacao = '';
    for (var ci = 0; ci < dadosCid.length; ci++) {
      if (_normalizarTexto(dadosCid[ci][6]) === cidNorm) { segmentacao = String(dadosCid[ci][3] || '').trim(); break; }
    }
    if (!segmentacao) return { erro: true, mensagem: 'Cidade não mapeada em CIDADES.' };

    var cabecalho = dadosTab[1].map(function(h) { return _normalizarTexto(h); });
    var formaNorm = String(forma || '').toUpperCase().trim();
    var sufixo    = (formaNorm === 'BOLETO') ? '' : '_REC';
    var colIdx    = cabecalho.indexOf(_normalizarTexto(segmentacao + sufixo));
    if (colIdx === -1 && sufixo) {
      // Fallback: tabela ainda em Rev3 sem cols REC — usa boleto e deduz
      colIdx = cabecalho.indexOf(_normalizarTexto(segmentacao));
    }
    if (colIdx === -1) return { erro: true, mensagem: 'Segmentação "' + segmentacao + '" não encontrada.' };

    // Extrai nome puro do plano. O select do CRM monta "Nome | preço" (ex.
    // "VERO MAIS 800MB | 149,90"), mas há planos cujo NOME contém pipes
    // (ex. "800MB YOUTUBE PREMIUM | HBO MAX | TELECINE"). Solução: tira só
    // o último segmento se for número (preço), preservando o restante.
    var nomePuro = String(plano || '').trim()
                      .replace(/\s*\|\s*R?\$?\s*[\d.,]+\s*$/, '')
                      .trim();
    if (!nomePuro) return { erro: true, mensagem: 'Plano vazio.' };
    var nomeNorm = _normalizarTexto(nomePuro);

    for (var ti = 2; ti < dadosTab.length; ti++) {
      var nomeRow = String(dadosTab[ti][0] || '').trim();
      if (!nomeRow) continue;
      if (_normalizarTexto(nomeRow) !== nomeNorm) continue;
      var raw = dadosTab[ti][colIdx];
      if (raw === '' || raw === null || raw === undefined) {
        return { erro: true, mensagem: 'Plano sem valor para a segmentação "' + segmentacao + '".' };
      }
      var s = String(raw).replace(/[^0-9.,]/g, '').replace(',', '.');
      var valor = parseFloat(s) || 0;
      // Fallback Rev3: se forma=RECORRENTE mas o JSON só tem boleto, aplica regra antiga
      if (formaNorm !== 'BOLETO' && cabecalho.indexOf(_normalizarTexto(segmentacao + '_REC')) === -1) {
        var cat = String(dadosTab[ti][1] || '').toUpperCase();
        var ehMovel = cat.indexOf('MOVEL') > -1 || cat.indexOf('MÓVEL') > -1;
        if (!ehMovel) valor = valor - 10;
      }
      return { erro: false, valor: valor };
    }
    return { erro: true, mensagem: 'Plano "' + nomePuro + '" não encontrado na TABELA.' };
  } catch (e) {
    Logger.log('getValorPlano erro: ' + (e && e.message || e));
    return { erro: true, mensagem: e.message || String(e) };
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

    // Filtros por produto (Sprint 3 - 12/05/2026, refator Rev5):
    // Fonte da verdade = coluna PRODUTO_TIPO (índice 13) do JSON. Domínio
    // fechado: FIBRA_ALONE | FIBRA_COMBO | MOVEL_ALONE | MOVEL_COMBO.
    // Fallback heurístico (categoria + presença de "MÓVEL" no nome) só dispara
    // se o JSON ainda for Rev4 (sem essa coluna) — comportamento idêntico ao
    // que estava em produção antes do Rev5, preservando compatibilidade.
    var colProdutoTipo = cabecalho.indexOf(_normalizarTexto('PRODUTO_TIPO'));
    var colPublicar    = cabecalho.indexOf(_normalizarTexto('PUBLICAR'));
    var produtoNorm    = String(produto || '').toUpperCase().trim();

    // Mapa produto-UI → PRODUTO_TIPO esperado no JSON
    var ALVO_TIPO = {
      'FIBRA ALONE':  'FIBRA_ALONE',
      'FIBRA COMBO':  'FIBRA_COMBO',
      'MÓVEL ALONE':  'MOVEL_ALONE',
      'MOVEL ALONE':  'MOVEL_ALONE',
      'MÓVEL COMBO':  'MOVEL_COMBO',
      'MOVEL COMBO':  'MOVEL_COMBO'
    };
    var tipoAlvo  = ALVO_TIPO[produtoNorm] || null;
    var buscaMovel= produtoNorm.indexOf('MÓVEL') > -1 || produtoNorm.indexOf('MOVEL') > -1;
    var ehFibraAlone = produtoNorm === 'FIBRA ALONE';
    var ehFibraCombo = produtoNorm === 'FIBRA COMBO';

    var planos   = [];
    var planosDetalhes = []; // [{nome, codigo, valor, categoria}] paralelo a `planos` (sem cabeçalhos)
    var resolverCodigo = _criarResolvedorCodigos_(cidade);
    var catAtual = '';

    for (var ti = 2; ti < dadosTab.length; ti++) {
      var nome   = String(dadosTab[ti][0]).trim();
      var cat    = String(dadosTab[ti][1]).trim();
      var valRaw = dadosTab[ti][colIdx];
      if (!nome || valRaw === '' || valRaw === null) continue;

      // Pular planos com PUBLICAR=false (descontinuados — não aparecem no
      // dropdown da Nova Venda). Rev7 (17/05/2026). getValorPlano continua
      // achando o plano por nome — edição de venda histórica funciona normal.
      // Guard: aplicar SOMENTE para Fibra (FIBRA_ALONE/COMBO). Planos Móvel
      // têm PUBLICAR=false historicamente (semântica "não publicar na LP")
      // mas devem aparecer no dropdown quando o operador escolhe Móvel.
      if (colPublicar > -1 && tipoAlvo && tipoAlvo.indexOf('FIBRA') === 0) {
        var pub = dadosTab[ti][colPublicar];
        if (pub !== true && pub !== 'SIM') continue;
      }

      if (colProdutoTipo > -1 && tipoAlvo) {
        // ── Filtro determinístico (Rev5+) ─────────────────────────────────
        var pt = String(dadosTab[ti][colProdutoTipo] || '').toUpperCase().trim();
        if (pt !== tipoAlvo) continue;
      } else {
        // ── Fallback heurístico (Rev4 e anteriores) ───────────────────────
        var catNorm     = cat.toUpperCase();
        var nomeNorm    = nome.toUpperCase();
        var ehCatMovel  = catNorm.indexOf('MÓVEL') > -1 || catNorm.indexOf('MOVEL') > -1;
        var nomeTemMovel= nomeNorm.indexOf('MÓVEL') > -1 || nomeNorm.indexOf('MOVEL') > -1;
        if (buscaMovel) {
          if (!ehCatMovel) continue;
        } else {
          if (ehCatMovel) continue;
          if (ehFibraAlone && nomeTemMovel) continue;
          if (ehFibraCombo && !nomeTemMovel) continue;
        }
      }

      if (_normalizarTexto(cat) !== _normalizarTexto(catAtual)) {
        catAtual = cat;
        planos.push('▶️ ' + cat.toUpperCase() + ' ◀️');
      }
      var valNum = parseFloat(valRaw);
      var valStr = !isNaN(valNum) ? valNum.toFixed(2).replace('.', ',') : '0,00';
      planos.push(nome + ' | ' + valStr);
      planosDetalhes.push({
        nome:      nome,
        categoria: cat,
        valor:     valStr,
        codigo:    resolverCodigo(nome) // null = sem resolução determinística pra cidade
      });
    }

    // planos: backward-compat (array de strings que Nova Venda lê hoje).
    // planosDetalhes: estrutura nova com código Vero por plano (Fase B passa a usar).
    return { erro: false, cidade: cidade.toUpperCase(), planos: planos, planosDetalhes: planosDetalhes };
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

// ── Nova fonte de verdade: cidades_vero.json no Drive ─────────────────────
// Gerado a partir das abas B2C_REDE_VERO/EPON/NEUTRA da planilha mestra
// "TABELA_DE_PREÇOS_PORTFÓLIO_B2C.xlsx". Substitui a aba CIDADES do Sheets.
// Schema: { geradoEm, totalCidades, cidades: [{nome, sistema, sistemaFallback,
//          segmentacao, regional, cluster, territorio, redes, rawSistema}] }
function _getCidadesJson() {
  if (!CONFIG.CIDADES_JSON_FILE_ID) return null; // sem JSON configurado → caller usa fallback
  var cache = CacheService.getScriptCache();
  var key   = CONFIG.CACHE_PREFIX + 'cidades_json_v1';
  try {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch(e) {}
  try {
    var file = DriveApp.getFileById(CONFIG.CIDADES_JSON_FILE_ID);
    var data = JSON.parse(file.getBlob().getDataAsString());
    // Indexa por nome normalizado pra lookups rápidos
    var indexed = { _gerado: data.geradoEm, _total: data.totalCidades, _byNome: {} };
    var lista = data.cidades || [];
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i];
      indexed._byNome[_normalizarTexto(c.nome)] = c;
    }
    try {
      var json = JSON.stringify(indexed);
      if (json.length < 95000) cache.put(key, json, 600);
    } catch(e) {}
    return indexed;
  } catch(e) {
    Logger.log('_getCidadesJson erro: ' + e.message);
    return null;
  }
}

// Acha entrada da cidade no JSON (case-insensitive, ignora acentos)
function _acharCidadeJson(cidade) {
  var idx = _getCidadesJson();
  if (!idx) return null;
  return idx._byNome[_normalizarTexto(cidade)] || null;
}

function _getTabela() {
  var cache = CacheService.getScriptCache();
  var key   = CONFIG.CACHE_PREFIX + 'tabela_v1';
  try {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch(e) {}
  var file = DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID);
  var rows = JSON.parse(file.getBlob().getDataAsString());
  try {
    var json = JSON.stringify(rows);
    if (json.length < 95000) cache.put(key, json, 600);
  } catch(e) {}
  return rows;
}

// ─── CÓDIGOS VERO — leitura do planos_vero_codigos.json (Drive) ───────────────
// Mapeamento código numérico Vero ↔ nome_crm. Coletado via VeroHub (Cowork).
// Cache 600s. Se CODIGOS_VERO_JSON_FILE_ID estiver vazio, busca por nome no Drive
// (planos_vero_codigos.json) e cacheia o ID nas Script Properties pra próxima.
function _getCodigosVero() {
  var cache = CacheService.getScriptCache();
  var key   = CONFIG.CACHE_PREFIX + 'codigos_vero_v1';
  try {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch(e) {}

  var fileId = CONFIG.CODIGOS_VERO_JSON_FILE_ID;
  if (!fileId) {
    try {
      var props = PropertiesService.getScriptProperties();
      fileId = props.getProperty('CODIGOS_VERO_FILE_ID') || '';
    } catch(e) {}
  }
  if (!fileId) {
    try {
      var iter = DriveApp.getFilesByName('planos_vero_codigos.json');
      if (iter.hasNext()) {
        fileId = iter.next().getId();
        try { PropertiesService.getScriptProperties().setProperty('CODIGOS_VERO_FILE_ID', fileId); } catch(e) {}
      }
    } catch(e) {
      throw new Error('Falha ao buscar planos_vero_codigos.json no Drive: ' + e.message);
    }
  }
  if (!fileId) {
    throw new Error('planos_vero_codigos.json não encontrado no Drive. Configure CONFIG.CODIGOS_VERO_JSON_FILE_ID ou suba o arquivo.');
  }

  var content = DriveApp.getFileById(fileId).getBlob().getDataAsString();
  var parsed = JSON.parse(content);
  try {
    var json = JSON.stringify(parsed);
    if (json.length < 95000) cache.put(key, json, 600);
  } catch(e) {}
  return parsed;
}

// Mapa flat para o cruzamento: { "4624": { nome: "<nome_crm>", conf: "alta" }, ... }
// Direcao codigo->nome e' deterministica (cada codigo -> 1 nome_crm). Em duplicatas
// (mesmo codigo em coletas diferentes), mantem a de maior confianca. Ignora
// nome_crm_match null (SKU Vero sem par no CRM). Tolerante a falha (retorna {}).
function _getCodigosVeroMapaFlat_() {
  var out = {};
  var rank = { alta: 3, media: 2, baixa: 1, '': 0 };
  try {
    var cv = _getCodigosVero();
    (cv.coletas || []).forEach(function(col) {
      (col.planos || []).forEach(function(p) {
        if (!p || !p.codigo || !p.nome_crm_match) return;
        var cod  = String(p.codigo).trim();
        var conf = String(p.confianca || '').toLowerCase();
        if (!out[cod] || (rank[conf] || 0) > (rank[out[cod].conf] || 0)) {
          out[cod] = { nome: String(p.nome_crm_match).trim(), conf: conf };
        }
      });
    });
  } catch (e) {
    Logger.log('_getCodigosVeroMapaFlat_ erro: ' + e.message);
  }
  return out;
}

// ─── PONTUAÇÃO DE PLANOS — Módulo Financeiro (§11.9 / §4.1) ───────────────────
// Lê pontuacao_planos.json no Drive. Pontos por código + segmentação (BL) e
// pontos do Móvel combo. RECEITA = (pontuacao_bl[seg] + pontos_movel) × fator.
// Cache 600s. Se PONTUACAO_JSON_FILE_ID vazio, busca por nome e cacheia o ID.
// Mesma estrutura de _getCodigosVero.
function _getPontuacaoPlanos() {
  var cache = CacheService.getScriptCache();
  var key   = CONFIG.CACHE_PREFIX + 'pontuacao_planos_v1';
  try {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch(e) {}

  var fileId = CONFIG.PONTUACAO_JSON_FILE_ID;
  if (!fileId) {
    try {
      var props = PropertiesService.getScriptProperties();
      fileId = props.getProperty('PONTUACAO_PLANOS_FILE_ID') || '';
    } catch(e) {}
  }
  if (!fileId) {
    try {
      var iter = DriveApp.getFilesByName('pontuacao_planos.json');
      if (iter.hasNext()) {
        fileId = iter.next().getId();
        try { PropertiesService.getScriptProperties().setProperty('PONTUACAO_PLANOS_FILE_ID', fileId); } catch(e) {}
      }
    } catch(e) {
      throw new Error('Falha ao buscar pontuacao_planos.json no Drive: ' + e.message);
    }
  }
  if (!fileId) {
    throw new Error('pontuacao_planos.json não encontrado no Drive. Configure CONFIG.PONTUACAO_JSON_FILE_ID ou suba o arquivo.');
  }

  var content = DriveApp.getFileById(fileId).getBlob().getDataAsString();
  var parsed = JSON.parse(content);
  try {
    var json = JSON.stringify(parsed);
    if (json.length < 95000) cache.put(key, json, 600);
  } catch(e) {}
  return parsed;
}

// Mapa flat por código: { "4279": <entry>, ... }. Tolerante a falha (retorna {}).
function _getPontuacaoMapaPorCodigo_() {
  var out = {};
  try {
    var pj = _getPontuacaoPlanos();
    (pj.planos || []).forEach(function(p) {
      if (p && p.codigo) out[String(p.codigo).trim()] = p;
    });
  } catch (e) {
    Logger.log('_getPontuacaoMapaPorCodigo_ erro: ' + e.message);
  }
  return out;
}

// Resolve os pontos de uma venda a partir do código do plano + segmentação.
// Retorna { pontos_bl, pontos_movel, produto_tipo, encontrado } ou null em erro.
// pontos_bl = pontuação da Fibra na segmentação; pontos_movel = pontos do Móvel
// combo (0 se não houver). A receita prevista é (pontos_bl + pontos_movel) × fator.
function getPontuacaoVenda(codigo, segmentacao) {
  try {
    if (!codigo) return { encontrado: false, pontos_bl: 0, pontos_movel: 0, produto_tipo: '' };
    var mapa = _getPontuacaoMapaPorCodigo_();
    var p = mapa[String(codigo).trim()];
    if (!p) return { encontrado: false, pontos_bl: 0, pontos_movel: 0, produto_tipo: '' };
    var seg = String(segmentacao || 'PADRAO').trim().toUpperCase();
    if (seg === 'ESPECIAIS') seg = 'ESPECIAL';
    if (seg === 'PADRÃO')    seg = 'PADRAO';
    var bl = 0;
    if (p.pontuacao_bl) {
      bl = (p.pontuacao_bl[seg] != null) ? Number(p.pontuacao_bl[seg]) : Number(p.pontuacao_bl.PADRAO || 0);
    }
    var mv = (p.movel_vinculado && p.movel_vinculado.pontos_movel_combo) ? Number(p.movel_vinculado.pontos_movel_combo) : 0;
    return { encontrado: true, pontos_bl: bl, pontos_movel: mv, produto_tipo: p.produto_tipo || '', nome_crm: p.nome_crm || '' };
  } catch (e) {
    Logger.log('getPontuacaoVenda erro: ' + e.message);
    return null;
  }
}

// ─── CARTAS DE META PAP — Módulo Financeiro (§4.2 / §11.9) ────────────────────
// Lê cartas_meta_pap.json no Drive. Fator do mês por tier de estrela (por número
// de INSTALAÇÕES no mês), pontos do Móvel e regras de desconto. Cache 600s.
// Fallback por nome no Drive (mesma estrutura de _getPontuacaoPlanos).
function _getCartasMetaPap() {
  var cache = CacheService.getScriptCache();
  var key   = CONFIG.CACHE_PREFIX + 'cartas_meta_v1';
  try {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch(e) {}

  var fileId = CONFIG.CARTAS_META_JSON_FILE_ID;
  if (!fileId) {
    try {
      var props = PropertiesService.getScriptProperties();
      fileId = props.getProperty('CARTAS_META_FILE_ID') || '';
    } catch(e) {}
  }
  if (!fileId) {
    try {
      var iter = DriveApp.getFilesByName('cartas_meta_pap.json');
      if (iter.hasNext()) {
        fileId = iter.next().getId();
        try { PropertiesService.getScriptProperties().setProperty('CARTAS_META_FILE_ID', fileId); } catch(e) {}
      }
    } catch(e) {
      throw new Error('Falha ao buscar cartas_meta_pap.json no Drive: ' + e.message);
    }
  }
  if (!fileId) {
    throw new Error('cartas_meta_pap.json não encontrado no Drive. Configure CONFIG.CARTAS_META_JSON_FILE_ID ou suba o arquivo.');
  }

  var content = DriveApp.getFileById(fileId).getBlob().getDataAsString();
  var parsed = JSON.parse(content);
  try {
    var json = JSON.stringify(parsed);
    if (json.length < 95000) cache.put(key, json, 600);
  } catch(e) {}
  return parsed;
}

// Retorna a carta do mês "YYYY-MM". Se não existir, retorna a mais recente
// disponível (fallback) ou null. Mês ausente é comum até o upload do mês corrente.
function getCartaDoMes(mesCompetencia) {
  try {
    var cj = _getCartasMetaPap();
    var cartas = (cj && cj.cartas) || [];
    if (!cartas.length) return null;
    var alvo = String(mesCompetencia || '').trim();
    if (alvo) {
      for (var i = 0; i < cartas.length; i++) {
        if (String(cartas[i].mes_competencia) === alvo) return cartas[i];
      }
    }
    // Fallback: a carta de maior mes_competencia (mais recente).
    var maisRecente = cartas[0];
    for (var j = 1; j < cartas.length; j++) {
      if (String(cartas[j].mes_competencia) > String(maisRecente.mes_competencia)) maisRecente = cartas[j];
    }
    return maisRecente;
  } catch (e) {
    Logger.log('getCartaDoMes erro: ' + e.message);
    return null;
  }
}

// Resolve o tier de estrela + fator a partir do número de instalações do mês.
// Retorna { tier, fator_base, adimplencia_diferida, fator_total } ou null.
// O fator_base é o que entra no extrato no mês; a adimplência (0,4) é diferida (M+3).
function resolverEstrelaPorInstalacoes(instalacoes, mesCompetencia) {
  try {
    var carta = getCartaDoMes(mesCompetencia);
    if (!carta || !carta.estrelas) return null;
    var n = Number(instalacoes) || 0;
    for (var i = 0; i < carta.estrelas.length; i++) {
      var t = carta.estrelas[i];
      var min = (t.instalacoes_min != null) ? t.instalacoes_min : 0;
      var max = (t.instalacoes_max != null) ? t.instalacoes_max : Infinity;
      if (n >= min && n <= max) {
        return {
          tier: t.tier,
          fator_base: Number(t.fator_base) || 0,
          adimplencia_diferida: Number(t.adimplencia_diferida) || 0,
          fator_total: Number(t.fator_total) || 0,
          mes_competencia: carta.mes_competencia
        };
      }
    }
    return null;
  } catch (e) {
    Logger.log('resolverEstrelaPorInstalacoes erro: ' + e.message);
    return null;
  }
}

// ─── SWEEP VEROHUB — código por cidade (verohub_codigos_cidades.json) ─────────
// Dataset do sweep /api/plans_svas: { codigos:{cod→{nome,produto_tipo,...}},
// porCidade:{city_id→[cods]}, cidadeIndex:{NOME_NORMALIZADO→city_id} }. Cobre as
// ~359 cidades com plano (não só as 4 coletadas). Cache chunked (>95KB). Fallback
// por nome no Drive. Tolerante a falha (retorna null).
function _getVerohubCodigos() {
  var key = CONFIG.CACHE_PREFIX + 'verohub_codigos_v1';
  try { var hit = _cacheGetChunked(key); if (hit && hit.codigos && hit.porCidade) return hit; } catch(e){}
  var fileId = CONFIG.VEROHUB_CODIGOS_JSON_FILE_ID;
  if (!fileId) { try { fileId = PropertiesService.getScriptProperties().getProperty('VEROHUB_CODIGOS_FILE_ID') || ''; } catch(e){} }
  if (!fileId) {
    try { var it = DriveApp.getFilesByName('verohub_codigos_cidades.json');
      if (it.hasNext()) { fileId = it.next().getId(); try { PropertiesService.getScriptProperties().setProperty('VEROHUB_CODIGOS_FILE_ID', fileId); } catch(e){} } } catch(e){}
  }
  if (!fileId) return null;
  try {
    var parsed = JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString());
    try { _cachePutChunked(key, parsed, 600); } catch(e){}
    return parsed;
  } catch(e){ Logger.log('_getVerohubCodigos erro: ' + e.message); return null; }
}

// Núcleo normalizado de um nome de plano, pra casar nome CRM ↔ nome Vero do sweep
// (MAIS CONECTADO↔MÓVEL, GLOBOPLAY↔GLP, tira acento/MESH/ROKU/sufixo de preço).
function _vhNucleo_(s) {
  s = String(s || '').toUpperCase();
  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch(e){}
  s = s.replace(/MAIS CONECTADO/g, 'MOVEL').replace(/VERO CONTROLE/g, 'MOVEL');
  s = s.replace(/GLOBOPLAY|GLOBO PLAY/g, 'GLP');
  s = s.replace(/COM ANUNCIO|COM ADS/g, 'ADS');
  s = s.replace(/\bRN\b/g, '').replace(/\bMESH\b/g, '').replace(/\bROKU\b/g, '');
  // "ou" conector de streaming-escolha (ex. "YOUTUBE PREMIUM ou HBO MAX ou TELECINE")
  // — tratado como separador (some no núcleo), igual ao "|". Sem isso, o nome novo
  // (Rev8) ganharia tokens "OU" extras e quebraria o match Jaccard do reverse-lookup.
  s = s.replace(/\bOU\b/g, ' ');
  s = s.replace(/(\d+)\s*MB/g, '$1MB').replace(/(\d+)\s*GB/g, '$1GB');
  s = s.replace(/\s*\|\s*R?\$?\s*[\d.,]+\s*$/i, '');
  s = s.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// Normaliza removendo os CONECTORES de plano ("|" e "ou") — usado pra comparar
// nome do CRM (Rev8 usa "ou") com nome_crm_match do dicionário de códigos (que
// ainda pode ter "|"). Sem isso, o reverse-lookup legado quebra pro plano de
// streaming-escolha (800MB YOUTUBE PREMIUM ou HBO MAX ou TELECINE).
function _semConectoresVero_(s) {
  return _normalizarTexto(s)
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\bOU\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Reverse lookup: (nome do plano + cidade) -> codigo Vero. Gravado em COD_PLANO.
// Estratégia (Sprint sweep VeroHub, 21/05): tenta o SWEEP primeiro (todas as
// cidades, match CONSERVADOR — núcleo exato ou Jaccard≥0.92, prefere não-PACOTE,
// pula ambíguos pra não chutar código errado num dado financeiro); se não achar,
// cai no dicionário legado (_getCodigoVeroLegado_, 4 cidades coletadas). Match
// inseguro NUNCA é feito — sem match retorna '' (cobertura cresce, sem risco).
function getCodigoVeroPorPlanoCidade(plano, cidade) {
  try {
    var planoCore = String(plano || '').replace(/\s*\|\s*R?\$?\s*[\d.,]+\s*$/i, '').trim();
    if (!planoCore) return '';
    var cidNorm = _normalizarTexto(cidade);
    if (!cidNorm) return '';

    // 1) SWEEP VeroHub (todas as cidades)
    var vh = _getVerohubCodigos();
    if (vh && vh.cidadeIndex && vh.porCidade && vh.codigos) {
      var cityId = vh.cidadeIndex[cidNorm];
      if (cityId != null) {
        var cods = vh.porCidade[cityId] || vh.porCidade[String(cityId)] || [];
        var alvo = _vhNucleo_(planoCore);
        var alvoT = alvo ? alvo.split(' ') : [];
        var alvoSet = {}; alvoT.forEach(function(t){ alvoSet[t]=1; });
        var melhor = null; // {cod, score, pacote}
        for (var i = 0; i < cods.length; i++) {
          var info = vh.codigos[cods[i]]; if (!info || !info.nome) continue;
          var nuc = _vhNucleo_(info.nome); if (!nuc) continue;
          var score;
          if (nuc === alvo) { score = 1; }
          else {
            var kt = nuc.split(' '), inter = 0, uni = {};
            alvoT.forEach(function(t){ uni[t]=1; });
            kt.forEach(function(t){ if (alvoSet[t]) inter++; uni[t]=1; });
            var uniN = Object.keys(uni).length || 1;
            score = inter / uniN;
            if (score < 0.92) continue; // CONSERVADOR
          }
          var pacote = (info.produto_tipo === 'PACOTE');
          if (!melhor) melhor = { cod: cods[i], score: score, pacote: pacote };
          else {
            // prefere não-PACOTE; depois maior score; empate exato c/ cods diferentes = ambíguo
            if (melhor.pacote && !pacote) melhor = { cod: cods[i], score: score, pacote: pacote };
            else if (melhor.pacote === pacote) {
              if (score > melhor.score) melhor = { cod: cods[i], score: score, pacote: pacote };
              else if (score === melhor.score && cods[i] !== melhor.cod) melhor.ambiguo = true;
            }
          }
        }
        if (melhor && !melhor.ambiguo) return melhor.cod;
        // ambíguo ou sem match no sweep → tenta legado
      }
    }

    // 2) Fallback: dicionário legado (4 cidades coletadas)
    return _getCodigoVeroLegado_(planoCore, cidNorm);
  } catch (e) {
    Logger.log('getCodigoVeroPorPlanoCidade erro: ' + e.message);
    return '';
  }
}

// Reverse lookup legado: planos_vero_codigos.json (4 cidades), match por
// nome_crm_match exato + cidade exata. Mantido como fallback do sweep.
function _getCodigoVeroLegado_(planoCore, cidNorm) {
  try {
    var cv = _getCodigosVero();
    var rank = { alta: 3, media: 2, baixa: 1, '': 0 };
    var planoCoreKey = _semConectoresVero_(planoCore);
    var melhor = null;
    (cv.coletas || []).forEach(function(col) {
      var ctx = col.contexto || {};
      if (_normalizarTexto(ctx.cidade) !== cidNorm) return;
      (col.planos || []).forEach(function(p) {
        if (!p || !p.codigo || !p.nome_crm_match) return;
        var nmCore = String(p.nome_crm_match).replace(/\s*\|\s*R?\$?\s*[\d.,]+\s*$/i, '').trim();
        if (_semConectoresVero_(nmCore) !== planoCoreKey) return;
        var conf = String(p.confianca || '').toLowerCase();
        var temAddon = !!(p.addon && String(p.addon).trim() !== '');
        var score = (rank[conf] || 0) * 10 + (temAddon ? 0 : 5);
        if (!melhor || score > melhor.score) melhor = { codigo: String(p.codigo).trim(), score: score };
      });
    });
    return melhor ? melhor.codigo : '';
  } catch (e) {
    Logger.log('_getCodigoVeroLegado_ erro: ' + e.message);
    return '';
  }
}

// ─── VALIDAÇÃO CÓDIGOS VERO — cruza planos_vero.json vs planos_vero_codigos.json
// Retorna { ok, sem_codigo, orfaos, resumo } pra alimentar a tela admin.
// Chave de cruzamento: planos_vero.json[i][0] (nome_crm) ↔ codigos.coletas[*].planos[*].nome_crm_match
// Filtra só planos com PUBLICAR=true (comercialmente ativos) — descontinuados
// ainda no JSON ficam fora da fila de "sem código" mas geram alerta de órfão se
// já tinham código mapeado.
function getValidacaoCodigosVero(adminUsuario) {
  _assertAdmin_(adminUsuario);

  var planos, codigos;
  try { planos = _getTabela(); }
  catch (e) { return { ok: false, mensagem: 'planos_vero.json indisponível: ' + e.message }; }
  try { codigos = _getCodigosVero(); }
  catch (e) { return { ok: false, mensagem: 'planos_vero_codigos.json indisponível: ' + e.message }; }

  if (!planos || planos.length < 3) {
    return { ok: false, mensagem: 'planos_vero.json com formato inválido.' };
  }

  // 1. Indexar planos do CRM (linha 2+, PUBLICAR=true). Mantém também os descontinuados num set separado.
  var planosCrmPublicados = [];
  var todosNomesCrm = {};
  for (var i = 2; i < planos.length; i++) {
    var row = planos[i];
    if (!row || !row[0]) continue;
    var nome = String(row[0]).trim();
    todosNomesCrm[nome] = true;
    var publicar = row[8];
    if (publicar === true || publicar === 'SIM') {
      planosCrmPublicados.push({
        nome_crm:     nome,
        tipo:         String(row[1] || '').trim(),
        produto_tipo: String(row[13] || '').trim(),
        preco_boleto: row[2]
      });
    }
  }

  // 2. Indexar códigos do JSON de mapeamento por nome_crm_match
  var codigosPorNome = {};
  var totalCodigos = 0;
  (codigos.coletas || []).forEach(function (col) {
    var ctx = col.contexto || {};
    var contextoLabel = ctx.cidade
      ? (ctx.cidade + (ctx.conexao ? '/' + ctx.conexao : '') + (ctx.rede_canonica ? ' [' + ctx.rede_canonica + ']' : ''))
      : (ctx.produto || 'sem contexto');
    (col.planos || []).forEach(function (p) {
      totalCodigos++;
      if (!p.nome_crm_match) return;
      var nm = String(p.nome_crm_match).trim();
      if (!codigosPorNome[nm]) codigosPorNome[nm] = [];
      codigosPorNome[nm].push({
        codigo:       p.codigo || null,
        nome_vero:    p.nome_vero || '',
        confianca:    p.confianca || '',
        addon:        p.addon || '',
        contexto:     contextoLabel
      });
    });
  });

  // 3. Cruzar — publicados que têm código (ok) ou não (sem_codigo)
  var ok = [];
  var sem_codigo = [];
  planosCrmPublicados.forEach(function (p) {
    var hits = codigosPorNome[p.nome_crm];
    if (hits && hits.length) {
      ok.push({
        nome_crm:     p.nome_crm,
        tipo:         p.tipo,
        produto_tipo: p.produto_tipo,
        n_codigos:    hits.length,
        codigos:      hits
      });
    } else {
      sem_codigo.push({
        nome_crm:     p.nome_crm,
        tipo:         p.tipo,
        produto_tipo: p.produto_tipo,
        preco_boleto: p.preco_boleto
      });
    }
  });

  // 4. Órfãos — nome_crm_match nos códigos que não casa com nenhum nome em planos_vero.json
  var orfaos = [];
  Object.keys(codigosPorNome).forEach(function (nm) {
    if (!todosNomesCrm[nm]) {
      orfaos.push({
        nome_crm_match: nm,
        n_codigos:      codigosPorNome[nm].length,
        codigos:        codigosPorNome[nm],
        razao:          'Nome não existe mais em planos_vero.json (renomeado ou removido)'
      });
    }
  });

  var totalCrm = planosCrmPublicados.length;
  var totalOk  = ok.length;
  var cobertura_pct = totalCrm > 0 ? Math.round((totalOk / totalCrm) * 100) : 0;

  ok.sort(function (a, b) { return a.nome_crm.localeCompare(b.nome_crm); });
  sem_codigo.sort(function (a, b) { return a.nome_crm.localeCompare(b.nome_crm); });
  orfaos.sort(function (a, b) { return a.nome_crm_match.localeCompare(b.nome_crm_match); });

  return {
    ok: true,
    verificado_em: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
    resumo: {
      total_planos_crm:         totalCrm,
      total_planos_ok:          totalOk,
      total_planos_sem_codigo:  sem_codigo.length,
      total_codigos_vero:       totalCodigos,
      total_codigos_orfaos:     orfaos.length,
      cobertura_pct:            cobertura_pct,
      meta_status:              codigos._meta && codigos._meta.status || ''
    },
    ok_list:    ok,
    sem_codigo: sem_codigo,
    orfaos:     orfaos
  };
}

// Injeta a página Códigos Vero no CRM (admin only — guarda no JS.html).
function getCodigosVeroHtml() {
  return HtmlService.createHtmlOutputFromFile('CodigosVero').getContent();
}

// One-shot: limpa cache forçando releitura do JSON do Drive na próxima validação.
function _limparCacheCodigosVero() {
  try {
    CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'codigos_vero_v1');
    return 'OK — cache limpo.';
  } catch (e) {
    return 'Erro: ' + e.message;
  }
}

// ─── API PÚBLICA — `?action=planos` e `?action=cidades` (doGet) ──────────────
// Consumidores externos: ofertasverointernet (PlanosSection.tsx, HeroForm.tsx)
// e agente-ia-vero (Renata, via HTTP node n8n com cache 1h).
// Single source: `planos_vero.json` no Drive, lido via _getTabela() (cache 600s).

// Resolvedor memoizado de código Vero por nome do plano, para uma cidade fixa.
// Compartilhado pelos 3 consumidores (_serveActionPlanos_, getPlanosPorCidadeProduto,
// getOfertasCidade). Cada nome único é resolvido 1× via getCodigoVeroPorPlanoCidade
// (que já cacheia _getVerohubCodigos por 600s). Sem resolução determinística → null.
function _criarResolvedorCodigos_(cidade) {
  var cache = {};
  return function(nomePlano) {
    var key = String(nomePlano || '').trim();
    if (!key) return null;
    if (cache.hasOwnProperty(key)) return cache[key];
    var c = '';
    try { c = getCodigoVeroPorPlanoCidade(key, cidade); } catch (e) { c = ''; }
    cache[key] = c || null;
    return cache[key];
  };
}

function _serveActionPlanos_(cidade, produto, forma) {
  try {
    var dadosTab = _getTabela();
    if (!dadosTab || dadosTab.length < 3) {
      return { ok: false, mensagem: 'TABELA indisponível.', planos: [], total: 0 };
    }

    var cabecalho = dadosTab[1].map(function(h) { return _normalizarTexto(h); });

    // Resolve segmentação pela cidade; default PADRÃO se cidade vazia/não mapeada
    var segmentacao = cidade ? String(getSegmentacaoPorCidade(cidade) || '').trim() : '';
    if (!segmentacao) segmentacao = 'PADRÃO';

    var segNorm     = _normalizarTexto(segmentacao);
    var colBoleto   = cabecalho.indexOf(segNorm);
    var colRec      = cabecalho.indexOf(segNorm + '_REC');           // -1 em Rev3 e anteriores
    var colProduto  = cabecalho.indexOf(_normalizarTexto('PRODUTO_TIPO')); // -1 em Rev4 e anteriores
    var colPublicar = cabecalho.indexOf(_normalizarTexto('PUBLICAR'));

    if (colBoleto === -1) {
      return { ok: false, mensagem: 'Segmentação "' + segmentacao + '" ausente no cabeçalho.', planos: [], total: 0 };
    }

    var produtoNorm = _normalizarTexto(produto);
    var planos = [];
    var resolverCodigo = _criarResolvedorCodigos_(cidade);

    for (var ti = 2; ti < dadosTab.length; ti++) {
      var publicar = colPublicar > -1 ? dadosTab[ti][colPublicar] : true;
      // PUBLICAR é boolean (Rev2+) ou string 'SIM' em revisões antigas — aceita ambos
      if (publicar !== true && publicar !== 'SIM') continue;

      if (produtoNorm && colProduto > -1) {
        // Match por prefixo: 'FIBRA' captura FIBRA_ALONE+FIBRA_COMBO; 'FIBRA_ALONE' segue exato.
        var prodTipo = _normalizarTexto(dadosTab[ti][colProduto]);
        if (prodTipo.indexOf(produtoNorm) !== 0) continue;
      }

      var nome = String(dadosTab[ti][0] || '').trim();
      if (!nome) continue;

      var tipo  = String(dadosTab[ti][1] || '').trim();
      var precoBoletoRaw = dadosTab[ti][colBoleto];
      var precoRecRaw;
      if (colRec > -1) {
        precoRecRaw = dadosTab[ti][colRec];
      } else {
        // Fallback Rev3: recorrente = boleto - 10 para Fibra; Móvel preserva (mesma regra de getValorPlano)
        var ehMovel = tipo.toUpperCase().indexOf('MOVEL') > -1 || tipo.toUpperCase().indexOf('MÓVEL') > -1;
        if (!ehMovel && typeof precoBoletoRaw === 'number') {
          precoRecRaw = precoBoletoRaw - 10;
        } else {
          precoRecRaw = precoBoletoRaw;
        }
      }

      planos.push({
        nome:             nome,
        tipo:             tipo,
        produto_tipo:     colProduto > -1 ? String(dadosTab[ti][colProduto] || '') : '',
        nome_lp:          String(dadosTab[ti][6] || ''),
        features:         _parseFeatures_(dadosTab[ti][7]),
        speed:            _deriveSpeed_(nome),
        destaque:         false,
        preco:            _formatarPrecoBR_(forma === 'RECORRENTE' ? precoRecRaw : precoBoletoRaw),
        preco_boleto:     _formatarPrecoBR_(precoBoletoRaw),
        preco_recorrente: _formatarPrecoBR_(precoRecRaw),
        // codigo Vero resolvido por (nome, cidade) via _criarResolvedorCodigos_.
        // null = sem resolução determinística pra essa cidade (cidade fora do sweep,
        // ambíguo, ou plano não casa no dicionário). Aditivo — consumidores antigos ignoram.
        codigo:           resolverCodigo(nome)
      });
    }

    // Heurística destaque: primeiro VERO MAIS da lista filtrada
    for (var i = 0; i < planos.length; i++) {
      if (planos[i].tipo === 'VERO MAIS') { planos[i].destaque = true; break; }
    }

    return {
      ok: true,
      gerado_em: new Date().toISOString(),
      cidade: cidade,
      segmentacao: segmentacao,
      total: planos.length,
      planos: planos
    };
  } catch (err) {
    Logger.log('_serveActionPlanos_ erro: ' + (err && err.message || err));
    return { ok: false, mensagem: String((err && err.message) || err), planos: [], total: 0 };
  }
}

function _serveActionCidades_() {
  try {
    var rows = _getCidades();
    var nomes = [];
    var vistos = {};
    // rows[i][6] = nome da cidade (mesmo índice usado em getSistemaPorCidade/getSegmentacaoPorCidade)
    for (var i = 0; i < rows.length; i++) {
      var nome = String(rows[i][6] || '').trim();
      if (!nome) continue;
      var k = _normalizarTexto(nome);
      if (vistos[k]) continue;
      vistos[k] = true;
      nomes.push(nome);
    }
    nomes.sort(function(a, b) { return a.localeCompare(b, 'pt-BR'); });
    return { ok: true, total: nomes.length, cidades: nomes };
  } catch (err) {
    Logger.log('_serveActionCidades_ erro: ' + (err && err.message || err));
    return { ok: false, mensagem: String((err && err.message) || err), cidades: [] };
  }
}

function _parseFeatures_(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(function(x) { return String(x).trim(); }).filter(Boolean);
  return String(raw)
    .split(/[|;]/)
    .map(function(s) { return s.trim(); })
    .filter(Boolean);
}

function _deriveSpeed_(nome) {
  // Extrai velocidade do nome do plano. Ex: "VERO MAIS 550MB + ..." → { valor: '550', unidade: 'MB' }.
  // Retorna undefined para planos sem velocidade óbvia (Móvel, combos sem MB/GB no nome).
  var m = String(nome || '').match(/(\d+(?:[.,]\d+)?)\s*(MB|GIGA|GB|MEGA)\b/i);
  if (!m) return undefined;
  var valor = m[1].replace(',', '.');
  var unidadeRaw = m[2].toUpperCase();
  var unidade = (unidadeRaw === 'GIGA' || unidadeRaw === 'GB') ? 'Giga' : 'MB';
  return { valor: valor, unidade: unidade };
}

function _formatarPrecoBR_(raw) {
  // Devolve string no formato BR ("112,90"). Preserva strings exóticas do JSON (ex: "209,9 (Bauru)").
  // Strings puramente numéricas (ex: "97.9" — formato como recorrentes estão hoje no JSON) são normalizadas.
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number') {
    return raw.toFixed(2).replace('.', ',');
  }
  var s = String(raw).trim();
  if (/^\d+([.,]\d+)?$/.test(s)) {
    var n = parseFloat(s.replace(',', '.'));
    if (!isNaN(n)) return n.toFixed(2).replace('.', ',');
  }
  return s;
}


function _atualizarPlanosVeroJsonRev2() {
  var dados = [
    ["Última atualização: 08/05/2026 23:15","","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","LANDING PAGE","",""],
    ["Valores para pagamento via boleto","TIPO","ESPECIAIS","OURO","PRATA","PADRÃO","NOME_LP","FEATURES","PUBLICAR"],
    ["VERO MAIS 550MB + MÓVEL 20GB","VERO MAIS",112.9,112.9,112.9,112.9,"Vero Mais","20GB Celular | Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true],
    ["VERO MAIS 800MB + GLP PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Globo Play Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + HBO MAX + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","HBO Max | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["OFERTA VERÃO 800MB + GLP PREMIUM + HBO MAX + MÓVEL 60GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Globo Play Premium | HBO Max | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + DISNEY+ PADRÃO + MÓVEL 20GB","VERO MAIS",144.9,144.9,144.9,144.9,"Vero Mais","Disney Padrão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + DISNEY+ PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Disney Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 850MB + DIVERSÃO + MÓVEL 20GB","VERO MAIS",189.9,189.9,189.9,189.9,"Vero Mais","Vero Video Diversão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB - GLP PREMIUM + ASSISTÊNCIA RES. + MÓVEL 20GB","VERO MAIS",154.9,154.9,154.9,154.9,"Vero Mais","Globoplay Premium | Assistência Residencial | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 1GB + GLP PREMIUM + EXITLAG + MÓVEL 60GB","VERO MAIS","209,9 (Bauru)","","","","Vero Mais","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["VERO MAIS 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Disney com Ads | HBO Max com Ads | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Prime Video | Apple TV | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB","VERO MAIS",209.9,209.9,209.9,209.9,"Vero Mais","Prime Video | Apple TV | HBO Max | Globoplay Premium | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["550MB MUNDO FIBRA","MUNDO FIBRA",107.9,107.9,107.9,107.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true],
    ["550MB ASSISTÊNCIA RESIDENCIAL","MUNDO FIBRA",117.9,120.9,128.9,130.9,"Mundo Fibra","Assistência Residencial | Wi-Fi 6 | Instalação Grátis",true],
    ["750MB MUNDO FIBRA","MUNDO FIBRA",127.9,127.9,127.9,127.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true],
    ["600MB GLOBOPLAY PADRÃO COM ANÚNCIOS","ENTRETENIMENTO",137.9,137.9,137.9,137.9,"Mundo Entrenimento","Globo Play | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB YOUTUBE PREMIUM | HBO MAX | TELECINE","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Youtube Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB DISNEY+ PADRÃO","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Disney | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB DISNEY+ PREMIUM","ENTRETENIMENTO",165,165,165,165,"Mundo Entrenimento","Disney Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB GLOBOPLAY PREMIUM","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Globoplay Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB GLOBOPLAY PREMIUM + ASSISTÊNCIA RESIDENCIAL","ENTRETENIMENTO",149.9,149.9,149.9,149.9,"Mundo Entrenimento","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB PREMIERE","ENTRETENIMENTO",160,160,160,160,"Mundo Entrenimento","Premiere | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["850MB FILMES","COMPLETO",170,170,170,170,"Mundo Completo","Vero Video + Filmes | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["850MB ESPORTES","COMPLETO",185,185,185,185,"Mundo Completo","Vero Video + Esportes | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["1GB DIVERSÃO","COMPLETO",210,210,210,210,"Mundo Completo","Vero Video + Diversão | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB GAMER","GAMER",160,160,160,160,"Mundo Gamer","Exitlag | Oneplay | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["VERO CONTROLE 10GB","MÓVEL",30,30,30,30,"","",false],
    ["VERO CONTROLE 20GB","MÓVEL",40,40,40,40,"","",false],
    ["VERO CONTROLE 30GB","MÓVEL",50,50,50,50,"","",false],
    ["VERO CONTROLE 60GB","MÓVEL",80,80,80,80,"","",false],
    ["VERO CONTROLE + CHIPS 20GB","MÓVEL",40,40,40,40,"","",false],
    ["ASSINATURA + CHIPS 20GB","MÓVEL",12,12,12,12,"","",false],
    ["VERO CONTROLE + CHIPS 30GB","MÓVEL",50,50,50,50,"","",false],
    ["ASSINATURA + CHIPS 30GB","MÓVEL",12,12,12,12,"","",false],
    ["VERO CONTROLE + CHIPS 60GB","MÓVEL",80,80,80,80,"","",false],
    ["ASSINATURA + CHIPS 60GB","MÓVEL",12,12,12,12,"","",false],
    ["10GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",30,30,30,30,"","",false],
    ["20GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",40,40,40,40,"","",false],
    ["60GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",50,50,50,50,"","",false]
  ];
  var conteudo = JSON.stringify(dados, null, 2);
  DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID).setContent(conteudo);
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'tabela_v1');
  Logger.log('OK rev2 — ' + dados.length + ' linhas, ' + conteudo.length + ' bytes. Cache invalidado.');
}

/**
 * Rev3 — Tabela Vero 11/05/2026.
 * Delta vs Rev2: adiciona "VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MÓVEL 30GB" (R$ 139,90).
 * Fora de escopo (Ricardo decidiu não modelar): REDE EPON (espelho com velocidades 320MB/X) e
 * Pagamento Recorrente (cluster com ~R$10 desconto). Linha EXITLAG mantida como Bauru-only.
 */
function _atualizarPlanosVeroJsonRev3() {
  var dados = [
    ["Última atualização: 11/05/2026 — REDE VERO SEM RECORRENTE (REDE EPON e Pagamento Recorrente fora de escopo)","","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","LANDING PAGE","",""],
    ["Valores para pagamento via boleto","TIPO","ESPECIAIS","OURO","PRATA","PADRÃO","NOME_LP","FEATURES","PUBLICAR"],
    ["VERO MAIS 550MB + MÓVEL 20GB","VERO MAIS",112.9,112.9,112.9,112.9,"Vero Mais","20GB Celular | Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true],
    ["VERO MAIS 800MB + GLP PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Globo Play Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + HBO MAX + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","HBO Max | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MÓVEL 30GB","VERO MAIS",139.9,139.9,139.9,139.9,"Vero Mais","Esportes Futebol | YouTube Premium | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["OFERTA VERÃO 800MB + GLP PREMIUM + HBO MAX + MÓVEL 60GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Globo Play Premium | HBO Max | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + DISNEY+ PADRÃO + MÓVEL 20GB","VERO MAIS",144.9,144.9,144.9,144.9,"Vero Mais","Disney Padrão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + DISNEY+ PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Disney Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 850MB + DIVERSÃO + MÓVEL 20GB","VERO MAIS",189.9,189.9,189.9,189.9,"Vero Mais","Vero Video Diversão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB - GLP PREMIUM + ASSISTÊNCIA RES. + MÓVEL 20GB","VERO MAIS",154.9,154.9,154.9,154.9,"Vero Mais","Globoplay Premium | Assistência Residencial | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 1GB + GLP PREMIUM + EXITLAG + MÓVEL 60GB","VERO MAIS","209,9 (Bauru)","","","","Vero Mais","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["VERO MAIS 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Disney com Ads | HBO Max com Ads | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Prime Video | Apple TV | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["VERO MAIS 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB","VERO MAIS",209.9,209.9,209.9,209.9,"Vero Mais","Prime Video | Apple TV | HBO Max | Globoplay Premium | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true],
    ["550MB MUNDO FIBRA","MUNDO FIBRA",107.9,107.9,107.9,107.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true],
    ["550MB ASSISTÊNCIA RESIDENCIAL","MUNDO FIBRA",117.9,120.9,128.9,130.9,"Mundo Fibra","Assistência Residencial | Wi-Fi 6 | Instalação Grátis",true],
    ["750MB MUNDO FIBRA","MUNDO FIBRA",127.9,127.9,127.9,127.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true],
    ["600MB GLOBOPLAY PADRÃO COM ANÚNCIOS","ENTRETENIMENTO",137.9,137.9,137.9,137.9,"Mundo Entrenimento","Globo Play | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB YOUTUBE PREMIUM | HBO MAX | TELECINE","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Youtube Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB DISNEY+ PADRÃO","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Disney | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB DISNEY+ PREMIUM","ENTRETENIMENTO",165,165,165,165,"Mundo Entrenimento","Disney Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB GLOBOPLAY PREMIUM","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Globoplay Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB GLOBOPLAY PREMIUM + ASSISTÊNCIA RESIDENCIAL","ENTRETENIMENTO",149.9,149.9,149.9,149.9,"Mundo Entrenimento","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB PREMIERE","ENTRETENIMENTO",160,160,160,160,"Mundo Entrenimento","Premiere | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["850MB FILMES","COMPLETO",170,170,170,170,"Mundo Completo","Vero Video + Filmes | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["850MB ESPORTES","COMPLETO",185,185,185,185,"Mundo Completo","Vero Video + Esportes | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["1GB DIVERSÃO","COMPLETO",210,210,210,210,"Mundo Completo","Vero Video + Diversão | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["800MB GAMER","GAMER",160,160,160,160,"Mundo Gamer","Exitlag | Oneplay | Wi-Fi 6 | Kiddle | Instalação Grátis",true],
    ["VERO CONTROLE 10GB","MÓVEL",30,30,30,30,"","",false],
    ["VERO CONTROLE 20GB","MÓVEL",40,40,40,40,"","",false],
    ["VERO CONTROLE 30GB","MÓVEL",50,50,50,50,"","",false],
    ["VERO CONTROLE 60GB","MÓVEL",80,80,80,80,"","",false],
    ["VERO CONTROLE + CHIPS 20GB","MÓVEL",40,40,40,40,"","",false],
    ["ASSINATURA + CHIPS 20GB","MÓVEL",12,12,12,12,"","",false],
    ["VERO CONTROLE + CHIPS 30GB","MÓVEL",50,50,50,50,"","",false],
    ["ASSINATURA + CHIPS 30GB","MÓVEL",12,12,12,12,"","",false],
    ["VERO CONTROLE + CHIPS 60GB","MÓVEL",80,80,80,80,"","",false],
    ["ASSINATURA + CHIPS 60GB","MÓVEL",12,12,12,12,"","",false],
    ["10GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",30,30,30,30,"","",false],
    ["20GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",40,40,40,40,"","",false],
    ["60GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",50,50,50,50,"","",false]
  ];
  var conteudo = JSON.stringify(dados, null, 2);
  DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID).setContent(conteudo);
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'tabela_v1');
  Logger.log('OK rev3 — ' + dados.length + ' linhas, ' + conteudo.length + ' bytes. Cache invalidado.');
}

// Rev4 (12/05/2026): adiciona 4 cols REC ao final (ESPECIAIS_REC, OURO_REC,
// PRATA_REC, PADRÃO_REC). Fibra: REC = Boleto − R$10. Móvel: REC = Boleto
// (sem desconto recorrente formal). Backward-compatible: cols 0-8 idênticas
// à Rev3, novas cols 9-12 ignoradas por callers antigos.
function _atualizarPlanosVeroJsonRev4() {
  var dados = [
    ["Última atualização: 12/05/2026 — Forma de Pagamento (Boleto vs Recorrente). Cols 2-5: Boleto. Cols 9-12: Recorrente (Fibra = Boleto - R$10; Móvel = Boleto, sem desconto formal).","","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","LANDING PAGE","","","","","",""],
    ["Valores para pagamento via boleto","TIPO","ESPECIAIS","OURO","PRATA","PADRÃO","NOME_LP","FEATURES","PUBLICAR","ESPECIAIS_REC","OURO_REC","PRATA_REC","PADRÃO_REC"],
    ["VERO MAIS 550MB + MÓVEL 20GB","VERO MAIS",112.9,112.9,112.9,112.9,"Vero Mais","20GB Celular | Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,102.9,102.9,102.9,102.9],
    ["VERO MAIS 800MB + GLP PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Globo Play Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,139.9,139.9,139.9,139.9],
    ["VERO MAIS 800MB + HBO MAX + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","HBO Max | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,139.9,139.9,139.9,139.9],
    ["VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MÓVEL 30GB","VERO MAIS",139.9,139.9,139.9,139.9,"Vero Mais","Esportes Futebol | YouTube Premium | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,129.9,129.9,129.9,129.9],
    ["OFERTA VERÃO 800MB + GLP PREMIUM + HBO MAX + MÓVEL 60GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Globo Play Premium | HBO Max | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true,149.9,149.9,149.9,149.9],
    ["VERO MAIS 800MB + DISNEY+ PADRÃO + MÓVEL 20GB","VERO MAIS",144.9,144.9,144.9,144.9,"Vero Mais","Disney Padrão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,134.9,134.9,134.9,134.9],
    ["VERO MAIS 800MB + DISNEY+ PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Disney Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,139.9,139.9,139.9,139.9],
    ["VERO MAIS 850MB + DIVERSÃO + MÓVEL 20GB","VERO MAIS",189.9,189.9,189.9,189.9,"Vero Mais","Vero Video Diversão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,179.9,179.9,179.9,179.9],
    ["VERO MAIS 800MB - GLP PREMIUM + ASSISTÊNCIA RES. + MÓVEL 20GB","VERO MAIS",154.9,154.9,154.9,154.9,"Vero Mais","Globoplay Premium | Assistência Residencial | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,144.9,144.9,144.9,144.9],
    ["VERO MAIS 1GB + GLP PREMIUM + EXITLAG + MÓVEL 60GB","VERO MAIS","209,9 (Bauru)","","","","Vero Mais","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"199,9 (Bauru)","","",""],
    ["VERO MAIS 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Disney com Ads | HBO Max com Ads | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,149.9,149.9,149.9,149.9],
    ["VERO MAIS 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Prime Video | Apple TV | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,149.9,149.9,149.9,149.9],
    ["VERO MAIS 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB","VERO MAIS",209.9,209.9,209.9,209.9,"Vero Mais","Prime Video | Apple TV | HBO Max | Globoplay Premium | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true,199.9,199.9,199.9,199.9],
    ["550MB MUNDO FIBRA","MUNDO FIBRA",107.9,107.9,107.9,107.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,97.9,97.9,97.9,97.9],
    ["550MB ASSISTÊNCIA RESIDENCIAL","MUNDO FIBRA",117.9,120.9,128.9,130.9,"Mundo Fibra","Assistência Residencial | Wi-Fi 6 | Instalação Grátis",true,107.9,110.9,118.9,120.9],
    ["750MB MUNDO FIBRA","MUNDO FIBRA",127.9,127.9,127.9,127.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,117.9,117.9,117.9,117.9],
    ["600MB GLOBOPLAY PADRÃO COM ANÚNCIOS","ENTRETENIMENTO",137.9,137.9,137.9,137.9,"Mundo Entrenimento","Globo Play | Wi-Fi 6 | Kiddle | Instalação Grátis",true,127.9,127.9,127.9,127.9],
    ["800MB YOUTUBE PREMIUM | HBO MAX | TELECINE","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Youtube Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,134.9,134.9,134.9,134.9],
    ["800MB DISNEY+ PADRÃO","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Disney | Wi-Fi 6 | Kiddle | Instalação Grátis",true,134.9,134.9,134.9,134.9],
    ["800MB DISNEY+ PREMIUM","ENTRETENIMENTO",165,165,165,165,"Mundo Entrenimento","Disney Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,155,155,155,155],
    ["800MB GLOBOPLAY PREMIUM","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Globoplay Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,134.9,134.9,134.9,134.9],
    ["800MB GLOBOPLAY PREMIUM + ASSISTÊNCIA RESIDENCIAL","ENTRETENIMENTO",149.9,149.9,149.9,149.9,"Mundo Entrenimento","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true,139.9,139.9,139.9,139.9],
    ["800MB PREMIERE","ENTRETENIMENTO",160,160,160,160,"Mundo Entrenimento","Premiere | Wi-Fi 6 | Kiddle | Instalação Grátis",true,150,150,150,150],
    ["850MB FILMES","COMPLETO",170,170,170,170,"Mundo Completo","Vero Video + Filmes | Wi-Fi 6 | Kiddle | Instalação Grátis",true,160,160,160,160],
    ["850MB ESPORTES","COMPLETO",185,185,185,185,"Mundo Completo","Vero Video + Esportes | Wi-Fi 6 | Kiddle | Instalação Grátis",true,175,175,175,175],
    ["1GB DIVERSÃO","COMPLETO",210,210,210,210,"Mundo Completo","Vero Video + Diversão | Wi-Fi 6 | Kiddle | Instalação Grátis",true,200,200,200,200],
    ["800MB GAMER","GAMER",160,160,160,160,"Mundo Gamer","Exitlag | Oneplay | Wi-Fi 6 | Kiddle | Instalação Grátis",true,150,150,150,150],
    ["VERO CONTROLE 10GB","MÓVEL",30,30,30,30,"","",false,30,30,30,30],
    ["VERO CONTROLE 20GB","MÓVEL",40,40,40,40,"","",false,40,40,40,40],
    ["VERO CONTROLE 30GB","MÓVEL",50,50,50,50,"","",false,50,50,50,50],
    ["VERO CONTROLE 60GB","MÓVEL",80,80,80,80,"","",false,80,80,80,80],
    ["VERO CONTROLE + CHIPS 20GB","MÓVEL",40,40,40,40,"","",false,40,40,40,40],
    ["ASSINATURA + CHIPS 20GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12],
    ["VERO CONTROLE + CHIPS 30GB","MÓVEL",50,50,50,50,"","",false,50,50,50,50],
    ["ASSINATURA + CHIPS 30GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12],
    ["VERO CONTROLE + CHIPS 60GB","MÓVEL",80,80,80,80,"","",false,80,80,80,80],
    ["ASSINATURA + CHIPS 60GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12],
    ["10GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",30,30,30,30,"","",false,30,30,30,30],
    ["20GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",40,40,40,40,"","",false,40,40,40,40],
    ["60GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",50,50,50,50,"","",false,50,50,50,50]
  ];
  var conteudo = JSON.stringify(dados, null, 2);
  DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID).setContent(conteudo);
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'tabela_v1');
  Logger.log('OK rev4 — ' + dados.length + ' linhas, ' + conteudo.length + ' bytes. Cache invalidado.');
}

// Rev5 (12/05/2026): adiciona col 13 PRODUTO_TIPO ao final do array.
// Domínio fechado: 'FIBRA_ALONE' | 'FIBRA_COMBO' | 'MOVEL_ALONE' | 'MOVEL_COMBO'.
// Substitui filtro frágil por nome em getPlanosPorCidadeProduto. Backward-
// compatible: callers que leem cols 0-12 continuam funcionando; o filtro
// novo só ativa se a col 13 existir no header.
function _atualizarPlanosVeroJsonRev5() {
  var dados = [
    ["Última atualização: 12/05/2026 — Rev5: col 13 PRODUTO_TIPO adicionada (FIBRA_ALONE/FIBRA_COMBO/MOVEL_ALONE/MOVEL_COMBO) para filtragem determinística.","","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","LANDING PAGE","","","","","","",""],
    ["Valores para pagamento via boleto","TIPO","ESPECIAIS","OURO","PRATA","PADRÃO","NOME_LP","FEATURES","PUBLICAR","ESPECIAIS_REC","OURO_REC","PRATA_REC","PADRÃO_REC","PRODUTO_TIPO"],
    ["VERO MAIS 550MB + MÓVEL 20GB","VERO MAIS",112.9,112.9,112.9,112.9,"Vero Mais","20GB Celular | Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,"102.9","102.9","102.9","102.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + GLP PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Globo Play Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + HBO MAX + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","HBO Max | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MÓVEL 30GB","VERO MAIS",139.9,139.9,139.9,139.9,"Vero Mais","Esportes Futebol | YouTube Premium | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,"129.9","129.9","129.9","129.9","FIBRA_COMBO"],
    ["OFERTA VERÃO 800MB + GLP PREMIUM + HBO MAX + MÓVEL 60GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Globo Play Premium | HBO Max | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true,"149.9","149.9","149.9","149.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + DISNEY+ PADRÃO + MÓVEL 20GB","VERO MAIS",144.9,144.9,144.9,144.9,"Vero Mais","Disney Padrão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + DISNEY+ PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Disney Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_COMBO"],
    ["VERO MAIS 850MB + DIVERSÃO + MÓVEL 20GB","VERO MAIS",189.9,189.9,189.9,189.9,"Vero Mais","Vero Video Diversão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"179.9","179.9","179.9","179.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB - GLP PREMIUM + ASSISTÊNCIA RES. + MÓVEL 20GB","VERO MAIS",154.9,154.9,154.9,154.9,"Vero Mais","Globoplay Premium | Assistência Residencial | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"144.9","144.9","144.9","144.9","FIBRA_COMBO"],
    ["VERO MAIS 1GB + GLP PREMIUM + EXITLAG + MÓVEL 60GB","VERO MAIS","209,9 (Bauru)","","","","Vero Mais","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"199,9 (Bauru)","","","","FIBRA_COMBO"],
    ["VERO MAIS 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Disney com Ads | HBO Max com Ads | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,"149.9","149.9","149.9","149.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Prime Video | Apple TV | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,"149.9","149.9","149.9","149.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB","VERO MAIS",209.9,209.9,209.9,209.9,"Vero Mais","Prime Video | Apple TV | HBO Max | Globoplay Premium | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true,"199.9","199.9","199.9","199.9","FIBRA_COMBO"],
    ["550MB MUNDO FIBRA","MUNDO FIBRA",107.9,107.9,107.9,107.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,"97.9","97.9","97.9","97.9","FIBRA_ALONE"],
    ["550MB ASSISTÊNCIA RESIDENCIAL","MUNDO FIBRA",117.9,120.9,128.9,130.9,"Mundo Fibra","Assistência Residencial | Wi-Fi 6 | Instalação Grátis",true,"107.9","110.9","118.9","120.9","FIBRA_ALONE"],
    ["750MB MUNDO FIBRA","MUNDO FIBRA",127.9,127.9,127.9,127.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,"117.9","117.9","117.9","117.9","FIBRA_ALONE"],
    ["600MB GLOBOPLAY PADRÃO COM ANÚNCIOS","ENTRETENIMENTO",137.9,137.9,137.9,137.9,"Mundo Entrenimento","Globo Play | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"127.9","127.9","127.9","127.9","FIBRA_ALONE"],
    ["800MB YOUTUBE PREMIUM | HBO MAX | TELECINE","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Youtube Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_ALONE"],
    ["800MB DISNEY+ PADRÃO","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Disney | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_ALONE"],
    ["800MB DISNEY+ PREMIUM","ENTRETENIMENTO",165,165,165,165,"Mundo Entrenimento","Disney Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"155","155","155","155","FIBRA_ALONE"],
    ["800MB GLOBOPLAY PREMIUM","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Globoplay Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_ALONE"],
    ["800MB GLOBOPLAY PREMIUM + ASSISTÊNCIA RESIDENCIAL","ENTRETENIMENTO",149.9,149.9,149.9,149.9,"Mundo Entrenimento","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_ALONE"],
    ["800MB PREMIERE","ENTRETENIMENTO",160,160,160,160,"Mundo Entrenimento","Premiere | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"150","150","150","150","FIBRA_ALONE"],
    ["850MB FILMES","COMPLETO",170,170,170,170,"Mundo Completo","Vero Video + Filmes | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"160","160","160","160","FIBRA_ALONE"],
    ["850MB ESPORTES","COMPLETO",185,185,185,185,"Mundo Completo","Vero Video + Esportes | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"175","175","175","175","FIBRA_ALONE"],
    ["1GB DIVERSÃO","COMPLETO",210,210,210,210,"Mundo Completo","Vero Video + Diversão | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"200","200","200","200","FIBRA_ALONE"],
    ["800MB GAMER","GAMER",160,160,160,160,"Mundo Gamer","Exitlag | Oneplay | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"150","150","150","150","FIBRA_ALONE"],
    ["VERO CONTROLE 10GB","MÓVEL",30,30,30,30,"","",false,30,30,30,30,"MOVEL_ALONE"],
    ["VERO CONTROLE 20GB","MÓVEL",40,40,40,40,"","",false,40,40,40,40,"MOVEL_ALONE"],
    ["VERO CONTROLE 30GB","MÓVEL",50,50,50,50,"","",false,50,50,50,50,"MOVEL_ALONE"],
    ["VERO CONTROLE 60GB","MÓVEL",80,80,80,80,"","",false,80,80,80,80,"MOVEL_ALONE"],
    ["VERO CONTROLE + CHIPS 20GB","MÓVEL",40,40,40,40,"","",false,40,40,40,40,"MOVEL_ALONE"],
    ["ASSINATURA + CHIPS 20GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12,"MOVEL_ALONE"],
    ["VERO CONTROLE + CHIPS 30GB","MÓVEL",50,50,50,50,"","",false,50,50,50,50,"MOVEL_ALONE"],
    ["ASSINATURA + CHIPS 30GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12,"MOVEL_ALONE"],
    ["VERO CONTROLE + CHIPS 60GB","MÓVEL",80,80,80,80,"","",false,80,80,80,80,"MOVEL_ALONE"],
    ["ASSINATURA + CHIPS 60GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12,"MOVEL_ALONE"],
    ["10GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",30,30,30,30,"","",false,30,30,30,30,"MOVEL_COMBO"],
    ["20GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",40,40,40,40,"","",false,40,40,40,40,"MOVEL_COMBO"],
    ["60GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",50,50,50,50,"","",false,50,50,50,50,"MOVEL_COMBO"]
  ];
  var conteudo = JSON.stringify(dados, null, 2);
  DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID).setContent(conteudo);
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'tabela_v1');
  Logger.log('OK rev5 — ' + dados.length + ' linhas, ' + conteudo.length + ' bytes. Cache invalidado.');
}

// Rev6 (12/05/2026): adiciona "30GB | MAIS CONECTADO | COMBO" (R$ 50) e
// corrige preço de "60GB | MAIS CONECTADO | COMBO" (R$ 50 → R$ 80, alinhado
// à tabela MÓVEL Vero atual: VERO CONTROLE 60GB / TITULAR 60GB = R$ 80).
// Resolve auto-inferência de Móvel Combo para planos Fibra com "MÓVEL 30GB"
// no nome (3 planos: ESPORTES FUTEBOL, DISNEY+ ADS, PRIME VIDEO).
function _atualizarPlanosVeroJsonRev6() {
  var dados = [
    ["Última atualização: 12/05/2026 — Rev6: corrige preço 60GB MAIS CONECTADO COMBO (R$50→R$80) e adiciona 30GB MAIS CONECTADO COMBO (R$50).","","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","LANDING PAGE","","","","","","",""],
    ["Valores para pagamento via boleto","TIPO","ESPECIAIS","OURO","PRATA","PADRÃO","NOME_LP","FEATURES","PUBLICAR","ESPECIAIS_REC","OURO_REC","PRATA_REC","PADRÃO_REC","PRODUTO_TIPO"],
    ["VERO MAIS 550MB + MÓVEL 20GB","VERO MAIS",112.9,112.9,112.9,112.9,"Vero Mais","20GB Celular | Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,"102.9","102.9","102.9","102.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + GLP PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Globo Play Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + HBO MAX + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","HBO Max | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MÓVEL 30GB","VERO MAIS",139.9,139.9,139.9,139.9,"Vero Mais","Esportes Futebol | YouTube Premium | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,"129.9","129.9","129.9","129.9","FIBRA_COMBO"],
    ["OFERTA VERÃO 800MB + GLP PREMIUM + HBO MAX + MÓVEL 60GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Globo Play Premium | HBO Max | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true,"149.9","149.9","149.9","149.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + DISNEY+ PADRÃO + MÓVEL 20GB","VERO MAIS",144.9,144.9,144.9,144.9,"Vero Mais","Disney Padrão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + DISNEY+ PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Disney Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_COMBO"],
    ["VERO MAIS 850MB + DIVERSÃO + MÓVEL 20GB","VERO MAIS",189.9,189.9,189.9,189.9,"Vero Mais","Vero Video Diversão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"179.9","179.9","179.9","179.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB - GLP PREMIUM + ASSISTÊNCIA RES. + MÓVEL 20GB","VERO MAIS",154.9,154.9,154.9,154.9,"Vero Mais","Globoplay Premium | Assistência Residencial | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"144.9","144.9","144.9","144.9","FIBRA_COMBO"],
    ["VERO MAIS 1GB + GLP PREMIUM + EXITLAG + MÓVEL 60GB","VERO MAIS","209,9 (Bauru)","","","","Vero Mais","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"199,9 (Bauru)","","","","FIBRA_COMBO"],
    ["VERO MAIS 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Disney com Ads | HBO Max com Ads | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,"149.9","149.9","149.9","149.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Prime Video | Apple TV | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,"149.9","149.9","149.9","149.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB","VERO MAIS",209.9,209.9,209.9,209.9,"Vero Mais","Prime Video | Apple TV | HBO Max | Globoplay Premium | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true,"199.9","199.9","199.9","199.9","FIBRA_COMBO"],
    ["550MB MUNDO FIBRA","MUNDO FIBRA",107.9,107.9,107.9,107.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,"97.9","97.9","97.9","97.9","FIBRA_ALONE"],
    ["550MB ASSISTÊNCIA RESIDENCIAL","MUNDO FIBRA",117.9,120.9,128.9,130.9,"Mundo Fibra","Assistência Residencial | Wi-Fi 6 | Instalação Grátis",true,"107.9","110.9","118.9","120.9","FIBRA_ALONE"],
    ["750MB MUNDO FIBRA","MUNDO FIBRA",127.9,127.9,127.9,127.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,"117.9","117.9","117.9","117.9","FIBRA_ALONE"],
    ["600MB GLOBOPLAY PADRÃO COM ANÚNCIOS","ENTRETENIMENTO",137.9,137.9,137.9,137.9,"Mundo Entrenimento","Globo Play | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"127.9","127.9","127.9","127.9","FIBRA_ALONE"],
    ["800MB YOUTUBE PREMIUM | HBO MAX | TELECINE","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Youtube Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_ALONE"],
    ["800MB DISNEY+ PADRÃO","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Disney | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_ALONE"],
    ["800MB DISNEY+ PREMIUM","ENTRETENIMENTO",165,165,165,165,"Mundo Entrenimento","Disney Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"155","155","155","155","FIBRA_ALONE"],
    ["800MB GLOBOPLAY PREMIUM","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Globoplay Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_ALONE"],
    ["800MB GLOBOPLAY PREMIUM + ASSISTÊNCIA RESIDENCIAL","ENTRETENIMENTO",149.9,149.9,149.9,149.9,"Mundo Entrenimento","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_ALONE"],
    ["800MB PREMIERE","ENTRETENIMENTO",160,160,160,160,"Mundo Entrenimento","Premiere | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"150","150","150","150","FIBRA_ALONE"],
    ["850MB FILMES","COMPLETO",170,170,170,170,"Mundo Completo","Vero Video + Filmes | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"160","160","160","160","FIBRA_ALONE"],
    ["850MB ESPORTES","COMPLETO",185,185,185,185,"Mundo Completo","Vero Video + Esportes | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"175","175","175","175","FIBRA_ALONE"],
    ["1GB DIVERSÃO","COMPLETO",210,210,210,210,"Mundo Completo","Vero Video + Diversão | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"200","200","200","200","FIBRA_ALONE"],
    ["800MB GAMER","GAMER",160,160,160,160,"Mundo Gamer","Exitlag | Oneplay | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"150","150","150","150","FIBRA_ALONE"],
    ["VERO CONTROLE 10GB","MÓVEL",30,30,30,30,"","",false,30,30,30,30,"MOVEL_ALONE"],
    ["VERO CONTROLE 20GB","MÓVEL",40,40,40,40,"","",false,40,40,40,40,"MOVEL_ALONE"],
    ["VERO CONTROLE 30GB","MÓVEL",50,50,50,50,"","",false,50,50,50,50,"MOVEL_ALONE"],
    ["VERO CONTROLE 60GB","MÓVEL",80,80,80,80,"","",false,80,80,80,80,"MOVEL_ALONE"],
    ["VERO CONTROLE + CHIPS 20GB","MÓVEL",40,40,40,40,"","",false,40,40,40,40,"MOVEL_ALONE"],
    ["ASSINATURA + CHIPS 20GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12,"MOVEL_ALONE"],
    ["VERO CONTROLE + CHIPS 30GB","MÓVEL",50,50,50,50,"","",false,50,50,50,50,"MOVEL_ALONE"],
    ["ASSINATURA + CHIPS 30GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12,"MOVEL_ALONE"],
    ["VERO CONTROLE + CHIPS 60GB","MÓVEL",80,80,80,80,"","",false,80,80,80,80,"MOVEL_ALONE"],
    ["ASSINATURA + CHIPS 60GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12,"MOVEL_ALONE"],
    ["10GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",30,30,30,30,"","",false,30,30,30,30,"MOVEL_COMBO"],
    ["20GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",40,40,40,40,"","",false,40,40,40,40,"MOVEL_COMBO"],
    ["30GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",50,50,50,50,"","",false,50,50,50,50,"MOVEL_COMBO"],
    ["60GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",80,80,80,80,"","",false,80,80,80,80,"MOVEL_COMBO"]
  ];
  var conteudo = JSON.stringify(dados, null, 2);
  DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID).setContent(conteudo);
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'tabela_v1');
  Logger.log('OK rev6 — ' + dados.length + ' linhas, ' + conteudo.length + ' bytes. Cache invalidado.');
}

// ──────────────────────────────────────────────────────────────────────────────
// _atualizarPlanosVeroJsonRev7 — 17/05/2026
// Base: RESUMO NP 2.0 (versão consolidada do PORTFÓLIO_B2C 15/05/2026).
// Mudanças aplicadas (4):
//   1. OFERTA VERÃO 800MB + GLP PREMIUM + HBO MAX + MÓVEL 60GB → PUBLICAR=false
//      (plano descontinuado no resumo NP 2.0; some da LP/Renata/Nova Venda mas
//      preserva a linha pra histórico de vendas).
//   2. VERO MAIS 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB
//      → VERO DUO 800MB + ... (nome) | TIPO: VERO DUO
//   3. VERO MAIS 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB
//      → VERO DUO 800MB + ... (nome) | TIPO: VERO DUO
//   4. VERO MAIS 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB
//      → VERO FULL 800MB + ... (nome) | TIPO: VERO FULL
// PRODUTO_TIPO permanece FIBRA_COMBO nos três renomeados (têm móvel → combo).
// Vendas históricas com os 3 nomes antigos precisam ser migradas no Sheets via
// _migrarNomesVeroDuoFull() (executar APÓS este helper).
// ──────────────────────────────────────────────────────────────────────────────
function _atualizarPlanosVeroJsonRev7() {
  var dados = [
    ["Última atualização: 17/05/2026 — Rev7: Oferta Verão PUBLICAR=false (descontinuada); 3 planos renomeados para VERO DUO/VERO FULL (Disney+ADS+HBO ADS, Prime+AppleTV, Prime+AppleTV+HBO+GLP).","","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","NG / ADAPTER","LANDING PAGE","","","","","","",""],
    ["Valores para pagamento via boleto","TIPO","ESPECIAIS","OURO","PRATA","PADRÃO","NOME_LP","FEATURES","PUBLICAR","ESPECIAIS_REC","OURO_REC","PRATA_REC","PADRÃO_REC","PRODUTO_TIPO"],
    ["VERO MAIS 550MB + MÓVEL 20GB","VERO MAIS",112.9,112.9,112.9,112.9,"Vero Mais","20GB Celular | Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,"102.9","102.9","102.9","102.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + GLP PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Globo Play Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + HBO MAX + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","HBO Max | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MÓVEL 30GB","VERO MAIS",139.9,139.9,139.9,139.9,"Vero Mais","Esportes Futebol | YouTube Premium | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,"129.9","129.9","129.9","129.9","FIBRA_COMBO"],
    ["OFERTA VERÃO 800MB + GLP PREMIUM + HBO MAX + MÓVEL 60GB","VERO MAIS",159.9,159.9,159.9,159.9,"Vero Mais","Globo Play Premium | HBO Max | 60GB Celular | Wi-Fi 6 | Instalação Grátis",false,"149.9","149.9","149.9","149.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + DISNEY+ PADRÃO + MÓVEL 20GB","VERO MAIS",144.9,144.9,144.9,144.9,"Vero Mais","Disney Padrão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB + DISNEY+ PREMIUM + MÓVEL 20GB","VERO MAIS",149.9,149.9,149.9,149.9,"Vero Mais","Disney Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_COMBO"],
    ["VERO MAIS 850MB + DIVERSÃO + MÓVEL 20GB","VERO MAIS",189.9,189.9,189.9,189.9,"Vero Mais","Vero Video Diversão | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"179.9","179.9","179.9","179.9","FIBRA_COMBO"],
    ["VERO MAIS 800MB - GLP PREMIUM + ASSISTÊNCIA RES. + MÓVEL 20GB","VERO MAIS",154.9,154.9,154.9,154.9,"Vero Mais","Globoplay Premium | Assistência Residencial | 20GB Celular | Wi-Fi 6 | Instalação Grátis",true,"144.9","144.9","144.9","144.9","FIBRA_COMBO"],
    ["VERO MAIS 1GB + GLP PREMIUM + EXITLAG + MÓVEL 60GB","VERO MAIS","209,9 (Bauru)","","","","Vero Mais","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"199,9 (Bauru)","","","","FIBRA_COMBO"],
    ["VERO DUO 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB","VERO DUO",159.9,159.9,159.9,159.9,"Vero Duo","Disney com Ads | HBO Max com Ads | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,"149.9","149.9","149.9","149.9","FIBRA_COMBO"],
    ["VERO DUO 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB","VERO DUO",159.9,159.9,159.9,159.9,"Vero Duo","Prime Video | Apple TV | 30GB Celular | Wi-Fi 6 | Instalação Grátis",true,"149.9","149.9","149.9","149.9","FIBRA_COMBO"],
    ["VERO FULL 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB","VERO FULL",209.9,209.9,209.9,209.9,"Vero Full","Prime Video | Apple TV | HBO Max | Globoplay Premium | 60GB Celular | Wi-Fi 6 | Instalação Grátis",true,"199.9","199.9","199.9","199.9","FIBRA_COMBO"],
    ["550MB MUNDO FIBRA","MUNDO FIBRA",107.9,107.9,107.9,107.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,"97.9","97.9","97.9","97.9","FIBRA_ALONE"],
    ["550MB ASSISTÊNCIA RESIDENCIAL","MUNDO FIBRA",117.9,120.9,128.9,130.9,"Mundo Fibra","Assistência Residencial | Wi-Fi 6 | Instalação Grátis",true,"107.9","110.9","118.9","120.9","FIBRA_ALONE"],
    ["750MB MUNDO FIBRA","MUNDO FIBRA",127.9,127.9,127.9,127.9,"Mundo Fibra","Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis",true,"117.9","117.9","117.9","117.9","FIBRA_ALONE"],
    ["600MB GLOBOPLAY PADRÃO COM ANÚNCIOS","ENTRETENIMENTO",137.9,137.9,137.9,137.9,"Mundo Entrenimento","Globo Play | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"127.9","127.9","127.9","127.9","FIBRA_ALONE"],
    ["800MB YOUTUBE PREMIUM | HBO MAX | TELECINE","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Youtube Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_ALONE"],
    ["800MB DISNEY+ PADRÃO","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Disney | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_ALONE"],
    ["800MB DISNEY+ PREMIUM","ENTRETENIMENTO",165,165,165,165,"Mundo Entrenimento","Disney Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"155","155","155","155","FIBRA_ALONE"],
    ["800MB GLOBOPLAY PREMIUM","ENTRETENIMENTO",144.9,144.9,144.9,144.9,"Mundo Entrenimento","Globoplay Premium | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"134.9","134.9","134.9","134.9","FIBRA_ALONE"],
    ["800MB GLOBOPLAY PREMIUM + ASSISTÊNCIA RESIDENCIAL","ENTRETENIMENTO",149.9,149.9,149.9,149.9,"Mundo Entrenimento","Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"139.9","139.9","139.9","139.9","FIBRA_ALONE"],
    ["800MB PREMIERE","ENTRETENIMENTO",160,160,160,160,"Mundo Entrenimento","Premiere | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"150","150","150","150","FIBRA_ALONE"],
    ["850MB FILMES","COMPLETO",170,170,170,170,"Mundo Completo","Vero Video + Filmes | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"160","160","160","160","FIBRA_ALONE"],
    ["850MB ESPORTES","COMPLETO",185,185,185,185,"Mundo Completo","Vero Video + Esportes | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"175","175","175","175","FIBRA_ALONE"],
    ["1GB DIVERSÃO","COMPLETO",210,210,210,210,"Mundo Completo","Vero Video + Diversão | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"200","200","200","200","FIBRA_ALONE"],
    ["800MB GAMER","GAMER",160,160,160,160,"Mundo Gamer","Exitlag | Oneplay | Wi-Fi 6 | Kiddle | Instalação Grátis",true,"150","150","150","150","FIBRA_ALONE"],
    ["VERO CONTROLE 10GB","MÓVEL",30,30,30,30,"","",false,30,30,30,30,"MOVEL_ALONE"],
    ["VERO CONTROLE 20GB","MÓVEL",40,40,40,40,"","",false,40,40,40,40,"MOVEL_ALONE"],
    ["VERO CONTROLE 30GB","MÓVEL",50,50,50,50,"","",false,50,50,50,50,"MOVEL_ALONE"],
    ["VERO CONTROLE 60GB","MÓVEL",80,80,80,80,"","",false,80,80,80,80,"MOVEL_ALONE"],
    ["VERO CONTROLE + CHIPS 20GB","MÓVEL",40,40,40,40,"","",false,40,40,40,40,"MOVEL_ALONE"],
    ["ASSINATURA + CHIPS 20GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12,"MOVEL_ALONE"],
    ["VERO CONTROLE + CHIPS 30GB","MÓVEL",50,50,50,50,"","",false,50,50,50,50,"MOVEL_ALONE"],
    ["ASSINATURA + CHIPS 30GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12,"MOVEL_ALONE"],
    ["VERO CONTROLE + CHIPS 60GB","MÓVEL",80,80,80,80,"","",false,80,80,80,80,"MOVEL_ALONE"],
    ["ASSINATURA + CHIPS 60GB","MÓVEL",12,12,12,12,"","",false,12,12,12,12,"MOVEL_ALONE"],
    ["10GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",30,30,30,30,"","",false,30,30,30,30,"MOVEL_COMBO"],
    ["20GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",40,40,40,40,"","",false,40,40,40,40,"MOVEL_COMBO"],
    ["30GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",50,50,50,50,"","",false,50,50,50,50,"MOVEL_COMBO"],
    ["60GB | MAIS CONECTADO | COMBO","MÓVEL COMBO",80,80,80,80,"","",false,80,80,80,80,"MOVEL_COMBO"]
  ];
  var conteudo = JSON.stringify(dados, null, 2);
  DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID).setContent(conteudo);
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'tabela_v1');
  Logger.log('OK rev7 — ' + dados.length + ' linhas, ' + conteudo.length + ' bytes. Cache invalidado.');
}

// Rev8 (25/05/2026): corrige a apresentacao do plano de streaming-ESCOLHA.
// O plano "800MB YOUTUBE PREMIUM | HBO MAX | TELECINE" usava "|" no NOME, o que
// dava a entender combo (3 streamings juntos). Na verdade o cliente ESCOLHE UM.
// Troca o "|" por "ou" SO no nome desse plano (col 0). Os demais planos cujo nome
// ou features usam "|" (ex. "10GB | MAIS CONECTADO | COMBO", "Youtube Premium |
// Wi-Fi 6 | ...") NAO sao tocados — ali o "|" e separador legitimo.
// Read-modify-write: le o JSON atual do Drive e altera apenas a linha alvo,
// garantindo que TODO o resto fique byte-identico ao que ja esta em producao
// (sem risco de transcrever errado os 40+ planos). Rodar UMA VEZ no editor.
function _atualizarPlanosVeroJsonRev8() {
  var fileId = CONFIG.TABELA_JSON_FILE_ID;
  var atual = JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString());
  var NOVO_NOME = '800MB YOUTUBE PREMIUM ou HBO MAX ou TELECINE';
  var alterados = 0;
  for (var i = 2; i < atual.length; i++) {
    var nome = String(atual[i][0] || '');
    var up = nome.toUpperCase();
    // casa pela triade de streamings (robusto a espacamento), nao pela string exata
    if (up.indexOf('YOUTUBE PREMIUM') > -1 && up.indexOf('HBO MAX') > -1 && up.indexOf('TELECINE') > -1) {
      Logger.log('Rev8: "' + nome + '"  ->  "' + NOVO_NOME + '"');
      atual[i][0] = NOVO_NOME;
      alterados++;
    }
  }
  if (atual[0] && atual[0].length) {
    atual[0][0] = 'Última atualização: 25/05/2026 — Rev8: plano 800MB YOUTUBE PREMIUM/HBO MAX/TELECINE passa a usar "ou" no nome (cliente escolhe 1 streaming, não é combo).';
  }
  var conteudo = JSON.stringify(atual, null, 2);
  DriveApp.getFileById(fileId).setContent(conteudo);
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'tabela_v1');
  Logger.log('OK rev8 — ' + atual.length + ' linhas, ' + alterados + ' nome(s) alterado(s), ' + conteudo.length + ' bytes. Cache invalidado.');
}

// Checker READ-ONLY: conta quantas vendas historicas na aba "1 - Vendas" ainda
// tem o nome antigo do plano (com "|") na coluna PLANO. So conta e loga — nao
// grava nada. Se vier > 0, rodar _migrarNome800Streaming() para atualizar.
function _verificarVendas800Streaming() {
  var ss = _getSpreadsheet_();
  var sheet = ss.getSheetByName('1 - Vendas');
  if (!sheet) { Logger.log('Aba "1 - Vendas" nao encontrada.'); return; }
  var colPlano = _acharColunaPorHeader_(sheet, 'PLANO');
  if (colPlano < 0) { Logger.log('Coluna PLANO nao encontrada no cabecalho.'); return; }
  var ultima = sheet.getLastRow();
  if (ultima < 3) { Logger.log('Sem linhas de venda.'); return; }
  var valores = sheet.getRange(3, colPlano + 1, ultima - 2, 1).getValues();
  var ALVO = 'YOUTUBE PREMIUM | HBO MAX | TELECINE';
  var n = 0;
  for (var i = 0; i < valores.length; i++) {
    if (String(valores[i][0] || '').toUpperCase().indexOf(ALVO) > -1) n++;
  }
  Logger.log('Vendas com nome antigo (com "|"): ' + n + (n ? ' — rodar _migrarNome800Streaming()' : ' — nada a migrar.'));
}

// Migracao das vendas historicas: troca o nome antigo (com "|") pelo novo (com
// "ou") na coluna PLANO da aba "1 - Vendas". Preserva qualquer sufixo " | preco"
// que o select monta apos o nome (substituicao de substring do nucleo). Idempotente
// (so escreve celulas que ainda tem o nome antigo). Rodar no editor APOS o Rev8,
// e somente se _verificarVendas800Streaming() acusar > 0.
function _migrarNome800Streaming() {
  // Casa a TRIADE de streamings independente de prefixo ("800MB", codigo Vero,
  // etc), caixa e espacamento, e troca SO os "|" entre eles por " ou ". Preserva
  // prefixo, sufixo "| preco" e o resto da string. Idempotente (linhas ja com
  // "ou" nao tem "|" entre os streamings e nao re-casam).
  var TRIADE = /(YOUTUBE\s*PREMIUM)\s*\|\s*(HBO\s*MAX)\s*\|\s*(TELECINE)/gi;
  var ss = _getSpreadsheet_();
  var sheet = ss.getSheetByName('1 - Vendas');
  if (!sheet) { Logger.log('Aba "1 - Vendas" nao encontrada.'); return; }
  var colPlano = _acharColunaPorHeader_(sheet, 'PLANO');
  if (colPlano < 0) { Logger.log('Coluna PLANO nao encontrada no cabecalho.'); return; }
  var ultima = sheet.getLastRow();
  if (ultima < 3) { Logger.log('Sem linhas de venda.'); return; }
  var rng = sheet.getRange(3, colPlano + 1, ultima - 2, 1);
  var valores = rng.getValues();
  var alterados = 0;
  for (var i = 0; i < valores.length; i++) {
    var atual = String(valores[i][0] || '');
    var novo = atual.replace(TRIADE, '$1 ou $2 ou $3');
    if (novo !== atual) {
      Logger.log('Migracao: linha ' + (i + 3) + '  "' + atual + '"  ->  "' + novo + '"');
      valores[i][0] = novo;
      alterados++;
    }
  }
  if (alterados > 0) rng.setValues(valores);
  Logger.log('Migracao 800 streaming — ' + alterados + ' venda(s) atualizada(s).');
}

// Helper: acha o indice 0-based de uma coluna pelo nome do header (procura nas
// linhas 1 e 2, normalizando). Retorna -1 se nao achar.
function _acharColunaPorHeader_(sheet, header) {
  var alvo = String(header || '').trim().toUpperCase();
  var nCols = sheet.getLastColumn();
  var topo = sheet.getRange(1, 1, Math.min(2, sheet.getLastRow()), nCols).getValues();
  for (var r = 0; r < topo.length; r++) {
    for (var c = 0; c < topo[r].length; c++) {
      if (String(topo[r][c] || '').trim().toUpperCase() === alvo) return c;
    }
  }
  return -1;
}

// ──────────────────────────────────────────────────────────────────────────────
// _migrarNomesVeroDuoFull — 17/05/2026
// Migra vendas históricas que ainda têm os 3 nomes antigos (VERO MAIS ...) na
// coluna PLANO (N) da aba "1 - Vendas" para os nomes novos da Rev7 (VERO DUO,
// VERO FULL). Idempotente. Use startsWith pra cobrir formatos com sufixo
// "| R$ XX,XX" caso existam.
// IMPORTANTE: executar DEPOIS de _atualizarPlanosVeroJsonRev7().
// ──────────────────────────────────────────────────────────────────────────────
function _migrarNomesVeroDuoFull() {
  // ORDEM IMPORTA: prefixo mais longo primeiro, pra não disparar o curto antes.
  var renames = [
    {
      antigo: 'VERO MAIS 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB',
      novo:   'VERO FULL 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB'
    },
    {
      antigo: 'VERO MAIS 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB',
      novo:   'VERO DUO 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB'
    },
    {
      antigo: 'VERO MAIS 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB',
      novo:   'VERO DUO 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB'
    }
  ];

  var sheet = _getSpreadsheet_().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) { Logger.log('ERRO: aba ' + CONFIG.SHEET_NAME + ' não encontrada.'); return; }

  var ultLinha = sheet.getLastRow();
  if (ultLinha < 3) { Logger.log('Aba vazia (ultLinha=' + ultLinha + '). Nada a migrar.'); return; }

  // PLANO = índice 13 (col N, 0-based no array de COLUNAS)
  var col = CONFIG.COLUNAS.PLANO + 1; // converte pra 1-based pro getRange
  var range = sheet.getRange(3, col, ultLinha - 2, 1);
  var valores = range.getValues();

  var alterados = 0;
  var detalhes = [];
  for (var i = 0; i < valores.length; i++) {
    var v = String(valores[i][0] || '');
    if (!v) continue;
    for (var j = 0; j < renames.length; j++) {
      var r = renames[j];
      if (v.indexOf(r.antigo) === 0) {
        var novo = r.novo + v.substring(r.antigo.length); // preserva sufixo "| R$ XX,XX" se houver
        valores[i][0] = novo;
        alterados++;
        detalhes.push('L' + (i + 3) + ': "' + v.substring(0, 60) + (v.length > 60 ? '…' : '') + '" → "' + r.novo.split(' ')[1] + ' ' + r.novo.split(' ')[0] + ' …"');
        break;
      }
    }
  }

  if (alterados > 0) {
    range.setValues(valores);
    Logger.log('OK — ' + alterados + ' venda(s) migrada(s) para VERO DUO/VERO FULL.');
    detalhes.forEach(function(d) { Logger.log('  ' + d); });
  } else {
    Logger.log('Nenhuma venda histórica encontrada com os 3 nomes antigos. Nada a migrar (idempotente).');
  }
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
    var CACHE_KEY_LISTA = CONFIG.CACHE_PREFIX + 'lista_v4';
    if (offset === 0 && !filtro) {
      var cachedLista = _cacheGetChunked(CACHE_KEY_LISTA);
      if (cachedLista && Array.isArray(cachedLista.dados) && cachedLista.dados.length > 0) {
        Logger.log('getVendasPaginadas CACHE HIT: ' + cachedLista.dados.length + ' registros, totalGeral=' + cachedLista.totalGeral);
        _incCounter_('lista_cache_hit');
        return {
          dados:      cachedLista.dados,
          total:      cachedLista.dados.length,
          totalGeral: cachedLista.totalGeral || cachedLista.dados.length,
          pagina:     1,
          temMais:    !!(cachedLista.temMais)
        };
      }
      _incCounter_('lista_cache_miss');
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
    var vinculosMap = _getVinculosVendasMap_();
    var linhasNecessarias = {};
    for (var ln = 0; ln < linhasSlice.length; ln++) {
      linhasNecessarias[linhasSlice[ln]] = true;
    }
    for (var vr = 0; vr < linhasSlice.length; vr++) {
      var linhaBase = linhasSlice[vr];
      var filhosVinculados = vinculosMap.filhasPorMae[linhaBase] || [];
      for (var fv = 0; fv < filhosVinculados.length; fv++) {
        linhasNecessarias[filhosVinculados[fv].vendaFilhaLinha] = true;
      }
      var paiVinculado = vinculosMap.maePorFilha[linhaBase];
      if (paiVinculado && paiVinculado.vendaMaeLinha) {
        linhasNecessarias[paiVinculado.vendaMaeLinha] = true;
      }
    }

    var linhasAsc = Object.keys(linhasNecessarias)
      .map(function(linha) { return parseInt(linha, 10); })
      .filter(function(linha) { return !isNaN(linha) && linha >= 3; })
      .sort(function(a, b) { return a - b; });
    var blocos    = _agruparBlocos(linhasAsc, 8);
    var lidos     = _lerBlocos(sheet, blocos, 47);

    // Mapa linhaSheet → row para acesso em O(1)
    var mapaLinhas = {};
    for (var m = 0; m < lidos.length; m++) {
      mapaLinhas[lidos[m].linhaSheet] = lidos[m].row;
    }

    // ── FASE 4: Mapeia na ordem desc (linhasSlice já está em ordem desc) ─────
    var mapaResumoVinculos = {};
    for (var r = 0; r < linhasAsc.length; r++) {
      var linhaResumo = linhasAsc[r];
      if (!mapaLinhas[linhaResumo]) continue;
      mapaResumoVinculos[linhaResumo] = _resumirVendaVinculada_(_mapearLinhaLista(mapaLinhas[linhaResumo], linhaResumo, tz));
    }

    var vendas = [];
    for (var k = 0; k < linhasSlice.length; k++) {
      var numLinha = linhasSlice[k];
      var row = mapaLinhas[numLinha];
      if (!row) continue;
      vendas.push(_decorarVendaComVinculos_(_mapearLinhaLista(row, numLinha, tz), vinculosMap, mapaResumoVinculos));
    }

    // ── Salva no cache (somente offset=0, sem filtro, TTL 30min — Fase 5b) ──
    // TTL bumped 300 → 1800 em conjunto com update fino (commit 3+) que mantém
    // cache quente em saves. Stale máximo de 30min cobre edições direto no
    // Sheets / scripts externos sem chamar invalidação. Botão Sincronizar (commit 8)
    // dá saída de emergência. Decidir após telemetria de 1 semana se ajusta.
    if (offset === 0 && !filtro) {
      _cachePutChunked(CACHE_KEY_LISTA, { dados: vendas, totalGeral: totalGeral, temMais: temMais }, 1800);
      Logger.log('getVendasPaginadas: cache gravado (' + vendas.length + ' de ' + totalGeral + ' registros, TTL 1800s)');
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

// ─── LITE (Performance 19/05/2026) ─────────────────────────────────────────
// Versão rápida do getVendasPaginadas, processa apenas o `limite` solicitado
// (default 50) e NÃO cacheia. Usado pelo frontend em pipeline:
//   1ª: getVendasPaginadasLite(50) → render imediato (~2s)
//   2ª: getVendasPaginadas (500)   → popula cache do backend pra próximas
// Como NÃO usa cache, ainda paga _preScanColuna + _getVinculosVendasMap_ + lerBlocos
// + _mapearLinhaLista por linha. Mas com 50 linhas em vez de 500, o tempo
// total dropa de ~12-15s para ~2-3s. O pipeline mantém o cache backend
// quente pra próximas sessões.
function getVendasPaginadasLite(limite, offset) {
  try {
    limite = Math.min(parseInt(limite) || 50, 200);
    offset = Math.max(parseInt(offset) || 0, 0);

    var sheet       = _getSheet();
    var ultimaLinha = sheet.getLastRow();
    if (ultimaLinha < 3) return { dados: [], total: 0, totalGeral: 0, temMais: false };

    var tz = Session.getScriptTimeZone();

    var COL_CLIENTE = CONFIG.COLUNAS.CLIENTE + 1;
    var linhasNaoVazias = _preScanColuna(sheet, ultimaLinha, COL_CLIENTE, function(v) {
      return v !== '' && v !== null && v !== undefined;
    });
    var totalGeral = linhasNaoVazias.length;
    linhasNaoVazias.sort(function(a, b) { return b - a; });

    var linhasSlice = linhasNaoVazias.slice(offset, offset + limite);
    if (linhasSlice.length === 0) {
      return { dados: [], total: 0, totalGeral: totalGeral, temMais: false };
    }

    var vinculosMap = _getVinculosVendasMap_();
    var linhasNecessarias = {};
    for (var ln = 0; ln < linhasSlice.length; ln++) linhasNecessarias[linhasSlice[ln]] = true;
    for (var vr = 0; vr < linhasSlice.length; vr++) {
      var linhaBase = linhasSlice[vr];
      var filhos = vinculosMap.filhasPorMae[linhaBase] || [];
      for (var fv = 0; fv < filhos.length; fv++) linhasNecessarias[filhos[fv].vendaFilhaLinha] = true;
      var pai = vinculosMap.maePorFilha[linhaBase];
      if (pai && pai.vendaMaeLinha) linhasNecessarias[pai.vendaMaeLinha] = true;
    }

    var linhasAsc = Object.keys(linhasNecessarias)
      .map(function(l) { return parseInt(l, 10); })
      .filter(function(l) { return !isNaN(l) && l >= 3; })
      .sort(function(a, b) { return a - b; });
    var blocos = _agruparBlocos(linhasAsc, 8);
    var lidos  = _lerBlocos(sheet, blocos, 47);

    var mapaLinhas = {};
    for (var m = 0; m < lidos.length; m++) mapaLinhas[lidos[m].linhaSheet] = lidos[m].row;

    var mapaResumoVinculos = {};
    for (var r = 0; r < linhasAsc.length; r++) {
      var ln2 = linhasAsc[r];
      if (!mapaLinhas[ln2]) continue;
      mapaResumoVinculos[ln2] = _resumirVendaVinculada_(_mapearLinhaLista(mapaLinhas[ln2], ln2, tz));
    }

    var vendas = [];
    for (var k = 0; k < linhasSlice.length; k++) {
      var numLinha = linhasSlice[k];
      var row = mapaLinhas[numLinha];
      if (!row) continue;
      vendas.push(_decorarVendaComVinculos_(_mapearLinhaLista(row, numLinha, tz), vinculosMap, mapaResumoVinculos));
    }

    Logger.log('getVendasPaginadasLite: offset=' + offset + ' limite=' + limite + ' retornando=' + vendas.length + ' totalGeral=' + totalGeral);
    return {
      dados:      vendas,
      total:      vendas.length,
      totalGeral: totalGeral,
      temMais:    offset + limite < totalGeral,
      lite:       true
    };
  } catch(e) {
    Logger.log('ERRO em getVendasPaginadasLite: ' + e);
    return { dados: [], total: 0, totalGeral: 0, temMais: false, erro: e.message };
  }
}

function getVendaPorLinha(numeroLinha) {
  try {
    var sheet = _getSheet();
    var dados = sheet.getRange(numeroLinha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
    var vinculosMap = _getVinculosVendasMap_();
    var mapaResumoVinculos = {};
    mapaResumoVinculos[numeroLinha] = _resumirVendaVinculada_(_mapearLinha(dados, numeroLinha));

    var filhos = vinculosMap.filhasPorMae[numeroLinha] || [];
    for (var f = 0; f < filhos.length; f++) {
      var linhaFilha = filhos[f].vendaFilhaLinha;
      if (!linhaFilha) continue;
      var dadosFilha = sheet.getRange(linhaFilha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
      mapaResumoVinculos[linhaFilha] = _resumirVendaVinculada_(_mapearLinha(dadosFilha, linhaFilha));
    }

    var pai = vinculosMap.maePorFilha[numeroLinha];
    if (pai && pai.vendaMaeLinha) {
      var dadosMae = sheet.getRange(pai.vendaMaeLinha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
      mapaResumoVinculos[pai.vendaMaeLinha] = _resumirVendaVinculada_(_mapearLinha(dadosMae, pai.vendaMaeLinha));
    }

    return _decorarVendaComVinculos_(_mapearLinha(dados, numeroLinha), vinculosMap, mapaResumoVinculos);
  } catch (erro) {
    throw new Error('Erro ao buscar venda: ' + erro.message);
  }
}

// Sprint 3.2 (12/05/2026): infere automaticamente o plano Móvel Combo
// a partir do nome do plano Fibra Combo. Regex extrai "MÓVEL NGB" → busca
// no JSON o plano "NGB | MAIS CONECTADO | COMBO" com PRODUTO_TIPO=MOVEL_COMBO.
// Substitui o modal manual de escolha do chip.
// Retorna: { erro: false, produto: 'Móvel Combo', plano: 'NGB | MAIS CONECTADO | COMBO', valor: N }
// ou { erro: true, mensagem: '...' } com mensagem clara para o operador.
function _inferirMovelComboFromFibra_(planoFibra) {
  var nome = String(planoFibra || '').toUpperCase();
  var m = nome.match(/M[ÓO]VEL\s+(\d+)\s*GB/);
  if (!m) return { erro: true, mensagem: 'Plano Fibra Combo "' + planoFibra + '" não indica GB do Móvel.' };
  var gb = parseInt(m[1], 10) + 'GB';

  var dadosTab = _getTabela();
  if (!dadosTab || !dadosTab.length) return { erro: true, mensagem: 'TABELA indisponível.' };

  var cabecalho     = dadosTab[1].map(function(h) { return _normalizarTexto(h); });
  var colProdutoTipo= cabecalho.indexOf(_normalizarTexto('PRODUTO_TIPO'));
  // Busca plano Móvel Combo cujo nome começa com o GB extraído
  // Ex: "20GB | MAIS CONECTADO | COMBO" matches gb="20GB"
  for (var ti = 2; ti < dadosTab.length; ti++) {
    var nomePlano = String(dadosTab[ti][0] || '').trim().toUpperCase();
    if (!nomePlano) continue;
    if (colProdutoTipo > -1) {
      var pt = String(dadosTab[ti][colProdutoTipo] || '').toUpperCase().trim();
      if (pt !== 'MOVEL_COMBO') continue;
    } else {
      // Fallback Rev4: usa TIPO=MÓVEL COMBO
      var tipoRow = String(dadosTab[ti][1] || '').toUpperCase();
      if (tipoRow.indexOf('MÓVEL COMBO') === -1 && tipoRow.indexOf('MOVEL COMBO') === -1) continue;
    }
    if (nomePlano.indexOf(gb) === 0) {
      // Match: nome começa com o GB esperado. Captura nome original (case original)
      var nomeOrig = String(dadosTab[ti][0] || '').trim();
      var valor = parseFloat(String(dadosTab[ti][2] || '').replace(',', '.')) || 0;
      return { erro: false, produto: 'Móvel Combo', plano: nomeOrig, valor: valor };
    }
  }
  return {
    erro: true,
    mensagem: 'Plano Móvel Combo com ' + gb + ' não encontrado na tabela. ' +
              'Configure no JSON (`_atualizarPlanosVeroJsonRev5`) antes de cadastrar este combo.'
  };
}

function criarVendaMovelVinculada(payload) {
  payload = payload || {};
  var linhaOrigem = parseInt(payload.linhaOrigem || payload.linhaMae || payload.linha || '', 10);
  if (isNaN(linhaOrigem) || linhaOrigem < 3) {
    throw new Error('Venda de origem inválida.');
  }

  var produtoMovel = String(payload.produto || '').trim();
  var plano = String(payload.plano || '').trim();
  var contrato = String(payload.contrato || '').trim();
  var portabilidade = String(payload.portabilidade || '').trim();
  var linhaMovel = String(payload.linhaMovel || '').trim();
  var valor = String(payload.valor || '').trim();

  if (!produtoMovel) throw new Error('Produto móvel é obrigatório.');
  if (_normalizarTexto(produtoMovel).indexOf('MOVEL') === -1) throw new Error('Produto inválido para duplicação móvel.');
  if (!plano) throw new Error('Plano móvel é obrigatório.');
  if (!portabilidade) throw new Error('Portabilidade é obrigatória.');

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (le) {
    return { sucesso: false, mensagem: '⚠️ Sistema ocupado. Tente novamente em instantes.' };
  }

  try {
    var sheet = _getSheet();
    var rowOrigem = sheet.getRange(linhaOrigem, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
    var vendaOrigem = _mapearLinha(rowOrigem, linhaOrigem);
    if (_normalizarTexto(vendaOrigem.produto) !== 'FIBRA COMBO') {
      throw new Error('A duplicação móvel só está disponível para vendas Fibra Combo.');
    }

    var vinculos = _getVinculosVendasMap_();
    var filhasExistentes = vinculos.filhasPorMae[linhaOrigem] || [];
    if (filhasExistentes.length > 0) {
      var ultimaLinha = sheet.getLastRow();
      var temMovelReal = filhasExistentes.some(function(f) {
        if (!f.vendaFilhaLinha || f.vendaFilhaLinha < 3 || f.vendaFilhaLinha > ultimaLinha) return false;
        var prod = String(sheet.getRange(f.vendaFilhaLinha, CONFIG.COLUNAS.PRODUTO + 1, 1, 1).getValues()[0][0] || '');
        return _normalizarTexto(prod).indexOf('MOVEL') !== -1;
      });
      if (temMovelReal) throw new Error('Esta venda já possui um móvel vinculado.');
    }

    if (!valor) valor = _extrairValorDoPlano_(plano);

    var observacaoBase = String(vendaOrigem.observacao || '').trim();
    var obsVinculo = 'Venda móvel vinculada à linha ' + linhaOrigem + (vendaOrigem.contrato ? ' (Fibra ID ' + vendaOrigem.contrato + ')' : '');
    var dadosMovel = {
      canal:           vendaOrigem.canal || '',
      produto:         produtoMovel,
      status:          '1- Conferencia/Ativação',
      preStatus:       vendaOrigem.preStatus || '',
      dataAtiv:        new Date(),
      contrato:        contrato,
      codCli:          '',
      resp:            vendaOrigem.resp || '',
      agenda:          '',
      turno:           '',
      instal:          '',
      observacao:      [observacaoBase, obsVinculo].filter(Boolean).join(' | '),
      cpf:             vendaOrigem.cpf || '',
      cliente:         vendaOrigem.cliente || '',
      whats:           vendaOrigem.whats || '',
      tel:             vendaOrigem.tel || '',
      cep:             vendaOrigem.cep || '',
      rua:             vendaOrigem.rua || '',
      num:             vendaOrigem.num || '',
      complemento:     vendaOrigem.complemento || '',
      bairro:          vendaOrigem.bairro || '',
      cidade:          vendaOrigem.cidade || '',
      uf:              vendaOrigem.uf || '',
      sistema:         vendaOrigem.sistema || '',
      venc:            vendaOrigem.venc || '',
      // Sprint 3: FAT (col Q) liberada — não gravamos mais
      plano:           plano,
      valor:           valor,
      linhaMovel:      linhaMovel,
      portabilidade:   portabilidade,
      nomeMae:         vendaOrigem.nomeMae || '',
      dtNasc:          vendaOrigem.dtNasc || '',
      rg:              vendaOrigem.rg || '',
      segmentacao:     vendaOrigem.segmentacao || '',
      criadoPor:       vendaOrigem.criadoPor || '',       // herda o autor da fibra-mãe
      formaPagamento:  vendaOrigem.formaPagamento || '',  // Sprint 3: Móvel herda Forma de Pagamento da Fibra
      reagendamentos:  0,
      statusPAP:       vendaOrigem.statusPAP || 'Em Aberto',
      verohub:         '',
      verohubPedido:   '',
      verohubPedidoDt: '',
      // bcTags/bcStatus removidos em 19/05/2026 (Performance Lista).
      viabilidade:     ''
    };

    var linhaDados = _construirLinhaDados(dadosMovel);
    var ultimaSheet = sheet.getLastRow();
    var novaLinha = 3;
    if (ultimaSheet >= 3) {
      var colStatus = sheet.getRange(3, CONFIG.COLUNAS.STATUS + 1, ultimaSheet - 2, 1).getValues();
      for (var r = colStatus.length - 1; r >= 0; r--) {
        if (colStatus[r][0] !== '' && colStatus[r][0] !== null && colStatus[r][0] !== undefined) {
          novaLinha = r + 4;
          break;
        }
      }
    }

    sheet.getRange(novaLinha, 1, 1, linhaDados.length).setValues([linhaDados]);
    _registrarVinculoVenda_(linhaOrigem, novaLinha, 'COMBO_MOVEL');
    // Fase 5b: update fino — INSERT do Móvel + UPDATE da Fibra mãe (vínculo
    // novo recém-registrado precisa aparecer no card agrupado).
    _limparCacheSemLista();
    _atualizarVendaNoCache_(novaLinha);
    _atualizarVendaNoCache_(linhaOrigem);
    return { sucesso: true, linha: novaLinha, mensagem: '✅ Venda móvel vinculada criada com sucesso!' };
  } finally {
    lock.releaseLock();
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
  var _lockReleased = false; // flag para o finally não tentar liberar 2x
  var _statusAntigoAlerta = ''; // disparo-grupo: capturado em edição p/ Alerta 1/2
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

    // Cadastro novo: canal e responsável são obrigatórios.
    // Em edições, deixamos passar para não exigir re-validar quando os selects
    // do painel não foram tocados (preservação via merge cuida disso).
    if (!dados.linhaReferencia || dados.linhaReferencia === '') {
      if (!String(dados.canal || '').trim()) throw new Error('Canal é obrigatório.');
      if (!String(dados.resp  || '').trim()) throw new Error('Responsável é obrigatório.');
      // Sprint 3.3 (12/05/2026): Produto e Plano são obrigatórios. Bug raiz
      // observado: venda salva com PLANO = "112.9" (só o valor) porque
      // validação do frontend não bloqueava. Backend agora trava em qualquer
      // caminho (Nova Venda, console manual, scripts externos).
      var produtoNovo = String(dados.produto || '').trim();
      var planoNovo   = String(dados.plano   || '').trim();
      if (!produtoNovo) throw new Error('Produto é obrigatório.');
      if (!planoNovo)   throw new Error('Plano é obrigatório.');
      // Plano sem nome (apenas valor numérico, ex: "112.9") é inválido.
      // Plano legítimo tem letras: "VERO MAIS 800MB | 112,90" / "DISNEY+ PADRÃO | 144,90".
      if (!/[A-Za-zÁÉÍÓÚÀÂÊÔÃÕÇa-záéíóúàâêôãõç]/.test(planoNovo)) {
        Logger.log('salvarVenda: Plano sem texto rejeitado. dados.plano=' + JSON.stringify(planoNovo));
        throw new Error('Plano inválido: nome do plano está vazio ou contém apenas números. Selecione um plano da lista. (Se o campo está preenchido na tela, faça Ctrl+Shift+R para limpar cache.)');
      }
      // Sprint 3 (12/05/2026): Forma de Pagamento e Vencimento obrigatórios em cadastro novo.
      var fpNova = String(dados.formaPagamento || '').toUpperCase().trim();
      if (fpNova !== 'BOLETO' && fpNova !== 'RECORRENTE') {
        throw new Error('Forma de Pagamento é obrigatória (Boleto ou Recorrente).');
      }
      if (!String(dados.venc || '').trim()) throw new Error('Vencimento é obrigatório.');
    }

    // Turno: domínio fechado (Manhã, Tarde, vazio). Qualquer outro valor vira ''.
    if (dados.turno && _TURNOS_VALIDOS_.indexOf(String(dados.turno).trim()) === -1) {
      dados.turno = '';
    }

    // Validação de formato do contrato (NG/Adapter) — só para transições para
    // status 2 ou 3, onde o ID é operacional. Replica a validação que vivia
    // no frontend (_validarContratoFormato) para defesa em profundidade.
    var statusValidaContrato =
      dados.status === '2- Aguardando Instalação' ||
      dados.status === '3 - Finalizada/Instalada';
    if (statusValidaContrato && dados.contrato) {
      var errContrato = _validarContratoFormatoBackend_(dados.contrato, dados.sistema);
      if (errContrato) throw new Error(errContrato);
    }

    var sheet = _getSheet();

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
      var linhaAtual = sheet.getRange(linhaNum, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
      // Captura status antigo ANTES do merge (depois disso dados.status é o novo)
      var statusAntigo = String(linhaAtual[CONFIG.COLUNAS.STATUS] || '').trim();
      _statusAntigoAlerta = statusAntigo;
      // Sprint 3.3 (12/05/2026): snapshot da linha original para reverter
      // a Fibra caso a gravação subsequente do Móvel falhe (atomicidade).
      var linhaAtualSnapshot = linhaAtual.slice();
      dados = _mesclarDadosVendaComLinhaAtual_(dados, linhaAtual, linhaNum);
      // Validação de transição usando estado FINAL pós-merge
      var errTrans = _validarTransicaoStatusServer_(statusAntigo, dados.status, {
        dataAtiv: dados.dataAtiv, contrato: dados.contrato,
        agenda:   dados.agenda,   turno:    dados.turno,
        instal:   dados.instal,   sistema:  dados.sistema
      });
      if (errTrans) throw new Error(errTrans);
      // Sprint Integridade (21/05/2026) — INV-01/03: editar Fibra (incl. trocar
      // Alone→Combo) para status operacional exige Móvel vinculado. Exceção: se
      // o próprio payload já traz o Móvel (dados.movel.linha), este save está
      // completando o combo — não bloqueia.
      if (!(dados.movel && dados.movel.linha)) {
        var produtoAntigo = String(linhaAtualSnapshot[CONFIG.COLUNAS.PRODUTO] || '').trim();
        var errCombo = _validarComboIntegridade_(dados.produto, produtoAntigo, statusAntigo, dados.status, linhaNum);
        if (errCombo) throw new Error(errCombo);
      }
      var linhaDados = _construirLinhaDados(dados);
      sheet.getRange(linhaNum, 1, 1, linhaDados.length).setValues([linhaDados]);

      // Sprint 3.3 (12/05/2026): se payload inclui `movel`, atualiza também
      // a venda Móvel vinculada (painel unificado). Atômico: se falhar,
      // reverte a Fibra para o snapshot original.
      if (dados.movel && dados.movel.linha) {
        try {
          var linhaMv = parseInt(dados.movel.linha, 10);
          if (isNaN(linhaMv) || linhaMv < 3) throw new Error('Linha do Móvel inválida.');
          var rowMvAtual    = sheet.getRange(linhaMv, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
          var statusMvAnt   = String(rowMvAtual[CONFIG.COLUNAS.STATUS] || '').trim();
          var dadosMv       = _mesclarDadosVendaComLinhaAtual_(dados.movel, rowMvAtual, linhaMv);
          var errTransMv    = _validarTransicaoStatusServer_(statusMvAnt, dadosMv.status, {
            dataAtiv: dadosMv.dataAtiv, contrato: dadosMv.contrato,
            agenda:   dadosMv.agenda,   turno:    dadosMv.turno,
            instal:   dadosMv.instal,   sistema:  dadosMv.sistema
          });
          if (errTransMv) throw new Error('Móvel: ' + errTransMv);
          var linhaMvDados  = _construirLinhaDados(dadosMv);
          sheet.getRange(linhaMv, 1, 1, linhaMvDados.length).setValues([linhaMvDados]);
        } catch (eMv) {
          // REVERSÃO: restaura a Fibra para o estado anterior à edição.
          // (Nota: Móvel pode ter sido parcialmente alterado antes da falha —
          //  reversão só cobre a Fibra. Bug pré-existente, não da Fase 5b.)
          try {
            sheet.getRange(linhaNum, 1, 1, linhaAtualSnapshot.length).setValues([linhaAtualSnapshot]);
            // Fase 5b: update fino no cache em vez de invalidação total.
            _limparCacheSemLista();
            _atualizarVendaNoCache_(linhaNum);
            if (linhaMv >= 3) _atualizarVendaNoCache_(linhaMv); // estado pós-reversão do Móvel
            Logger.log('salvarVenda: Fibra revertida após falha do Móvel: ' + (eMv && eMv.message || eMv));
          } catch (eRev) {
            Logger.log('salvarVenda: FALHA AO REVERTER Fibra linha ' + linhaNum + ': ' + (eRev && eRev.message || eRev));
          }
          throw new Error('Erro ao atualizar Móvel: ' + (eMv.message || eMv) + ' — alterações da Fibra revertidas.');
        }
      }

      // Propaga campos compartilhados (cliente, endereço, contatos) para o Móvel
      // vinculado, se a venda editada for a mãe de um combo ATIVO. Esse helper
      // roda APÓS o update explícito do Móvel — campos compartilhados do dados
      // sobrescrevem o que veio em dados.movel (intencional: cliente é único).
      try { _propagarFibraParaMovelSeCombo_(sheet, linhaNum, dados); } catch (epm) {
        Logger.log('Falha ao propagar Fibra→Móvel: ' + (epm && epm.message ? epm.message : epm));
      }
      // Fase 5b: update fino no cache da Lista em vez de invalidação total.
      // _atualizarVendaNoCache_ reconstrói vínculos da mãe + filhas, então
      // alterações propagadas (cliente/endereço/contato) aparecem no card combo.
      _limparCacheSemLista();
      _atualizarVendaNoCache_(linhaNum);
      // Capturar linha para notificação PAP fora do lock — SÓ em transição real
      // (status mudou para 2/3). Re-salvar uma venda já em 2/3 não re-notifica
      // o vendedor (a notificação é um evento único da mudança de status).
      if ((dados.status === '2- Aguardando Instalação' || dados.status === '3 - Finalizada/Instalada') &&
          String(_statusAntigoAlerta).trim() !== String(dados.status).trim()) {
        _papLinha = linhaNum;
      }
      resultado = { sucesso: true, linha: linhaNum, mensagem: '✅ ' + dados.cliente.trim() + ' atualizado com sucesso!' };
    } else {
      // ── CADASTRO NOVO ──────────────────────────────────────────────────
      // Sprint 3.2 (rev2, 12/05/2026): cadastro de Fibra Combo é ATÔMICO.
      // Valida pré-condições do Móvel ANTES de gravar a Fibra — se faltar
      // Portabilidade ou inferência falhar, aborta sem deixar a Fibra órfã.
      // Se a gravação do Móvel falhar APÓS gravar a Fibra (race condition,
      // lock, etc), reverte a linha da Fibra via clearContent (preserva
      // numeração das linhas em "Vinculos Vendas").
      var ehFibraComboNovo = String(dados.produto || '').trim() === 'Fibra Combo';
      var inferidoMovel = null;
      if (ehFibraComboNovo) {
        if (!String(dados.movelPortabilidade || '').trim()) {
          // Log de diagnóstico: ajuda detectar payload incompleto (ex: frontend
          // em cache enviou sem o campo). Inclui keys do dados sem valores PII.
          Logger.log('salvarVenda Fibra Combo SEM movelPortabilidade — keys do payload: ' + Object.keys(dados || {}).join(','));
          throw new Error('Portabilidade do Móvel é obrigatória ao cadastrar Fibra Combo. (Se o campo está preenchido na tela, faça Ctrl+Shift+R para limpar cache e tente novamente.)');
        }
        inferidoMovel = _inferirMovelComboFromFibra_(dados.plano);
        if (inferidoMovel.erro) {
          throw new Error('Não foi possível inferir o plano Móvel: ' + inferidoMovel.mensagem);
        }
      }

      var linhaDados = _construirLinhaDados(dados);
      // Captura forward-only do codigo Vero do plano na coluna FAT (Q) — so cadastro novo.
      // Cobertura parcial (cidades ja no dicionario); sem match fica em branco. Sem backfill.
      try {
        var _codVero = getCodigoVeroPorPlanoCidade(dados.plano, dados.cidade);
        if (_codVero) linhaDados[CONFIG.COLUNAS.FAT] = _codVero;
      } catch (eCodVero) { Logger.log('codigo Vero (nova venda) falhou: ' + eCodVero.message); }
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
      // Fase 5b: INSERT da nova venda no cache da Lista (não invalida o resto).
      _limparCacheSemLista();
      _atualizarVendaNoCache_(novaLinha);
      resultado = { sucesso: true, linha: novaLinha, mensagem: '✅ ' + dados.cliente.trim() + ' cadastrado com sucesso!' };

      // Cria Móvel Combo automaticamente (validação prévia já garantiu que
      // chega aqui só se Portabilidade + inferência estiverem OK). Se mesmo
      // assim falhar a gravação do Móvel, REVERTE a Fibra (clearContent).
      if (ehFibraComboNovo && inferidoMovel) {
        var resMovel = null;
        var erroMovel = null;
        try {
          // releases lock antes — criarVendaMovelVinculada adquire o seu próprio
          lock.releaseLock(); _lockReleased = true;
          resMovel = criarVendaMovelVinculada({
            linhaOrigem:   novaLinha,
            produto:       inferidoMovel.produto,
            plano:         inferidoMovel.plano + ' | ' + (inferidoMovel.valor || 0).toFixed(2).replace('.', ','),
            valor:         inferidoMovel.valor,
            contrato:      String(dados.movelContrato || '').trim(),
            portabilidade: String(dados.movelPortabilidade || '').trim(),
            linhaMovel:    String(dados.movelLinha || '').trim()
          });
        } catch (eMovel) {
          erroMovel = (eMovel && eMovel.message) || String(eMovel);
        }

        if (resMovel && resMovel.sucesso) {
          resultado.movelLinha = resMovel.linha;
          resultado.mensagem   = '✅ Combo criado: ' + dados.cliente.trim() + ' — Fibra + Móvel ' + inferidoMovel.plano.split(' | ')[0];
        } else {
          // ── REVERSÃO ATÔMICA ─────────────────────────────────────────
          // Limpa o conteúdo da linha da Fibra recém-criada para não deixar
          // venda órfã. Usa clearContent em vez de deleteRow para preservar
          // a numeração das linhas (vinculos em "Vinculos Vendas" são por
          // número de linha; deletar quebraria índices).
          var msgErroMovel = erroMovel || (resMovel && resMovel.mensagem) || 'erro desconhecido';
          try {
            sheet.getRange(novaLinha, 1, 1, CONFIG.TOTAL_COLUNAS).clearContent();
            // Fase 5b: mantém invalidação total — linha foi limpa via clearContent,
            // update fino tentaria mapear uma linha vazia e degradar o cache.
            _limparCache();
            Logger.log('salvarVenda: Fibra revertida (linha ' + novaLinha + ') após falha no Móvel: ' + msgErroMovel);
          } catch (eRev) {
            Logger.log('salvarVenda: FALHA AO REVERTER linha ' + novaLinha + ': ' + (eRev && eRev.message || eRev) + ' — venda órfã possível.');
          }
          resultado = { sucesso: false, mensagem: '❌ Erro ao criar Móvel Combo: ' + msgErroMovel + ' — venda cancelada.' };
        }
      }
    }

  } catch (erro) {
    resultado = { sucesso: false, mensagem: '❌ ' + erro.message };
  } finally {
    if (!_lockReleased) { try { lock.releaseLock(); } catch (_) {} }
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
        if (vPAP && vPAP.subscriberId && dados.notificarVendedor !== false) {
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

  // disparo-grupo: Alertas 1 e 2 (transição de status). Não-bloqueante.
  if (resultado.sucesso && resultado.linha) {
    try {
      _dispararAlertaTransicaoStatus_(resultado.linha, _statusAntigoAlerta, dados.status);
    } catch (eAlerta) { Logger.log('Alerta transicao status — erro: ' + (eAlerta && eAlerta.message || eAlerta)); }
  }

  // Meta Ads (Fase 3): venda META ADS que entra em status 2/3 marca o lead
  // correspondente como "Converteu" (direção única Vendas → Leads). Só na
  // transição (status mudou), fora do lock. Não-bloqueante.
  if (resultado.sucesso && resultado.linha) {
    try {
      var _novoStatusMA = String(dados.status || '').trim();
      var _transicaoMA = String(_statusAntigoAlerta || '').trim() !== _novoStatusMA;
      if (_transicaoMA &&
          (_novoStatusMA === '2- Aguardando Instalação' || _novoStatusMA === '3 - Finalizada/Instalada')) {
        _reconciliarVendaMetaAdsAposSave_(resultado.linha);
      }
    } catch (eMA) { Logger.log('Reconciliacao Meta Ads — erro: ' + (eMA && eMA.message || eMA)); }
  }

  return resultado;
}




// ─── DADOS DO FUNIL DE INSTALAÇÕES ────────────────────────────────────────
// Retorna TODAS as vendas dos 3 status do funil (sem paginação)

function getVendasFunil() {
  try {
    // ── Cache com chunks (suporta JSON > 100KB) ────────────────────────
    // funil_v3 (21/05): shape novo do card inclui cpf/sistema/sistemaFallback.
    var CACHE_KEY = CONFIG.CACHE_PREFIX + 'funil_v3';
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
    // Lê até SISTEMA (33) — necessário para cpf/sistema/sistemaFallback (botões NG/AD no card).
    var colunasFunilFast = _getMaxColunaLida([cf.WHATS, cf.CPF, cf.CIDADE, cf.SISTEMA]);
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

      // Fase 5b/Funil: mapeamento extraído pra _mapearLinhaFunil_ (reusado no update fino).
      resultadoFast.push(_mapearLinhaFunil_(rowFast, linhaFast, tz));
    }

    Logger.log('getVendasFunil fast: ' + resultadoFast.length + ' registros. Ag=' +
      contadoresFast['2- Aguardando Instalação'] + ' Fin=' +
      contadoresFast['3 - Finalizada/Instalada'] + ' Pen=' + contadoresFast['Pendencia Vero']);

    var retornoFast = { dados: resultadoFast, total: resultadoFast.length };
    // Funil 20/05: TTL 300 → 1800 (30min), alinhado ao update fino que mantém quente.
    _cachePutChunked(CACHE_KEY, retornoFast, 1800);
    return retornoFast;

  } catch (e) {
    Logger.log('Erro em getVendasFunil: ' + e.toString());
    return { dados: [], total: 0, erro: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PERFORMANCE FUNIL (20/05/2026) — Update fino do cache do board
//  Mesma fórmula da Fase 5b da Lista, adaptada: o cache funil_v2 é um array flat
//  e o frontend distribui nas 3 colunas. Update fino remove a entrada antiga da
//  linha e readiciona SE a venda ainda qualifica pro board.
// ─────────────────────────────────────────────────────────────────────────────

// Mapeia uma linha da planilha para o objeto do board do Funil. Compartilhado
// entre getVendasFunil (carga em massa) e _atualizarVendaNoFunilCache_ (update
// fino). Todas as colunas usadas estão até WHATS (21) — funciona com row parcial
// (getVendasFunil lê só até WHATS) ou completa (update fino lê TOTAL_COLUNAS).
function _mapearLinhaFunil_(row, linha, tz) {
  var cf = CONFIG.COLUNAS;
  var dAtiv = row[cf.DATA_ATIV];
  var dataAtivStr = (dAtiv instanceof Date && !isNaN(dAtiv)) ? Utilities.formatDate(dAtiv, tz, 'dd/MM/yyyy') : '';
  var dAg = row[cf.AGENDA];
  var agendaStr = (dAg instanceof Date && !isNaN(dAg)) ? Utilities.formatDate(dAg, tz, 'dd/MM/yyyy') : (dAg ? String(dAg) : '');
  var dIns = row[cf.INSTAL];
  var instalStr = (dIns instanceof Date && !isNaN(dIns)) ? Utilities.formatDate(dIns, tz, 'dd/MM/yyyy') : (dIns ? String(dIns) : '');
  return {
    linha:     linha,
    status:    String(row[cf.STATUS]     || '').trim(),
    cliente:   String(row[cf.CLIENTE]    || '').trim(),
    produto:   String(row[cf.PRODUTO]    || '').trim(),
    plano:     String(row[cf.PLANO]      || '').trim(),
    resp:      String(row[cf.RESP]       || '').trim(),
    whats:     String(row[cf.WHATS]      || '').trim(),
    codCli:    String(row[cf.COD_CLI]    || '').trim(),
    contrato:  String(row[cf.CONTRATO]   || '').trim(),
    dataAtiv:  dataAtivStr,
    agenda:    agendaStr,
    turno:     String(row[cf.TURNO]      || '').trim(),
    instal:    instalStr,
    preStatus: String(row[cf.PRE_STATUS] || '').trim(),
    // Campos p/ os botões de consulta NG/AD direto no card do funil (espelham _mapearLinha).
    // Exigem que getVendasFunil leia até a coluna SISTEMA (33).
    cpf:       (function(v) {
      var s = String(v || '').trim().replace(/[^0-9\/\.\-]/g, '');
      if (!s) return '';
      var soDigitos = s.replace(/\D/g, '');
      if (soDigitos.length > 0 && soDigitos === s) {
        if (soDigitos.length <= 11) return soDigitos.padStart(11, '0');
        if (soDigitos.length <= 14) return soDigitos.padStart(14, '0');
      }
      return s;
    })(row[cf.CPF]),
    sistema:   String(row[cf.SISTEMA] || '').trim(),
    sistemaFallback: (function() {
      try {
        var cid = row[cf.CIDADE];
        if (!cid) return null;
        return getSistemaFallbackPorCidade(String(cid).trim()) || null;
      } catch(e) { return null; }
    })()
  };
}

// A linha qualifica para o board do Funil? Replica o filtro de getVendasFunil:
// status ∈ {2- Aguardando Instalação, 3 - Finalizada/Instalada, Pendencia Vero};
// se status 3, a instalação precisa cair no mês/ano atual. O limite de 150/coluna
// do MISS NÃO é aplicado aqui (desvio de ±1 é recortado no próximo MISS).
function _qualificaParaFunil_(row) {
  var cf = CONFIG.COLUNAS;
  var status = String(row[cf.STATUS] || '').trim();
  var statusFunil = {
    '2- Aguardando Instalação': true,
    '3 - Finalizada/Instalada': true,
    'Pendencia Vero':           true
  };
  if (!statusFunil[status]) return false;
  if (status === '3 - Finalizada/Instalada') {
    var dIns = _parseDataFlex(row[cf.INSTAL]);
    var agora = new Date();
    if (!dIns || (dIns.getMonth() + 1) !== (agora.getMonth() + 1) ||
        dIns.getFullYear() !== agora.getFullYear()) return false;
  }
  return true;
}

// Invalida o cache chunked do board (funil_v2). Usado no fallback do update fino.
function _limparCacheFunil_() {
  try {
    var cache = CacheService.getScriptCache();
    var base  = CONFIG.CACHE_PREFIX + 'funil_v3';
    cache.remove(base + '_meta');
    for (var i = 0; i < 20; i++) cache.remove(base + '_' + i);
  } catch(e) { Logger.log('_limparCacheFunil_ erro: ' + e); }
}

// Update fino do board: remove a entrada antiga da linha do funil_v2 e readiciona
// SE a venda ainda qualifica (status do funil + filtro de mês no status 3). No-op
// se o cache não existe (não cria do nada). Falha graciosa: erro → invalida funil_v2.
function _atualizarVendaNoFunilCache_(numeroLinha) {
  numeroLinha = parseInt(numeroLinha);
  if (!numeroLinha || numeroLinha < 3) return;
  try {
    var key = CONFIG.CACHE_PREFIX + 'funil_v3';
    var cached = _cacheGetChunked(key);
    if (!cached || !Array.isArray(cached.dados)) return; // não cria cache do nada

    // Remove a entrada antiga da linha (mudança de coluna ou saída do board)
    var novos = [];
    for (var i = 0; i < cached.dados.length; i++) {
      if (cached.dados[i] && cached.dados[i].linha !== numeroLinha) novos.push(cached.dados[i]);
    }

    // Lê a linha e readiciona se ainda qualifica pro funil
    var sheet = _getSheet();
    if (numeroLinha <= sheet.getLastRow()) {
      var row = sheet.getRange(numeroLinha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
      if (_qualificaParaFunil_(row)) {
        var cf = CONFIG.COLUNAS;
        var cliente = String(row[cf.CLIENTE] || '').trim();
        var cpf     = String(row[cf.CPF]     || '').trim();
        if (cliente || cpf) {
          novos.unshift(_mapearLinhaFunil_(row, numeroLinha, Session.getScriptTimeZone()));
        }
      }
    }

    cached.dados = novos;
    cached.total = novos.length;
    _cachePutChunked(key, cached, 1800);
    _incCounter_('funil_fine_update');
  } catch(e) {
    Logger.log('_atualizarVendaNoFunilCache_ erro (linha ' + numeroLinha + '): ' + (e && e.message || e) + ' — fallback invalida funil_v2.');
    _incCounter_('funil_fine_update_fallback');
    _limparCacheFunil_();
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

    // Le estado atual para validacao de transicao
    var rowAtual    = sheet.getRange(linha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
    var vendaAtual  = _mapearLinha(rowAtual, linha);
    var statusAnt   = vendaAtual.status || '';

    // Normaliza valorExtra de data para DD/MM/YYYY (consistente com _construirLinhaDados)
    var instalNorm = '';
    if (campoExtra === 'instal' && valorExtra) {
      instalNorm = _formatarDataNascimento(valorExtra, 'dd/MM/yyyy');
    }

    // Defesa em profundidade: valida transição com o estado FINAL projetado.
    // Para o funil drag-and-drop, dataAtiv/contrato/agenda/turno tem de ja
    // estar gravados na linha — o frontend nao envia esses campos. Se faltarem,
    // o usuario eh orientado a usar o painel inline.
    var errTrans = _validarTransicaoStatusServer_(statusAnt, novoStatus, {
      dataAtiv: vendaAtual.dataAtiv, contrato: vendaAtual.contrato,
      agenda:   vendaAtual.agenda,   turno:    vendaAtual.turno,
      instal:   instalNorm || vendaAtual.instal,
      sistema:  vendaAtual.sistema
    });
    if (errTrans) {
      return { sucesso: false, mensagem: errTrans + ' Use o painel lateral (✏️ Editar) para completar os campos antes de mover no funil.' };
    }

    // Sprint Integridade (21/05/2026) — INV-01/02: combo órfão não entra em
    // estado operacional via drag no funil.
    var errCombo = _validarComboIntegridade_(vendaAtual.produto, vendaAtual.produto, statusAnt, novoStatus, linha);
    if (errCombo) return { sucesso: false, mensagem: errCombo };

    // Atualiza status (coluna C = índice 2 = coluna 3)
    sheet.getRange(linha, CONFIG.COLUNAS.STATUS + 1).setValue(novoStatus);

    // Atualiza campo extra conforme destino — instal sempre normalizado a DD/MM/YYYY
    if (instalNorm) {
      sheet.getRange(linha, CONFIG.COLUNAS.INSTAL + 1).setValue(instalNorm);
    }
    if (campoExtra === 'observacao' && valorExtra) {
      sheet.getRange(linha, CONFIG.COLUNAS.OBSERVACAO + 1).setValue(valorExtra);
    }

    // Funil 20/05: update fino em vez de invalidação total. _atualizarVendaNoCache_
    // cuida da Lista (lista_v4) E do board (funil_v2 via _atualizarVendaNoFunilCache_).
    _limparCacheSemLista();
    _atualizarVendaNoCache_(linha);

    Logger.log('Funil: linha ' + linha + ' movida para "' + novoStatus + '"' +
               (campoExtra ? ' | ' + campoExtra + ': ' + valorExtra : ''));

    resultado = { sucesso: true };

  } catch (e) {
    Logger.log('Erro em moverVendaFunil: ' + e);
    resultado = { sucesso: false, mensagem: e.message };
  } finally {
    lock.releaseLock();
  }

  // Notificação PAP fora do lock (apenas status 2 e 3, e SÓ em transição real —
  // re-arrastar para a mesma coluna não re-notifica o vendedor)
  if (resultado.sucesso && sheet && linha &&
      (novoStatus === '2- Aguardando Instalação' || novoStatus === '3 - Finalizada/Instalada') &&
      String((typeof statusAnt !== 'undefined' ? statusAnt : '')).trim() !== String(novoStatus).trim()) {
    try {
      var c      = CONFIG.COLUNAS;
      var rowPAP = sheet.getRange(linha, 1, 1, c.CLIENTE + 1).getValues()[0];
      if (rowPAP[c.CANAL] === 'PAP') {
        var vPAP  = _papBuscarSubscriberVendedor(null, rowPAP[c.RESP]);
        if (vPAP && vPAP.subscriberId && payload.notificarVendedor !== false) {
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

  // disparo-grupo: Alertas 1 e 2 (transição de status no drag-and-drop).
  if (resultado.sucesso && linha) {
    try {
      var _statAnt = (typeof statusAnt !== 'undefined') ? statusAnt : '';
      _dispararAlertaTransicaoStatus_(linha, _statAnt, novoStatus);
    } catch (eAlerta) { Logger.log('Alerta funil — erro: ' + (eAlerta && eAlerta.message || eAlerta)); }
  }

  // Meta Ads (Fase 3): drag para status 2/3 marca lead "Converteu" se canal META ADS.
  if (resultado.sucesso && linha &&
      (novoStatus === '2- Aguardando Instalação' || novoStatus === '3 - Finalizada/Instalada')) {
    try { _reconciliarVendaMetaAdsAposSave_(linha); }
    catch (eMA) { Logger.log('Reconciliacao Meta Ads (funil) — erro: ' + (eMA && eMA.message || eMA)); }
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

// Remove todos os chunks do cache chunked das listas principais
function _limparCacheListaV3() {
  var cache  = CacheService.getScriptCache();
  try {
    var prefixes = [
      CONFIG.CACHE_PREFIX + 'lista_v3',
      CONFIG.CACHE_PREFIX + 'lista_v4'
    ];
    var keys = [];

    for (var p = 0; p < prefixes.length; p++) {
      var prefix = prefixes[p];
      var metaRaw = cache.get(prefix + '_meta');
      keys.push(prefix + '_meta');
      if (metaRaw) {
        var meta = JSON.parse(metaRaw);
        if (meta && meta.total) {
          for (var i = 0; i < meta.total; i++) keys.push(prefix + '_' + i);
        }
      }
    }
    cache.removeAll(keys);
    Logger.log('_limparCacheListaV3: ' + keys.length + ' chaves removidas.');
  } catch(e) { Logger.log('_limparCacheListaV3 erro: ' + e); }

  // Performance (19/05/2026): invalida tb cache de vínculos (acoplado).
  _limparCacheVinculosVendas_();
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
    CONFIG.CACHE_PREFIX + 'funil_v3_meta',
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

// ─────────────────────────────────────────────────────────────────────────────
//  PERFORMANCE FASE 5b (19/05/2026) — Update fino do cache da Lista
//  Substitui invalidação total por UPDATE/INSERT cirúrgico por linha. Mantém
//  cache quente entre saves. Em caso de erro, fallback para invalidação total.
// ─────────────────────────────────────────────────────────────────────────────

// Variante de _limparCache() que NÃO invalida o cache da Lista (lista_v4 /
// lista_completa). Usar nos pontos de save onde _atualizarVendaNoCache_()
// cuida da lista linha-a-linha. Sem essa função, todo save invalida cache via
// cascata em _limparCache() → _limparCacheListaV3 — anulando a Fase 5b.
function _limparCacheSemLista() {
  var cache = CacheService.getScriptCache();
  // Funil 20/05: 'funil_v2_meta' REMOVIDO daqui — o board agora é mantido por
  // update fino (_atualizarVendaNoFunilCache_, chamado dentro de _atualizarVendaNoCache_).
  // Os 2 chamadores desta função (salvarVenda, criarVendaMovelVinculada) sempre
  // chamam _atualizarVendaNoCache_ em seguida, então o funil segue consistente.
  var toRemove = [
    CONFIG.CACHE_PREFIX + 'leads_v1_meta',
    CONFIG.CACHE_PREFIX + 'responsaveis_v1',
    CONFIG.CACHE_PREFIX + 'cidades_v1',
    CONFIG.CACHE_PREFIX + 'tabela_v1',
    CONFIG.CACHE_PREFIX + 'keys'
  ];
  var hoje = new Date();
  for (var m = 0; m <= 2; m++) {
    var d = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1);
    toRemove.push(CONFIG.CACHE_PREFIX + 'dash_' + (d.getMonth()+1) + '_' + d.getFullYear());
  }
  try { cache.removeAll(toRemove); } catch(e) { Logger.log('_limparCacheSemLista removeAll erro: ' + e); }
}

// Atualiza a entrada de UMA venda nos caches da Lista (lista_v4 + lista_completa).
// UPDATE se já existe; INSERT no topo se nova. Mantém ≤ 500 itens.
// Reconstrói vínculos da venda + pai + filhas pra manter card agrupado correto.
// Falha graciosa: em erro, cai pra invalidação total (comportamento antigo).
function _atualizarVendaNoCache_(numeroLinha) {
  numeroLinha = parseInt(numeroLinha);
  if (!numeroLinha || numeroLinha < 3) return;
  try {
    var sheet = _getSheet();
    var ult = sheet.getLastRow();
    if (numeroLinha > ult) return;

    var row = sheet.getRange(numeroLinha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
    var tz  = Session.getScriptTimeZone();
    var vinculosMap = _getVinculosVendasMap_(); // já cacheado (Fase 2)

    // Resumo da venda + filhas + pai (necessário pro card agrupado)
    var mapaResumoVinculos = {};
    mapaResumoVinculos[numeroLinha] = _resumirVendaVinculada_(_mapearLinhaLista(row, numeroLinha, tz));
    var filhos = vinculosMap.filhasPorMae[numeroLinha] || [];
    for (var f = 0; f < filhos.length; f++) {
      var lf = filhos[f].vendaFilhaLinha;
      if (!lf || lf < 3 || lf > ult) continue;
      var rowF = sheet.getRange(lf, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
      mapaResumoVinculos[lf] = _resumirVendaVinculada_(_mapearLinhaLista(rowF, lf, tz));
    }
    var pai = vinculosMap.maePorFilha[numeroLinha];
    if (pai && pai.vendaMaeLinha && pai.vendaMaeLinha >= 3 && pai.vendaMaeLinha <= ult) {
      var rowM = sheet.getRange(pai.vendaMaeLinha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
      mapaResumoVinculos[pai.vendaMaeLinha] = _resumirVendaVinculada_(_mapearLinhaLista(rowM, pai.vendaMaeLinha, tz));
    }

    var vendaAtualizada = _decorarVendaComVinculos_(
      _mapearLinhaLista(row, numeroLinha, tz),
      vinculosMap,
      mapaResumoVinculos
    );

    _aplicarUpdateNoChunked_(CONFIG.CACHE_PREFIX + 'lista_v4',       numeroLinha, vendaAtualizada);
    _aplicarUpdateNoChunked_(CONFIG.CACHE_PREFIX + 'lista_completa', numeroLinha, vendaAtualizada);
    _incCounter_('lista_fine_update');
  } catch(e) {
    Logger.log('_atualizarVendaNoCache_ erro (linha ' + numeroLinha + '): ' + (e && e.message || e) + ' — fallback p/ invalidação total.');
    _incCounter_('lista_fine_update_fallback');
    try { _limparCacheListaV3(); _limparCacheListaCompleta(); } catch(e2) {}
  }
  // Funil 20/05: mantém o board quente também (try/catch próprio — não afeta a Lista).
  _atualizarVendaNoFunilCache_(numeroLinha);
}

// Aplica UPDATE-or-INSERT num cache chunked individual. Helper privado.
// No-op se o cache ainda não existe (não cria do nada — Fase 5b assume
// que getVendasPaginadas é quem cria o cache; update fino só mantém).
function _aplicarUpdateNoChunked_(key, numeroLinha, vendaAtualizada) {
  var cached = _cacheGetChunked(key);
  if (!cached || !Array.isArray(cached.dados)) return;
  var idx = -1;
  for (var i = 0; i < cached.dados.length; i++) {
    if (cached.dados[i] && cached.dados[i].linha === numeroLinha) { idx = i; break; }
  }
  if (idx >= 0) {
    cached.dados[idx] = vendaAtualizada;
  } else {
    // INSERT: presume mais recente = topo (linhasNaoVazias sort desc por linha física)
    cached.dados.unshift(vendaAtualizada);
    if (cached.dados.length > 500) cached.dados.pop();
    cached.totalGeral = (cached.totalGeral || cached.dados.length - 1) + 1;
  }
  // TTL conservador 30min (commit 2 alinha o cache principal pra mesmo valor).
  _cachePutChunked(key, cached, 1800);
}

// Telemetria leve via Script Properties. Fire-and-forget — nunca falha.
// Contadores expostos via _testTelemetria() / _resetTelemetriaLista().
// Decisão a tomar após 1 semana: se HIT/MISS ratio < 70%, TTL precisa subir.
function _incCounter_(key) {
  try {
    var p = PropertiesService.getScriptProperties();
    var n = parseInt(p.getProperty('counter_' + key) || '0', 10) + 1;
    p.setProperty('counter_' + key, String(n));
  } catch(e) { /* never throw from telemetry */ }
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
// Normaliza valor monetário para número antes de gravar na col O (VALOR).
// Aceita number, "R$ 89,90", "89,90", "1.099,90", "89.90". Retorna '' se vazio/inválido.
function _normalizarValorParaNumero_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return isFinite(v) && v >= 0 ? v : '';
  var s = String(v).replace(/R\$\s*/i, '').replace(/\s/g, '').trim();
  if (!s) return '';
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return (isFinite(n) && n >= 0) ? n : '';
}

function _valorListaSemDuplicar(plano, valor) {
  var planoTxt = String(plano || '').trim();
  var valorTxt = String(valor || '').trim();
  if (!planoTxt || !valorTxt) return valorTxt;

  var planoNorm = planoTxt.replace(/\s+/g, ' ').replace(/R\$\s*/gi, '').trim();
  var valorNorm = valorTxt.replace(/\s+/g, ' ').replace(/R\$\s*/gi, '').trim();
  return planoNorm.indexOf(valorNorm) !== -1 ? '' : valorTxt;
}

// Performance (19/05/2026): formatadores puro JS em vez de Utilities.formatDate.
// Utilities.formatDate é cara em GAS (~3-5ms por call); com 500 linhas × 5 datas
// = 2500 calls = 7-12s. Substituído por puro JS (~0.05ms por call) — 100× mais rápido.
// O Date.prototype.getDate/getMonth/getFullYear retorna componentes no fuso local
// do script (definido em appsscript.json — America/Sao_Paulo).
function _fmtDataBR(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  var dd = d.getDate();      if (dd < 10) dd = '0' + dd;
  var mm = d.getMonth() + 1; if (mm < 10) mm = '0' + mm;
  return dd + '/' + mm + '/' + d.getFullYear();
}

function _fmtDataHoraBR(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  var dd = d.getDate();      if (dd < 10) dd = '0' + dd;
  var mm = d.getMonth() + 1; if (mm < 10) mm = '0' + mm;
  var HH = d.getHours();     if (HH < 10) HH = '0' + HH;
  var MM = d.getMinutes();   if (MM < 10) MM = '0' + MM;
  return dd + '/' + mm + '/' + d.getFullYear() + ' ' + HH + ':' + MM;
}

function _mapearLinhaLista(row, numeroLinha, tz) {
  var c = CONFIG.COLUNAS;
  var clienteLegado = _normalizarCamposClienteLegado(row, c);
  return {
    linha:       numeroLinha,
    canal:       row[c.CANAL]        || '',
    produto:     row[c.PRODUTO]      || '',
    status:      row[c.STATUS]       || '',
    dataAtiv:    (row[c.DATA_ATIV] instanceof Date) ? _fmtDataBR(row[c.DATA_ATIV]) : (row[c.DATA_ATIV] || ''),
    codCli:      row[c.COD_CLI]      || '',
    contrato:    String(row[c.CONTRATO] || '').trim().replace(/\.0$/, ''),
    agenda:      (row[c.AGENDA] instanceof Date) ? _fmtDataBR(row[c.AGENDA]) : (row[c.AGENDA] || ''),
    turno:       row[c.TURNO]        || '',
    instal:      (row[c.INSTAL] instanceof Date) ? _fmtDataBR(row[c.INSTAL]) : (row[c.INSTAL] || ''),
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
    sistemaFallback: (function() {
      try {
        var cid = row[c.CIDADE];
        if (!cid) return null;
        return getSistemaFallbackPorCidade(String(cid).trim()) || null;
      } catch(e) { return null; }
    })(),
    venc:        row[c.VENC]         || '',
    fat:         row[c.FAT]          || '',
    plano:       row[c.PLANO]        || '',
    valor:       _valorListaSemDuplicar(row[c.PLANO], row[c.VALOR]),
    linhaMovel:    row[c.LINHA_MOVEL]    || '',
    portabilidade: row[c.PORTABILIDADE] || '',
    observacao:  row[c.OBSERVACAO]   || '',
    verohub:     (function(v) {
      if (!v) return '';
      if (v instanceof Date && !isNaN(v)) return _fmtDataBR(v);
      return String(v).trim();
    })(row[c.VEROHUB]),
    statusPAP:        String(row[c.STATUS_PAP]        || ''),
    verohubPedido:    String(row[c.VEROHUB_PEDIDO]    || '').trim(),
    verohubPedidoDt:  String(row[c.VEROHUB_PEDIDO_DT] || '').trim(),
    segmentacao:      String(row[c.SEGMENTACAO]        || '').trim(),
    preStatus:        String(row[c.PRE_STATUS]         || ''),
    // bcTags/bcStatus removidos em 19/05/2026 (Performance Lista).
    nomeMae:          clienteLegado.nomeMae,
    dtNasc:           clienteLegado.dtNasc,
    rg:               clienteLegado.rg,
    mapsLink:         '',
    reagendamentos:   parseInt(row[c.REAGENDAMENTOS]) || 0,
    viabilidade:      String(row[c.VIABILIDADE]        || '').trim(),
    criadoEm:         (function(v) {
      if (!v) return '';
      if (v instanceof Date && !isNaN(v)) return _fmtDataHoraBR(v);
      return String(v).trim();
    })(row[c.CRIADO_EM]),
    criadoPor:        String(row[c.CRIADO_POR] || '').trim(),
    veroStatus:       String(row[c.VERO_STATUS] || '').trim(),
    formaPagamento:   String(row[c.FORMA_PAGAMENTO] || '').trim()
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
    sistemaFallback: (function() {
      try {
        var cid = row[c.CIDADE];
        if (!cid) return null;
        return getSistemaFallbackPorCidade(String(cid).trim()) || null;
      } catch(e) { return null; }
    })(),
    venc:        row[c.VENC]         || '',
    fat:         row[c.FAT]          || '',
    plano:       row[c.PLANO]        || '',
    valor:       String(row[c.VALOR] || '').trim(),
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
    // bcTags/bcStatus removidos em 19/05/2026 (Performance Lista).
    nomeMae:          clienteLegado.nomeMae,
    dtNasc:           clienteLegado.dtNasc,
    rg:               clienteLegado.rg,
    mapsLink:         '',
    reagendamentos:   parseInt(row[c.REAGENDAMENTOS]) || 0,
    viabilidade:      String(row[c.VIABILIDADE]        || '').trim(),
    criadoEm:         (function(v) {
      if (!v) return '';
      if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
      return String(v).trim();
    })(row[c.CRIADO_EM]),
    criadoPor:        String(row[c.CRIADO_POR] || '').trim(),
    veroStatus:       String(row[c.VERO_STATUS] || '').trim(),
    formaPagamento:   String(row[c.FORMA_PAGAMENTO] || '').trim(),
    // ── Financeiro (AU-BL) — Fase 3. Lidos p/ preservar em edição (full-row rewrite). ──
    codPlano:            String(row[c.COD_PLANO] || '').trim(),
    pontosVenda:         (row[c.PONTOS_VENDA]  === '' || row[c.PONTOS_VENDA]  == null) ? '' : row[c.PONTOS_VENDA],
    pontosMovel:         (row[c.PONTOS_MOVEL]  === '' || row[c.PONTOS_MOVEL]  == null) ? '' : row[c.PONTOS_MOVEL],
    mesCompetencia:      String(row[c.MES_COMPETENCIA] || '').trim(),
    estrelasNoMes:       String(row[c.ESTRELAS_NO_MES] || '').trim(),
    fatorAplicado:       (row[c.FATOR_APLICADO]   === '' || row[c.FATOR_APLICADO]   == null) ? '' : row[c.FATOR_APLICADO],
    receitaPrevista:     (row[c.RECEITA_PREVISTA] === '' || row[c.RECEITA_PREVISTA] == null) ? '' : row[c.RECEITA_PREVISTA],
    receitaRealizada:    (row[c.RECEITA_REALIZADA]=== '' || row[c.RECEITA_REALIZADA]== null) ? '' : row[c.RECEITA_REALIZADA],
    statusAdimpl90d:     String(row[c.STATUS_ADIMPL_90D] || '').trim(),
    statusChurn:         String(row[c.STATUS_CHURN] || '').trim(),
    statusSuspensao:     String(row[c.STATUS_SUSPENSAO] || '').trim(),
    faixaRisco:          (row[c.FAIXA_RISCO] === '' || row[c.FAIXA_RISCO] == null) ? '' : row[c.FAIXA_RISCO],
    neverPaid:           (row[c.NEVER_PAID] === '' || row[c.NEVER_PAID] == null) ? '' : row[c.NEVER_PAID],
    agingDias:           (row[c.AGING_DIAS] === '' || row[c.AGING_DIAS] == null) ? '' : row[c.AGING_DIAS],
    ultimoRefreshRisco:  String(row[c.ULTIMO_REFRESH_RISCO] || '').trim(),
    origemContratoVero:  String(row[c.ORIGEM_CONTRATO_VERO] || '').trim(),
    mesRefVenda:         String(row[c.MES_REF_VENDA] || '').trim(),
    classificacaoCluster:String(row[c.CLASSIFICACAO_CLUSTER] || '').trim()
  };
}

// Sprint 2 — domínio fechado para Turno. Valores fora desta lista são
// silenciosamente normalizados para '' em salvarVenda.
var _TURNOS_VALIDOS_ = ['Manhã (08h às 12h)', 'Tarde (13h às 17h)'];

// Sprint 2.5 — validação server-side de transição de status. Defesa em
// profundidade: o frontend (_pifValidarTransicaoStatus em JS.html) já valida,
// mas qualquer caminho de gravação (salvarVenda, moverVendaFunil, webhook,
// macro) passa por aqui para garantir consistência da etapa.
//   oldStatus / newStatus : strings exatas do STATUS_LIST
//   campos : { dataAtiv, contrato, agenda, turno, instal, sistema }
// Retorna null se OK; string com mensagem de erro se invalido.
// ── Sprint Integridade de Vendas (21/05/2026) — INV-01/02/03 do §6 do
// ARCHITECTURE_FINANCEIRO.md ────────────────────────────────────────────────
// Um status "exige combo completo" quando representa um estado operacional
// (a venda virou real e precisa do par Fibra↔Móvel). Status 1 (Conferência),
// leads e estados terminais (Cancelado/Churn/Devolvido) ficam livres.
function _statusExigeComboCompleto_(status) {
  var s = String(status || '').trim();
  return s === '2- Aguardando Instalação'   // Fibra
      || s === '3 - Finalizada/Instalada'   // Fibra
      || s === 'Pendencia Vero'             // Fibra/Móvel
      || s === '2- Aguardando Entrega'      // Móvel
      || s === '3- Aguardando Retirada'     // Móvel
      || s === '4- Entregue'               // Móvel
      || s === '5 - Finalizado';            // Móvel
}

function _comboEhCombo_(produto) {
  var p = _normalizarTexto(produto);
  return p === 'FIBRA COMBO' || p === 'MOVEL COMBO';
}

// Bloqueia um combo órfão de ENTRAR em estado operacional (decisão Ricardo
// 21/05/2026: REJEITAR, não criar automaticamente):
//   - Fibra Combo indo p/ status operacional SEM Móvel vinculado ATIVO → erro.
//   - Móvel Combo indo p/ status operacional SEM Fibra mãe ATIVA → erro.
// Dispara só numa "entrada nova" como combo operacional — qualquer um destes:
//   (a) status entrando em operacional (não-op → op);              [INV-01]
//   (b) produto virando combo (Alone → Combo) já em operacional.    [INV-03]
// Combos legados JÁ operacionais E combo não são re-bloqueados em edições de
// outros campos — esses são tratados pela tela Vínculos Pendentes + alerta no
// sino (§6.4). Reutiliza o conceito de "vínculo ativo" do
// _decorarVendaComVinculos_ (filhasPorMae/maePorFilha já filtram status ATIVO).
// Retorna null se OK ou string (toast) se inválido — mesmo padrão de
// _validarTransicaoStatusServer_. NÃO cria nem grava nada.
function _validarComboIntegridade_(produto, oldProduto, oldStatus, novoStatus, linha, opts) {
  opts = opts || {};
  if (!_comboEhCombo_(produto)) return null;                 // produto final não é combo
  if (!_statusExigeComboCompleto_(novoStatus)) return null;  // destino não-operacional: livre

  var entrandoOperacional = !_statusExigeComboCompleto_(oldStatus); // não-op → op
  var virandoCombo        = !_comboEhCombo_(oldProduto);            // Alone → Combo
  if (!entrandoOperacional && !virandoCombo) return null;   // legado já op+combo: não re-bloqueia

  var linhaNum = parseInt(linha, 10);
  if (isNaN(linhaNum)) return null; // sem linha resolvida (cadastro novo é atômico à parte)

  var mapa = opts.vinculosMap || _getVinculosVendasMap_();

  if (_normalizarTexto(produto) === 'FIBRA COMBO') {
    var filhas = (mapa.filhasPorMae && mapa.filhasPorMae[linhaNum]) || [];
    if (!filhas.length) {
      return '⚠️ Combo sem Móvel vinculado: cadastre o Móvel antes de mover esta Fibra Combo para "' + novoStatus + '". Use "Duplicar para Móvel" no painel lateral ou a tela Vínculos Pendentes.';
    }
  } else { // MOVEL COMBO
    var mae = mapa.maePorFilha && mapa.maePorFilha[linhaNum];
    if (!mae) {
      return '⚠️ Móvel Combo sem Fibra mãe vinculada: vincule à Fibra antes de mover para "' + novoStatus + '".';
    }
  }
  return null;
}

function _validarTransicaoStatusServer_(oldStatus, newStatus, campos) {
  campos = campos || {};
  var old = String(oldStatus || '').trim();
  var nov = String(newStatus || '').trim();
  if (nov === old) return null;

  // Transição para 2 — exige dataAtiv + contrato + agenda + turno
  if (nov === '2- Aguardando Instalação') {
    if (!String(campos.dataAtiv || '').trim()) return 'Data de Ativação é obrigatória para mover para Aguardando Instalação.';
    if (!String(campos.contrato || '').trim()) return 'ID Contrato é obrigatório para mover para Aguardando Instalação.';
    if (!String(campos.agenda   || '').trim()) return 'Data de Agendamento é obrigatória para mover para Aguardando Instalação.';
    if (!String(campos.turno    || '').trim()) return 'Turno é obrigatório para mover para Aguardando Instalação.';
    var errContrato = _validarContratoFormatoBackend_(campos.contrato, campos.sistema);
    if (errContrato) return errContrato;
  }

  // Transição para 3 — precisa vir de 2 e ter instal
  if (nov === '3 - Finalizada/Instalada') {
    if (old !== '2- Aguardando Instalação') {
      return 'A venda precisa estar em "Aguardando Instalação" para ser finalizada.';
    }
    if (!String(campos.instal || '').trim()) return 'Data de Instalação é obrigatória para finalizar a venda.';
  }

  // ── Transições do fluxo Móvel (Sprint 3.3 — 12/05/2026) ──────────────────
  // Fluxo: 1- Conferencia/Ativação → 2- Aguardando Entrega → 3- Aguardando
  // Retirada → 4- Entregue → 5 - Finalizado. Único campo exigido é o ID
  // Contrato do Móvel ao mover para "Aguardando Retirada" (operação real).
  if (nov === '3- Aguardando Retirada') {
    if (!String(campos.contrato || '').trim()) {
      return 'ID Contrato do Móvel é obrigatório para mover para Aguardando Retirada.';
    }
  }

  return null;
}

// Sprint 2 — validação server-side do contrato (NG/Adapter). Espelha a
// _validarContratoFormato do frontend; é chamada em salvarVenda apenas em
// transições para status 2 ou 3 (onde o ID precisa ser operacional).
// Retorna null se válido, string com mensagem de erro se inválido.
function _validarContratoFormatoBackend_(valor, sistema) {
  if (!valor) return null;
  var v = String(valor).trim();
  if (!/^\d+$/.test(v)) return 'ID Contrato inválido. Use apenas números.';
  var sis = String(sistema || '').toUpperCase();
  var msgErro = 'ID Contrato inválido. Use: NG (9 dígitos começando com 202) ou Adapter (7 dígitos começando com 3).';
  if (sis.indexOf('NG') > -1)      return /^202\d{6}$/.test(v) ? null : msgErro;
  if (sis.indexOf('ADAPTER') > -1) return /^3\d{6}$/.test(v)   ? null : msgErro;
  return (/^202\d{6}$/.test(v) || /^3\d{6}$/.test(v)) ? null : msgErro;
}

function _construirLinhaDados(d) {
  var linha = new Array(CONFIG.TOTAL_COLUNAS).fill('');
  var c = CONFIG.COLUNAS;

  // Auto-fill Sistema/Segmentação: se cidade está preenchida mas sistema OU
  // segmentação estão vazios, buscar via _getCidades(). Idempotente (não
  // sobrescreve valores já preenchidos). Garante que QUALQUER caminho de
  // gravação (doPost/Botconversa, criarVendaMovelVinculada, salvarVenda,
  // moverVendaFunil etc) produza vendas com esses campos.
  var cidadeRaw = String(d.cidade || '').trim();
  if (cidadeRaw) {
    var sisRaw = String(d.sistema || '').trim();
    var segRaw = String(d.segmentacao || '').trim();
    if (!sisRaw || !segRaw) {
      try {
        if (!sisRaw)  d.sistema     = getSistemaPorCidade(cidadeRaw)     || '';
        if (!segRaw)  d.segmentacao = getSegmentacaoPorCidade(cidadeRaw) || '';
      } catch (eAuto) {
        Logger.log('Auto-fill sistema/segmentacao falhou: ' + (eAuto && eAuto.message || eAuto));
      }
    }
  }

  linha[c.CANAL]       = d.canal       || '';
  linha[c.PRODUTO]     = d.produto     || '';
  linha[c.STATUS]      = d.status      || '';
  // Datas: normalizadas no servidor para DD/MM/YYYY independente de como vieram
  // (Date object do MMC, ISO YYYY-MM-DD do MS2/MS3, ou DD/MM/YYYY do PIF).
  linha[c.DATA_ATIV]   = _formatarDataNascimento(d.dataAtiv, 'dd/MM/yyyy');
  linha[c.COD_CLI]     = d.codCli      || '';
  linha[c.CONTRATO]    = d.contrato    || '';
  linha[c.AGENDA]      = _formatarDataNascimento(d.agenda, 'dd/MM/yyyy');
  linha[c.TURNO]       = d.turno       || '';
  linha[c.INSTAL]      = _formatarDataNascimento(d.instal, 'dd/MM/yyyy');
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
  // Sprint 3 (12/05/2026): FAT (col Q) liberada — fonte da verdade agora é
  // FORMA_PAGAMENTO (col AT). Não gravamos mais nada aqui. A coluna pode
  // ser limpa manualmente e reutilizada para outro dado.
  // linha[c.FAT] = d.fat || '';
  linha[c.PLANO]       = d.plano       || '';
  linha[c.VALOR]       = _normalizarValorParaNumero_(d.valor);
  linha[c.LINHA_MOVEL]   = d.linhaMovel    || '';
  linha[c.PORTABILIDADE] = d.portabilidade || '';
  linha[c.PRE_STATUS]        = d.preStatus        || '';
  linha[c.RG]                = d.rg                || '';
  linha[c.NOME_MAE]          = d.nomeMae           || '';
  linha[c.DT_NASC]           = _formatarDataNascimento(d.dtNasc, 'dd/MM/yyyy');
  linha[c.SEGMENTACAO]       = d.segmentacao       || '';
  linha[c.REAGENDAMENTOS]    = d.reagendamentos    || '';
  linha[c.VEROHUB]           = d.verohub           || '';
  linha[c.STATUS_PAP]        = d.statusPAP         || 'Em Aberto';
  linha[c.VEROHUB_PEDIDO]    = d.verohubPedido     || '';
  linha[c.VEROHUB_PEDIDO_DT] = d.verohubPedidoDt   || '';
  // BC_TAGS / BC_STATUS removidos em 19/05/2026 (Performance Lista).
  // As colunas existem mas não são mais preenchidas. Serão removidas na Fase 6b.
  linha[c.VIABILIDADE]       = d.viabilidade       || '';
  linha[c.CRIADO_EM]         = d.criadoEm          || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  linha[c.VERO_STATUS]       = d.veroStatus         || '';
  linha[c.CRIADO_POR]        = d.criadoPor          || '';
  // AT = FORMA_PAGAMENTO: 'BOLETO' | 'RECORRENTE' | '' (legado vazio até ser editado)
  linha[c.FORMA_PAGAMENTO]   = d.formaPagamento    || '';

  // ── Bloco 7: Financeiro (AU-BL) — Módulo Financeiro Fase 3 (§5) ──────────────
  // SNAPSHOTS (COD_PLANO/PONTOS/MES): computados de forma IDEMPOTENTE — só quando
  // vazios. Em edição, o merge (_mesclarDadosVendaComLinhaAtual_) traz o valor
  // atual em d.*, então NÃO recomputa (preserva o snapshot original — §5). Em
  // cadastro novo, d.* vem vazio e calcula. Mesmo padrão do auto-fill de Sistema.
  var codPlanoF = String(d.codPlano || '').trim();
  if (!codPlanoF && d.plano && d.cidade) {
    try { codPlanoF = getCodigoVeroPorPlanoCidade(d.plano, d.cidade) || ''; } catch (eC) {}
  }
  linha[c.COD_PLANO] = codPlanoF;

  var pontosBlF = (d.pontosVenda === undefined || d.pontosVenda === '' || d.pontosVenda === null) ? '' : d.pontosVenda;
  var pontosMvF = (d.pontosMovel === undefined || d.pontosMovel === '' || d.pontosMovel === null) ? '' : d.pontosMovel;
  if ((pontosBlF === '' || pontosMvF === '') && codPlanoF) {
    try {
      var ppF = getPontuacaoVenda(codPlanoF, d.segmentacao);
      if (ppF && ppF.encontrado) {
        if (pontosBlF === '') pontosBlF = ppF.pontos_bl;
        if (pontosMvF === '') pontosMvF = ppF.pontos_movel;
      }
    } catch (eP) {}
  }
  // Anti-dupla-contagem (§2.2): a Móvel COMBO é filha de uma Fibra Combo, cuja
  // linha (movel_vinculado no pontuacao_planos.json) já carrega os pontos do móvel.
  // Então a linha da Móvel Combo NÃO grava pontos — senão o combo conta 2× na
  // projeção. Fibra (alone/combo) e Móvel ALONE (standalone) mantêm seus pontos.
  if (_normalizarTexto(d.produto) === 'MOVEL COMBO') {
    linha[c.PONTOS_VENDA] = '';
    linha[c.PONTOS_MOVEL] = '';
  } else {
    linha[c.PONTOS_VENDA] = pontosBlF;
    linha[c.PONTOS_MOVEL] = pontosMvF;
  }

  var mesCompF = String(d.mesCompetencia || '').trim();
  if (!mesCompF && String(d.status || '').trim() === '3 - Finalizada/Instalada' && d.instal) {
    try {
      var dInsF = _parseDDMMYYYY_(_formatarDataNascimento(d.instal, 'dd/MM/yyyy'));
      if (dInsF && !isNaN(dInsF)) mesCompF = Utilities.formatDate(dInsF, Session.getScriptTimeZone(), 'yyyy-MM');
    } catch (eM) {}
  }
  linha[c.MES_COMPETENCIA] = mesCompF;

  // LIVE (import extrato/inadimplência/SAFRA): nunca gravadas pelo formulário —
  // só preservadas do estado atual (que o merge trouxe em d.*). Cadastro novo = ''.
  linha[c.ESTRELAS_NO_MES]       = d.estrelasNoMes       || '';
  linha[c.FATOR_APLICADO]        = (d.fatorAplicado      === undefined || d.fatorAplicado      === null) ? '' : d.fatorAplicado;
  linha[c.RECEITA_PREVISTA]      = (d.receitaPrevista    === undefined || d.receitaPrevista    === null) ? '' : d.receitaPrevista;
  linha[c.RECEITA_REALIZADA]     = (d.receitaRealizada   === undefined || d.receitaRealizada   === null) ? '' : d.receitaRealizada;
  linha[c.STATUS_ADIMPL_90D]     = d.statusAdimpl90d     || '';
  linha[c.STATUS_CHURN]          = d.statusChurn         || '';
  linha[c.STATUS_SUSPENSAO]      = d.statusSuspensao     || '';
  linha[c.FAIXA_RISCO]           = (d.faixaRisco         === undefined || d.faixaRisco         === null) ? '' : d.faixaRisco;
  linha[c.NEVER_PAID]            = (d.neverPaid          === undefined || d.neverPaid          === null) ? '' : d.neverPaid;
  linha[c.AGING_DIAS]            = (d.agingDias          === undefined || d.agingDias          === null) ? '' : d.agingDias;
  linha[c.ULTIMO_REFRESH_RISCO]  = d.ultimoRefreshRisco  || '';
  linha[c.ORIGEM_CONTRATO_VERO]  = d.origemContratoVero  || '';
  linha[c.MES_REF_VENDA]         = d.mesRefVenda         || '';
  linha[c.CLASSIFICACAO_CLUSTER] = d.classificacaoCluster|| '';
  return linha;
}

function _mesclarDadosVendaComLinhaAtual_(dados, linhaAtual, numeroLinha) {
  var atual = _mapearLinha(linhaAtual, numeroLinha);
  var mesclado = {};
  Object.keys(atual).forEach(function(chave) {
    mesclado[chave] = atual[chave];
  });
  Object.keys(dados || {}).forEach(function(chave) {
    var valor = dados[chave];
    if (valor !== undefined) mesclado[chave] = valor;
  });
  mesclado.linhaReferencia = String(dados.linhaReferencia || numeroLinha || '');
  // CRIADO_POR é imutável após criação — preserva o autor original se já existir
  if (atual.criadoPor) {
    mesclado.criadoPor = atual.criadoPor;
  }
  return mesclado;
}

// Campos que pertencem ao "cliente + endereço + contato" e fazem sentido
// replicar entre as duas linhas de um combo. NÃO inclui status, produto, plano,
// valor, contrato, datas, portabilidade, linhaMovel — esses são próprios do Móvel.
var _COMBO_PROPAGAVEIS_ = [
  'cpf','cliente','whats','tel','nomeMae','dtNasc','rg',
  'cep','rua','num','complemento','bairro','cidade','uf','sistema','segmentacao',
  'venc','canal','resp',
  // Sprint 3 (12/05/2026): Forma de Pagamento entra no propagáveis; FAT
  // (legado) sai — sua coluna foi liberada e não é mais gravada.
  'formaPagamento'
];

function _propagarFibraParaMovelSeCombo_(sheet, linhaMae, dadosMae) {
  if (!linhaMae || linhaMae < 3) return;
  var produtoMae = _normalizarTexto(dadosMae && dadosMae.produto || '');
  if (produtoMae.indexOf('FIBRA') === -1) return; // só propaga quando origem é Fibra

  var vinculos = _getVinculosVendasMap_();
  var filhas = (vinculos && vinculos.filhasPorMae) ? (vinculos.filhasPorMae[linhaMae] || []) : [];
  if (!filhas.length) return;

  var ultimaLinha = sheet.getLastRow();
  for (var i = 0; i < filhas.length; i++) {
    var linhaFilha = parseInt(filhas[i].vendaFilhaLinha, 10);
    if (isNaN(linhaFilha) || linhaFilha < 3 || linhaFilha > ultimaLinha) continue;

    var rowFilha = sheet.getRange(linhaFilha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
    var filha = _mapearLinha(rowFilha, linhaFilha);
    if (_normalizarTexto(filha.produto || '').indexOf('MOVEL') === -1) continue; // só replica em Móvel

    // Constrói novo objeto: cópia da filha sobrescrita pelos campos compartilhados da mãe.
    var atualizado = {};
    Object.keys(filha).forEach(function(k) { atualizado[k] = filha[k]; });
    _COMBO_PROPAGAVEIS_.forEach(function(k) {
      if (Object.prototype.hasOwnProperty.call(dadosMae, k)) atualizado[k] = dadosMae[k];
    });

    var linhaDados = _construirLinhaDados(atualizado);
    sheet.getRange(linhaFilha, 1, 1, linhaDados.length).setValues([linhaDados]);
  }
}

function _getSheetVinculosVendas_(createIfMissing) {
  var ss = _getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.SHEET_VINCULOS_VENDAS);
  if (!sh && createIfMissing) {
    sh = ss.insertSheet(CONFIG.SHEET_VINCULOS_VENDAS);
    sh.getRange(1, 1, 1, 10).setValues([[
      'CriadoEm',
      'TipoVinculo',
      'VendaMaeLinha',
      'VendaFilhaLinha',
      'VendaMaeContrato',
      'VendaFilhaContrato',
      'Status',
      'Observacao',
      'VendaMaeCliente',
      'VendaFilhaCliente'
    ]]);
  }
  return sh;
}

// Performance (19/05/2026): cache do mapa de vínculos. TTL 300s, invalidado
// junto com o cache da Lista e ao registrar/arquivar vínculos.
var _VINCULOS_VENDAS_CACHE_KEY = 'vinculos_map_v1';

function _getVinculosVendasMap_() {
  // CACHE HIT
  var cachedMap = _cacheGetChunked(CONFIG.CACHE_PREFIX + _VINCULOS_VENDAS_CACHE_KEY);
  if (cachedMap && cachedMap.filhasPorMae && cachedMap.maePorFilha) {
    return cachedMap;
  }

  var sh = _getSheetVinculosVendas_(false);
  var mapa = { filhasPorMae: {}, maePorFilha: {} };
  if (sh && sh.getLastRow() >= 2) {
    var raw = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
    for (var i = 0; i < raw.length; i++) {
      var row = raw[i];
      var status = _normalizarTexto(row[6] || 'ATIVO');
      if (status && status !== 'ATIVO') continue;

      var maeLinha = parseInt(row[2], 10);
      var filhaLinha = parseInt(row[3], 10);
      if (isNaN(maeLinha) || isNaN(filhaLinha)) continue;

      var vinculo = {
        tipo: String(row[1] || '').trim(),
        vendaMaeLinha: maeLinha,
        vendaFilhaLinha: filhaLinha,
        vendaMaeContrato: String(row[4] || '').trim(),
        vendaFilhaContrato: String(row[5] || '').trim()
      };
      if (!mapa.filhasPorMae[maeLinha]) mapa.filhasPorMae[maeLinha] = [];
      mapa.filhasPorMae[maeLinha].push(vinculo);
      mapa.maePorFilha[filhaLinha] = vinculo;
    }
  }

  _mesclarVinculosLegadosInferidos_(mapa);

  // CACHE SET (TTL 300s — mesmo da Lista)
  try { _cachePutChunked(CONFIG.CACHE_PREFIX + _VINCULOS_VENDAS_CACHE_KEY, mapa, 300); }
  catch(eCache) { Logger.log('_getVinculosVendasMap_ cache erro: ' + eCache); }

  return mapa;
}

// Invalida cache do mapa de vínculos. Chamada quando vínculo é registrado/arquivado
// e dentro de _limparCacheListaV3 (sempre que a Lista é invalidada).
function _limparCacheVinculosVendas_() {
  try {
    var cache = CacheService.getScriptCache();
    var base  = CONFIG.CACHE_PREFIX + _VINCULOS_VENDAS_CACHE_KEY;
    var metaRaw = cache.get(base + '_meta');
    var keys = [base + '_meta'];
    if (metaRaw) {
      var meta = JSON.parse(metaRaw);
      if (meta && meta.chunks) {
        for (var i = 0; i < meta.chunks; i++) keys.push(base + '_' + i);
      }
    }
    cache.removeAll(keys);
  } catch(e) { Logger.log('_limparCacheVinculosVendas_ erro: ' + e); }
}

function _decorarVendaComVinculos_(venda, vinculosMap, mapaResumoVinculos) {
  var v = {};
  Object.keys(venda || {}).forEach(function(chave) {
    v[chave] = venda[chave];
  });
  vinculosMap = vinculosMap || { filhasPorMae: {}, maePorFilha: {} };
  mapaResumoVinculos = mapaResumoVinculos || {};

  var filhos = vinculosMap.filhasPorMae[v.linha] || [];
  var pai = vinculosMap.maePorFilha[v.linha] || null;
  var produtoNorm = _normalizarTexto(v.produto);

  // ── Seleciona a filha mais recente cujo produto contenha 'MOVEL' (evita entradas antigas/obsoletas)
  var melhorFilha = null;
  for (var _fi = filhos.length - 1; _fi >= 0; _fi--) {
    var _cand = filhos[_fi];
    var _resumoCand = mapaResumoVinculos[_cand.vendaFilhaLinha];
    if (_resumoCand && _normalizarTexto(_resumoCand.produto || '').indexOf('MOVEL') !== -1) {
      melhorFilha = _cand;
      break;
    }
  }
  // NÃO usar fallback genérico aqui: se nenhuma filha for Móvel, deixar sem
  // vínculo visual. Combo = Fibra + Móvel por definição. Caia o vínculo no
  // banco se estiver errado (mãe→Fibra), o card não deve agrupar 2 Fibras.
  v.vendaMovelLinha = melhorFilha ? melhorFilha.vendaFilhaLinha : '';
  v.temVendaMovelVinculada = filhos.length > 0;
  v.comboMovelPendente = (produtoNorm === 'FIBRA COMBO') && !v.temVendaMovelVinculada;
  v.vendaMaeLinha = pai ? pai.vendaMaeLinha : '';
  v.tipoVinculo = pai ? pai.tipo : (filhos.length ? filhos[filhos.length - 1].tipo : '');
  v.vendaMovelResumo = v.vendaMovelLinha ? (mapaResumoVinculos[v.vendaMovelLinha] || null) : null;
  v.vendaMaeResumo = v.vendaMaeLinha ? (mapaResumoVinculos[v.vendaMaeLinha] || null) : null;
  return v;
}

function _resumirVendaVinculada_(venda) {
  if (!venda) return null;
  return {
    linha:         venda.linha          || '',
    cliente:       venda.cliente        || '',
    produto:       venda.produto        || '',
    plano:         venda.plano          || '',
    valor:         venda.valor          || '',
    venc:          venda.venc           || '',
    fat:           venda.fat            || '',  // legado — manter até col Q ser repurposada
    formaPagamento:venda.formaPagamento || '',  // Sprint 3
    status:        venda.status         || '',
    preStatus:     venda.preStatus      || '',
    contrato:      venda.contrato       || '',
    linhaMovel:    venda.linhaMovel     || '',
    portabilidade: venda.portabilidade  || '',
    dataAtiv:      venda.dataAtiv       || '',
    agenda:        venda.agenda         || '',
    turno:         venda.turno          || '',
    instal:        venda.instal         || '',
    reagendamentos:venda.reagendamentos || 0
  };
}

function _mesclarVinculosLegadosInferidos_(mapa) {
  var cacheKey = CONFIG.CACHE_PREFIX + 'vinculos_legados_v1';
  var inferidos = _cacheGetChunked(cacheKey);
  if (!Array.isArray(inferidos) || !inferidos.length) return;

  for (var i = 0; i < inferidos.length; i++) {
    var vinculo = inferidos[i];
    var maeLinha = vinculo.vendaMaeLinha;
    var filhaLinha = vinculo.vendaFilhaLinha;
    if (!maeLinha || !filhaLinha) continue;
    if (mapa.maePorFilha[filhaLinha]) continue;
    if (!mapa.filhasPorMae[maeLinha]) mapa.filhasPorMae[maeLinha] = [];
    mapa.filhasPorMae[maeLinha].push(vinculo);
    mapa.maePorFilha[filhaLinha] = vinculo;
  }
}

function reconstruirCacheVinculosLegados() {
  var inferidos = _inferirVinculosLegados_(_getVinculosVendasMapSemLegado_());
  _cachePutChunked(CONFIG.CACHE_PREFIX + 'vinculos_legados_v1', inferidos, 21600);
  return {
    sucesso: true,
    total: inferidos.length,
    mensagem: inferidos.length + ' vínculo(s) legado(s) preparados em cache.'
  };
}

function _getVinculosVendasMapSemLegado_() {
  var sh = _getSheetVinculosVendas_(false);
  var mapa = { filhasPorMae: {}, maePorFilha: {} };
  if (!sh || sh.getLastRow() < 2) return mapa;

  var raw = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  for (var i = 0; i < raw.length; i++) {
    var row = raw[i];
    var status = _normalizarTexto(row[6] || 'ATIVO');
    if (status && status !== 'ATIVO') continue;

    var maeLinha = parseInt(row[2], 10);
    var filhaLinha = parseInt(row[3], 10);
    if (isNaN(maeLinha) || isNaN(filhaLinha)) continue;

    var vinculo = {
      tipo: String(row[1] || '').trim(),
      vendaMaeLinha: maeLinha,
      vendaFilhaLinha: filhaLinha,
      vendaMaeContrato: String(row[4] || '').trim(),
      vendaFilhaContrato: String(row[5] || '').trim()
    };
    if (!mapa.filhasPorMae[maeLinha]) mapa.filhasPorMae[maeLinha] = [];
    mapa.filhasPorMae[maeLinha].push(vinculo);
    mapa.maePorFilha[filhaLinha] = vinculo;
  }
  return mapa;
}

function _inferirVinculosLegados_(mapaAtual) {
  mapaAtual = mapaAtual || { filhasPorMae: {}, maePorFilha: {} };
  var sheet = _getSheet();
  var ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 3) return [];

  var totalLinhas = ultimaLinha - 2;
  var c = CONFIG.COLUNAS;
  var produtos = sheet.getRange(3, c.PRODUTO + 1, totalLinhas, 1).getValues();
  var cpfs = sheet.getRange(3, c.CPF + 1, totalLinhas, 1).getValues();
  var clientes = sheet.getRange(3, c.CLIENTE + 1, totalLinhas, 1).getValues();
  var whatsApps = sheet.getRange(3, c.WHATS + 1, totalLinhas, 1).getValues();
  var contratos = sheet.getRange(3, c.CONTRATO + 1, totalLinhas, 1).getValues();

  var fibrasPorChave = {};
  var moveisPorChave = {};

  for (var i = 0; i < totalLinhas; i++) {
    var linha = i + 3;
    if (mapaAtual.filhasPorMae[linha] || mapaAtual.maePorFilha[linha]) continue;

    var produtoNorm = _normalizarTexto(produtos[i][0]);
    var chave = _criarChaveLegadoCombo_(cpfs[i][0], whatsApps[i][0], clientes[i][0]);
    if (!chave) continue;

    var item = {
      linha: linha,
      contrato: String(contratos[i][0] || '').trim().replace(/\.0$/, '')
    };

    if (produtoNorm === 'FIBRA COMBO') {
      if (!fibrasPorChave[chave]) fibrasPorChave[chave] = [];
      fibrasPorChave[chave].push(item);
      continue;
    }

    if (produtoNorm.indexOf('MOVEL') !== -1) {
      if (!moveisPorChave[chave]) moveisPorChave[chave] = [];
      moveisPorChave[chave].push(item);
    }
  }

  var vinculos = [];
  Object.keys(fibrasPorChave).forEach(function(chave) {
    var fibras = fibrasPorChave[chave] || [];
    var moveis = moveisPorChave[chave] || [];
    if (fibras.length !== 1 || moveis.length !== 1) return;

    vinculos.push({
      tipo: 'COMBO_MOVEL_LEGADO',
      vendaMaeLinha: fibras[0].linha,
      vendaFilhaLinha: moveis[0].linha,
      vendaMaeContrato: fibras[0].contrato,
      vendaFilhaContrato: moveis[0].contrato
    });
  });

  return vinculos;
}

function _criarChaveLegadoCombo_(cpf, whats, cliente) {
  var cpfNorm = String(cpf || '').replace(/\D/g, '');
  var whatsNorm = String(whats || '').replace(/\D/g, '');
  var clienteNorm = _normalizarTexto(cliente || '');

  if (cpfNorm) return 'CPF:' + cpfNorm;
  if (whatsNorm && clienteNorm) return 'WPP:' + whatsNorm + '|CLI:' + clienteNorm;
  return '';
}

function _registrarVinculoVenda_(maeLinha, filhaLinha, tipo) {
  var sheetVendas = _getSheet();
  var rowMae = sheetVendas.getRange(maeLinha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
  var rowFilha = sheetVendas.getRange(filhaLinha, 1, 1, CONFIG.TOTAL_COLUNAS).getValues()[0];
  var c = CONFIG.COLUNAS;
  var sh = _getSheetVinculosVendas_(true);

  // ── Arquivar vínculos ATIVO anteriores para a mesma mãe ───────────────────
  //  Evita acúmulo de entradas obsoletas que causariam seleção errada da filha
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var existentes = sh.getRange(2, 1, lastRow - 1, 8).getValues();
    for (var ei = 0; ei < existentes.length; ei++) {
      if (_normalizarTexto(existentes[ei][6] || 'ATIVO') !== 'ATIVO') continue;
      if (parseInt(existentes[ei][2], 10) === maeLinha) {
        sh.getRange(ei + 2, 7).setValue('ARQUIVADO');
      }
    }
  }

  sh.appendRow([
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'),
    String(tipo || 'COMBO_MOVEL'),
    maeLinha,
    filhaLinha,
    String(rowMae[c.CONTRATO] || '').trim(),
    String(rowFilha[c.CONTRATO] || '').trim(),
    'ATIVO',
    '',
    String(rowMae[c.CLIENTE] || '').trim(),
    String(rowFilha[c.CLIENTE] || '').trim()
  ]);

  // Performance (19/05/2026): invalida cache de vínculos ao gravar novo
  _limparCacheVinculosVendas_();
}

// ── REPARO DE VÍNCULOS COMBO ──────────────────────────────────────────────
//  EXCEÇÃO PERMANENTE à convenção "reparar* → _arquivo.js": esta função fica
//  no Code.js de propósito porque o problema reincide (combos perdem o vínculo
//  na aba "Vinculos Vendas") e o Ricardo precisa dela sempre disponível no
//  dropdown do editor. NÃO mover para _arquivo.js em limpezas futuras.
//
//  Roda manualmente no editor Apps Script (sem trigger). Faz duas passagens:
//    1. Arquiva entradas ATIVO duplicadas em "Vinculos Vendas" (no máx. 1 ativo por mãe).
//    2. Para cada Fibra Combo sem Móvel vinculado, tenta inferir o par por
//       CPF ou WhatsApp (janela ±7 dias). Só vincula quando há EXATAMENTE 1
//       candidato livre — ambíguos e sem par só vão pro log, sem agir.
//  Ao final imprime o resumo no Logger e o retorna como texto.
// ─────────────────────────────────────────────────────────────────────────
function repararVinculosCombosOrfaos() {
  var sheet  = _getSheet();
  var shVinc = _getSheetVinculosVendas_(true);
  var c      = CONFIG.COLUNAS;
  var log    = [];

  // ── PASSAGEM 1: Limpar duplicatas em Vinculos Vendas ──────────────────
  var duplicatasArquivadas = 0;
  var lastVincRow = shVinc.getLastRow();
  if (lastVincRow >= 2) {
    var vincsRaw = shVinc.getRange(2, 1, lastVincRow - 1, 8).getValues();
    var ativosPorMae = {};
    for (var vi = 0; vi < vincsRaw.length; vi++) {
      if (_normalizarTexto(vincsRaw[vi][6] || 'ATIVO') !== 'ATIVO') continue;
      var mae = parseInt(vincsRaw[vi][2], 10);
      if (isNaN(mae)) continue;
      if (!ativosPorMae[mae]) ativosPorMae[mae] = [];
      ativosPorMae[mae].push(vi); // índice base-0; linha na sheet = vi + 2
    }
    var maesComDup = Object.keys(ativosPorMae);
    for (var mi = 0; mi < maesComDup.length; mi++) {
      var idxs = ativosPorMae[maesComDup[mi]];
      if (idxs.length <= 1) continue;
      // Manter o último (mais recente); arquivar os anteriores
      for (var ii = 0; ii < idxs.length - 1; ii++) {
        shVinc.getRange(idxs[ii] + 2, 7).setValue('ARQUIVADO');
        duplicatasArquivadas++;
      }
      log.push('🗂 Duplicatas arquivadas para mãe linha ' + maesComDup[mi] +
               ': ' + (idxs.length - 1) + ' entrada(s) obsoleta(s)');
    }
  }

  // ── PASSAGEM 2: Reconectar Fibra Combos sem Móvel vinculado ───────────
  // Recarrega o mapa com dados já limpos
  var vinculosMap = _getVinculosVendasMap_();

  var lastRow = sheet.getLastRow();
  if (lastRow < 3) {
    Logger.log('Nenhuma venda na planilha.');
    return 'Nenhuma venda.';
  }
  var raw = sheet.getRange(3, 1, lastRow - 2, CONFIG.TOTAL_COLUNAS).getValues();

  // Separar Fibra Combos e Móveis (ainda sem vínculo como filha)
  var fibraCombos = [];
  var moveisLivres = [];

  for (var ri = 0; ri < raw.length; ri++) {
    var row     = raw[ri];
    var lnum    = ri + 3;
    var produto = _normalizarTexto(row[c.PRODUTO] || '');
    if (!produto) continue;
    var cpf     = String(row[c.CPF]   || '').replace(/[^0-9]/g, '');
    var whats   = String(row[c.WHATS] || '').replace(/[^0-9]/g, '');
    var cliente = String(row[c.CLIENTE] || '').trim();
    var tsRaw   = row[c.CRIADO_EM];
    var ts      = (tsRaw instanceof Date) ? tsRaw.getTime() : (tsRaw ? new Date(tsRaw).getTime() : 0);

    if (produto === 'FIBRA COMBO') {
      fibraCombos.push({ linha: lnum, cpf: cpf, whats: whats, cliente: cliente, ts: ts });
    } else if (produto.indexOf('MOVEL') !== -1) {
      // Só considera Móvel que ainda não é filho de ninguém
      if (!vinculosMap.maePorFilha[lnum]) {
        moveisLivres.push({ linha: lnum, cpf: cpf, whats: whats, cliente: cliente, ts: ts });
      }
    }
  }

  var jaOk = 0, vinculados = 0, ambiguos = 0, semPar = 0;

  for (var fi = 0; fi < fibraCombos.length; fi++) {
    var fibra = fibraCombos[fi];

    // Verifica se já existe vínculo válido com um Móvel
    var filhos = vinculosMap.filhasPorMae[fibra.linha] || [];
    var temMovelValido = false;
    for (var fj = 0; fj < filhos.length; fj++) {
      var fIdx = filhos[fj].vendaFilhaLinha - 3;
      if (fIdx >= 0 && fIdx < raw.length &&
          _normalizarTexto(raw[fIdx][c.PRODUTO] || '').indexOf('MOVEL') !== -1) {
        temMovelValido = true;
        break;
      }
    }
    if (temMovelValido) { jaOk++; continue; }

    // Procurar candidatos: mesmo CPF ou mesmo WhatsApp + Móvel criado até 24h depois
    var candidatos = [];
    for (var mj = 0; mj < moveisLivres.length; mj++) {
      var movel = moveisLivres[mj];
      var matchCpf   = fibra.cpf.length   >= 11 && fibra.cpf   === movel.cpf;
      var matchWhats = fibra.whats.length >=  8 && fibra.whats === movel.whats;
      if (!matchCpf && !matchWhats) continue;
      // Filtro temporal: |Móvel - Fibra| ≤ 7 dias em qualquer direção.
      // Móvel pode ser criado ANTES da Fibra (cliente pega chip primeiro,
      // depois fecha a Fibra) ou DEPOIS (fluxo padrão criarVendaMovelVinculada).
      // 7 dias dá folga para negociações longas sem permitir falsos positivos
      // em clientes recorrentes (cuja correspondência seria múltipla → "ambíguo").
      if (fibra.ts && movel.ts) {
        var diff = Math.abs(movel.ts - fibra.ts);
        if (diff > 7 * 86400000) continue;
      }
      candidatos.push(movel);
    }

    if (candidatos.length === 0) {
      semPar++;
      log.push('⚠️  Sem par:    linha ' + fibra.linha + ' — ' + fibra.cliente);
    } else if (candidatos.length > 1) {
      ambiguos++;
      log.push('❓ Ambíguo:    linha ' + fibra.linha + ' — ' + fibra.cliente +
               ' (' + candidatos.length + ' candidatos — verificar manualmente)');
    } else {
      // Exatamente 1 candidato: vincular
      var alvo = candidatos[0];
      _registrarVinculoVenda_(fibra.linha, alvo.linha, 'COMBO_MOVEL');
      vinculados++;
      log.push('✅ Vinculado:  linha ' + fibra.linha + ' (' + fibra.cliente +
               ') → Móvel linha ' + alvo.linha);
      // Atualiza mapa local para não reutilizar este Móvel em outro Fibra
      vinculosMap.maePorFilha[alvo.linha] = { vendaMaeLinha: fibra.linha, vendaFilhaLinha: alvo.linha };
      if (!vinculosMap.filhasPorMae[fibra.linha]) vinculosMap.filhasPorMae[fibra.linha] = [];
      vinculosMap.filhasPorMae[fibra.linha].push({ vendaFilhaLinha: alvo.linha, vendaMaeLinha: fibra.linha });
    }
  }

  if (vinculados > 0) _limparCache();

  var resumo = [
    '════════════════════════════════',
    '  repararVinculosCombosOrfaos   ',
    '════════════════════════════════',
    'Duplicatas arquivadas : ' + duplicatasArquivadas,
    'Já OK (sem ação)      : ' + jaOk,
    'Vínculos criados      : ' + vinculados,
    'Ambíguos (manual)     : ' + ambiguos,
    'Sem par encontrado    : ' + semPar,
    '────────────────────────────────'
  ].concat(log);

  resumo.forEach(function(l) { Logger.log(l); });
  return resumo.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════
//  VÍNCULOS PENDENTES — triagem manual de combos órfãos no CRM (admin only)
//  Página que lista Fibra Combos sem Móvel vinculado e deixa o operador
//  aprovar o par certo (quando há candidatos) ou ignorar (sem combo móvel).
//  Complementa repararVinculosCombosOrfaos, que só religa o caso de 1 candidato.
// ══════════════════════════════════════════════════════════════════════════

var _VINCULOS_IGNORADOS_PROP = 'VINCULOS_PENDENTES_IGNORADOS';

// Conjunto de linhas-mãe (Fibra Combo) marcadas como "revisadas, sem combo móvel".
// Retorna um objeto { linha: true } para lookup O(1).
function _getVinculosIgnorados_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_VINCULOS_IGNORADOS_PROP);
    if (!raw) return {};
    var arr = JSON.parse(raw);
    var set = {};
    (arr || []).forEach(function(l) { var n = parseInt(l, 10); if (!isNaN(n)) set[n] = true; });
    return set;
  } catch (e) {
    Logger.log('_getVinculosIgnorados_ erro: ' + e);
    return {};
  }
}

function _setVinculoIgnorado_(maeLinha, ignorar) {
  var n = parseInt(maeLinha, 10);
  if (isNaN(n)) return;
  var set = _getVinculosIgnorados_();
  if (ignorar) set[n] = true; else delete set[n];
  PropertiesService.getScriptProperties()
    .setProperty(_VINCULOS_IGNORADOS_PROP, JSON.stringify(Object.keys(set).map(Number)));
}

// Injeta a página VinculosPendentes.html no CRM (mesmo padrão de getUsuariosHtml).
function getVinculosPendentesHtml() {
  return HtmlService.createHtmlOutputFromFile('VinculosPendentes').getContent();
}

// Lista Fibra Combos sem Móvel vinculado, agrupados por terem ou não candidatos.
// Mesma heurística de pareamento da passagem 2 de repararVinculosCombosOrfaos
// (mesmo CPF/WhatsApp, janela ±7 dias), mas SEM agir — só devolve pro frontend.
function getVinculosPendentes(adminUsuario) {
  _assertAdmin_(adminUsuario);

  var sheet = _getSheet();
  var c = CONFIG.COLUNAS;
  var tz = Session.getScriptTimeZone();
  var ignorados = _getVinculosIgnorados_();
  var resultado = {
    comCandidatos: [],
    semPar: [],
    totalJaOk: 0,
    totalIgnorados: Object.keys(ignorados).length,
    geradoEm: Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm')
  };

  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return resultado;

  var raw = sheet.getRange(3, 1, lastRow - 2, CONFIG.TOTAL_COLUNAS).getValues();
  var vinculosMap = _getVinculosVendasMap_();

  function fmtTs(ts) { return ts ? Utilities.formatDate(new Date(ts), tz, 'dd/MM/yyyy') : ''; }

  function lerItem(row, lnum) {
    var tsRaw = row[c.CRIADO_EM];
    var ts = (tsRaw instanceof Date) ? tsRaw.getTime() : (tsRaw ? new Date(tsRaw).getTime() : 0);
    return {
      linha:    lnum,
      cliente:  String(row[c.CLIENTE] || '').trim(),
      cpf:      String(row[c.CPF]   || '').replace(/[^0-9]/g, ''),
      whats:    String(row[c.WHATS] || '').replace(/[^0-9]/g, ''),
      plano:    String(row[c.PLANO] || '').trim(),
      contrato: String(row[c.CONTRATO] || '').trim(),
      valor:    String(row[c.VALOR] || '').trim(),
      status:   String(row[c.STATUS] || '').trim(),
      ts:       ts,
      criadoEm: fmtTs(ts)
    };
  }

  // Separa Fibra Combos e Móveis ainda sem vínculo como filha.
  var fibraCombos = [];
  var moveisLivres = [];
  for (var ri = 0; ri < raw.length; ri++) {
    var row = raw[ri];
    var lnum = ri + 3;
    var produto = _normalizarTexto(row[c.PRODUTO] || '');
    if (!produto) continue;
    if (produto === 'FIBRA COMBO') {
      fibraCombos.push(lerItem(row, lnum));
    } else if (produto.indexOf('MOVEL') !== -1) {
      if (!vinculosMap.maePorFilha[lnum]) moveisLivres.push(lerItem(row, lnum));
    }
  }

  for (var fi = 0; fi < fibraCombos.length; fi++) {
    var fibra = fibraCombos[fi];
    if (ignorados[fibra.linha]) continue; // já revisado manualmente

    // Já tem um Móvel válido vinculado?
    var filhos = vinculosMap.filhasPorMae[fibra.linha] || [];
    var temMovel = false;
    for (var fj = 0; fj < filhos.length; fj++) {
      var fIdx = filhos[fj].vendaFilhaLinha - 3;
      if (fIdx >= 0 && fIdx < raw.length &&
          _normalizarTexto(raw[fIdx][c.PRODUTO] || '').indexOf('MOVEL') !== -1) {
        temMovel = true; break;
      }
    }
    if (temMovel) { resultado.totalJaOk++; continue; }

    // Candidatos: mesmo CPF (>=11) ou WhatsApp (>=8), janela ±7 dias.
    var candidatos = [];
    for (var mj = 0; mj < moveisLivres.length; mj++) {
      var movel = moveisLivres[mj];
      var matchCpf   = fibra.cpf.length   >= 11 && fibra.cpf   === movel.cpf;
      var matchWhats = fibra.whats.length >=  8 && fibra.whats === movel.whats;
      if (!matchCpf && !matchWhats) continue;
      var deltaDias = '';
      if (fibra.ts && movel.ts) {
        var diff = Math.abs(movel.ts - fibra.ts);
        if (diff > 7 * 86400000) continue;
        deltaDias = Math.round(diff / 86400000);
      }
      candidatos.push({
        linha:    movel.linha,
        cliente:  movel.cliente,
        plano:    movel.plano,
        contrato: movel.contrato,
        valor:    movel.valor,
        status:   movel.status,
        criadoEm: movel.criadoEm,
        matchPor: matchCpf ? 'CPF' : 'WhatsApp',
        deltaDias: deltaDias
      });
    }

    var fibraOut = {
      linha:    fibra.linha,
      cliente:  fibra.cliente,
      cpf:      fibra.cpf,
      whats:    fibra.whats,
      plano:    fibra.plano,
      contrato: fibra.contrato,
      valor:    fibra.valor,
      status:   fibra.status,
      criadoEm: fibra.criadoEm
    };

    if (candidatos.length === 0) {
      resultado.semPar.push({ fibra: fibraOut });
    } else {
      resultado.comCandidatos.push({ fibra: fibraOut, candidatos: candidatos });
    }
  }

  return resultado;
}

// Aprova um pareamento Fibra Combo → Móvel escolhido pelo operador.
function aprovarVinculoCombo(adminUsuario, maeLinha, filhaLinha) {
  _assertAdmin_(adminUsuario);
  var mae   = parseInt(maeLinha, 10);
  var filha = parseInt(filhaLinha, 10);
  if (isNaN(mae) || isNaN(filha)) return { ok: false, mensagem: 'Linhas inválidas.' };

  var sheet  = _getSheet();
  var c      = CONFIG.COLUNAS;
  var ultima = sheet.getLastRow();
  if (mae < 3 || mae > ultima || filha < 3 || filha > ultima) {
    return { ok: false, mensagem: 'Linha fora do intervalo da planilha.' };
  }

  var prodMae   = _normalizarTexto(sheet.getRange(mae,   c.PRODUTO + 1).getValue() || '');
  var prodFilha = _normalizarTexto(sheet.getRange(filha, c.PRODUTO + 1).getValue() || '');
  if (prodMae !== 'FIBRA COMBO') return { ok: false, mensagem: 'A linha mãe não é Fibra Combo.' };
  if (prodFilha.indexOf('MOVEL') === -1) return { ok: false, mensagem: 'A linha filha não é uma venda Móvel.' };

  // Impede reaproveitar um Móvel que já é filho de outra Fibra.
  var vinculosMap = _getVinculosVendasMap_();
  var paiExistente = vinculosMap.maePorFilha[filha];
  if (paiExistente && parseInt(paiExistente.vendaMaeLinha, 10) !== mae) {
    return { ok: false, mensagem: 'Esse Móvel (linha ' + filha + ') já está vinculado à Fibra linha ' + paiExistente.vendaMaeLinha + '.' };
  }

  _registrarVinculoVenda_(mae, filha, 'COMBO_MOVEL'); // já arquiva ativos anteriores da mãe + invalida cache de vínculos
  _setVinculoIgnorado_(mae, false); // se estava ignorada, deixa de estar
  _limparCache();
  return { ok: true, mensagem: 'Vínculo criado: Fibra linha ' + mae + ' → Móvel linha ' + filha + '.' };
}

// Marca uma Fibra Combo como revisada sem combo móvel — some da lista de pendentes.
function ignorarVinculoPendente(adminUsuario, maeLinha) {
  _assertAdmin_(adminUsuario);
  var mae = parseInt(maeLinha, 10);
  if (isNaN(mae)) return { ok: false, mensagem: 'Linha inválida.' };
  _setVinculoIgnorado_(mae, true);
  return { ok: true, mensagem: 'Marcada como revisada (sem combo móvel). Não aparece mais na lista.' };
}

function _extrairValorDoPlano_(plano) {
  var texto = String(plano || '');
  var match = texto.match(/R\$\s*([\d\.,]+)/i);
  return match ? ('R$ ' + match[1].trim()) : '';
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
      if (typeof v === 'string' && v.trim()) {
        var s = v.trim();
        // DD/MM/YYYY
        var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
        // YYYY-MM-DD (ISO)
        var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
      }
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
      // Lê VALOR com suporte a formato BR ("R$ 89,90" ou "89,90") e fallback no nome do plano
      var _valorRaw = row[c.VALOR];
      var valor = 0;
      if (typeof _valorRaw === 'number' && _valorRaw > 0) {
        valor = _valorRaw;
      } else if (_valorRaw) {
        var _vs = String(_valorRaw).replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.').trim();
        valor = parseFloat(_vs) || 0;
      }
      if (!valor && plano) {
        var _mp = String(plano).match(/R\$\s*([\d\.,]+)/i);
        if (_mp) valor = parseFloat(_mp[1].replace(/\./g, '').replace(',', '.')) || 0;
      }
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
          ticketSoma += valor;
          if (valor > 0) ticketQtd++; // só conta denominador quando há preço real
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

function getDispPessoalHtml() {
  return HtmlService.createHtmlOutputFromFile('DispPessoal').getContent();
}

// getViabilidadeHtml() vive em ViabilidadeAPI.js (Sprint 3 — feature flag VIABILIDADE_ATIVO em Script Properties)

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

    // disparo-grupo: cooldown one-way contra auto-fire recente (≤5min).
    // Mostra banner amarelo no topo do modal; operador decide se manda mesmo.
    var bannerCooldown = '';
    try {
      var iso = PropertiesService.getScriptProperties().getProperty('ultimoEnvioParcialAuto');
      if (iso) {
        var ms = new Date(iso).getTime();
        if (!isNaN(ms)) {
          var diff = hoje.getTime() - ms;
          if (diff >= 0 && diff < 5 * 60 * 1000) {
            var segs = Math.round(diff / 1000);
            bannerCooldown = '<div style="background:#3d2f0a;color:#ffd166;border:1px solid #8a6d1f;padding:10px 12px;border-radius:6px;margin-bottom:10px;font-size:12px;line-height:1.4;">' +
              '⏱️ Uma parcial automática foi enviada há ' + segs + 's. ' +
              'Confirme se quer reenviar (basta copiar e colar como faz normalmente).</div>';
          }
        }
      }
    } catch (eCd) { Logger.log('cooldown parcial: ' + eCd.message); }

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

    return bannerCooldown + '<pre id="texto" style="white-space:pre-wrap;font-size:13px;line-height:1.6;font-family:monospace;background:var(--surface2,#1e1e2e);color:var(--text,#cdd6f4);padding:12px;border-radius:6px;border:1px solid var(--border,#313244);">' + mensagem.trim() + '</pre>'
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

// ══════════════════════════════════════════════════════════════════════════════
// ASSERTIVA LOCALIZE — Consulta cadastral por CPF
// Docs: https://integracao.assertivasolucoes.com.br/v3/doc/
// ══════════════════════════════════════════════════════════════════════════════

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


// ══════════════════════════════════════════════════════════════════════════════
//  GERENCIAR USUÁRIOS — API do painel admin
// ══════════════════════════════════════════════════════════════════════════════

// Verifica se adminUsuario é admin. Lança erro se não for.
function _assertAdmin_(adminUsuario) {
  var u     = String(adminUsuario || '').trim().toLowerCase();
  var lista = _getUsuariosSheet_();
  if (!lista || lista.length === 0) lista = USUARIOS;
  var match = lista.filter(function(r) {
    return String(r.usuario).trim().toLowerCase() === u && r.ativo !== false;
  });
  if (!match.length || match[0].perfil !== 'admin') {
    throw new Error('Acesso negado: apenas administradores podem executar esta ação.');
  }
}

// Retorna lista de usuários sem senhaHash (apenas para admin).
function getUsuarios(adminUsuario) {
  try {
    _assertAdmin_(adminUsuario);
    var lista = _getUsuariosSheet_();
    if (!lista || lista.length === 0) {
      lista = USUARIOS.map(function(u) {
        return { usuario: u.usuario, nome: u.nome, perfil: u.perfil, foto: u.foto || '', ativo: true };
      });
    }
    return lista.map(function(u) {
      return { usuario: u.usuario, nome: u.nome, perfil: u.perfil, foto: u.foto, ativo: u.ativo !== false };
    });
  } catch(e) {
    Logger.log('getUsuarios erro: ' + e.message);
    return { erro: e.message };
  }
}

// Cria ou atualiza um usuário na planilha.
// dados = { usuario, nome, perfil, foto?, ativo?, senhaInicial? }
function salvarUsuario(adminUsuario, dados) {
  try {
    _assertAdmin_(adminUsuario);
    if (!dados || !dados.usuario || !dados.nome || !dados.perfil) {
      return { ok: false, mensagem: 'Campos obrigatórios ausentes.' };
    }
    if (['admin','supervisor','backoffice'].indexOf(dados.perfil) === -1) {
      return { ok: false, mensagem: 'Perfil inválido.' };
    }
    var ss    = _getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.SHEET_USUARIOS);
    if (!sheet) return { ok: false, mensagem: 'Aba Usuarios não encontrada. Execute migrarUsuariosParaSheet primeiro.' };

    var uKey    = String(dados.usuario).trim().toLowerCase();
    var lastRow = sheet.getLastRow();
    var existingRow = -1;

    if (lastRow >= 2) {
      var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < colA.length; i++) {
        if (String(colA[i][0]).trim().toLowerCase() === uKey) {
          existingRow = i + 2;
          break;
        }
      }
    }

    var novoHash = '';
    if (existingRow > 0) {
      novoHash = sheet.getRange(existingRow, 2).getValue() || '';
    } else if (dados.senhaInicial) {
      novoHash = _sha256(dados.senhaInicial);
    }

    var rowData = [
      dados.usuario,
      novoHash,
      dados.nome,
      dados.perfil,
      dados.foto || '',
      dados.ativo !== false
    ];

    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, 6).setValues([rowData]);
      return { ok: true, mensagem: 'Usuário atualizado com sucesso.' };
    } else {
      sheet.appendRow(rowData);
      return { ok: true, mensagem: 'Usuário criado com sucesso.' };
    }
  } catch(e) {
    Logger.log('salvarUsuario erro: ' + e.message);
    return { ok: false, mensagem: e.message };
  }
}

// Ativa ou desativa um usuário na planilha.
function toggleAtivoUsuario(adminUsuario, usuarioAlvo, ativo) {
  try {
    _assertAdmin_(adminUsuario);
    var ss    = _getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.SHEET_USUARIOS);
    if (!sheet) return { ok: false, mensagem: 'Aba Usuarios não encontrada.' };

    var uKey    = String(usuarioAlvo).trim().toLowerCase();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, mensagem: 'Nenhum usuário encontrado.' };

    var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < colA.length; i++) {
      if (String(colA[i][0]).trim().toLowerCase() === uKey) {
        sheet.getRange(i + 2, 6).setValue(ativo === true);
        return { ok: true, mensagem: 'Status atualizado.' };
      }
    }
    return { ok: false, mensagem: 'Usuário não encontrado.' };
  } catch(e) {
    Logger.log('toggleAtivoUsuario erro: ' + e.message);
    return { ok: false, mensagem: e.message };
  }
}

// Redefine a senha de um usuário (admin pode redefinir qualquer um).
// Grava em PropertiesService (prioridade no login) e atualiza coluna B da planilha.
function resetarSenha(adminUsuario, usuarioAlvo, novaSenha) {
  try {
    _assertAdmin_(adminUsuario);
    if (!novaSenha || novaSenha.length < 6) {
      return { ok: false, mensagem: 'A senha deve ter ao menos 6 caracteres.' };
    }
    var u        = String(usuarioAlvo).trim().toLowerCase();
    var novoHash = _sha256(novaSenha);
    PropertiesService.getScriptProperties().setProperty('pwd_' + u, novoHash);

    // Atualiza coluna B na planilha para manter consistência
    var ss    = _getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.SHEET_USUARIOS);
    if (sheet && sheet.getLastRow() >= 2) {
      var colA = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < colA.length; i++) {
        if (String(colA[i][0]).trim().toLowerCase() === u) {
          sheet.getRange(i + 2, 2).setValue(novoHash);
          break;
        }
      }
    }
    return { ok: true, mensagem: 'Senha redefinida com sucesso.' };
  } catch(e) {
    Logger.log('resetarSenha erro: ' + e.message);
    return { ok: false, mensagem: e.message };
  }
}

// Remove um usuário da aba Usuarios. Não permite excluir o próprio admin logado.
function excluirUsuario(adminUsuario, usuarioAlvo) {
  try {
    _assertAdmin_(adminUsuario);
    var uAdmin = String(adminUsuario).trim().toLowerCase();
    var uAlvo  = String(usuarioAlvo).trim().toLowerCase();
    if (uAdmin === uAlvo) {
      return { ok: false, mensagem: 'Você não pode excluir o seu próprio usuário.' };
    }
    var ss    = _getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.SHEET_USUARIOS);
    if (!sheet) return { ok: false, mensagem: 'Aba Usuarios não encontrada.' };
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, mensagem: 'Nenhum usuário encontrado.' };
    var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < colA.length; i++) {
      if (String(colA[i][0]).trim().toLowerCase() === uAlvo) {
        sheet.deleteRow(i + 2);
        return { ok: true, mensagem: 'Usuário excluído.' };
      }
    }
    return { ok: false, mensagem: 'Usuário não encontrado na planilha.' };
  } catch(e) {
    Logger.log('excluirUsuario erro: ' + e.message);
    return { ok: false, mensagem: e.message };
  }
}

// Retorna o HTML do painel de usuários para injeção no CRM.
function getUsuariosHtml() {
  return HtmlService.createHtmlOutputFromFile('Usuarios').getContent();
}

// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO ALERTAS — Sino de Notificações Internas
//  Implementado em 25/04/2026
//  Detecta: leads parados no funil, WABA quality score, campanhas com CPL alto.
//  Visível apenas para perfis admin e supervisor.
// ══════════════════════════════════════════════════════════════════════════════

/** Retorna o perfil de um usuário (admin/supervisor/backoffice).
 *  Consulta a aba Usuarios; fallback para USUARIOS do Config.js. */
function _getPerfilUsuario_(usuario) {
  try {
    var rows = _getUsuariosSheet_();
    if (rows && rows.length > 0) {
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim().toLowerCase() === String(usuario).trim().toLowerCase()) {
          return String(rows[i][3] || '').trim();
        }
      }
    }
  } catch(e) { /* fallback abaixo */ }
  // Fallback: USUARIOS do Config.js
  for (var j = 0; j < USUARIOS.length; j++) {
    if (USUARIOS[j].usuario === usuario) return USUARIOS[j].perfil;
  }
  return '';
}

/** Converte string de data 'dd/MM/yyyy' para objeto Date (meia-noite).
 *  Retorna null se inválida. */
function _parseDDMMYYYY_(str) {
  if (!str) return null;
  var p = String(str).trim().split('/');
  if (p.length !== 3) return null;
  var d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  d.setHours(0, 0, 0, 0);
  return isNaN(d) ? null : d;
}

/**
 * Detecta alertas ativos e retorna lista para exibição no sino do CRM.
 * Chamada via google.script.run pelo frontend (apenas admin e supervisor).
 *
 * @param {string} usuario — login do usuário logado
 * @returns {{ alertas: Array, total: number, naoLidos: number }}
 */
function detectarAlertasAtivos(usuario) {
  try {
    var alertas = [];
    var agora   = new Date();
    agora.setHours(0, 0, 0, 0);

    // ── 1. Leads parados no Funil ──────────────────────────────────────────
    try {
      var funilRes = getVendasFunil();
      var dados    = (funilRes && funilRes.dados) ? funilRes.dados : [];
      var slaConf  = ALERTAS_CONFIG.LEAD_PARADO_DIAS;

      dados.forEach(function(v) {
        // Aguardando Instalação: contagem desde a data de agenda
        if (v.status === '2- Aguardando Instalação' && v.agenda) {
          var dAgenda = _parseDDMMYYYY_(v.agenda);
          if (dAgenda) {
            var diasAtrasado = Math.floor((agora - dAgenda) / 86400000);
            if (diasAtrasado >= (slaConf['2- Aguardando Instalação'] || 5)) {
              alertas.push({
                id:         'funil_ag_' + v.linha,
                tipo:       'lead_parado',
                icone:      diasAtrasado >= 10 ? '🔴' : '🟡',
                titulo:     (v.cliente || 'Cliente') + ' — instalação atrasada',
                sub:        diasAtrasado + ' dia' + (diasAtrasado !== 1 ? 's' : '') +
                            ' em atraso' + (v.resp ? ' · ' + v.resp : ''),
                severidade: diasAtrasado >= 10 ? 'critico' : 'atencao',
                destino:    'funil'
              });
            }
          }
        }

        // Pendência Vero: contagem desde dataAtiv (proxy de entrada no status)
        if (v.status === 'Pendencia Vero' && v.dataAtiv) {
          var dAtiv = _parseDDMMYYYY_(v.dataAtiv);
          if (dAtiv) {
            var diasPendente = Math.floor((agora - dAtiv) / 86400000);
            if (diasPendente >= (slaConf['Pendencia Vero'] || 3)) {
              alertas.push({
                id:         'funil_pv_' + v.linha,
                tipo:       'pendencia_vero',
                icone:      diasPendente >= 7 ? '🔴' : '🟡',
                titulo:     (v.cliente || 'Cliente') + ' — Pendência Vero',
                sub:        diasPendente + ' dia' + (diasPendente !== 1 ? 's' : '') +
                            ' aguardando Vero',
                severidade: diasPendente >= 7 ? 'critico' : 'atencao',
                destino:    'funil'
              });
            }
          }
        }
      });
    } catch(eFunil) {
      Logger.log('detectarAlertasAtivos — funil: ' + eFunil.toString());
    }

    // Limita alertas de leads a 10 para não afogar o sino
    var maxLeads = 10;
    if (alertas.length > maxLeads) {
      var excedente = alertas.length - maxLeads;
      alertas = alertas.slice(0, maxLeads);
      alertas.push({
        id:         'funil_outros_' + excedente,
        tipo:       'lead_parado',
        icone:      '📋',
        titulo:     '+ ' + excedente + ' instalação' + (excedente !== 1 ? 'ões' : '') + ' atrasada' + (excedente !== 1 ? 's' : ''),
        sub:        'Acesse o Funil de Instalações para ver todas',
        severidade: 'atencao',
        destino:    'funil'
      });
    }

    // ── 2. WABA Quality Score ─────────────────────────────────────────────
    try {
      var wabaData = _sbFetch_('GET', '/v_waba_health_current?select=current_quality&limit=1');
      if (wabaData && wabaData.length > 0) {
        var score = String(wabaData[0].current_quality || '').toUpperCase();
        if (score && ALERTAS_CONFIG.WABA_SCORES_ALERTA.indexOf(score) >= 0) {
          alertas.push({
            id:         'waba_score_' + score,
            tipo:       'waba_score',
            icone:      score === 'RED' ? '🔴' : '🟡',
            titulo:     'WABA Quality Score: ' + score,
            sub:        score === 'RED'
                          ? 'Risco de suspensão — revise templates imediatamente'
                          : 'Qualidade em atenção — monitore aprovações de template',
            severidade: score === 'RED' ? 'critico' : 'atencao',
            destino:    'dash'
          });
        }
      }
    } catch(eWaba) {
      Logger.log('detectarAlertasAtivos — WABA erro: ' + eWaba.toString());
    }

    // ── 3. Campanhas de disparo-massa com problema ────────────────────────
    // v_campaign_stats é do disparo-massa (WhatsApp), não Meta Ads — sem CPL.
    // Alertas: kill switch ativo ou taxa de falha alta.
    try {
      var campanhas = _sbFetch_('GET',
        '/v_campaign_stats?select=id,name,status,fail_rate_pct,optout_rate_pct,pause_reasons,sent_count&order=updated_at.desc&limit=20');
      var failMax   = (ALERTAS_CONFIG.CAMPANHA_FAIL_RATE_MAX != null) ? ALERTAS_CONFIG.CAMPANHA_FAIL_RATE_MAX : 20;
      var optoutMax = (ALERTAS_CONFIG.CAMPANHA_OPTOUT_MAX   != null) ? ALERTAS_CONFIG.CAMPANHA_OPTOUT_MAX   : 5;
      campanhas.forEach(function(c) {
        var nome      = c.name || c.id || 'Campanha';
        var idSlug    = String(c.id || nome).replace(/\W/g, '_').slice(0, 40);
        var failRate  = parseFloat(c.fail_rate_pct)  || 0;
        var optRate   = parseFloat(c.optout_rate_pct) || 0;
        var enviados  = parseInt(c.sent_count) || 0;
        var pauseStr  = String(c.pause_reasons || '');
        var killSwitch = pauseStr.indexOf('kill_switch') >= 0;

        // Kill switch ativo
        if (c.status === 'paused' && killSwitch) {
          alertas.push({
            id:         'disp_kill_' + idSlug,
            tipo:       'disparo_kill',
            icone:      '🛑',
            titulo:     'Kill switch: ' + nome,
            sub:        'Disparo pausado automaticamente por limite crítico',
            severidade: 'critico',
            destino:    'disparos'
          });
        }
        // Taxa de falha alta (só se já enviou ao menos 10)
        else if (enviados >= 10 && failRate > failMax) {
          alertas.push({
            id:         'disp_fail_' + idSlug,
            tipo:       'disparo_falha',
            icone:      '📵',
            titulo:     'Falhas altas: ' + nome,
            sub:        failRate.toFixed(1) + '% de falha · limite: ' + failMax + '%',
            severidade: 'atencao',
            destino:    'disparos'
          });
        }
        // Opt-out alto
        else if (enviados >= 10 && optRate > optoutMax) {
          alertas.push({
            id:         'disp_optout_' + idSlug,
            tipo:       'disparo_optout',
            icone:      '🚫',
            titulo:     'Opt-out alto: ' + nome,
            sub:        optRate.toFixed(1) + '% de opt-out · limite: ' + optoutMax + '%',
            severidade: 'atencao',
            destino:    'disparos'
          });
        }
      });
    } catch(eCamp) {
      Logger.log('detectarAlertasAtivos — campanhas erro: ' + eCamp.toString());
    }

    // ── 4. Combos órfãos em status operacional (Sprint Integridade §6.4) ──────
    // Fibra Combo que está em estado operacional (status ≥2) SEM Móvel vinculado
    // ATIVO. O guard _validarComboIntegridade_ impede NOVOS órfãos nos portões de
    // gravação; este alerta vigia os legados que já estavam assim antes da Sprint.
    try {
      var funilCombo = getVendasFunil();
      var dadosCombo = (funilCombo && funilCombo.dados) ? funilCombo.dados : [];
      var vincMap    = _getVinculosVendasMap_();
      var combosOrfaos = [];
      dadosCombo.forEach(function(v) {
        if (_normalizarTexto(v.produto) !== 'FIBRA COMBO') return;
        if (!_statusExigeComboCompleto_(v.status)) return;
        var filhas = (vincMap.filhasPorMae && vincMap.filhasPorMae[v.linha]) || [];
        if (!filhas.length) combosOrfaos.push(v);
      });
      var maxCombo = 8;
      combosOrfaos.slice(0, maxCombo).forEach(function(v) {
        alertas.push({
          id:         'combo_orfao_' + v.linha,
          tipo:       'combo_orfao',
          icone:      '⛓️',
          titulo:     (v.cliente || 'Cliente') + ' — combo sem Móvel',
          sub:        'Fibra Combo em "' + v.status + '" sem Móvel vinculado · L.' + v.linha,
          severidade: 'atencao',
          destino:    'vinculosPendentes'
        });
      });
      if (combosOrfaos.length > maxCombo) {
        alertas.push({
          id:         'combo_orfao_outros_' + (combosOrfaos.length - maxCombo),
          tipo:       'combo_orfao',
          icone:      '⛓️',
          titulo:     '+ ' + (combosOrfaos.length - maxCombo) + ' combos sem Móvel',
          sub:        'Acesse Vínculos Pendentes para resolver',
          severidade: 'atencao',
          destino:    'vinculosPendentes'
        });
      }
    } catch(eCombo) {
      Logger.log('detectarAlertasAtivos — combos órfãos: ' + eCombo.toString());
    }

    // Estado "lido" é gerenciado pelo frontend (sessionStorage) — backend sempre retorna lido:false.
    // Isso evita que alertas de WABA/CPL fiquem presos como lidos permanentemente no UserProperties.
    alertas.forEach(function(a) { a.lido = false; });

    // Críticos primeiro
    alertas.sort(function(a, b) {
      return (a.severidade === 'critico' ? 0 : 1) - (b.severidade === 'critico' ? 0 : 1);
    });

    return { alertas: alertas, total: alertas.length, naoLidos: alertas.length };

  } catch(e) {
    Logger.log('detectarAlertasAtivos erro geral: ' + e.toString());
    return { alertas: [], total: 0, naoLidos: 0, erro: e.message };
  }
}

/**
 * No-op mantido para compatibilidade com chamadas antigas do frontend.
 * Estado "lido" migrado para sessionStorage no cliente (não persiste entre sessões).
 */
function marcarAlertasLidos(usuario, ids) {
  return { ok: true };
}

/**
 * DIAGNÓSTICO — rode manualmente no editor GAS (não exposta ao frontend).
 * Verifica se _sbFetch_ consegue ler WABA e campanhas do Supabase.
 */
function diagnosticarAlertasWabaCpl() {
  Logger.log('=== DIAGNÓSTICO WABA / CPL ===');

  // 1. Credencial Supabase
  try {
    var key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE');
    Logger.log('SUPABASE_SERVICE_ROLE presente: ' + (key ? 'SIM (' + key.length + ' chars)' : 'NÃO — FALTA A CHAVE'));
  } catch(e) {
    Logger.log('Erro ao ler SUPABASE_SERVICE_ROLE: ' + e.toString());
  }

  // 2. WABA — busca todas as colunas para descobrir o schema real
  try {
    var wabaData = _sbFetch_('GET', '/v_waba_health_current?limit=1');
    Logger.log('WABA colunas: ' + (wabaData && wabaData.length > 0 ? JSON.stringify(Object.keys(wabaData[0])) : 'vazio'));
    Logger.log('WABA linha completa: ' + JSON.stringify(wabaData));
  } catch(e) {
    Logger.log('WABA erro: ' + e.toString());
  }

  // 3. Campanhas — busca todas as colunas para descobrir o schema real
  try {
    var camps = _sbFetch_('GET', '/v_campaign_stats?limit=3');
    Logger.log('Campanhas colunas: ' + (camps && camps.length > 0 ? JSON.stringify(Object.keys(camps[0])) : 'vazio'));
    Logger.log('Campanhas amostra: ' + JSON.stringify(camps));
  } catch(e) {
    Logger.log('Campanhas erro: ' + e.toString());
  }

  Logger.log('=== FIM ===');
}
