/**
 * ONE-SHOT — diagnóstico + (re)setup das dependências da página
 * "Alertas Operacionais" (29/05/2026).
 *
 * Roda 3 funções no editor Apps Script, na ordem:
 *   1. _alertasOpDiag()        — mostra estado atual sem mudar nada.
 *   2. _setN8nApiKey()         — grava N8N_API_KEY + self-test (idempotente).
 *   3. _alertasOpMenuSetup()   — sincroniza PERFIS_MENUS_JSON (idempotente).
 *
 * Depois: logout + login no CRM.
 *
 * Eu deleto este arquivo após confirmação de que apareceu o menu.
 */

// ── DIAG ──────────────────────────────────────────────────────────────────
function _alertasOpDiag() {
  var p = PropertiesService.getScriptProperties();
  var resultado = {};

  // 1) N8N_API_KEY
  var key = p.getProperty('N8N_API_KEY');
  resultado.N8N_API_KEY = key
    ? { gravada: true, len: key.length, preview: key.substr(0, 30) + '...' }
    : { gravada: false };

  // 2) PERFIS_MENUS_JSON
  var raw = p.getProperty('PERFIS_MENUS_JSON');
  if (!raw) {
    resultado.PERFIS_MENUS_JSON = {
      existe: false,
      consequencia: 'Config.js é fonte de verdade. Como Config.js já tem alertasOp, deveria funcionar.'
    };
  } else {
    try {
      var perfis = JSON.parse(raw);
      resultado.PERFIS_MENUS_JSON = {
        existe: true,
        admin: perfis.admin || [],
        adminTemAlertasOp: (perfis.admin || []).indexOf('alertasOp') >= 0,
        supervisor: perfis.supervisor || [],
        backoffice: perfis.backoffice || []
      };
    } catch (e) {
      resultado.PERFIS_MENUS_JSON = { existe: true, parseError: e.message };
    }
  }

  // 3) Confere se Config.js (em runtime) tem alertasOp em admin
  try {
    var cfgAdmin = (typeof PERFIS_MENUS === 'object' && PERFIS_MENUS.admin) || [];
    resultado.Config_PERFIS_MENUS_admin = cfgAdmin;
    resultado.Config_admin_tem_alertasOp = cfgAdmin.indexOf('alertasOp') >= 0;
  } catch (e) {
    resultado.Config_PERFIS_MENUS_admin = 'erro: ' + e.message;
  }

  // 4) DEPLOY_DATE pra confirmar versão em produção
  resultado.DEPLOY_DATE = (typeof DEPLOY_DATE !== 'undefined') ? DEPLOY_DATE : 'indef';

  Logger.log('_alertasOpDiag →\n' + JSON.stringify(resultado, null, 2));
  return resultado;
}

// ── SETUP N8N_API_KEY ─────────────────────────────────────────────────────
function _setN8nApiKey() {
  var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMzZlNDMzMi1iOGRiLTRhZWUtYjUwMS1iMTA5OGFhMjJhMDMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzc5NjQ5NjAxfQ.6KTNmgxOgh0bVfE2OAPLYOBDwP_ONj1tuqdIN3BeQJM';

  PropertiesService.getScriptProperties().setProperty('N8N_API_KEY', key);
  Logger.log('N8N_API_KEY gravada. len=' + key.length);

  // Self-test
  try {
    var resp = UrlFetchApp.fetch(
      'https://n8n.ofertasverointernet.com.br/api/v1/workflows?active=true',
      { method: 'get', headers: { 'X-N8N-API-KEY': key }, muteHttpExceptions: true }
    );
    var code = resp.getResponseCode();
    if (code === 200) {
      var data = JSON.parse(resp.getContentText());
      var qtd = (data.data || []).length;
      Logger.log('Self-test OK — ' + qtd + ' workflows ativos.');
      return { ok: true, workflowsAtivos: qtd };
    }
    Logger.log('Self-test FALHOU — HTTP ' + code + ': ' + resp.getContentText().slice(0, 200));
    return { ok: false, http: code };
  } catch (e) {
    Logger.log('Self-test erro: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ── SETUP PERFIS_MENUS_JSON ───────────────────────────────────────────────
function _alertasOpMenuSetup() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('PERFIS_MENUS_JSON');

  if (!raw) {
    Logger.log('PERFIS_MENUS_JSON não existe — Config.js é a fonte de verdade.');
    Logger.log('Config.js JÁ tem alertasOp em admin (commit 7198d95).');
    Logger.log('Tudo certo. Só falta logout/login no CRM.');
    return { ok: true, mensagem: 'JSON ausente — Config.js basta.' };
  }

  var perfis;
  try { perfis = JSON.parse(raw); }
  catch (e) { Logger.log('JSON inválido: ' + e.message); return { ok: false, mensagem: 'JSON inválido' }; }

  var antesAdmin = (perfis.admin || []).slice();
  if ((perfis.admin || []).indexOf('alertasOp') < 0) {
    perfis.admin = (perfis.admin || []).concat('alertasOp');
  }

  // Defensivo: une admin do JSON com admin do Config.js
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
