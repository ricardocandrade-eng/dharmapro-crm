// ONE-SHOT — Fase 9. A Script Property PERFIS_MENUS_JSON SOMBREIA o Config.js
// (regra do CLAUDE.md). Sem sincronizar, o menu '◐ Financeiro' não aparece pro
// admin mesmo estando no Config.js. Esta função faz a UNIÃO defensiva do admin do
// JSON com o admin do Config.js + garante 'financeiro'.
// Rodar UMA VEZ no editor, depois LOGOUT/LOGIN. Deletar este arquivo + novo push.
function financeiroMenuSetup() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('PERFIS_MENUS_JSON');
  if (!raw) {
    return 'PERFIS_MENUS_JSON não existe — Config.js já é a fonte da verdade e ' +
           "'financeiro' já está no admin do Config.js. Nada a fazer (só logout/login).";
  }
  var perfis = JSON.parse(raw);
  var cfgAdmin = (typeof PERFIS_MENUS !== 'undefined' && PERFIS_MENUS.admin) ? PERFIS_MENUS.admin : [];
  var atual = perfis.admin || [];
  var uniao = atual.slice();
  cfgAdmin.forEach(function(m) { if (uniao.indexOf(m) === -1) uniao.push(m); });
  if (uniao.indexOf('financeiro') === -1) uniao.push('financeiro');
  perfis.admin = uniao;
  props.setProperty('PERFIS_MENUS_JSON', JSON.stringify(perfis));
  var msg = 'OK — admin sincronizado (inclui financeiro). Faça LOGOUT/LOGIN. admin agora: ' + uniao.join(', ');
  Logger.log(msg);
  return msg;
}
