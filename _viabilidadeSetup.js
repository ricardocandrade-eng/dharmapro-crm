// ══════════════════════════════════════════════════════════════════════════════
//  _viabilidadeSetup.js — one-shots de setup do módulo Viabilidade (Sprint 3)
//
//  TEMPORÁRIO. Após Ricardo executar as funções no editor Apps Script,
//  remover este arquivo no próximo push (padrão `_cruzAutoSetup.js`, etc.).
//
//  Sequência:
//   1. _criarAbaViabilidade()              — cria aba "Consultas Viabilidade"
//   2. _setViabilidadeExtensionId("<ID>")  — grava EXTENSION_ID em Script Properties
//   3. _setViabilidadeAtivo(true)          — liga a feature flag
//   4. _checarConfigViabilidade()          — confirma estado (opcional)
//
//  Observação: o EXTENSION_ID aparece em chrome://extensions (modo desenvolvedor)
//  após Ricardo carregar a extensão `extensao-dharmapro` (v2.2.0).
// ══════════════════════════════════════════════════════════════════════════════

function _criarAbaViabilidade() {
  var nome = 'Consultas Viabilidade'; // mesmo valor de VIABILIDADE_ABA em ViabilidadeAPI.js
  var ss = _getSpreadsheet_();
  var sheet = ss.getSheetByName(nome);
  if (sheet) {
    Logger.log('Aba "' + nome + '" já existe — nada a fazer.');
    return { ok: true, criada: false, abaId: sheet.getSheetId() };
  }
  sheet = ss.insertSheet(nome);
  // Header A-G conforme spec §7
  var headers = ['TIMESTAMP', 'USUARIO', 'ENDERECO_HASH', 'RESULTADO', 'CTOS_QTD', 'MOTIVO', 'META_JSON'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a1d24').setFontColor('#e8ecf3');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 1, 170);   // A TIMESTAMP
  sheet.setColumnWidths(2, 1, 140);   // B USUARIO
  sheet.setColumnWidths(3, 1, 140);   // C HASH
  sheet.setColumnWidths(4, 1, 130);   // D RESULTADO
  sheet.setColumnWidths(5, 1, 80);    // E CTOS_QTD
  sheet.setColumnWidths(6, 1, 320);   // F MOTIVO
  sheet.setColumnWidths(7, 1, 300);   // G META_JSON
  Logger.log('OK — aba "' + nome + '" criada com 7 colunas. ID: ' + sheet.getSheetId());
  return { ok: true, criada: true, abaId: sheet.getSheetId() };
}

function _setViabilidadeAtivo(ligar) {
  var v = (ligar === true || String(ligar) === '1' || String(ligar).toLowerCase() === 'true') ? '1' : '0';
  PropertiesService.getScriptProperties().setProperty('VIABILIDADE_ATIVO', v);
  Logger.log('OK — VIABILIDADE_ATIVO=' + v + (v === '1' ? ' (ligado)' : ' (desligado)'));
  return { ok: true, ativo: v === '1' };
}

function _setViabilidadeExtensionId(id) {
  var s = String(id || '').trim();
  if (!/^[a-p]{32}$/.test(s)) {
    Logger.log('AVISO: ID "' + s + '" não bate com formato esperado (32 chars a-p). Gravando mesmo assim.');
  }
  PropertiesService.getScriptProperties().setProperty('VIABILIDADE_EXTENSION_ID', s);
  Logger.log('OK — VIABILIDADE_EXTENSION_ID gravado: ' + s);
  return { ok: true, extensionId: s };
}

function _checarConfigViabilidade() {
  var props = PropertiesService.getScriptProperties();
  var ativo = props.getProperty('VIABILIDADE_ATIVO');
  var extId = props.getProperty('VIABILIDADE_EXTENSION_ID');
  var key   = props.getProperty('CLAUDE_API_KEY');
  var sheet = null;
  try { sheet = _getSpreadsheet_().getSheetByName('Consultas Viabilidade'); } catch (e) {}
  var info = {
    VIABILIDADE_ATIVO:        ativo || '(não setado)',
    VIABILIDADE_EXTENSION_ID: extId ? (extId.substr(0,8) + '... (' + extId.length + ' chars)') : '(não setado)',
    CLAUDE_API_KEY:           key ? '✓ presente' : '✗ AUSENTE (cleanup IA não vai funcionar)',
    aba_consultas_viabilidade: sheet ? '✓ existe (id ' + sheet.getSheetId() + ', ' + sheet.getLastRow() + ' linhas)' : '✗ AUSENTE — rodar _criarAbaViabilidade()'
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}
