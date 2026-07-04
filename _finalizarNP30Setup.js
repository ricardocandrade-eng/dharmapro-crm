// ══════════════════════════════════════════════════════════════════════════
// _finalizarNP30Setup.js — ONE-SHOTs (push -> executar no editor -> deletar -> push)
// Fecha a captura do codigo NP 3.0:
//   1) _atualizarPlanosVeroJsonRev13() — grava NOME_VERO (col 14) dos 35 planos
//      NP3.0 mapeados (CRM -> nome canonico VeroHub), destravando o passo (0) do
//      resolver getCodigoVeroPorPlanoCidade. Rodar DEPOIS de _atualizarVerohubCodigosV2.
//   2) backfillCodPlano(dryRun) — preenche COD_PLANO (col AU) das vendas antigas
//      com COD_PLANO vazio via getCodigoVeroPorPlanoCidade. Rodar por ultimo.
//      backfillCodPlano(true) = dry-run (so conta). backfillCodPlano() = grava.
// Remover este arquivo apos rodar.
// ══════════════════════════════════════════════════════════════════════════

function _atualizarPlanosVeroJsonRev13() {
  var MAPA = {
    "VERO MAIS 550MB + MÓVEL 20GB": "VERO MAIS 550MB + MAIS CONECTADO 20GB",
    "VERO MAIS 800MB + GLP PREMIUM + MÓVEL 20GB": "VERO MAIS 800MB + GLOBOPLAY PREMIUM + MAIS CONECTADO 20GB",
    "VERO MAIS 800MB + HBO MAX + MÓVEL 20GB": "VERO MAIS 800MB + HBO MAX + MAIS CONECTADO 20GB",
    "VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MÓVEL 30GB": "VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MAIS CONECTADO 30GB",
    "VERO MAIS 800MB + DISNEY+ PADRÃO + MÓVEL 20GB": "VERO MAIS 800MB + DISNEY+ PADRÃO + MAIS CONECTADO 20GB",
    "VERO MAIS 800MB + DISNEY+ PREMIUM + MÓVEL 20GB": "VERO MAIS 800MB + DISNEY+ PREMIUM + MAIS CONECTADO 20GB",
    "VERO MAIS 850MB + DIVERSÃO + MÓVEL 20GB": "VERO MAIS 850MB + DIVERSÃO + MAIS CONECTADO 20GB",
    "VERO DUO 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB": "VERO DUO 800MB + DISNEY+ COM ANÚNCIO + HBO MAX COM ANÚNCIO + MAIS CONECTADO 30GB",
    "VERO DUO 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB": "VERO DUO 800MB + PRIME VIDEO + APPLE TV + MAIS CONECTADO 30GB",
    "VERO FAST 550MB": "VERO FAST 550MB",
    "VERO FAST 700MB": "VERO FAST 700MB",
    "VERO FAST 700MB + MEDIQUO": "VERO FAST 700MB + MEDIQUO",
    "VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL": "VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL",
    "VERO FAST 700MB + MÓVEL 20GB": "VERO FAST 700MB + MAIS CONECTADO 20GB",
    "VERO FAST 700MB + MEDIQUO + MÓVEL 20GB": "VERO FAST 700MB + MEDIQUO + MAIS CONECTADO 20GB",
    "VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL + MÓVEL 20GB": "VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL + MAIS CONECTADO 20GB",
    "VERO FAST PLUS 800MB + DISNEY+ PADRÃO + MÓVEL 30GB": "VERO FAST MAIS 800MB + DISNEY+ PADRÃO + MAIS CONECTADO 30GB",
    "VERO FAST PLUS 800MB + HBO MAX + MÓVEL 30GB": "VERO FAST MAIS 800MB + HBO MAX + MAIS CONECTADO 30GB",
    "VERO FAST PLUS 800MB + GLOBOPLAY PREMIUM + MÓVEL 30GB": "VERO FAST MAIS 800MB + GLOBOPLAY PREMIUM + MAIS CONECTADO 30GB",
    "VERO FAST PLUS 800MB + YOUTUBE PREMIUM + MÓVEL 30GB": "VERO FAST MAIS 800MB + YOUTUBE PREMIUM + MAIS CONECTADO 30GB",
    "VERO FAST PLUS 800MB + PRIME VIDEO + MÓVEL 30GB": "VERO FAST MAIS 800MB + PRIME VIDEO + MAIS CONECTADO 30GB",
    "VERO FAST PLUS 800MB + APPLE TV + MÓVEL 30GB": "VERO FAST MAIS 800MB + APPLE TV + MAIS CONECTADO 30GB",
    "VERO FAST PLUS 800MB + TELECINE + MÓVEL 30GB": "VERO FAST MAIS 800MB + TELECINE + MAIS CONECTADO 30GB",
    "VERO FAST PLUS 800MB + DISNEY+ PREMIUM + MÓVEL 30GB": "VERO FAST MAIS 800MB + DISNEY+ PREMIUM + MAIS CONECTADO 30GB",
    "VERO FAST PLUS 800MB + PREMIERE + MÓVEL 30GB": "VERO FAST MAIS 800MB + PREMIERE + MAIS CONECTADO 30GB",
    "VERO PRO ONE 850MB + MÓVEL 60GB": "VERO PRO ONE 850MB + MAIS CONECTADO 60GB",
    "VERO PRO TECH 850MB + MÓVEL 60GB": "VERO PRO TECH 850MB + MAIS CONECTADO 60GB",
    "VERO PRO GAME 850MB + MÓVEL 60GB": "VERO PRO GAME 850MB + MAIS CONECTADO 60GB",
    "VERO PRO SPORTS 850MB + MÓVEL 60GB": "VERO PRO ESPORTES 850MB + MAIS CONECTADO 60GB",
    "VERO PRO FILMS 850MB + MÓVEL 60GB": "VERO PRO FILMES 850MB + MAIS CONECTADO 60GB",
    "VERO PRO LIVE 850MB + MÓVEL 60GB": "VERO PRO LIVE 850MB + MAIS CONECTADO 60GB",
    "VERO PRO MAX FAMILY 900MB + MÓVEL 100GB": "VERO PRO MAX FAMILIY 900MB + MAIS CONECTADO FAMILIA 100GB",
    "VERO PRO MAX TECH 900MB + MÓVEL 60GB": "VERO PRO MAX TECH 900MB + MAIS CONECTADO 60GB",
    "VERO PRO MAX VIP 900MB + MÓVEL 100GB": "VERO PRO MAX VIP 900MB + MAIS CONECTADO FAMILIA 100GB",
    "VERO PRO MAX VIP PREMIUM 900MB + MÓVEL 100GB": "VERO PRO MAX VIP PREMIUM 900MB + MAIS CONECTADO FAMILIA 100GB",
    "VERO FAST PLUS 800MB + DISNEY+ ADS + MÓVEL 30GB": "VERO FAST MAIS 800MB + DISNEY+ COM ANÚNCIOS + MAIS CONECTADO 30GB",
    "VERO FAST PLUS 800MB + HBO MAX ADS + MÓVEL 30GB": "VERO FAST MAIS 800MB + HBO MAX COM ANÚNCIOS + MAIS CONECTADO 30GB",
    "VERO FAST PLUS 800MB + GLOBOPLAY ADS + MÓVEL 30GB": "VERO FAST MAIS 800MB + GLOBOPLAY COM ANÚNCIOS + MAIS CONECTADO 30GB"
  };
  var fileId = CONFIG.TABELA_JSON_FILE_ID;
  var atual = JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString());
  // Header (linha 1): rotula col 14 = NOME_VERO se ainda nao houver
  if (atual[1]) { while (atual[1].length <= 14) atual[1].push(''); if (!String(atual[1][14] || '').trim()) atual[1][14] = 'NOME_VERO'; }
  var alterados = 0, jaTinha = 0, naoEncontrados = [];
  var vistos = {};
  for (var i = 2; i < atual.length; i++) {
    var nome = String(atual[i][0] || '').trim();
    if (!MAPA.hasOwnProperty(nome)) continue;
    vistos[nome] = true;
    while (atual[i].length <= 14) atual[i].push('');
    if (String(atual[i][14] || '').trim() === MAPA[nome]) { jaTinha++; continue; }
    atual[i][14] = MAPA[nome];
    alterados++;
  }
  Object.keys(MAPA).forEach(function (k) { if (!vistos[k]) naoEncontrados.push(k); });
  if (atual[0] && atual[0].length) { atual[0][0] = 'Ultima atualizacao: Rev13 — NOME_VERO (CRM->VeroHub NP3.0) para resolver COD_PLANO no passo (0).'; }
  var conteudo = JSON.stringify(atual, null, 2);
  DriveApp.getFileById(fileId).setContent(conteudo);
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'tabela_v1');
  Logger.log('OK Rev13 — NOME_VERO setado em ' + alterados + ' plano(s) (' + jaTinha + ' ja tinha). Nao encontrados no JSON: ' + (naoEncontrados.length ? naoEncontrados.join(' | ') : '(nenhum)') + '. ' + conteudo.length + ' bytes. Cache invalidado.');
  return { alterados: alterados, jaTinha: jaTinha, naoEncontrados: naoEncontrados };
}

