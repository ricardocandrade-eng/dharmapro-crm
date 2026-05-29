// ════════════════════════════════════════════════════════════════════════════
//  ONE-SHOT — Inadimplência menu setup
//
//  Sincroniza `PERFIS_MENUS_JSON` (Script Property) com o Config.js — adiciona
//  'inadimplencia' ao perfil admin. Necessário porque a property sombreia o
//  Config.js quando existe (mesma pegadinha de viabilidade/vinculosPendentes
//  em 20/05 e financeiro em 21/05).
//
//  USO:
//   1. clasp push (esta one-shot vai pro GAS)
//   2. Ricardo abre o editor Apps Script, seleciona `inadimplenciaMenuSetup`
//      no dropdown, clica Executar. Log mostra resultado.
//   3. Ricardo faz LOGOUT/LOGIN no CRM (permissões só recarregam no login).
//   4. Depois removo este arquivo no próximo push.
//
//  Idempotente — re-rodar é seguro.
// ════════════════════════════════════════════════════════════════════════════

function inadimplenciaMenuSetup() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('PERFIS_MENUS_JSON');

  if (!raw) {
    Logger.log('PERFIS_MENUS_JSON não existe. Config.js já tem inadimplencia no admin — nada a fazer.');
    Logger.log('Ricardo: faça LOGOUT/LOGIN no CRM pra ver o menu.');
    return { ok: true, jaNoConfig: true };
  }

  var perfis;
  try {
    perfis = JSON.parse(raw);
  } catch (e) {
    Logger.log('PERFIS_MENUS_JSON corrompido: ' + e.message);
    return { ok: false, erro: 'JSON corrompido' };
  }

  if (!perfis.admin || !Array.isArray(perfis.admin)) {
    Logger.log('PERFIS_MENUS_JSON.admin ausente ou inválido. Abortando — investigar manualmente.');
    return { ok: false, erro: 'admin ausente' };
  }

  var antes = perfis.admin.length;
  if (perfis.admin.indexOf('inadimplencia') === -1) {
    perfis.admin.push('inadimplencia');
  }
  var depois = perfis.admin.length;

  props.setProperty('PERFIS_MENUS_JSON', JSON.stringify(perfis));

  Logger.log('PERFIS_MENUS_JSON.admin: ' + antes + ' → ' + depois + ' menus.');
  Logger.log('inadimplencia presente: ' + (perfis.admin.indexOf('inadimplencia') > -1));
  Logger.log('Ricardo: faça LOGOUT/LOGIN no CRM pra ver o menu ◇ Inadimplência.');
  return { ok: true, antes: antes, depois: depois, menus: perfis.admin };
}
