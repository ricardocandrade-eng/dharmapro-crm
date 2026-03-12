/*****
 * // Versao Atualizada 1.0
 * @fileoverview CRM Mobile Digital — Versão Corrigida
 * Correções aplicadas:
 * - Autenticação real no backend (validarLogin)
 * - Validação de CPF/CNPJ
 * - Busca de CEP movida para backend (UrlFetchApp)
 * - CONFIG com comentários por coluna
 * - Cache com prefixo consistente e limpeza rastreável
 * - Funções privadas com prefixo _ para clareza
 */

var CONFIG = {
  SHEET_NAME:     '1 - Vendas',
  SHEET_USUARIOS: 'Usuarios',  // aba: A=usuario | B=senha | C=nome exibição
  CACHE_TTL:      60,
  CACHE_PREFIX:   'crm_v2_',   // prefixo único — v2 invalida cache antigo (adicionado statusPAP col AQ)
  MAX_RESULTS:    500,
  COLUNAS: {
    CANAL:        0,  // A  - Canal de venda (ATIVO, PAP, etc.)
    PRODUTO:      1,  // B  - Produto
    STATUS:       2,  // C  - Status do pedido
    DATA_ATIV:    3,  // D  - Data de ativação
    //              4,  // E  - reservada
    COD_CLI:      5,  // F  - Código do cliente no sistema
    CONTRATO:     6,  // G  - Contrato / OS
    AGENDA:       7,  // H  - Data agendamento
    TURNO:        8,  // I  - Turno da instalação
    INSTAL:       9,  // J  - Data instalação
    //             10,  // K  - reservada
    OBSERVACAO:  11,  // L  - Motivo Cancelamento / Observação
    RESP:        12,  // M  - Responsável
    CPF:         13,  // N  - CPF ou CNPJ
    CLIENTE:     14,  // O  - Nome completo do cliente
    WHATS:       15,  // P  - WhatsApp
    TEL:         16,  // Q  - Telefone ligação
    CEP:         17,  // R  - CEP
    RUA:         18,  // S  - Logradouro
    NUM:         19,  // T  - NúmerogetVendasPaginadas 
    COMPLEMENTO: 20,  // U  - Complemento
    BAIRRO:      21,  // V  - Bairro
    CIDADE:      22,  // W  - Cidade
    UF:          23,  // X  - Estado
    //             24,  // Y  - reservada
    SISTEMA:     25,  // Z  - Sistema
    //          26-28,  // AA-AC - reservadas
    VENC:        29,  // AD - Vencimento
    FAT:         30,  // AE - Pagamento/Faturamento
    //          31-32,  // AF-AG - reservadas
    PLANO:       33,  // AH - Plano
    //             34,  // AI - reservada
    VALOR:       35,  // AJ - Valor
    //             36,  // AK - reservada
    LINHA_MOVEL: 37,  // AL - Linha Móvel
    VEROHUB:     41   // AP - Data blindagem VeroHub
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
    var raw   = sheet.getRange(3, 1, ult - 2, 43).getValues();

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


// ── EXCLUIR VENDA (limpa conteúdo da linha, não deleta) ───────────────────
function excluirVenda(linha) {
  try {
    linha = parseInt(linha);
    if (!linha || linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };

    var sheet = _getSheet();
    var ult   = sheet.getLastRow();
    if (linha > ult) return { sucesso: false, mensagem: 'Linha não encontrada.' };

    // Limpa todo o conteúdo da linha (preserva a linha para não deslocar índices)
    sheet.getRange(linha, 1, 1, 43).clearContent();

    // Limpa o cache para forçar recarregamento
    _clearCache();

    return { sucesso: true };
  } catch(e) {
    Logger.log('Erro em excluirVenda: ' + e);
    return { sucesso: false, mensagem: e.message };
  }
}


// ── VEROHUB — salva data de blindagem na col AP ──────────────────────────
function salvarVeroHub(linha, data) {
  try {
    linha = parseInt(linha);
    if (!linha || linha < 3) return { sucesso: false, mensagem: 'Linha inválida.' };
    var sheet = _getSheet();
    sheet.getRange(linha, 42).setValue(data || ''); // col AP = índice 41 = coluna 42
    _limparCacheListaCompleta();
    return { sucesso: true };
  } catch(e) {
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
    if (total <= 0) return { vendas: { dados: [], total: 0, pagina: 1, temMais: false }, contratos: [] };
    var raw = sheet.getRange(3, 1, total, 43).getValues();

    // Contratos (para Cruzamento Vero)
    var contratos = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
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

    // Vendas página 1 (ordem decrescente — últimas linhas primeiro)
    var vendas = [];
    for (var j = raw.length - 1; j >= 0; j--) {
      var row = raw[j];
      var cli = row[CONFIG.COLUNAS.CLIENTE] ? String(row[CONFIG.COLUNAS.CLIENTE]) : '';
      var cpf = row[CONFIG.COLUNAS.CPF]     ? String(row[CONFIG.COLUNAS.CPF])     : '';
      var ctr = row[CONFIG.COLUNAS.CONTRATO]? String(row[CONFIG.COLUNAS.CONTRATO]).trim().replace(/\.0$/,'') : '';
      if (!cli && !cpf && !ctr) continue;
      vendas.push(_mapearLinha(row, j + 3));
    }
    var lim = CONFIG.MAX_RESULTS;
    return {
      vendas:    { dados: vendas.slice(0, lim), total: vendas.length, pagina: 1, temMais: vendas.length > lim },
      contratos: contratos
    };
  } catch(e) {
    Logger.log('getSincronizacaoInicial ERRO: ' + e.message);
    return { vendas: { dados: [], total: 0, pagina: 1, temMais: false }, contratos: [], erro: e.message };
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

    // Lê TODAS as 43 colunas para garantir que temos todos os dados
    var total = ultima - 2;
    var raw   = sheet.getRange(3, 1, total, 43).getValues();

    var tz   = Session.getScriptTimeZone();
    var dados = [];

    Logger.log('getContratosParaCruzamento: processando ' + raw.length + ' linhas');

    for (var i = 0; i < raw.length; i++) {
      var row = raw[i];
      
      // Pega contrato da coluna G (índice 6)
      var contratoRaw = row[6];
      var contrato = String(contratoRaw || '').trim().replace(/\.0$/, '');
      
      // Pula linhas sem contrato
      if (!contrato) continue;
      
      // Pega status da coluna C (índice 2)
      var status = String(row[2] || '').trim();
      
      // Pega cliente da coluna O (índice 14)
      var cliente = String(row[14] || '').trim();
      
      // Pega produto da coluna B (índice 1)
      var produto = String(row[1] || '').trim();
      
      // Data ativação: col D (índice 3)
      var dAtivRaw = row[3];
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
      
      // Data instalação: col J (índice 9)
      var dInstalRaw = row[9];
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

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CRM - Mobile Digital')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── AUTENTICAÇÃO REAL ─────────────────────────────────────────────────────

function validarLogin(usuario, senha) {
  try {
    if (!usuario || !senha) {
      return { autorizado: false, mensagem: 'Preencha usuário e senha.' };
    }

    // Perfis embutidos — espelho do Config.gs
    var PERFIS_LOCAL = {
      'admin':      ['dash','formulario','lista','funil','leads','pap','docs','cruzamento'],
      'supervisor': ['dash','formulario','lista','funil','leads','docs','cruzamento'],
      'backoffice': ['dash','formulario','lista','funil','leads','docs','cruzamento']
    };

    var u = usuario.trim().toLowerCase();
    for (var i = 0; i < USUARIOS.length; i++) {
      var reg = USUARIOS[i];
      if (String(reg.usuario).trim().toLowerCase() === u && String(reg.senha) === senha) {
        var perfil = reg.perfil || 'backoffice';
        var menus  = PERFIS_LOCAL[perfil] || PERFIS_LOCAL['backoffice'];
        return {
          autorizado: true,
          nome:       reg.nome   || reg.usuario,
          foto:       reg.foto   || '',
          perfil:     perfil,
          menus:      menus
        };
      }
    }

    return { autorizado: false, mensagem: 'Usuário ou senha incorretos.' };
  } catch (erro) {
    Logger.log('Erro em validarLogin: ' + erro);
    return { autorizado: false, mensagem: 'Erro ao validar. Tente novamente.' };
  }
}


// ─── DIAGNÓSTICO CEP (rode uma vez no editor Apps Script para testar) ────────
// Vá em: Apps Script → selecione "diagnosticoCEP" → clique ▶ Executar
// Veja o resultado em: Visualizar → Registros de execução
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
function getResponsaveis() {
  try {
    var cache    = CacheService.getScriptCache();
    var cacheKey = CONFIG.CACHE_PREFIX + 'responsaveis_v1';
    try {
      var cached = cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch(ce) {}

    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var sh   = ss.getSheetByName('3 - PAP');
    if (!sh) return { erro: true, mensagem: 'Aba "3 - PAP" não encontrada.' };

    var ultimaLinha = sh.getLastRow();
    if (ultimaLinha < 2) return { erro: false, lista: [] };

    // Colunas S-Z = índices 18-25 (base 0)
    // Cabeçalho na linha 1: VENDEDOR, ID BOT, WHATSAPP, DATA CADASTRO, CPF, CHAVE PIX, Código App, Validar Chave Pix
    // Queremos só a coluna S (VENDEDOR = índice 18)
    var raw  = sh.getRange(2, 19, ultimaLinha - 1, 1).getValues(); // col S = coluna 19
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


// ─── PAGAMENTOS PAP ────────────────────────────────────────────────────────
// Coluna AQ (índice 42) = Status Pagamento PAP ("Em aberto" / "Pago")
// Filtros: Produto=FIBRA ALONE/COMBO, Canal=PAP, Status=3 - Finalizada/Instalada, PAP=Em aberto

function getPagamentosPAP() {
  try {
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
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

    // Lê aba 1 - Vendas: colunas A até AQ (43 colunas)
    var totalDados = ultimaLinha - 2;
    var raw = sheet.getRange(3, 1, totalDados, 43).getValues();
    var tz  = Session.getScriptTimeZone();

    var resultado = [];
    var totalValor = 0;
    var porVendedor = {};

    for (var i = 0; i < raw.length; i++) {
      var row      = raw[i];
      var canal    = String(row[0]  || '').trim().toUpperCase(); // A
      var produto  = String(row[1]  || '').trim().toUpperCase(); // B
      var status   = String(row[2]  || '').trim();               // C
      var statusPAP= String(row[42] || '').trim().toUpperCase(); // AQ

      // Filtros
      if (canal !== 'PAP') continue;
      var prodNorm = produto.normalize('NFD').replace(/[̀-ͯ]/g,'');
      if (prodNorm !== 'FIBRA ALONE' && prodNorm !== 'FIBRA COMBO') continue;
      if (status !== '3 - Finalizada/Instalada') continue;
      if (statusPAP.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'') !== 'EM ABERTO') continue;

      var cliente  = String(row[14] || '').trim(); // O
      var resp     = String(row[12] || '').trim(); // M
      var contrato = String(row[6]  || '').trim(); // G
      var plano    = String(row[33] || '').trim(); // AH
      var valor    = parseFloat(row[35]) || 0;     // AJ

      // Data instalação col J (índice 9)
      var dInstal = row[9];
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
        produto:     String(row[1] || '').trim(),
        plano:       plano,
        valor:       valor,
        comissao:    comissao,
        dataInstal:  dataInstalStr,
        chavePix:    infoPAP.chavePix,
        whatsapp:    infoPAP.whatsapp,
        statusPAP:   String(row[42] || '').trim()
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


// Salva apenas o Status Pagamento PAP (col AQ = coluna 43) de uma linha
function salvarStatusPAP(linha, novoStatus) {
  try {
    var sheet = _getSheet();
    sheet.getRange(linha, 43).setValue(novoStatus || '');
    _limparCacheListaCompleta();
    Logger.log('salvarStatusPAP: linha ' + linha + ' = "' + novoStatus + '"');
    return { sucesso: true };
  } catch(e) {
    Logger.log('Erro salvarStatusPAP: ' + e);
    return { sucesso: false, mensagem: e.message };
  }
}

// Marca uma venda como paga na coluna AQ
function marcarPagoPAP(linha) {
  try {
    var sheet = _getSheet();
    sheet.getRange(linha, 43).setValue('Pago'); // col AQ = coluna 43
    _limparCacheListaCompleta();
    Logger.log('marcarPagoPAP: linha ' + linha + ' marcada como Pago.');
    return { sucesso: true };
  } catch(e) {
    Logger.log('Erro marcarPagoPAP: ' + e);
    return { sucesso: false, mensagem: e.message };
  }
}

// ─── LEADS — TRATAMENTO DE LEADS (KANBAN) ─────────────────────────────────
// Retorna vendas FIBRA ALONE/COMBO + STATUS 1- Conferencia/Ativação
// Classifica pela coluna D (pré-venda) em Quente/Morno/Frio
// Também inclui as que já estão em 2- Aguardando Instalação (coluna destino)
function getVendasLeads() {
  try {
    var cache    = CacheService.getScriptCache();
    var cacheKey = CONFIG.CACHE_PREFIX + 'leads_v1';
    try {
      var cached = cache.get(cacheKey);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.dados) && parsed.dados.length > 0) {
          Logger.log('getVendasLeads cache hit: ' + parsed.dados.length);
          return parsed;
        }
      }
    } catch(ce) {}

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

    var LIMITE = 200; // últimas 200 de cada temperatura
    var LOTE   = 400;
    var tz     = Session.getScriptTimeZone();

    var contadores = { quente: 0, morno: 0, frio: 0, aguardando: 0 };
    var resultado  = [];
    var linhaAtual = ultimaLinha;

    while (linhaAtual >= 3) {
      var linhaIni = Math.max(3, linhaAtual - LOTE + 1);
      var qtd      = linhaAtual - linhaIni + 1;
      var raw      = sheet.getRange(linhaIni, 1, qtd, 34).getValues();

      for (var i = raw.length - 1; i >= 0; i--) {
        var row     = raw[i];
        var status  = String(row[2] || '').trim();
        var produto = String(row[1] || '').trim().toUpperCase();
        var colD    = String(row[3] || '').trim().toUpperCase()
                        .normalize('NFD').replace(/[̀-ͯ]/g, '');

        // Só FIBRA ALONE ou FIBRA COMBO
        if (!PRODUTOS_FIBRA[produto.replace(/\s+/g,' ')
              .normalize('NFD').replace(/[̀-ͯ]/g,'')]) continue;

        var temperatura = null;

        if (status === STATUS_CONF) {
          if (PRE_VENDA_QUENTE[colD]) {
            if (contadores.quente >= LIMITE) continue;
            temperatura = 'quente';
            contadores.quente++;
          } else if (PRE_VENDA_MORNO[colD]) {
            if (contadores.morno >= LIMITE) continue;
            temperatura = 'morno';
            contadores.morno++;
          } else if (PRE_VENDA_FRIO[colD] || colD === 'EM NEGOCIACAO') {
            if (contadores.frio >= LIMITE) continue;
            temperatura = 'frio';
            contadores.frio++;
          } else {
            continue; // pré-venda não mapeada
          }
        } else if (status === STATUS_AGU) {
          if (contadores.aguardando >= LIMITE) continue;
          temperatura = 'aguardando';
          contadores.aguardando++;
        } else {
          continue;
        }

        var cliente = String(row[14] || '').trim();
        var cpf     = String(row[13] || '').trim();
        if (!cliente && !cpf) continue;

        // Data ativação (colD pode ser texto de pré-venda)
        var dAtiv = row[3];
        var dataAtivStr = (dAtiv instanceof Date && !isNaN(dAtiv))
          ? Utilities.formatDate(dAtiv, tz, 'dd/MM/yyyy') : '';

        // Agenda
        var dAg = row[7];
        var agendaStr = (dAg instanceof Date && !isNaN(dAg))
          ? Utilities.formatDate(dAg, tz, 'dd/MM/yyyy') : (dAg ? String(dAg) : '');

        resultado.push({
          linha:       linhaIni + i,
          status:      status,
          temperatura: temperatura,
          preVenda:    String(row[3] || '').trim(), // valor original da col D
          cliente:     cliente,
          cpf:         cpf,
          produto:     String(row[1]  || '').trim(),
          plano:       String(row[33] || '').trim(),
          resp:        String(row[12] || '').trim(),
          whats:       String(row[15] || '').trim(),
          dataAtiv:    dataAtivStr,
          agenda:      agendaStr,
          turno:       String(row[8]  || '').trim(),
          codCli:      String(row[5]  || '').trim(),
          contrato:    String(row[6]  || '').trim()
        });
      }

      // Para quando todos os baldes estão cheios
      if (contadores.quente  >= LIMITE &&
          contadores.morno   >= LIMITE &&
          contadores.frio    >= LIMITE &&
          contadores.aguardando >= LIMITE) break;

      linhaAtual = linhaIni - 1;
    }

    Logger.log('getVendasLeads: ' + resultado.length + ' registros. Q=' +
      contadores.quente + ' M=' + contadores.morno +
      ' F=' + contadores.frio + ' Ag=' + contadores.aguardando);

    var retorno = { dados: resultado, total: resultado.length };
    try {
      var jsonStr = JSON.stringify(retorno);
      if (jsonStr.length < 95000) cache.put(cacheKey, jsonStr, 120);
    } catch(ce) {}

    return retorno;
  } catch(e) {
    Logger.log('Erro em getVendasLeads: ' + e);
    return { dados: [], total: 0, erro: e.message };
  }
}

// Mover lead para 2- Aguardando Instalação com campos extras
function moverLeadAguardando(payload) {
  try {
    var sheet = _getSheet();
    if (!sheet) return { sucesso: false, mensagem: 'Planilha não encontrada.' };

    var linha = parseInt(payload.linha);

    // Status → col C (índice 2 = coluna 3)
    sheet.getRange(linha, 3).setValue('2- Aguardando Instalação');

    // Agenda → col H (índice 7 = coluna 8)
    if (payload.agenda) sheet.getRange(linha, 8).setValue(payload.agenda);

    // Turno → col I (índice 8 = coluna 9)
    if (payload.turno) sheet.getRange(linha, 9).setValue(payload.turno);

    // Contrato/OS → col G (índice 6 = coluna 7)
    if (payload.contrato) sheet.getRange(linha, 7).setValue(payload.contrato);

    // Observação → col AK (coluna 37)
    if (payload.obs) sheet.getRange(linha, 37).setValue(payload.obs);

    // Invalida caches
    _limparCacheListaCompleta();
    try {
      var c = CacheService.getScriptCache();
      c.remove(CONFIG.CACHE_PREFIX + 'leads_v1');
      c.remove(CONFIG.CACHE_PREFIX + 'funil_v1');
    } catch(ce) {}

    Logger.log('moverLeadAguardando: linha ' + linha + ' movida.');
    return { sucesso: true };
  } catch(e) {
    Logger.log('Erro em moverLeadAguardando: ' + e);
    return { sucesso: false, mensagem: e.message };
  }
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
    var shCid = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CIDADES');
    if (!shCid) return { erro: true, mensagem: 'Aba CIDADES não encontrada.' };

    var dados = shCid.getDataRange().getValues();
    var cidades = [];
    for (var i = 1; i < dados.length; i++) {
      var nome = String(dados[i][6] || '').trim();
      if (nome) cidades.push(nome);
    }
    cidades.sort(function(a, b) { return a.localeCompare(b, 'pt-BR'); });
    // Remove duplicatas
    var unicas = cidades.filter(function(v, i, arr) { return arr.indexOf(v) === i; });
    return { erro: false, cidades: unicas };
  } catch(e) {
    return { erro: true, mensagem: e.message };
  }
}

// Retorna todas as ofertas de uma cidade (todos os produtos/categorias)
function getOfertasCidade(cidade) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var shCid = ss.getSheetByName('CIDADES');
    var shTab = ss.getSheetByName('TABELA');
    if (!shCid || !shTab) return { erro: true, mensagem: 'Abas CIDADES ou TABELA não encontradas.' };

    var cidNorm  = _normalizarTexto(cidade);
    var dadosCid = shCid.getDataRange().getValues();
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

    var dadosTab = shTab.getDataRange().getValues();
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

    // Lookup de sistema na aba CIDADES
    var sistema = '';
    try {
      var shCid = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CIDADES');
      if (shCid) {
        var cidNorm = _normalizarTexto(data.cidade);
        var rows = shCid.getDataRange().getValues();
        for (var i = 0; i < rows.length; i++) {
          if (_normalizarTexto(rows[i][6]) === cidNorm) {
            sistema = rows[i][2] || '';
            Logger.log('[CEP] Sistema encontrado: ' + sistema);
            break;
          }
        }
        if (!sistema) Logger.log('[CEP] Cidade "' + cidNorm + '" nao encontrada na aba CIDADES.');
      }
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
function getSistemaPorCidade(cidade) {
  try {
    var shCid = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CIDADES');
    if (!shCid) return '';
    var cidNorm = _normalizarTexto(cidade);
    var rows = shCid.getDataRange().getValues();
    for (var i = 0; i < rows.length; i++) {
      if (_normalizarTexto(rows[i][6]) === cidNorm) return rows[i][2] || '';
    }
    return '';
  } catch(e) {
    Logger.log('getSistemaPorCidade erro: ' + e);
    return '';
  }
}

// ─── PLANOS POR CIDADE+PRODUTO (sem UrlFetchApp — recebe cidade já preenchida) ─
// Chamado pelo onProdutoChange quando o endereço já foi preenchido pelo browser
function getPlanosPorCidadeProduto(cidade, produto) {
  try {
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var shCid   = ss.getSheetByName('CIDADES');
    var shTab   = ss.getSheetByName('TABELA');
    if (!shCid || !shTab) return { erro: true, mensagem: 'Abas CIDADES ou TABELA não encontradas.' };

    var cidNorm  = _normalizarTexto(cidade);
    var dadosCid = shCid.getDataRange().getValues();
    var linhaCid = null;
    for (var ci = 0; ci < dadosCid.length; ci++) {
      if (_normalizarTexto(dadosCid[ci][6]) === cidNorm) { linhaCid = dadosCid[ci]; break; }
    }
    if (!linhaCid) return { erro: false, cidade: cidade, planos: [], mensagem: 'Cidade não mapeada em CIDADES.' };

    var segmentacao = linhaCid[3] || '';
    var segNorm     = _normalizarTexto(segmentacao);
    var dadosTab    = shTab.getDataRange().getValues();
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

    var ss          = SpreadsheetApp.getActiveSpreadsheet();
    var cidadeNorm  = _normalizarTexto(data.cidade);
    var sistema     = '';
    var segmentacao = '';
    var regional    = '';
    var cluster     = '';
    var planos      = [];

    // Cruza aba CIDADES para pegar sistema/segmentação/regional/cluster
    var shCid = ss.getSheetByName('CIDADES');
    if (shCid) {
      var dadosCid = shCid.getDataRange().getValues();
      var linhaCid = null;
      for (var ci = 0; ci < dadosCid.length; ci++) {
        if (_normalizarTexto(dadosCid[ci][6]) === cidadeNorm) { linhaCid = dadosCid[ci]; break; }
      }

      if (linhaCid) {
        sistema     = linhaCid[2] || '';
        segmentacao = linhaCid[3] || '';
        regional    = linhaCid[4] || '';
        cluster     = linhaCid[5] || '';

        // Carrega planos da aba TABELA filtrando pela segmentação e pelo produto
        var shTab = ss.getSheetByName('TABELA');
        if (shTab) {
          var dadosTab   = shTab.getDataRange().getValues();
          var segNorm    = _normalizarTexto(segmentacao);
          var cabecalho  = dadosTab[1].map(function (h) { return _normalizarTexto(h); });
          var colIdx     = cabecalho.indexOf(segNorm);

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
function _normalizarTexto(s) {
  return s ? s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() : '';
}

// ─── LEITURA ───────────────────────────────────────────────────────────────

function getVendasPaginadas(pagina, filtro, opcoes) {
  try {
    pagina  = pagina || 1;
    filtro  = (filtro || '').toString().trim();
    if (typeof opcoes === 'string') { try { opcoes = JSON.parse(opcoes); } catch(e) { opcoes = {}; } }
    opcoes  = opcoes || {};

    var fStatus    = (opcoes.status    || '').trim();
    var fPreVenda  = (opcoes.preVenda  || '').trim().toUpperCase();
    var fProduto   = (opcoes.produto   || '').trim();
    var fVerohub   = opcoes.verohub === true;

    // Data de hoje para filtro VeroHub
    var hoje = new Date(); hoje.setHours(0,0,0,0);

    var sheet       = _getSheet();
    var ultimaLinha = sheet.getLastRow();
    var totalLinhas = ultimaLinha - 2;

    if (totalLinhas <= 0 || ultimaLinha < 3) {
      return { dados: [], total: 0, pagina: 1, temMais: false };
    }

    var ehConsultaSimples = !filtro && !fStatus && !fPreVenda && !fProduto && !fVerohub;
    var raw = sheet.getRange(3, 1, totalLinhas, 43).getValues();
    var offsetLinha = 3;

    var filtroLower = filtro ? filtro.toLowerCase() : '';
    var vendas = [];

    for (var i = raw.length - 1; i >= 0; i--) {
      var row      = raw[i];
      var cliente  = row[CONFIG.COLUNAS.CLIENTE]  ? String(row[CONFIG.COLUNAS.CLIENTE])  : '';
      var cpf      = row[CONFIG.COLUNAS.CPF]       ? String(row[CONFIG.COLUNAS.CPF])      : '';
      var contrato = row[CONFIG.COLUNAS.CONTRATO]  ? String(row[CONFIG.COLUNAS.CONTRATO]).trim().replace(/\.0$/, '') : '';
      if (!cliente && !cpf && !contrato) continue;

      var status  = row[CONFIG.COLUNAS.STATUS]   ? String(row[CONFIG.COLUNAS.STATUS])  : '';
      var produto = row[CONFIG.COLUNAS.PRODUTO]  ? String(row[CONFIG.COLUNAS.PRODUTO]) : '';
      var colD    = row[CONFIG.COLUNAS.DATA_ATIV];

      // ── Filtro de busca texto ─────────────────────────────────────────────
      if (filtroLower) {
        var resp      = row[CONFIG.COLUNAS.RESP] ? String(row[CONFIG.COLUNAS.RESP]).toLowerCase() : '';
        var contratoL = contrato.toLowerCase();
        var filtroNum = filtroLower.replace(/[^0-9]/g, '');
        var cpfNum    = cpf.replace(/[^0-9]/g, '');
        var match = cliente.toLowerCase().indexOf(filtroLower) > -1 ||
                    contratoL.indexOf(filtroLower)             > -1 ||
                    status.toLowerCase().indexOf(filtroLower)  > -1 ||
                    resp.indexOf(filtroLower)                  > -1 ||
                    (filtroNum.length >= 3 && cpfNum.indexOf(filtroNum) > -1);
        if (!match) continue;
      }

      // ── Filtro de Status da Venda ─────────────────────────────────────────
      if (fStatus) {
        var sNorm  = status.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        var fsNorm = fStatus.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        if (sNorm !== fsNorm) continue;
      }

      // ── Filtro de Produto ─────────────────────────────────────────────────
      if (fProduto) {
        var prodNorm     = produto.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        var filtProdNorm = fProduto.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        if (prodNorm !== filtProdNorm) continue;
      }

      // ── Filtro de Pré-Venda (col D quando status = 1- Conferencia) ────────
      if (fPreVenda) {
        var sNormPV = status.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        if (sNormPV !== '1- conferencia/ativacao') continue;
        var colDStr       = String(colD || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        var fPreVendaNorm = fPreVenda.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        if (colDStr.indexOf(fPreVendaNorm) === -1) continue;
      }

      // ── Filtro VeroHub vencido ou sem data (só para status 1- Conferencia) ──
      if (fVerohub) {
        var sNormVH = status.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        if (sNormVH !== '1- conferencia/ativacao') continue;
        var vhVal  = row[CONFIG.COLUNAS.VEROHUB];
        var vhDate = null;
        if (vhVal instanceof Date && !isNaN(vhVal)) {
          // Data do Sheets — construir sem UTC para evitar bug de timezone
          vhDate = new Date(vhVal.getFullYear(), vhVal.getMonth(), vhVal.getDate());
        } else {
          var vhStr = String(vhVal || '').trim();
          if (vhStr) {
            var pts = vhStr.split('/');
            if (pts.length === 3) {
              // formato dd/MM/yyyy
              vhDate = new Date(parseInt(pts[2]), parseInt(pts[1])-1, parseInt(pts[0]));
            } else if (/^\d{4}-\d{2}-\d{2}/.test(vhStr)) {
              // formato ISO yyyy-MM-dd — parsear manualmente (evita interpretação UTC)
              var iso = vhStr.substring(0,10).split('-');
              vhDate = new Date(parseInt(iso[0]), parseInt(iso[1])-1, parseInt(iso[2]));
            } else {
              vhDate = new Date(vhStr);
            }
          }
        }
        if (vhDate !== null && !isNaN(vhDate.getTime())) {
          if (vhDate >= hoje) continue; // data de hoje ou futura = OK, não incluir
        }
        // sem data ou data inválida = incluir (vencido por omissão)
      }

      vendas.push(_mapearLinha(row, offsetLinha + i));
    }

    // ── Pagina ───────────────────────────────────────────────────────────────
    var inicio = (pagina - 1) * CONFIG.MAX_RESULTS;
    var fim    = inicio + CONFIG.MAX_RESULTS;

    Logger.log('getVendasPaginadas: total=' + vendas.length + ' pagina=' + pagina + ' filtro="' + filtro + '"');

    return {
      dados:   vendas.slice(inicio, fim),
      total:   vendas.length,
      pagina:  pagina,
      temMais: fim < vendas.length
    };

  } catch (erro) {
    Logger.log('ERRO em getVendasPaginadas: ' + erro);
    return { dados: [], total: 0, pagina: 1, temMais: false, erro: erro.message };
  }
}

function getVendaPorLinha(numeroLinha) {
  try {
    var sheet = _getSheet();
    var dados = sheet.getRange(numeroLinha, 1, 1, 43).getValues()[0];
    return _mapearLinha(dados, numeroLinha);
  } catch (erro) {
    throw new Error('Erro ao buscar venda: ' + erro.message);
  }
}

// ─── SALVAR / ATUALIZAR ────────────────────────────────────────────────────

function salvarVenda(dados) {
  try {
    if (!dados.cliente || dados.cliente.trim() === '') {
      throw new Error('Nome do cliente é obrigatório!');
    }
    if (!dados.status) {
      throw new Error('Status é obrigatório!');
    }
    if (STATUS_LIST.indexOf(dados.status) === -1) {
      throw new Error('Status inválido recebido: "' + dados.status + '"');
    }
    if (dados.cpf && dados.cpf.trim() !== '') {
      var cpfLimpo = dados.cpf.replace(/\D/g, '');
      if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) {
        throw new Error('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.');
      }
    }

    var sheet      = _getSheet();
    var linhaDados = _construirLinhaDados(dados);

    if (dados.linhaReferencia && dados.linhaReferencia !== '') {
      var linhaNum = parseInt(dados.linhaReferencia);
      if (isNaN(linhaNum) || linhaNum < 3) throw new Error('Linha de referência inválida!');
      sheet.getRange(linhaNum, 1, 1, linhaDados.length).setValues([linhaDados]);
      _limparCache();
      return { sucesso: true, mensagem: '✅ ' + dados.cliente.trim() + ' atualizado com sucesso!' };
    } else {
      // Encontra a última linha com conteúdo real usando getLastRow()
      // getLastRow() retorna a última linha que o Sheets considera ocupada (inclui formatação)
      // Para ignorar linhas com só formatação, varredemos de baixo pra cima pela col C
      var ultimaSheet = sheet.getLastRow();
      var novaLinha;
      if (ultimaSheet < 3) {
        novaLinha = 3;
      } else {
        // Lê col C de baixo pra cima em blocos até achar conteúdo real
        var colC = sheet.getRange(3, 3, ultimaSheet - 2, 1).getValues();
        var ultimaReal = 0; // índice dentro do array (base 0 = planilha linha 3)
        for (var r = colC.length - 1; r >= 0; r--) {
          if (colC[r][0] !== '' && colC[r][0] !== null && colC[r][0] !== undefined) {
            ultimaReal = r;
            break;
          }
        }
        novaLinha = ultimaReal + 3 + 1; // +3: offset (array começa na linha 3), +1: próxima linha
      }
      Logger.log('salvarVenda: nova linha = ' + novaLinha + ' (lastRow=' + ultimaSheet + ')');
      sheet.getRange(novaLinha, 1, 1, linhaDados.length).setValues([linhaDados]);
      _limparCache();
      return { sucesso: true, mensagem: '✅ ' + dados.cliente.trim() + ' cadastrado com sucesso!' };
    }

  } catch (erro) {
    return { sucesso: false, mensagem: '❌ ' + erro.message };
  }
}




// ─── DADOS DO FUNIL DE INSTALAÇÕES ────────────────────────────────────────
// Retorna TODAS as vendas dos 3 status do funil (sem paginação)

// Limpa cache do funil (rode no editor para forçar recarga)
function limparCacheFunil() {
  CacheService.getScriptCache().remove('crm_v1_funil_v1');
  Logger.log('Cache do funil removido.');
}

function getVendasFunil() {
  try {
    // Tenta cache primeiro (TTL 3 min)
    var cache    = CacheService.getScriptCache();
    var cacheKey = CONFIG.CACHE_PREFIX + 'funil_v1';
    try {
      var cached = cache.get(cacheKey);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.dados) && parsed.dados.length > 0) {
          Logger.log('getVendasFunil cache hit: ' + parsed.dados.length + ' registros');
          return parsed;
        }
        Logger.log('getVendasFunil: cache inválido, recalculando...');
      }
    } catch(ce) {}

    var sheet       = _getSheet();
    var ultimaLinha = sheet.getLastRow();
    var totalDados  = ultimaLinha - 2;
    Logger.log('getVendasFunil: lendo ' + totalDados + ' linhas');

    if (totalDados <= 0) return { dados: [], total: 0 };

    var statusFunil = {
      '2- Aguardando Instalação': true,
      '3 - Finalizada/Instalada': true,
      'Pendencia Vero':           true
    };

    var LIMITES = {
      '2- Aguardando Instalação': 150,
      '3 - Finalizada/Instalada': 10,
      'Pendencia Vero':           150
    };
    var LOTE = 300;
    var tz = Session.getScriptTimeZone();

    var contadores = { '2- Aguardando Instalação': 0, '3 - Finalizada/Instalada': 0, 'Pendencia Vero': 0 };
    var limites = LIMITES;
    var resultado  = [];
    var linhaAtual = ultimaLinha; // começa da última linha e sobe

    while (linhaAtual >= 3) {
      var linhaIni  = Math.max(3, linhaAtual - LOTE + 1);
      var qtd       = linhaAtual - linhaIni + 1;
      var raw       = sheet.getRange(linhaIni, 1, qtd, 34).getValues();

      for (var i = raw.length - 1; i >= 0; i--) {
        var row    = raw[i];
        var status = String(row[2] || '').trim();
        if (!statusFunil[status]) continue;
        if (contadores[status] >= (limites[status] || 150)) continue;

        var cliente = String(row[14] || '').trim();
        var cpf     = String(row[13] || '').trim();
        if (!cliente && !cpf) continue;

        var dAtiv = row[3];
        var dataAtivStr = (dAtiv instanceof Date && !isNaN(dAtiv))
          ? Utilities.formatDate(dAtiv, tz, 'dd/MM/yyyy')
          : (dAtiv ? String(dAtiv) : '');

        var dAg = row[7];
        var agendaStr = (dAg instanceof Date && !isNaN(dAg))
          ? Utilities.formatDate(dAg, tz, 'dd/MM/yyyy')
          : (dAg ? String(dAg) : '');

        resultado.push({
          linha:    linhaIni + i,
          status:   status,
          cliente:  cliente,
          cpf:      cpf,
          produto:  String(row[1]  || '').trim(),
          plano:    String(row[33] || '').trim(),
          resp:     String(row[12] || '').trim(),
          whats:    String(row[15] || '').trim(),
          codCli:   String(row[5]  || '').trim(),
          contrato: String(row[6]  || '').trim(),
          dataAtiv: dataAtivStr,
          agenda:   agendaStr,
          turno:    String(row[8]  || '').trim()
        });
        contadores[status]++;
      }

      // Para quando todos atingiram o limite
      if (contadores['2- Aguardando Instalação'] >= limites['2- Aguardando Instalação'] &&
          contadores['3 - Finalizada/Instalada'] >= limites['3 - Finalizada/Instalada'] &&
          contadores['Pendencia Vero']           >= limites['Pendencia Vero']) break;

      linhaAtual = linhaIni - 1;
    }

    Logger.log('getVendasFunil: ' + resultado.length + ' registros em lotes de ' + LOTE + '.');

    // Monta retorno enxuto — apenas campos usados pelo frontend
    var dadosEnxutos = resultado.map(function(v) {
      return {
        linha:    v.linha,
        status:   v.status,
        cliente:  v.cliente,
        produto:  v.produto,
        plano:    v.plano,
        resp:     v.resp,
        whats:    v.whats,
        codCli:   v.codCli,
        contrato: v.contrato,
        dataAtiv: v.dataAtiv,
        agenda:   v.agenda,
        turno:    v.turno
      };
    });

    var retorno = { dados: dadosEnxutos, total: dadosEnxutos.length };

    // Cache: só guarda se o JSON couber (limite seguro 95KB)
    try {
      var jsonStr = JSON.stringify(retorno);
      Logger.log('getVendasFunil JSON size: ' + jsonStr.length + ' bytes');
      if (jsonStr.length < 95000) {
        cache.put(cacheKey, jsonStr, 180);
        Logger.log('getVendasFunil: cache salvo.');
      } else {
        Logger.log('getVendasFunil: JSON muito grande para cache (' + jsonStr.length + ')');
      }
    } catch(ce) { Logger.log('Cache erro: ' + ce); }

    return retorno;

  } catch (e) {
    Logger.log('Erro em getVendasFunil: ' + e.toString());
    return { dados: [], total: 0, erro: e.message };
  }
}

// ─── MOVER VENDA NO FUNIL ──────────────────────────────────────────────────
// Atualiza status + campo extra (data de instalação ou observação)
function moverVendaFunil(payload) {
  try {
    var sheet = _getSheet();
    if (!sheet) return { sucesso: false, mensagem: 'Planilha não encontrada.' };

    var linha      = parseInt(payload.linha);
    var novoStatus = payload.novoStatus;
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
      // Data de instalação → coluna J (índice 9 = coluna 10)
      sheet.getRange(linha, CONFIG.COLUNAS.INSTAL + 1).setValue(valorExtra);
    }

    if (campoExtra === 'observacao' && valorExtra) {
      // Observação/Motivo → grava em coluna extra livre (AK = coluna 37)
      // Ajuste o número da coluna conforme sua planilha
      sheet.getRange(linha, 37).setValue(valorExtra);
    }

    // Invalida cache da lista e do funil
    _limparCacheListaCompleta();
    try { CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'funil_v1'); } catch(ce) {}

    Logger.log('Funil: linha ' + linha + ' movida para "' + novoStatus + '"' +
               (campoExtra ? ' | ' + campoExtra + ': ' + valorExtra : ''));

    return { sucesso: true };

  } catch (e) {
    Logger.log('Erro em moverVendaFunil: ' + e);
    return { sucesso: false, mensagem: e.message };
  }
}

// ─── FUNÇÕES PRIVADAS ──────────────────────────────────────────────────────

function _getSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('Planilha "' + CONFIG.SHEET_NAME + '" não encontrada!');
  return sheet;
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

function _limparCache() {
  var cache = CacheService.getScriptCache();
  try {
    var metaRaw = cache.get(CONFIG.CACHE_PREFIX + 'keys');
    if (metaRaw) {
      var keys = JSON.parse(metaRaw);
      if (keys && keys.length) cache.removeAll(keys);
    }
  } catch (e) { /* ignora */ }
  cache.remove(CONFIG.CACHE_PREFIX + 'keys');
}

function _registrarChaveCache(key) {
  var cache = CacheService.getScriptCache();
  try {
    var metaRaw = cache.get(CONFIG.CACHE_PREFIX + 'keys');
    var keys    = metaRaw ? JSON.parse(metaRaw) : [];
    if (keys.indexOf(key) === -1) keys.push(key);
    cache.put(CONFIG.CACHE_PREFIX + 'keys', JSON.stringify(keys), CONFIG.CACHE_TTL + 10);
  } catch (e) { /* ignora */ }
}

function _mapearLinha(row, numeroLinha) {
  var c = CONFIG.COLUNAS;
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
    valor:       row[c.VALOR]        || '',
    linhaMovel:  row[c.LINHA_MOVEL]  || '',
    observacao:  row[c.OBSERVACAO]   || '',  // L  - Motivo Cancelamento / Observação
    verohub:     (function(v) {
      if (!v) return '';
      if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      return String(v).trim();
    })(row[c.VEROHUB]),  // AP - Data blindagem VeroHub
    statusPAP:   String(row[42] || ''),  // AQ - Status Pagamento PAP
    mapsLink:    ''
  };
}

function _construirLinhaDados(d) {
  var linha = new Array(43).fill('');
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
  linha[c.LINHA_MOVEL] = d.linhaMovel  || '';
  linha[42]            = d.statusPAP   || '';  // AQ - Status Pagamento PAP
  return linha;
}

function _formatarData(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return valor.toString();
}

// ══════════════════════════════════════════════════════════════════════════
//  DASHBOARD — getDashboard(mes, ano)
//  mes/ano: inteiros. Se null, usa mês/ano atual.
// ══════════════════════════════════════════════════════════════════════════
function getDashboard(mes, ano) {
  try {
    var sheet    = _getSheet();
    var hoje     = new Date();
    var tz       = Session.getScriptTimeZone();
    var mesRef   = mes  || (hoje.getMonth() + 1);
    var anoRef   = ano  || hoje.getFullYear();
    var ehHoje   = (mesRef === hoje.getMonth() + 1 && anoRef === hoje.getFullYear());
    var cfg      = DASHBOARD_CONFIG;

    // ── Lê planilha completa (43 colunas) ─────────────────────────────────
    var ultima = sheet.getLastRow();
    if (ultima < 3) return { erro: false, vazio: true };
    var raw = sheet.getRange(3, 1, ultima - 2, 43).getValues();

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
    var instalacoesMes = 0, vendaBrutaMes = 0;
    var cancelComercialMes = 0, ticketSoma = 0, ticketQtd = 0;
    var backlog = 0, pendenciaVero = 0;
    var agendadosHoje = 0, instaladosHoje = 0, pendenciadoHoje = 0;
    var finalizadoMes = 0, entregueMes = 0, aguardandoEntregaMes = 0;
    var vendaBrutaCanal = {}, instalacaoCanal = {};
    var planoCount = {}, cidadeCount = {};
    var instalacoesMesAnt = 0;
    var rankingHoje   = {};
    var rankingMes    = {}; // venda bruta do mês por responsável
    var rankingMesAnt = {}; // venda bruta do mês anterior por responsável
    var funil = { 'EM NEGOCIACAO': 0, 'AG COMPROVANTE': 0, 'AG DOC': 0,
                  'AG ACEITE': 0, 'AG AUDITORIA': 0, 'AG QUALIDADE': 0,
                  'CRUZAMENTO DE CA': 0 };

    // Mês anterior
    var mesAnt = mesRef === 1 ? 12 : mesRef - 1;
    var anoAnt = mesRef === 1 ? anoRef - 1 : anoRef;

    for (var i = 0; i < raw.length; i++) {
      var row     = raw[i];
      var canal   = String(row[0]  || '').trim();
      var produto = String(row[1]  || '').trim();
      var status  = String(row[2]  || '').trim();
      var dAtiv   = toDate(row[3]);   // col D
      var dInstal = toDate(row[9]);   // col J
      var dAgenda = toDate(row[7]);   // col H
      var resp    = String(row[12] || '').trim();
      var cidade  = String(row[22] || '').trim();
      var plano   = String(row[33] || '').trim();
      var valor   = parseFloat(row[35]) || 0;  // col AJ
      var colD    = String(row[3]  || '').trim().toUpperCase()
                      .normalize('NFD').replace(/[\u0300-\u036f]/g,'');

      // ── HOJE (fixos) ────────────────────────────────────────────────────
      if (ehHoje) {
        // Fibra/Movel hoje: col B=Fibra, col C=Ag.Instalação ou Finalizada, col D=hoje
        var isVendaHoje = isFibra(produto) &&
          (status === '2- Aguardando Instalação' || status === '3 - Finalizada/Instalada') &&
          isHoje(dAtiv);
        if (isVendaHoje) {
          fibraHoje++;
          fibraHojeCanal[canal] = (fibraHojeCanal[canal] || 0) + 1;
        }
        // Móvel hoje: mesma lógica
        if (isMovel(produto) &&
          (status === '2- Aguardando Instalação' || status === '3 - Finalizada/Instalada') &&
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

      // Funil de leads: status 1- Conferencia/Ativação, col D = pré-venda
      if (status === '1- Conferencia/Ativação' && (isFibra(produto))) {
        var pv = colD;
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
        var dI = toDate(row[9]);
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
      agendadosHoje:      agendadosHoje,
      instaladosHoje:     instaladosHoje,
      emCampo:            emCampo,
      pendenciadoHoje:    pendenciadoHoje,

      // Mês
      instalacoesMes:     instalacoesMes,
      backlog:            backlog,
      projecaoBacklog:    instalacoesMes + backlog,
      vendaBrutaMes:      vendaBrutaMes,
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

  } catch(e) {
    Logger.log('getDashboard erro: ' + e + ' | ' + e.stack);
    return { erro: true, mensagem: e.message };
  }
}

// Serve o HTML do Dashboard para injeção inline no sistema
function getDocsHtml() {
  return HtmlService.createHtmlOutputFromFile('Docs').getContent();
}

function getDashboardHtml() {
  return HtmlService.createHtmlOutputFromFile('Dashboard').getContent();
}

// Retorna HTML do dashboard já com dados embutidos — apenas 1 roundtrip
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
function diagnosticoDashboard() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var sheet  = ss.getSheetByName('1 - Vendas');
  var tz     = ss.getSpreadsheetTimeZone();
  var hoje   = new Date();
  var hStr   = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');

  Logger.log('=== DIAGNÓSTICO DASHBOARD ===');
  Logger.log('Hoje: ' + hStr);

  var ultima = sheet.getLastRow();
  var raw    = sheet.getRange(3, 1, ultima - 2, 43).getValues();

  var contTotal    = 0;
  var contHojeFibra = 0;
  var contProblema  = 0;

  for (var i = 0; i < raw.length; i++) {
    var row     = raw[i];
    var produto = String(row[1]  || '').trim();
    var status  = String(row[2]  || '').trim();
    var dAtivRaw = row[3]; // col D — valor bruto
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
//  INDICAÇÕES (BACK-END DA NOVA PÁGINA)
// ══════════════════════════════════════════════════════════════════════════

function getIndicacoes() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_INDICACOES.ABA_NOME);
    if (!sheet) return { erro: true, mensagem: 'Aba "' + CONFIG_INDICACOES.ABA_NOME + '" não encontrada.' };
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { dados: [] };
    
    var headers = data[0];
    var rows = data.slice(1);
    var tz = Session.getScriptTimeZone();
    
    var resultados = rows.map(function(row, idx) {
      return {
        linha: idx + 2,
        formulario: String(row[0] || ''),
        data: row[1] instanceof Date ? Utilities.formatDate(row[1], tz, 'dd/MM/yyyy') : String(row[1] || ''),
        nomeIndicado: String(row[2] || ''),
        telefoneIndicado: String(row[3] || ''),
        nomeIndicador: String(row[4] || ''),
        telefoneIndicador: String(row[5] || ''),
        tipoPix: String(row[6] || ''),
        chavePix: String(row[7] || ''),
        statusAtendimento: String(row[8] || ''),
        status: String(row[9] || ''),
        contrato: String(row[10] || ''),
        dataInstalacao: row[11] instanceof Date ? Utilities.formatDate(row[11], tz, 'dd/MM/yyyy') : String(row[11] || ''),
        statusPagamento: String(row[12] || ''),
        dataPagamento: row[13] instanceof Date ? Utilities.formatDate(row[13], tz, 'dd/MM/yyyy') : String(row[13] || '')
      };
    });
    
    // Retorna do mais recente para o mais antigo
    return { erro: false, dados: resultados.reverse() };
  } catch(e) {
    return { erro: true, mensagem: e.message };
  }
}

function salvarNovaIndicacao(dados) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_INDICACOES.ABA_NOME);
    if (!sheet) return { sucesso: false, mensagem: 'Aba "' + CONFIG_INDICACOES.ABA_NOME + '" não encontrada.' };
    
    var novaLinha =[
      dados.formulario || 'Cadastro Manual CRM',
      new Date(), // Data automática do cadastro
      dados.nomeIndicado || '',
      dados.telefoneIndicado || '',
      dados.nomeIndicador || '',
      dados.telefoneIndicador || '',
      dados.tipoPix || '',
      dados.chavePix || '',
      'Novo', // Status Atendimento (inicial fixo)
      dados.status || 'Novo', // Status
      '', // Contrato
      '', // Data Instalação
      'Pendente', // Status Pagamento
      '' // Data Pagamento
    ];
    
    sheet.appendRow(novaLinha);
    return { sucesso: true, mensagem: 'Indicação cadastrada com sucesso!' };
  } catch(e) {
    return { sucesso: false, mensagem: e.message };
  }
}