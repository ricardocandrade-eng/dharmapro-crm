// ══════════════════════════════════════════════════════════════════════════════
//  _viabilidadeSetup.js — one-shots de setup do módulo Viabilidade (Sprint 3)
//
//  TEMPORÁRIO. Após executar `_setupViabilidadeCompleto()` no editor,
//  remover este arquivo no próximo push (padrão `_cruzAutoSetup.js`, etc.).
//
//  USO RÁPIDO (recomendado): rodar UMA função no editor:
//      _setupViabilidadeCompleto()
//   → cria a aba, grava o EXTENSION_ID, liga a flag e loga o diagnóstico.
//
//  USO PASSO-A-PASSO (se preferir):
//   1. _criarAbaViabilidade()        — cria aba "Consultas Viabilidade"
//   2. _setViabilidadeExtensionId()  — grava EXTENSION_ID (hardcoded abaixo)
//   3. _setViabilidadeAtivo(true)    — liga a feature flag
//   4. _checarConfigViabilidade()    — confirma estado
//
//  Observação: o EXTENSION_ID aparece em chrome://extensions (modo desenvolvedor)
//  após carregar a extensão `extensao-dharmapro` (v2.2.0). É derivado do path
//  absoluto da pasta unpacked — se trocar a localização, o ID muda; atualizar
//  a constante abaixo.
// ══════════════════════════════════════════════════════════════════════════════

// EXTENSION_ID da extensao-dharmapro carregada em chrome://extensions na máquina
// do Ricardo (G:\Meu Drive\Projetos Claude\dharmapro-crm\extensao-dharmapro\).
var _VIABILIDADE_EXTENSION_ID_HARDCODED = 'mikdfeacogcdcamoekipafammdfhlmcb';

// ─── ONE-SHOT MASTER ─────────────────────────────────────────────────────────
function _setupViabilidadeCompleto() {
  Logger.log('1/5 — Criando aba "Consultas Viabilidade"...');
  _criarAbaViabilidade();
  Logger.log('2/5 — Gravando EXTENSION_ID em Script Properties...');
  _setViabilidadeExtensionId();
  Logger.log('3/5 — Ligando feature flag VIABILIDADE_ATIVO...');
  _setViabilidadeAtivo(true);
  Logger.log('4/5 — Adicionando "viabilidade" aos PERFIS_MENUS_JSON...');
  _adicionarViabilidadeNosMenus();
  Logger.log('5/5 — Diagnóstico final:');
  return _checarConfigViabilidade();
}

// Adiciona 'viabilidade' a admin + backoffice no PERFIS_MENUS_JSON do Script
// Properties. Preserva qualquer customização que Ricardo tenha feito via UI
// de Gerenciar Usuários. Idempotente.
function _adicionarViabilidadeNosMenus() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('PERFIS_MENUS_JSON');
  var perfis;
  if (raw) {
    try { perfis = JSON.parse(raw); }
    catch (e) {
      Logger.log('PERFIS_MENUS_JSON corrompido (' + e.message + '). Usando Config.js como base.');
      perfis = JSON.parse(JSON.stringify(PERFIS_MENUS));
    }
  } else {
    Logger.log('Nenhum PERFIS_MENUS_JSON gravado; copiando de Config.js.');
    perfis = JSON.parse(JSON.stringify(PERFIS_MENUS));
  }
  var perfisAlvo = ['admin', 'backoffice'];
  var mudou = false;
  perfisAlvo.forEach(function (p) {
    if (!Array.isArray(perfis[p])) {
      perfis[p] = [];
      mudou = true;
      Logger.log('  - perfil "' + p + '" estava ausente; criado vazio.');
    }
    if (perfis[p].indexOf('viabilidade') === -1) {
      perfis[p].push('viabilidade');
      mudou = true;
      Logger.log('  + "viabilidade" adicionado ao perfil "' + p + '".');
    } else {
      Logger.log('  ✓ "viabilidade" já presente no perfil "' + p + '".');
    }
  });
  if (mudou) {
    props.setProperty('PERFIS_MENUS_JSON', JSON.stringify(perfis));
    Logger.log('OK — PERFIS_MENUS_JSON atualizado.');
  } else {
    Logger.log('OK — nada a mudar.');
  }
  return { ok: true, perfis: perfis };
}

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

// Sem args → LIGA (default). Aceita arg true/false se chamada por outra função.
function _setViabilidadeAtivo(ligar) {
  // dropdown do editor passa undefined; nesse caso liga
  var deveLigar = (ligar === undefined) ? true :
                  (ligar === true || String(ligar) === '1' || String(ligar).toLowerCase() === 'true');
  var v = deveLigar ? '1' : '0';
  PropertiesService.getScriptProperties().setProperty('VIABILIDADE_ATIVO', v);
  Logger.log('OK — VIABILIDADE_ATIVO=' + v + (v === '1' ? ' (ligado)' : ' (desligado)'));
  return { ok: true, ativo: v === '1' };
}

// Helper explícito pra desligar (chame via dropdown se precisar)
function _desligarViabilidade() {
  return _setViabilidadeAtivo(false);
}

// Sem parâmetros — pega da constante no topo do arquivo (Editor Apps Script
// não passa args via dropdown "Executar"). Para mudar o ID: editar a const
// _VIABILIDADE_EXTENSION_ID_HARDCODED no topo deste arquivo + clasp push.
function _setViabilidadeExtensionId() {
  var s = String(_VIABILIDADE_EXTENSION_ID_HARDCODED || '').trim();
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
