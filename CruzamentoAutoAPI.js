// ══════════════════════════════════════════════════════════════════════════
//  CRUZAMENTO AUTO API
//
//  Busca automatica do relatorio "SNIPER MOBILE" no Gmail (label vero-sniper),
//  parseia server-side (Drive converte XLSX -> Google Sheets temporario),
//  cruza com o CRM e grava na coluna VERO_STATUS aplicando prioridade
//  INSTALACOES > VENDAS > 🟡.
//
//  Funcoes publicas:
//    buscarEImportarVero(usuario)            — chamado pelo botao na UI
//    importarRelatorioVeroAutomatico()       — alvo do trigger diario
//
//  Convencao de propriedade (idempotencia):
//    Script Property "CRUZ_VERO_LAST_THREAD" — ultimo threadId processado
// ══════════════════════════════════════════════════════════════════════════

var CRUZ_VERO_LABEL      = 'vero-sniper';
var CRUZ_VERO_ASSUNTO    = 'Relatório de Vendas - SNIPER MOBILE';
var CRUZ_VERO_REMETENTE  = 'coordenacao_sis@verointernet.com.br';
var CRUZ_VERO_PROP_LAST  = 'CRUZ_VERO_LAST_THREAD';

// ── Entrada publica: botao na UI ─────────────────────────────────────────
function buscarEImportarVero(usuario) {
  var resultado;
  try {
    resultado = _importarRelatorioVero_({ forcar: true });
  } catch (e) {
    Logger.log('buscarEImportarVero ERRO: ' + e.message + ' | ' + e.stack);
    resultado = { sucesso: false, mensagem: e.message };
  }
  _registrarSyncVero_('manual', usuario, resultado);
  return resultado;
}

// ── Entrada publica: trigger diario ──────────────────────────────────────
function importarRelatorioVeroAutomatico() {
  var resultado;
  try {
    resultado = _importarRelatorioVero_({ forcar: false });
    Logger.log('importarRelatorioVeroAutomatico: ' + JSON.stringify(resultado));
  } catch (e) {
    Logger.log('importarRelatorioVeroAutomatico ERRO: ' + e.message + ' | ' + e.stack);
    resultado = { sucesso: false, mensagem: e.message };
  }
  _registrarSyncVero_('auto', '', resultado);
  return resultado;
}

// ── Registro da ultima sincronizacao (Script Property) ───────────────────
function _registrarSyncVero_(origem, usuario, resultado) {
  try {
    var registro = {
      quando: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
      origem: origem,                                          // 'auto' | 'manual'
      usuario: usuario || '',
      sucesso: !!(resultado && resultado.sucesso),
      jaProcessado: !!(resultado && resultado.jaProcessado),
      anexo: (resultado && resultado.anexo) || '',
      recebidoEm: (resultado && resultado.recebidoEm) || '',
      contagem: (resultado && resultado.contagem) || null,
      mensagem: (resultado && resultado.mensagem) || ''
    };
    PropertiesService.getScriptProperties()
      .setProperty('CRUZ_VERO_LAST_SYNC', JSON.stringify(registro));
  } catch (e) {
    Logger.log('_registrarSyncVero_ falhou: ' + e.message);
  }
}

