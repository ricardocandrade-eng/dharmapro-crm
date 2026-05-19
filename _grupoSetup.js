/**
 * _grupoSetup.js — ONE-SHOTS pro setup inicial dos alertas do grupo WhatsApp.
 *
 * Apagar este arquivo após executar TODAS as funções e dar `clasp push --force`
 * de novo. Padrão registrado em [[feedback_one_shots_via_setup_file]].
 *
 * Ordem de execução no editor Apps Script (uma vez cada):
 *   1. _setN8nGroupWebhookToken()       ─ grava token em Script Properties
 *   2. _criarColunasAlertasGrupo()      ─ adiciona colunas marker nas abas
 *   3. diagnosticarAlertasGrupo()       ─ testa envio (mensagem chega no grupo)
 *   4. APAGAR este arquivo + clasp push --force
 */

/**
 * Grava o N8N_GROUP_WEBHOOK_TOKEN em Script Properties. Valor está no
 * /opt/renata/.env do VPS (linha N8N_GROUP_WEBHOOK_TOKEN=...).
 *
 * Token atual (gerado em 2026-05-18 na foundation do disparo-grupo):
 */
function _setN8nGroupWebhookToken() {
  var TOKEN = 'b4496b659660c24efcb3c92c908c5603b0017030cc5e3c9593980c04f980f498';
  PropertiesService.getScriptProperties().setProperty('N8N_GROUP_WEBHOOK_TOKEN', TOKEN);
  Logger.log('[OK] N8N_GROUP_WEBHOOK_TOKEN gravado (' + TOKEN.length + ' chars).');
}

/**
 * Adiciona colunas marker de idempotência nas abas afetadas:
 *   - "1 - Vendas": alerta_parcial_auto_enviado_em, alerta_instalacao_enviado_em
 *   - "Leads Meta Ads": alerta_grupo_enviado
 *
 * Idempotente: só cria a coluna se ainda não existir; preserva todos os dados.
 */
function _criarColunasAlertasGrupo() {
  var ss = _getSpreadsheet_();

  // ── Aba 1 - Vendas ─────────────────────────────────────────────────
  var vendas = ss.getSheetByName('1 - Vendas');
  if (!vendas) throw new Error('Aba "1 - Vendas" não encontrada');
  _adicionarColunaSeNaoExiste_(vendas, 'alerta_parcial_auto_enviado_em', 2);
  _adicionarColunaSeNaoExiste_(vendas, 'alerta_instalacao_enviado_em', 2);

  // ── Aba Leads Meta Ads ─────────────────────────────────────────────
  var leadsMeta = ss.getSheetByName('Leads Meta Ads');
  if (!leadsMeta) throw new Error('Aba "Leads Meta Ads" não encontrada');
  _adicionarColunaSeNaoExiste_(leadsMeta, 'alerta_grupo_enviado', 1);

  Logger.log('[OK] Colunas marker criadas/garantidas.');
}

/**
 * Smoke test do Alerta 5 — chama registrarLeadMetaAds direto (sem passar pelo
 * doPost). Útil para debug: isola o hook do roteador do webhook.
 *
 * Após executar: ver "Leads Meta Ads" — linha nova com nome "Smoke Alerta5
 * direto HH:MM:SS" deve ter TRUE em col M, e mensagem `💬 Novo Lead Meta: ...`
 * deve chegar no grupo. Ver Logger.log pra qualquer erro.
 */
/**
 * Helper: define qual linha da aba "1 - Vendas" será usada nos smokes dos
 * Alertas 1 e 2. Edite a constante LINHA e rode no editor.
 *
 * IMPORTANTE: o smoke marca a coluna marker da linha (alerta_*_enviado_em).
 * Escolha uma linha estável (venda já finalizada / linha de teste).
 */
