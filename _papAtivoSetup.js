// ══════════════════════════════════════════════════════════════════════════════
// _papAtivoSetup.js — one-shot do feature "Vendedores PAP" (CRM)
//
// FLUXO (Ricardo executa no editor, na ordem):
//   1. setupColunaAtivoPAP()        — grava header AC4 + backfilla ativo=true
//   2. papSincronizarMenuVendedoresPap() — adiciona 'vendedoresPap' em
//                                     PERFIS_MENUS_JSON (admin + backoffice)
// (Sem `_` no início pra aparecer no dropdown "Executar" do editor.)
//
// Depois disso, logout/login no CRM para o menu aparecer.
// Pode remover este arquivo no próximo push.
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

// (1) Cria header "ATIVO" em AC4 e marca todas as linhas existentes como ativas.
//     Idempotente: pode rodar quantas vezes quiser.
function setupColunaAtivoPAP() {
  var ss = _getSpreadsheet_();
  var sh = ss.getSheetByName('3 - PAP');
  if (!sh) {
    Logger.log('Aba "3 - PAP" não encontrada.');
    return;
  }

  // Cabeçalho na linha 4, coluna AC (29).
  var headerCel = sh.getRange(4, 29);
  if (!headerCel.getValue()) {
    headerCel.setValue('ATIVO');
    headerCel.setFontWeight('bold');
  }

  var lastRow = sh.getLastRow();
  if (lastRow < 5) {
    Logger.log('Sem linhas de dados para backfillar (lastRow=' + lastRow + ').');
    SpreadsheetApp.flush();
    return;
  }

  // Lê AC + S (nome) para só marcar linhas que têm vendedor; preserva ativo=false
  // que já tenha sido marcado manualmente.
  var numRows = lastRow - 4;
  var rangeNome  = sh.getRange(5, 19, numRows, 1).getValues();
  var rangeAtivo = sh.getRange(5, 29, numRows, 1).getValues();

  var atualizados = 0;
  for (var i = 0; i < numRows; i++) {
    var nome = String(rangeNome[i][0] || '').trim();
    if (!nome) continue; // linha vazia → ignora
    if (rangeAtivo[i][0] === '' || rangeAtivo[i][0] === null || rangeAtivo[i][0] === undefined) {
      rangeAtivo[i][0] = true;
      atualizados++;
    }
  }

  if (atualizados > 0) {
    sh.getRange(5, 29, numRows, 1).setValues(rangeAtivo);
  }
  SpreadsheetApp.flush();
  Logger.log('OK — header garantido em AC4; ' + atualizados + ' vendedor(es) marcados como ATIVO=true.');
}

// (2) Sincroniza 'vendedoresPap' em PERFIS_MENUS_JSON para admin + backoffice.
//     PERFIS_MENUS_JSON sombreia o Config.js quando existe — sem este passo,
//     o item de menu não aparece para o usuário até logout/login + republish.
function papSincronizarMenuVendedoresPap() {
  var props = PropertiesService.getScriptProperties();
  var raw   = props.getProperty('PERFIS_MENUS_JSON');
  var perfilMenus;

  if (raw) {
    try { perfilMenus = JSON.parse(raw); }
    catch (e) {
      Logger.log('PERFIS_MENUS_JSON corrompido; reinicializando com base no Config.js. erro=' + e.message);
      perfilMenus = null;
    }
  }
  if (!perfilMenus) {
    // Clone do Config.js
    perfilMenus = JSON.parse(JSON.stringify(typeof PERFIS_MENUS !== 'undefined' ? PERFIS_MENUS : {}));
  }

  var alvos = ['admin', 'backoffice'];
  var changed = false;
  alvos.forEach(function(p) {
    if (!Array.isArray(perfilMenus[p])) perfilMenus[p] = [];
    if (perfilMenus[p].indexOf('vendedoresPap') === -1) {
      perfilMenus[p].push('vendedoresPap');
      changed = true;
    }
  });

  if (changed) {
    props.setProperty('PERFIS_MENUS_JSON', JSON.stringify(perfilMenus));
    Logger.log('OK — vendedoresPap adicionado a: ' + alvos.join(', ') + '. Logout/login para refletir.');
  } else {
    Logger.log('Nada a fazer — vendedoresPap já presente em admin + backoffice.');
  }
}