// Getter publico — consumido pelo frontend (Cruzamento.html) ao abrir a pagina.
function getUltimaSincronizacaoVero() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('CRUZ_VERO_LAST_SYNC');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ── Pipeline principal ───────────────────────────────────────────────────
function _importarRelatorioVero_(opts) {
  opts = opts || {};
  var forcar = !!opts.forcar;

  var thread = _buscarThreadVeroMaisRecente_();
  if (!thread) {
    return { sucesso: false, mensagem: 'Nenhum e-mail da Vero encontrado nos ultimos 14 dias.' };
  }

  var threadId = thread.getId();
  var props = PropertiesService.getScriptProperties();
  var ultimoProcessado = props.getProperty(CRUZ_VERO_PROP_LAST) || '';

  if (!forcar && ultimoProcessado === threadId) {
    Logger.log('Thread ja processado: ' + threadId);
    return { sucesso: true, jaProcessado: true, threadId: threadId };
  }

  var anexo = _baixarAnexoXlsxDoThread_(thread);
  if (!anexo) {
    return { sucesso: false, mensagem: 'E-mail encontrado mas sem anexo .xlsx.' };
  }

  var tempFileId = null;
  try {
    tempFileId = _xlsxParaSheetsTemp_(anexo.blob, anexo.nome);
    var dados = _extrairAbasVero_(tempFileId);

    if (!dados.vendas.length && !dados.instalacoes.length && !dados.cancelamentos.length && !dados.movel.length) {
      return { sucesso: false, mensagem: 'Anexo XLSX nao tem abas conhecidas (VENDAS, INSTALACOES, CANCELAMENTO/CHURN, MOVEL).' };
    }

    var resCRM = getContratosParaCruzamento();
    var crmRows = (resCRM && resCRM.dados) ? resCRM.dados : [];

    var consolidacao = _cruzConsolidarServer_(dados, crmRows);
    var resSalvar = aplicarVeroStatusCompleto(consolidacao.resultados);

    // Correcoes propostas (sobrescrita de dados). NAO sao aplicadas aqui —
    // viajam pro frontend para o passo de pre-visualizacao + confirmacao.
    // So o emoji VERO_STATUS e' gravado automaticamente (acima).
    var correcoes = _cruzComputarCorrecoesServer_(dados, crmRows);

    props.setProperty(CRUZ_VERO_PROP_LAST, threadId);

    return {
      sucesso: true,
      threadId: threadId,
      anexo: anexo.nome,
      recebidoEm: anexo.recebidoEm,
      contagem: {
        vendas: dados.vendas.length,
        instalacoes: dados.instalacoes.length,
        cancelamentos: dados.cancelamentos.length,
        movel: dados.movel.length,
        crmContratos: crmRows.length,
        marcados: consolidacao.resultados.length,
        verde_instalacoes: consolidacao.contagemInstalacoes,
        verde_vendas: consolidacao.contagemVendas,
        amarelos: consolidacao.contagemAmarelos,
        correcoes: correcoes.length
      },
      atualizadosNoSheet: resSalvar && resSalvar.atualizados || 0,
      // Dados detalhados pro frontend desenhar o kanban + persistir (localStorage)
      // e montar o painel de diff (mesmo do import manual).
      dados: dados,
      crmRows: crmRows,
      correcoes: correcoes
    };
  } finally {
    if (tempFileId) {
      try { DriveApp.getFileById(tempFileId).setTrashed(true); }
      catch (e) { Logger.log('Falha ao apagar temp ' + tempFileId + ': ' + e.message); }
    }
  }
}

// ── Gmail: buscar thread mais recente ────────────────────────────────────
function _buscarThreadVeroMaisRecente_() {
  // Encadeamento de buscas progressivamente mais largas para tolerar
  // diferentes pipelines de entrega (envio direto, encaminhamento Outlook,
  // assunto alterado, label nao aplicado etc).
  var queries = [
    'label:' + CRUZ_VERO_LABEL + ' has:attachment newer_than:14d',
    'from:(' + CRUZ_VERO_REMETENTE + ') subject:("' + CRUZ_VERO_ASSUNTO + '") has:attachment newer_than:14d',
    'subject:("SNIPER MOBILE") has:attachment newer_than:14d',
    'filename:"SNIPER MOBILE.xlsx" newer_than:14d',
    'filename:SNIPER has:attachment newer_than:14d'
  ];

  for (var i = 0; i < queries.length; i++) {
    var threads = GmailApp.search(queries[i], 0, 5);
    if (threads.length) {
      Logger.log('Vero: encontrou ' + threads.length + ' thread(s) via query #' + (i + 1) + ': ' + queries[i]);
      threads.sort(function(a, b) {
        return b.getLastMessageDate().getTime() - a.getLastMessageDate().getTime();
      });
      return threads[0];
    }
  }

  Logger.log('Vero: nenhuma das ' + queries.length + ' queries retornou thread.');
  return null;
}

// ── Gmail: baixar anexo XLSX ─────────────────────────────────────────────
function _baixarAnexoXlsxDoThread_(thread) {
  var msgs = thread.getMessages();
  for (var i = msgs.length - 1; i >= 0; i--) {
    var msg = msgs[i];
    var atts = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
    for (var j = 0; j < atts.length; j++) {
      var att = atts[j];
      var nome = att.getName() || '';
      if (/\.xlsx?$/i.test(nome)) {
        return {
          blob: att.copyBlob().setName(nome),
          nome: nome,
          recebidoEm: Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
        };
      }
    }
  }
  return null;
}