// Backfill idempotente do COD_PLANO (col AU) nas vendas com AU vazio.
// MEMOIZADO por (plano|cidade) + RESUMIVEL em lotes (cursor em Script Property)
// pra nao estourar o teto de 6 min do GAS. Le so 3 colunas (PLANO/CIDADE/AU).
//   backfillCodPlano(true) = dry-run (conta o lote atual, nao grava nem avanca cursor).
//   backfillCodPlano()     = grava o lote e avanca. Rodar de novo ate ver ">>> CONCLUIDO".
//   backfillCodPlano(false, true) = reseta o cursor pro inicio.
function backfillCodPlano(dryRun, resetCursor) {
  var sheet = _getSheet();
  var ultLinha = sheet.getLastRow();
  if (ultLinha < 3) { Logger.log('backfillCodPlano: nenhuma venda.'); return; }
  var c = CONFIG.COLUNAS;
  var nLinhas = ultLinha - 2;
  var props = PropertiesService.getScriptProperties();
  var CURSOR_KEY = 'BACKFILL_CODPLANO_CURSOR';
  var LOTE = 1200;
  if (resetCursor) { try { props.deleteProperty(CURSOR_KEY); } catch (e) {} }
  var inicio = 0;
  try { inicio = parseInt(props.getProperty(CURSOR_KEY) || '0', 10) || 0; } catch (e) {}
  if (inicio >= nLinhas) inicio = 0;
  var fim = Math.min(inicio + LOTE, nLinhas);

  var colPlano  = sheet.getRange(3, c.PLANO + 1, nLinhas, 1).getValues();
  var colCidade = sheet.getRange(3, c.CIDADE + 1, nLinhas, 1).getValues();
  var colAU     = sheet.getRange(3, c.COD_PLANO + 1, nLinhas, 1).getValues();

  var memo = {};
  var jaTinham = 0, resolvidos = 0, semResolucao = 0, semPlanoOuCidade = 0, processadas = 0;
  for (var i = inicio; i < fim; i++) {
    processadas++;
    var atual = String(colAU[i][0] || '').trim();
    if (atual) { jaTinham++; continue; }
    var plano = String(colPlano[i][0] || '').trim();
    var cidade = String(colCidade[i][0] || '').trim();
    if (!plano || !cidade) { semPlanoOuCidade++; continue; }
    var key = plano + '||' + cidade, cod;
    if (memo.hasOwnProperty(key)) { cod = memo[key]; }
    else { try { cod = getCodigoVeroPorPlanoCidade(plano, cidade) || ''; } catch (e) { cod = ''; } memo[key] = cod; }
    if (cod) { colAU[i][0] = String(cod).trim(); resolvidos++; }
    else { semResolucao++; }
  }

  var concluido = (fim >= nLinhas);
  if (!dryRun) {
    if (resolvidos > 0) { sheet.getRange(3, c.COD_PLANO + 1, nLinhas, 1).setValues(colAU); try { _limparCache(); } catch (eC) {} }
    if (concluido) { try { props.deleteProperty(CURSOR_KEY); } catch (e) {} }
    else { try { props.setProperty(CURSOR_KEY, String(fim)); } catch (e) {} }
  }

  var msg = 'backfillCodPlano' + (dryRun ? ' (DRY-RUN)' : '') + ': linhas ' + (inicio + 3) + '..' + (fim + 2) + ' de ' + nLinhas +
            ' | resolvidos=' + resolvidos + ' | jaTinham=' + jaTinham + ' | semResolucao=' + semResolucao +
            ' | semPlanoOuCidade=' + semPlanoOuCidade + ' | pares_unicos=' + Object.keys(memo).length +
            (concluido ? '  >>> CONCLUIDO' : '  >>> RODAR DE NOVO pra continuar');
  Logger.log(msg);
  try { _getSpreadsheet_().toast(msg, (dryRun ? 'Dry-run' : 'Backfill'), 12); } catch (eT) {}
  return { inicio: inicio, fim: fim, nLinhas: nLinhas, resolvidos: resolvidos, jaTinham: jaTinham, semResolucao: semResolucao, semPlanoOuCidade: semPlanoOuCidade, concluido: concluido };
}
