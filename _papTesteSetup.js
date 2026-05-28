/**
 * ONE-SHOT — smoke test da migração PAP→Evolution (27/05/2026).
 *
 * Roda no editor Apps Script: chama `_papEnviarMensagemDireta` direto, que
 * dispara via Evolution na instância Ricardo_Andrade (chip 5532991534154).
 *
 * Destino: DM Ricardo (5532988015161). Mesmo número que recebe os alertas
 * de tráfego do `disparo-grupo` Flow 1 (apelido "ricardo"), então se o teste
 * chegar lá, sabe-se que o caminho PAP→Evolution funciona ponta a ponta
 * com a feature flag PAP_CANAL_NOTIFICACAO default (EVOLUTION).
 *
 * Como rodar:
 *   1. Abrir o editor Apps Script (script.google.com)
 *   2. Selecionar `_papTesteEnvio` no dropdown "Executar"
 *   3. Clicar Executar e olhar o Log
 *   4. Conferir o WhatsApp do 988015161
 *
 * Após validar, deletar este arquivo no próximo push.
 */
function _papTesteEnvio() {
  var alvo = '32988015161';
  var msg  = '🧪 [Teste DharmaPro] Smoke test PAP → Evolution\n' +
             'Disparado via _papEnviarMensagemDireta (chip 5532991534154 → Ricardo_Andrade).\n' +
             'Pode ignorar — só validando o caminho novo de notificações PAP.';
  var res  = _papEnviarMensagemDireta(alvo, msg);
  Logger.log('_papTesteEnvio → ' + JSON.stringify(res));
  return res;
}

/**
 * Variante: testa explicitamente via `_papEnviarMensagemEvolution_` (helper
 * de baixo nível, sem passar pela feature flag). Útil se `_papTesteEnvio`
 * retornar `{sucesso:true, mensagem:'Canal de notificação desligado (kill switch).'}`
 * — ou seja, alguém setou `PAP_CANAL_NOTIFICACAO=OFF` em Script Properties.
 */
function _papTesteEnvioForcado() {
  var alvo = '32988015161';
  var msg  = '🧪 [Teste DharmaPro] Bypass kill switch — disparo via _papEnviarMensagemEvolution_ direto.';
  var res  = _papEnviarMensagemEvolution_(alvo, msg);
  Logger.log('_papTesteEnvioForcado → ' + JSON.stringify(res));
  return res;
}

/**
 * DIAGNÓSTICO — chama a Evolution direto pra ver o estado da instância
 * `Ricardo_Andrade`. Útil quando `_papTesteEnvio` volta com `SessionError`
 * ou outro erro de baixo nível, antes de tentar reparar.
 *
 * Endpoints checados:
 *   - GET /instance/fetchInstances?instanceName=Ricardo_Andrade — lista a
 *     instância com `instance.status`, `qrcode`, etc.
 *   - GET /instance/connectionState/Ricardo_Andrade — `state: open|connecting|close`.
 *
 * `state === 'open'` = chip pareado e enviando. Qualquer outro = precisa
 * de QR code novo (ou via WA Campanha no CRM, ou via Evolution manager).
 */
function _papDiagEvolution() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  var key = p.getProperty('EVOLUTION_API_KEY');
  if (!url || !key) {
    Logger.log('_papDiagEvolution: EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes.');
    return { ok: false, mensagem: 'Properties ausentes.' };
  }
  var headers = { 'apikey': key };
  var resultado = { url: url, instance: 'Ricardo_Andrade' };

  try {
    var r1 = UrlFetchApp.fetch(url + '/instance/connectionState/Ricardo_Andrade',
      { method: 'get', headers: headers, muteHttpExceptions: true });
    resultado.connectionState = {
      http: r1.getResponseCode(),
      body: r1.getContentText().slice(0, 500)
    };
  } catch(e) { resultado.connectionState = { erro: e.message }; }

  try {
    var r2 = UrlFetchApp.fetch(url + '/instance/fetchInstances?instanceName=Ricardo_Andrade',
      { method: 'get', headers: headers, muteHttpExceptions: true });
    resultado.fetchInstances = {
      http: r2.getResponseCode(),
      body: r2.getContentText().slice(0, 1000)
    };
  } catch(e) { resultado.fetchInstances = { erro: e.message }; }

  Logger.log('_papDiagEvolution →\n' + JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * DIAGNÓSTICO #2 — pergunta à Evolution qual é o JID real do número 988015161
 * (resolve o caso "número de 12 dígitos legacy vs 13 dígitos modernos").
 *
 * POST /chat/whatsappNumbers/Ricardo_Andrade { numbers: [...várias formas...] }
 *
 * Retorna pra cada candidato: { exists, jid, name }. Se nenhum `exists:true`,
 * o número não tem WhatsApp ativo. Se algum vier, o `jid` retornado é o que
 * a Evolution espera no campo `number` do sendText.
 */
function _papDiagWhatsAppNumber() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  var key = p.getProperty('EVOLUTION_API_KEY');
  if (!url || !key) return { erro: 'Properties ausentes.' };

  var candidatos = ['5532988015161', '553288015161', '32988015161', '3288015161'];
  var resp = UrlFetchApp.fetch(url + '/chat/whatsappNumbers/Ricardo_Andrade', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'apikey': key },
    payload: JSON.stringify({ numbers: candidatos }),
    muteHttpExceptions: true
  });
  var out = {
    http: resp.getResponseCode(),
    body: resp.getContentText().slice(0, 2000)
  };
  Logger.log('_papDiagWhatsAppNumber →\n' + JSON.stringify(out, null, 2));
  return out;
}