// ── Drive REST: converte XLSX -> Google Sheets via UrlFetchApp ───────────
function _xlsxParaSheetsTemp_(blob, nome) {
  var token = ScriptApp.getOAuthToken();
  var metadata = {
    name: '_cruz_vero_temp_' + new Date().getTime() + '_' + (nome || 'SNIPER.xlsx'),
    mimeType: 'application/vnd.google-apps.spreadsheet'
  };

  var boundary = '-------dharmapro_boundary_' + new Date().getTime();
  var delimiter = '\r\n--' + boundary + '\r\n';
  var closeDelim = '\r\n--' + boundary + '--';

  var bytes = blob.getBytes();
  var bodyParts = Utilities.newBlob(
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' + (blob.getContentType() || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') + '\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    Utilities.base64Encode(bytes) +
    closeDelim
  ).getBytes();

  var resp = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
    {
      method: 'post',
      contentType: 'multipart/related; boundary=' + boundary,
      headers: { Authorization: 'Bearer ' + token },
      payload: bodyParts,
      muteHttpExceptions: true
    }
  );

  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Drive upload falhou (' + code + '): ' + resp.getContentText());
  }
  var json = JSON.parse(resp.getContentText());
  return json.id;
}

// ── Le abas do Sheets temporario ─────────────────────────────────────────
function _extrairAbasVero_(fileId) {
  var wb = SpreadsheetApp.openById(fileId);
  var mapaAbas = {};
  wb.getSheets().forEach(function(sh) {
    mapaAbas[_cruzNormalizarTextoServer_(sh.getName())] = sh;
  });

  return {
    vendas:        _lerAbaVero_(mapaAbas, ['VENDAS']),
    instalacoes:   _lerAbaVero_(mapaAbas, ['INSTALACOES']),
    cancelamentos: _combinarListas_([
                     _lerAbaVero_(mapaAbas, ['CANCELAMENTO', 'CANCELAMENTOS']),
                     _lerAbaVero_(mapaAbas, ['CHURN'])
                   ]),
    movel:         _lerAbaVero_(mapaAbas, ['MOVEL'])
  };
}

function _lerAbaVero_(mapaAbas, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var key = _cruzNormalizarTextoServer_(aliases[i]);
    if (mapaAbas[key]) return _sheetToObjects_(mapaAbas[key]);
  }
  var chaves = Object.keys(mapaAbas);
  for (var k = 0; k < aliases.length; k++) {
    var alvo = _cruzNormalizarTextoServer_(aliases[k]);
    for (var c = 0; c < chaves.length; c++) {
      if (chaves[c].indexOf(alvo) > -1 || alvo.indexOf(chaves[c]) > -1) {
        return _sheetToObjects_(mapaAbas[chaves[c]]);
      }
    }
  }
  return [];
}

function _sheetToObjects_(sh) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var header = values[0].map(function(h) { return String(h || '').trim(); });
  var tz = Session.getScriptTimeZone();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var hasAny = false;
    var obj = {};
    for (var i = 0; i < header.length; i++) {
      var key = header[i];
      if (!key) continue;
      var v = row[i];
      if (v instanceof Date && !isNaN(v)) {
        v = Utilities.formatDate(v, tz, 'dd/MM/yyyy');
      } else if (v === null || v === undefined) {
        v = '';
      } else {
        v = String(v);
      }
      if (v !== '') hasAny = true;
      obj[key] = v;
    }
    if (hasAny) out.push(obj);
  }
  return out;
}

function _combinarListas_(listas) {
  var out = [];
  (listas || []).forEach(function(l) { if (l && l.length) out = out.concat(l); });
  return out;
}

