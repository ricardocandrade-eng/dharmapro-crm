/**
 * ONE-SHOT — sincroniza PERFIS_MENUS_JSON (Script Property) com a
 * página nova "Alertas Operacionais" no perfil admin.
 *
 * Roda no editor Apps Script. Necessário porque PERFIS_MENUS_JSON sombreia
 * o Config.js quando existe — adicionar 'alertasOp' apenas em Config.js
 * não basta. Ver § "Sistema → Gerenciar Usuários" no CLAUDE.md.
 *
 * Após rodar:
 *   1. Logout do CRM.
 *   2. Login novamente — menu "Alertas Operacionais" aparece sob Sistema.
 *
 * Avisar quando rodar — eu deleto este arquivo no próximo push.
 */
function _alertasOpMenuSetup() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('PERFIS_MENUS_JSON');

  if (!raw) {
    Logger.log('PERFIS_MENUS_JSON não existe — Config.js já é a fonte de verdade. Nada a fazer.');
    return { ok: true, mensagem: 'JSON ausente — Config.js basta.' };
  }

  var perfis;
  try { perfis = JSON.parse(raw); }
  catch (e) { Logger.log('JSON inválido: ' + e.message); return { ok: false, mensagem: 'JSON inválido' }; }

  var antesAdmin = (perfis.admin || []).slice();
  if ((perfis.admin || []).indexOf('alertasOp') < 0) {
    perfis.admin = (perfis.admin || []).concat('alertasOp');
  }

  // Tenta unir com o Config.js também (defensivo: garante todos os menus admin)
  if (typeof PERFIS_MENUS === 'object' && PERFIS_MENUS.admin) {
    PERFIS_MENUS.admin.forEach(function (m) {
      if ((perfis.admin || []).indexOf(m) < 0) perfis.admin.push(m);
    });
  }

  props.setProperty('PERFIS_MENUS_JSON', JSON.stringify(perfis));

  Logger.log('PERFIS_MENUS_JSON.admin ANTES: ' + JSON.stringify(antesAdmin));
  Logger.log('PERFIS_MENUS_JSON.admin DEPOIS: ' + JSON.stringify(perfis.admin));
  Logger.log('Faça logout/login pra recarregar as permissões.');
  return { ok: true, antes: antesAdmin, depois: perfis.admin };
}
