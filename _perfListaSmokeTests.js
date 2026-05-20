// ──────────────────────────────────────────────────────────────────────────
//  Smoke tests da otimização Lista de Vendas — Fase 5b (19/05/2026)
//  Roda no editor Apps Script após clasp push. Apagar arquivo no push final.
//  Leading "_" mantém visibilidade no dropdown Executar do editor.
// ──────────────────────────────────────────────────────────────────────────

// 1. Update fino SEM cache prévio — não deve criar cache do nada (no-op)
function _testUpdateFinoSemCache() {
  _limparCacheListaV3();
  _limparCacheListaCompleta();
  var linha = _getSheet().getLastRow();
  _atualizarVendaNoCache_(linha);
  Logger.log('OK — sem erro, cache não criado (esperado: fine update no-op em cache vazio).');
}

// 2. Update fino COM cache populado — deve substituir entrada
function _testUpdateFinoComCache() {
  _limparCacheListaV3();
  var t0 = Date.now();
  getVendasPaginadas(1, '', { limite: 500, offset: 0 });
  Logger.log('Popula cache (MISS): ' + (Date.now() - t0) + 'ms');

  var linha = _getSheet().getLastRow();
  t0 = Date.now();
  _atualizarVendaNoCache_(linha);
  Logger.log('Update fino linha ' + linha + ': ' + (Date.now() - t0) + 'ms (esperado <1s)');

  t0 = Date.now();
  var res = getVendasPaginadas(1, '', { limite: 500, offset: 0 });
  Logger.log('Cache HIT pós-update: ' + (Date.now() - t0) + 'ms (esperado <1s)');
  Logger.log('Total dados: ' + res.dados.length);
}

// 3. CRÍTICO — fluxo SAVE → RELOAD deve ser <1s.
//    Se >5s, a Fase 5b FALHOU (provavelmente _limparCacheSemLista não foi
//    aplicado em salvarVenda, ou outra invalidação total escapou).
function _testSaveQuente() {
  _limparCacheListaV3();
  _limparCacheListaCompleta();
  var t0 = Date.now();
  getVendasPaginadas(1, '', { limite: 500, offset: 0 });
  Logger.log('Popula cache (MISS): ' + (Date.now() - t0) + 'ms');

  // Pega turno atual da última linha pra preservar valor original
  var linha = _getSheet().getLastRow();
  var c = CONFIG.COLUNAS;
  var turnoOriginal = String(_getSheet().getRange(linha, c.TURNO + 1).getValue() || '');
  var turnoTeste    = turnoOriginal === 'MANHA' ? 'TARDE' : 'MANHA';

  t0 = Date.now();
  salvarTurno(linha, turnoTeste);
  Logger.log('salvarTurno: ' + (Date.now() - t0) + 'ms');

  t0 = Date.now();
  var res = getVendasPaginadas(1, '', { limite: 500, offset: 0 });
  var tempoReload = Date.now() - t0;
  Logger.log('save → reload: ' + tempoReload + 'ms ' +
             (tempoReload < 1000 ? '✓ PASSOU' :
              tempoReload < 5000 ? '⚠ MARGINAL — investigar' :
                                   '✗ FALHOU — Fase 5b não está fazendo efeito'));

  var encontrada = res.dados.filter(function(v) { return v.linha === linha; })[0];
  Logger.log('Turno na linha ' + linha + ' no cache: ' + (encontrada && encontrada.turno) +
             ' (esperado: ' + turnoTeste + ')');

  // Restaura
  salvarTurno(linha, turnoOriginal);
  Logger.log('Restaurado turno original: ' + turnoOriginal);
}

// 4. Stub BC ainda funciona após Fase 5b
function _testStubBcAposFase5b() {
  var res = sincronizarTagsBotConversa(false);
  Logger.log(JSON.stringify(res));
}

// 5. Inspeção dos contadores de telemetria
function _testTelemetria() {
  var p = PropertiesService.getScriptProperties();
  var keys = [
    'counter_lista_cache_hit',
    'counter_lista_cache_miss',
    'counter_lista_fine_update',
    'counter_lista_fine_update_fallback'
  ];
  var hit = parseInt(p.getProperty(keys[0]) || '0', 10);
  var miss = parseInt(p.getProperty(keys[1]) || '0', 10);
  var total = hit + miss;
  for (var i = 0; i < keys.length; i++) {
    Logger.log(keys[i] + ': ' + (p.getProperty(keys[i]) || '0'));
  }
  if (total > 0) {
    Logger.log('HIT ratio: ' + Math.round(100 * hit / total) + '% (alvo: >70%)');
  }
}

// 6. Zera os contadores (rodar no início da janela de medição de 1 semana)
function _resetTelemetriaLista() {
  var p = PropertiesService.getScriptProperties();
  ['counter_lista_cache_hit', 'counter_lista_cache_miss',
   'counter_lista_fine_update', 'counter_lista_fine_update_fallback',
   'counter_funil_fine_update', 'counter_funil_fine_update_fallback']
    .forEach(function(k) { p.deleteProperty(k); });
  Logger.log('Contadores zerados (Lista + Funil).');
}

// ── FUNIL (20/05/2026) ──────────────────────────────────────────────────────

// 7. CRÍTICO — fluxo mover venda no funil → reload do board deve ser <1s.
//    Se >5s, o update fino do funil FALHOU (provavelmente _limparCacheSemLista
//    ainda invalida funil_v2, ou _atualizarVendaNoFunilCache_ não roda).
function _testFunilSaveQuente() {
  _limparCacheFunil_();
  var t0 = Date.now();
  var board = getVendasFunil();
  Logger.log('Funil MISS (popula): ' + (Date.now() - t0) + 'ms, ' + board.dados.length + ' no board');
  if (!board.dados.length) { Logger.log('Board vazio — sem o que testar.'); return; }

  // Pega uma venda em "2- Aguardando Instalação" e simula mover de coluna seria
  // arriscado (muda dados reais). Em vez disso, exercita o update fino direto:
  var alvo = board.dados[0];
  t0 = Date.now();
  _atualizarVendaNoFunilCache_(alvo.linha);
  Logger.log('Update fino funil: ' + (Date.now() - t0) + 'ms (esperado <1s)');

  t0 = Date.now();
  var board2 = getVendasFunil();
  var tReload = Date.now() - t0;
  Logger.log('Funil reload pós-update: ' + tReload + 'ms ' +
             (tReload < 1000 ? '✓ PASSOU' : tReload < 5000 ? '⚠ MARGINAL' : '✗ FALHOU'));
  Logger.log('Board mantém ' + board2.dados.length + ' (esperado ~' + board.dados.length + ')');
  // Confere que a venda alvo continua no board (status não mudou no teste)
  var achou = board2.dados.filter(function(v){ return v.linha === alvo.linha; }).length;
  Logger.log('Venda alvo (linha ' + alvo.linha + ') no board: ' + (achou ? 'sim ✓' : 'NÃO ✗'));
}

// 8. Telemetria do Funil
function _testTelemetriaFunil() {
  var p = PropertiesService.getScriptProperties();
  ['counter_funil_fine_update', 'counter_funil_fine_update_fallback'].forEach(function(k) {
    Logger.log(k + ': ' + (p.getProperty(k) || '0'));
  });
}