// ── Consolidacao server-side (port de _cruzConsolidarESalvar) ────────────
function _cruzConsolidarServer_(dados, crmRows) {
  var idsVendas = {};
  (dados.vendas || []).forEach(function(row) {
    var id = _cruzNormIdServer_(row.ID_CONTRATO || row.CONTRATO || row.Contrato);
    if (id) idsVendas[id] = true;
  });

  var idsInstal = {};
  (dados.instalacoes || []).forEach(function(row) {
    var id = _cruzNormIdServer_(row.ID_CONTRATO || row.CONTRATO || row.Contrato);
    if (id) idsInstal[id] = true;
  });

  // Janela temporal para os 🟡: usa o mes/ano predominante da aba VENDAS
  // (DATA_CADASTRO) — soh marca 🟡 contratos do CRM cujo dataAtiv cai no
  // mesmo mes/ano. Evita marcar todo o historico como "falta no Vero"
  // quando o relatorio e diario.
  var mesVigente = _cruzMesVigenteServer_(dados.vendas || [], ['DATA_CADASTRO']);

  var resultados = [];
  var contV = 0, contI = 0, contA = 0;
  (crmRows || []).forEach(function(item) {
    if (!item || !item.linha) return;
    var id = _cruzNormIdServer_(item.contrato);
    if (!id) return;
    if (idsInstal[id]) {
      resultados.push({ linha: item.linha, veroStatus: '🟢 Instalações' });
      contI++;
    } else if (idsVendas[id]) {
      resultados.push({ linha: item.linha, veroStatus: '🟢 Vendas' });
      contV++;
    } else if (_cruzEhStatusVendaServer_(item.status)) {
      if (mesVigente && _cruzMesAnoCRMServer_(item.dataAtiv) !== mesVigente) return;
      resultados.push({ linha: item.linha, veroStatus: '🟡' });
      contA++;
    }
  });

  Logger.log('Cruz consolidacao — mesVigenteVendas=' + (mesVigente || 'todos') +
             ', verde_instal=' + contI + ', verde_vendas=' + contV + ', amarelos=' + contA);

  return {
    resultados: resultados,
    contagemInstalacoes: contI,
    contagemVendas: contV,
    contagemAmarelos: contA,
    mesVigente: mesVigente
  };
}

function _cruzMesAnoServer_(dataStr) {
  if (!dataStr) return null;
  var s = String(dataStr).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    var p = s.split('/');
    return p[1] + '/' + p[2];
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.substring(5, 7) + '/' + s.substring(0, 4);
  }
  return null;
}

function _cruzMesAnoCRMServer_(dataStr) {
  return _cruzMesAnoServer_(dataStr);
}

function _cruzMesVigenteServer_(rows, campos) {
  var contagem = {};
  (rows || []).forEach(function(row) {
    for (var i = 0; i < campos.length; i++) {
      var mesAno = _cruzMesAnoServer_(row[campos[i]]);
      if (mesAno) { contagem[mesAno] = (contagem[mesAno] || 0) + 1; break; }
    }
  });
  var mesVigente = null, maior = 0;
  Object.keys(contagem).forEach(function(k) {
    if (contagem[k] > maior) { maior = contagem[k]; mesVigente = k; }
  });
  return mesVigente;
}

