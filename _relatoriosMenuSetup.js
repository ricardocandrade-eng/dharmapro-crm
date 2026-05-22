// ══════════════════════════════════════════════════════════════════════════════
//  _relatoriosMenuSetup.js — ONE-SHOT (rodar UMA VEZ no editor Apps Script)
//
//  A Script Property PERFIS_MENUS_JSON SOMBREIA o Config.js quando existe. Logo,
//  adicionar 'relatorios' ao Config.js não basta se a property já existe em
//  produção — é preciso fazer a UNIÃO de 'relatorios' nos perfis dentro do JSON.
//
//  Passos:
//    1. clasp push (este arquivo NÃO está no .claspignore? confirmar — deve subir)
//    2. No editor: rodar  relatoriosMenuSetup()
//    3. Conferir o log ("OK — perfis atualizados: ...")
//    4. LOGOUT/LOGIN no CRM (permissões só recarregam no login)
//    5. Remover este arquivo no próximo push
//
//  Perfis que ganham 'relatorios': admin, supervisor (espelha o Config.js).
// ══════════════════════════════════════════════════════════════════════════════

function relatoriosMenuSetup() {
  var PERFIS_ALVO = ['admin', 'supervisor'];
  var MENU = 'relatorios';
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('PERFIS_MENUS_JSON');

  // Base: o JSON em produção, ou o Config.js se ainda não houver JSON.
  var mapa;
  if (raw) {
    mapa = JSON.parse(raw);
  } else {
    mapa = JSON.parse(JSON.stringify(PERFIS_MENUS)); // clona o default do Config.js
  }

  var alterados = [];
  PERFIS_ALVO.forEach(function(perfil) {
    if (!mapa[perfil]) mapa[perfil] = [];
    if (mapa[perfil].indexOf(MENU) === -1) {
      // insere logo após 'dash' quando possível, senão no fim
      var idx = mapa[perfil].indexOf('dash');
      if (idx > -1) mapa[perfil].splice(idx + 1, 0, MENU);
      else mapa[perfil].push(MENU);
      alterados.push(perfil);
    }
  });

  props.setProperty('PERFIS_MENUS_JSON', JSON.stringify(mapa));
  Logger.log('OK — origem: ' + (raw ? 'PERFIS_MENUS_JSON existente' : 'Config.js (novo JSON)') +
             '. Perfis atualizados: ' + (alterados.length ? alterados.join(', ') : 'nenhum (já tinham relatorios)') +
             '. Faça LOGOUT/LOGIN para recarregar as permissões.');
}

// Diagnóstico: imprime o estado atual sem alterar nada.
function relatoriosMenuCheck() {
  var raw = PropertiesService.getScriptProperties().getProperty('PERFIS_MENUS_JSON');
  if (!raw) { Logger.log('Sem PERFIS_MENUS_JSON — vale o Config.js: ' + JSON.stringify(PERFIS_MENUS)); return; }
  var mapa = JSON.parse(raw);
  Object.keys(mapa).forEach(function(p) {
    Logger.log(p + ': tem relatorios? ' + (mapa[p].indexOf('relatorios') > -1));
  });
}