function _setSmokeLinhaVenda() {
  var LINHA = 3942; // ← edite aqui (linha ≥ 3)
  if (!LINHA || LINHA < 3) {
    Logger.log('Edite LINHA em _setSmokeLinhaVenda antes de rodar (≥ 3)');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('SMOKE_LINHA_VENDA', String(LINHA));
  Logger.log('[OK] SMOKE_LINHA_VENDA = ' + LINHA);
}

function _smokeAlertaInstalacao() {
  var l = parseInt(PropertiesService.getScriptProperties().getProperty('SMOKE_LINHA_VENDA') || '0', 10);
  if (!l || l < 3) { Logger.log('Rode _setSmokeLinhaVenda primeiro'); return; }
  _disparoAlertaInstalacao_(l);
  Logger.log('Smoke alerta instalação: linha ' + l);
}

/**
 * Limpa as colunas marker da linha gravada em SMOKE_LINHA_VENDA. Útil após
 * smoke pra que a venda real volte a ser elegível pra alerta no futuro.
 */
function _limparMarkersSmokeLinha() {
  var l = parseInt(PropertiesService.getScriptProperties().getProperty('SMOKE_LINHA_VENDA') || '0', 10);
  if (!l || l < 3) { Logger.log('SMOKE_LINHA_VENDA não setada'); return; }
  var sheet = _getSheet();
  var headers = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  ['alerta_parcial_auto_enviado_em', 'alerta_instalacao_enviado_em'].forEach(function (h) {
    var col = headers.indexOf(h);
    if (col >= 0) {
      sheet.getRange(l, col + 1).clearContent();
      Logger.log('[OK] ' + h + ' limpo na linha ' + l);
    }
  });
}

function _smokeAlertaParcial() {
  var l = parseInt(PropertiesService.getScriptProperties().getProperty('SMOKE_LINHA_VENDA') || '0', 10);
  if (!l || l < 3) { Logger.log('Rode _setSmokeLinhaVenda primeiro'); return; }
  _disparoAlertaParcial_(l);
  Logger.log('Smoke alerta parcial: linha ' + l);
}

/**
 * Smoke test do Alerta 4 — chama _serveActionNotificacoesPendentes_ e
 * loga o resultado (sem passar pelo doGet, sem precisar de deploy).
 */
function _smokeEndpointNotificacoes() {
  var r = _serveActionNotificacoesPendentes_();
  Logger.log('total: ' + r.total + ' | naoLidos: ' + r.naoLidos + ' | ok: ' + r.ok);
  Logger.log('alertas (primeiros 5):');
  (r.alertas || []).slice(0, 5).forEach(function (a, i) {
    Logger.log('  [' + (i+1) + '] ' + a.icone + ' ' + a.titulo + ' · ' + (a.sub || ''));
  });
}

function _smokeAlertaLeadMeta() {
  var nome = 'Smoke Alerta5 direto ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH:mm:ss');
  var linha = registrarLeadMetaAds({
    nome:         nome,
    telefone:     '32999990002',
    cidade:       'Juiz de Fora',
    utm_source:   'meta_ads',
    utm_campaign: 'smoke_direct',
    utm_ad:       'smoke',
    utm_medium:   'cpc'
  });
  Logger.log('Smoke: linha criada = ' + linha);
}

/**
 * Helper: adiciona coluna ao final se ainda não existe.
 * @param {Sheet} sheet
 * @param {string} header - nome da coluna a procurar/criar
 * @param {number} headerRow - linha do cabeçalho (1 ou 2)
 */
function _adicionarColunaSeNaoExiste_(sheet, header, headerRow) {
  var ultCol  = sheet.getLastColumn();
  var headers = sheet.getRange(headerRow, 1, 1, ultCol).getValues()[0];
  if (headers.indexOf(header) >= 0) {
    Logger.log('  [skip] "' + header + '" já existe em "' + sheet.getName() + '"');
    return;
  }
  var novaCol = ultCol + 1;
  sheet.getRange(headerRow, novaCol).setValue(header);
  // Se for "1 - Vendas", header está na linha 2 — também colocar texto na linha 1?
  // Olhando a planilha: linha 1 tem títulos de seção visuais. Vou deixar linha 1 vazia.
  Logger.log('  [add] "' + header + '" criada em "' + sheet.getName() + '" col ' + novaCol);
}