function _cruzNormIdServer_(id) {
  if (id === null || id === undefined) return '';
  var bruto = String(id).trim().replace(/\.0$/, '').replace(/['"]/g, '');
  var soDig = bruto.replace(/\D+/g, '');
  return soDig || bruto.toUpperCase();
}

function _cruzNormalizarTextoServer_(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function _cruzEhStatusVendaServer_(status) {
  var key = _cruzNormalizarTextoServer_(status).replace(/\s*-\s*/g, ' - ');
  return key.indexOf('AGUARDANDO INSTALACAO') > -1
      || key.indexOf('FINALIZADA/INSTALADA') > -1
      || key.indexOf('INSTALADA') > -1;
}

// ══════════════════════════════════════════════════════════════════════════
//  SOBRESCRITA DE DADOS — computacao das correcoes (server-side)
//
//  Espelha a logica do frontend (_cruzComputarCorrecoes em Cruzamento.html).
//  Consolida os campos da planilha Vero por contrato e compara com os valores
//  atuais do CRM (crmRows ja traz codCli/valor/cidade/observacao/dataAtiv/instal).
//  Retorna SOMENTE as linhas com pelo menos uma diferenca. Nao grava nada.
//
//  Campos (decisao Ricardo 20/05): COD_CLI, INSTAL, VALOR, CIDADE, DATA_ATIV,
//  OBSERVACAO (append). Status preservado; match so por contrato; nao cria linha.
// ══════════════════════════════════════════════════════════════════════════
function _cruzComputarCorrecoesServer_(dados, crmRows) {
  var mapaVero = _cruzConsolidarCamposVeroServer_(dados);
  var mapaCodigos = _getCodigosVeroMapaFlat_();
  var correcoes = [];

  (crmRows || []).forEach(function(item) {
    if (!item || !item.linha) return;
    var id = _cruzNormIdServer_(item.contrato);
    if (!id) return;
    var v = mapaVero[id];
    if (!v) return;

    var campos = {};
    var diffs = [];

    // COD_CLI
    if (v.codCli && String(v.codCli).trim() !== '' &&
        String(v.codCli).trim() !== String(item.codCli || '').trim()) {
      campos.COD_CLI = String(v.codCli).trim();
      diffs.push({ campo: 'COD_CLI', label: 'Cód. cliente', atual: item.codCli || '', novo: campos.COD_CLI });
    }
    // INSTAL (compara em DD/MM/YYYY)
    if (v.instal) {
      var novoInst = _cruzToBRServer_(v.instal);
      var atualInst = _cruzToBRServer_(item.instal);
      if (novoInst && novoInst !== atualInst) {
        campos.INSTAL = novoInst;
        diffs.push({ campo: 'INSTAL', label: 'Data instalação', atual: atualInst, novo: novoInst });
      }
    }
    // DATA_ATIV
    if (v.dataAtiv) {
      var novoAtv = _cruzToBRServer_(v.dataAtiv);
      var atualAtv = _cruzToBRServer_(item.dataAtiv);
      if (novoAtv && novoAtv !== atualAtv) {
        campos.DATA_ATIV = novoAtv;
        diffs.push({ campo: 'DATA_ATIV', label: 'Data ativação', atual: atualAtv, novo: novoAtv });
      }
    }
    // VALOR (numerico)
    if (v.valor !== undefined && v.valor !== null && v.valor !== '') {
      var novoVal = _normalizarValorParaNumero_(v.valor);
      var atualVal = (item.valor === '' || item.valor === undefined || item.valor === null)
        ? '' : _normalizarValorParaNumero_(item.valor);
      if (novoVal !== '' && novoVal !== atualVal) {
        campos.VALOR = novoVal;
        diffs.push({
          campo: 'VALOR', label: 'Valor',
          atual: (atualVal === '' ? '' : 'R$ ' + _cruzValorBRServer_(atualVal)),
          novo: 'R$ ' + _cruzValorBRServer_(novoVal)
        });
      }
    }
    // CIDADE (compara normalizado — evita churn por caixa/acento)
    if (v.cidade && String(v.cidade).trim() !== '') {
      var novaCid = String(v.cidade).trim();
      if (_cruzNormalizarTextoServer_(novaCid) !== _cruzNormalizarTextoServer_(item.cidade || '')) {
        campos.CIDADE = novaCid;
        diffs.push({ campo: 'CIDADE', label: 'Cidade', atual: item.cidade || '', novo: novaCid });
      }
    }
    // OBSERVACAO (append idempotente)
    if (v.obsAppend && String(v.obsAppend).trim() !== '') {
      var linhaObs = String(v.obsAppend).trim();
      if (String(item.observacao || '').indexOf(linhaObs) === -1) {
        campos.OBSERVACAO_APPEND = linhaObs;
        diffs.push({ campo: 'OBSERVACAO', label: 'Observação (+)', atual: item.observacao || '', novo: linhaObs });
      }
    }
    // PLANO (codigo Vero -> nome_crm canonico; so confianca alta/media)
    if (v.planoCodigo && mapaCodigos[v.planoCodigo]) {
      var alvoPl = mapaCodigos[v.planoCodigo];
      if (alvoPl.nome && (alvoPl.conf === 'alta' || alvoPl.conf === 'media')) {
        var atualCore = _cruzPlanoCore_(item.plano);
        var novoCore  = _cruzPlanoCore_(alvoPl.nome);
        if (novoCore && _cruzNormalizarTextoServer_(novoCore) !== _cruzNormalizarTextoServer_(atualCore)) {
          campos.PLANO = alvoPl.nome;
          diffs.push({
            campo: 'PLANO',
            label: 'Plano' + (alvoPl.conf === 'media' ? ' (conf. média)' : ''),
            atual: item.plano || '', novo: alvoPl.nome
          });
        }
      }
    }

    if (diffs.length) {
      correcoes.push({
        linha: item.linha,
        contrato: item.contrato,
        cliente: item.cliente || '',
        campos: campos,
        diffs: diffs
      });
    }
  });

  return correcoes;
}

// Consolida os campos sobrescreviveis da planilha Vero por ID de contrato.
// Prioridade por aba: INSTALACOES (instal+valor) > VENDAS (codCli+cidade+dataAtiv)
// > MOVEL (idem movel) ; CANCELAMENTO/CHURN contribui so com a observacao.
// "primeiro nao-vazio vence" dentro dessa ordem.
function _cruzConsolidarCamposVeroServer_(dados) {
  var mapa = {};
  function ensure(id) { if (!mapa[id]) mapa[id] = {}; return mapa[id]; }

  (dados.instalacoes || []).forEach(function(row) {
    var id = _cruzNormIdServer_(row.ID_CONTRATO || row.CONTRATO || row.Contrato);
    if (!id) return;
    var o = ensure(id);
    var hab = row.DATA_HABILITACAO || row['DATA_HABILITAÇÃO'] || row['DATA_HABILITAÇAO'] || '';
    if (hab && !o.instal) o.instal = hab;
    if ((row.VALOR_CONTRATO || row.VALOR_CONTRATO === 0) && o.valor === undefined) o.valor = row.VALOR_CONTRATO;
    if (row.COD_CLIENTE && !o.codCli) o.codCli = row.COD_CLIENTE;
    if (row.CIDADE_HIERARQUIA && !o.cidade) o.cidade = row.CIDADE_HIERARQUIA;
    if (row.DATA_CADASTRO && !o.dataAtiv) o.dataAtiv = row.DATA_CADASTRO;
    if (row.NOME_PLANO_ATUAL && !o.planoCodigo) o.planoCodigo = _cruzExtrairCodigoPlano_(row.NOME_PLANO_ATUAL);
  });

  (dados.vendas || []).forEach(function(row) {
    var id = _cruzNormIdServer_(row.ID_CONTRATO || row.CONTRATO || row.Contrato);
    if (!id) return;
    var o = ensure(id);
    if (row.COD_CLIENTE && !o.codCli) o.codCli = row.COD_CLIENTE;
    if (row.CIDADE_HIERARQUIA && !o.cidade) o.cidade = row.CIDADE_HIERARQUIA;
    if (row.DATA_CADASTRO && !o.dataAtiv) o.dataAtiv = row.DATA_CADASTRO;
    if (row.NOME_PLANO_ATUAL && !o.planoCodigo) o.planoCodigo = _cruzExtrairCodigoPlano_(row.NOME_PLANO_ATUAL);
  });

  (dados.movel || []).forEach(function(row) {
    var id = _cruzNormIdServer_(row.IDCONTRATO || row.ID_CONTRATO || row.CONTRATO || row.Contrato);
    if (!id) return;
    var o = ensure(id);
    if (row.IDCLIENTE && !o.codCli) o.codCli = row.IDCLIENTE;
    var vm = row.VALOR_CONTRATO_MOVEL || row.VALOR_CONTRATO;
    if ((vm || vm === 0) && o.valor === undefined) o.valor = vm;
    if (row.DATA_VENDA && !o.dataAtiv) o.dataAtiv = row.DATA_VENDA;
    if (row.DATAHABILITACAO && !o.instal) o.instal = row.DATAHABILITACAO;
    if (row.CIDADE && !o.cidade) o.cidade = row.CIDADE;
    if (row.PLANO && !o.planoCodigo) o.planoCodigo = _cruzExtrairCodigoPlano_(row.PLANO);
  });

  (dados.cancelamentos || []).forEach(function(row) {
    var id = _cruzNormIdServer_(row.ID_CONTRATO || row.CONTRATO || row.Contrato);
    if (!id) return;
    var o = ensure(id);
    if (!o.obsAppend) o.obsAppend = _cruzMontarObsCancelamentoServer_(row);
  });

  return mapa;
}

function _cruzMontarObsCancelamentoServer_(row) {
  var data = row.DATA_CANCELAMENTO || '';
  var tipo = row.TIPO_CANCELAMENTO || '';
  var motivo = row.MOTIVO_CANCELAMENTO || '';
  var base = '[Vero] CANCELADO' + (data ? ' ' + data : '');
  var extra = [tipo, motivo].filter(function(x) { return x && String(x).trim() !== ''; }).join(' · ');
  return extra ? (base + ' · ' + extra) : base;
}

function _cruzToBRServer_(s) {
  if (!s) return '';
  s = String(s).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    var p = s.substring(0, 10).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  return s;
}

function _cruzValorBRServer_(n) {
  var num = Number(n);
  if (!isFinite(num)) return String(n);
  return num.toFixed(2).replace('.', ',');
}

// Extrai o codigo numerico do nome do plano Vero. Aceita "4624 - VERO MAIS ..."
// e "VERO 4390 - VERO CONTROLE ..." (Movel). Sem match -> ''.
function _cruzExtrairCodigoPlano_(s) {
  if (!s) return '';
  var m = String(s).match(/(\d{3,5})\s*-\s/);
  return m ? m[1] : '';
}

// Remove o sufixo de preco "| R$ XX,XX" do nome do plano pra comparar so o nome.
function _cruzPlanoCore_(s) {
  if (!s) return '';
  return String(s).replace(/\s*\|\s*R?\$?\s*[\d.,]+\s*$/i, '').trim();
}