/**
 * TESTE 3 — sendPresence ANTES do sendText.
 *
 * Workaround documentado pra Evolution v1.8.x + Baileys: ao chamar
 * sendPresence numa instância, o Baileys faz `assertSessions` (busca pre-keys
 * do destinatário). Esperar uns 2s depois dá tempo da sessão Signal
 * estabilizar antes do sendText. Em alguns casos resolve `SessionError`.
 *
 * Se ESTE também falhar, o problema é estrutural na Baileys store da
 * instância — DMs simplesmente não vão funcionar sem reset (logout +
 * delete instance + re-pair via QR), o que limpa o store local.
 */
function _papTesteEnvioComPresence() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  var key = p.getProperty('EVOLUTION_API_KEY');
  if (!url || !key) return { sucesso: false, mensagem: 'Properties ausentes.' };

  var headers = { 'apikey': key };
  var resultado = {};

  // 1) sendPresence -> força assertSessions no Baileys
  try {
    var r1 = UrlFetchApp.fetch(url + '/chat/sendPresence/Ricardo_Andrade', {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify({
        number: '5532988015161',
        options: { delay: 2000, presence: 'composing' }
      }),
      muteHttpExceptions: true
    });
    resultado.presence = { http: r1.getResponseCode(), body: r1.getContentText().slice(0, 300) };
  } catch(e) { resultado.presence = { erro: e.message }; }

  // 2) espera 3s pra Baileys terminar o assertSessions
  Utilities.sleep(3000);

  // 3) sendText
  try {
    var r2 = UrlFetchApp.fetch(url + '/message/sendText/Ricardo_Andrade', {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify({
        number: '5532988015161',
        options: { delay: 1200, presence: 'composing' },
        textMessage: { text: '🧪 [Teste DharmaPro] Tentativa com sendPresence prévio (workaround Baileys assertSessions).' }
      }),
      muteHttpExceptions: true
    });
    resultado.sendText = { http: r2.getResponseCode(), body: r2.getContentText().slice(0, 500) };
  } catch(e) { resultado.sendText = { erro: e.message }; }

  Logger.log('_papTesteEnvioComPresence →\n' + JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * RESET — logout + delete da instância Ricardo_Andrade na Evolution.
 *
 * Necessário porque a Baileys store local está corrompida pra DMs (sessão
 * Signal não estabelece, vide _papTesteEnvioComPresence retornando
 * SessionError mesmo com presence prévio aceito). Delete apaga a store
 * inteira. Depois disso, o user clica "Conectar" no Dashboard WA Pessoal
 * e escaneia o QR com o chip 4154 — instância renasce fresh, sem o
 * legado corrompido.
 *
 * Também limpa a linha de `WA Instâncias` no Sheets pra o Dashboard
 * mostrar "Desconectado" e o botão Conectar criar a instância nova.
 */
function _papResetInstanciaRicardoAndrade() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  var key = p.getProperty('EVOLUTION_API_KEY');
  if (!url || !key) return { ok: false, mensagem: 'Properties ausentes.' };

  var headers = { 'apikey': key };
  var out = { url: url, instance: 'Ricardo_Andrade' };

  // 1) logout (idempotente; 404 OK se já deslogado)
  try {
    var r1 = UrlFetchApp.fetch(url + '/instance/logout/Ricardo_Andrade',
      { method: 'delete', headers: headers, muteHttpExceptions: true });
    out.logout = { http: r1.getResponseCode(), body: r1.getContentText().slice(0, 300) };
  } catch(e) { out.logout = { erro: e.message }; }

  // 2) delete (apaga a Baileys store local — passo crítico)
  try {
    var r2 = UrlFetchApp.fetch(url + '/instance/delete/Ricardo_Andrade',
      { method: 'delete', headers: headers, muteHttpExceptions: true });
    out.delete = { http: r2.getResponseCode(), body: r2.getContentText().slice(0, 300) };
  } catch(e) { out.delete = { erro: e.message }; }

  // 3) confirma que sumiu mesmo
  try {
    var r3 = UrlFetchApp.fetch(url + '/instance/connectionState/Ricardo_Andrade',
      { method: 'get', headers: headers, muteHttpExceptions: true });
    out.checkAfter = { http: r3.getResponseCode(), body: r3.getContentText().slice(0, 300) };
  } catch(e) { out.checkAfter = { erro: e.message }; }

  // 4) limpa cache local em WA Instâncias (caso Dashboard não atualize sozinho)
  try {
    var sh = _waSheet_('WA Instâncias');
    var data = _waLerLinhas_(sh);
    var idxUsr = _waColIdx_(data.header, 'usuario');
    var idxSt  = _waColIdx_(data.header, 'status');
    var idxPh  = _waColIdx_(data.header, 'phone_display');
    for (var i = 0; i < data.linhas.length; i++) {
      var inst = _instanceNameFromUser_(String(data.linhas[i][idxUsr] || ''));
      if (inst === 'Ricardo_Andrade') {
        var row = i + 2; // header em row 1
        if (idxSt >= 0) sh.getRange(row, idxSt + 1).setValue('desconectado');
        if (idxPh >= 0) sh.getRange(row, idxPh + 1).setValue('');
        out.sheetRowUpdated = row;
        break;
      }
    }
  } catch(e) { out.sheetUpdate = { erro: e.message }; }

  Logger.log('_papResetInstanciaRicardoAndrade →\n' + JSON.stringify(out, null, 2));
  return out;
}

/**
 * DIAGNÓSTICO #3 — lista as últimas conversas conhecidas pela instância.
 * Se o "oi" inverso (5161 → 4154) chegou de verdade, deve aparecer aqui
 * uma chat com `id: "553288015161@s.whatsapp.net"`.
 *
 * Se NÃO aparecer, o receive não chegou — ou o webhook do n8n consumiu
 * sem nada acontecer no lado Baileys, ou a mensagem realmente não foi
 * entregue.
 */
function _papDiagListarChats() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  var key = p.getProperty('EVOLUTION_API_KEY');
  if (!url || !key) return { erro: 'Properties ausentes.' };

  // POST /chat/findChats/Ricardo_Andrade (v1.x) -> lista as chats
  var resp = UrlFetchApp.fetch(url + '/chat/findChats/Ricardo_Andrade', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'apikey': key },
    payload: JSON.stringify({}),
    muteHttpExceptions: true
  });
  var http = resp.getResponseCode();
  var txt  = resp.getContentText();

  var alvo = '553288015161';
  var encontrado = txt.indexOf(alvo) !== -1;
  var resumo = { http: http, encontrouAlvo: encontrado, tamanhoBody: txt.length, primeiros500: txt.slice(0, 500) };
  Logger.log('_papDiagListarChats →\n' + JSON.stringify(resumo, null, 2));
  return resumo;
}

/**
 * TESTE 2 — manda direto pra `553288015161` (12 dígitos, sem o "9" extra
 * entre DDD e número). Bypassa `_papPhoneToEvolutionNumber_` que sempre
 * prepend "9" em mobile de 8 dígitos.
 */
function _papTesteEnvioSemNove() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  var key = p.getProperty('EVOLUTION_API_KEY');
  if (!url || !key) return { sucesso: false, mensagem: 'Properties ausentes.' };

  var endpoint = url + '/message/sendText/Ricardo_Andrade';
  var resp = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'apikey': key },
    payload: JSON.stringify({
      number: '553288015161',
      options: { delay: 800, presence: 'composing' },
      textMessage: { text: '🧪 [Teste DharmaPro] Tentativa SEM 9 extra (legacy 12 dig).' }
    }),
    muteHttpExceptions: true
  });
  var out = { http: resp.getResponseCode(), body: resp.getContentText().slice(0, 500) };
  Logger.log('_papTesteEnvioSemNove →\n' + JSON.stringify(out, null, 2));
  return out;
}
