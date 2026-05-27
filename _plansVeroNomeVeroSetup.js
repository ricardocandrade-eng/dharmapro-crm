// ──────────────────────────────────────────────────────────────────────────────
// _plansVeroNomeVeroSetup.js — 26/05/2026
// Rev9: adiciona coluna 14 NOME_VERO (canônico VeroHub) ao planos_vero.json,
// destravando o resolver `getCodigoVeroPorPlanoCidade` p/ os nomes truncados
// (MUNDO/avulsos) que hoje falham match Jaccard ≥0.92 no sweep.
//
// Aditivo: cols 0..13 intactas (nome, PRODUTO_TIPO, preços, NOME_LP, etc).
// LP/Renata não leem col 14 → invisível pra eles. Resolver passa a ler col 14
// antes do sweep fuzzy (ver patch em Code.js / getCodigoVeroPorPlanoCidade).
//
// Mapeamento revisado com Ricardo em 26/05:
//   - 26 planos fibra: string canônica do sweep
//   - linha 19 (800MB YOUTUBE PREMIUM ou HBO MAX ou TELECINE): array com os 3
//   - linha 6 (OFERTA VERÃO sazonal): "" (sem código fibra equivalente)
//   - linhas 29-42 (Móvel Alone + Móvel Combo): "" (não há código fibra)
//
// Execução:
//   1. clasp push
//   2. editor → _plansVeroNomeVeroSetup.js → _atualizarPlanosVeroJsonRev9 → Executar
//   3. deletar este arquivo (one-shot) + clasp push
// ──────────────────────────────────────────────────────────────────────────────

function _atualizarPlanosVeroJsonRev9() {
  var fileId = CONFIG.TABELA_JSON_FILE_ID;
  var atual = JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString());

  // Mapa nome (col 0) → NOME_VERO. Match exato case-sensitive contra col 0.
  // Strings = 1 código canônico; Arrays = N códigos (plano-escolha do cliente).
  var MAPA = {
    // FIBRA_COMBO
    'VERO MAIS 550MB + MÓVEL 20GB': 'VERO MAIS 550MB + MAIS CONECTADO 20GB',
    'VERO MAIS 800MB + GLP PREMIUM + MÓVEL 20GB': 'VERO MAIS 800MB + GLOBOPLAY PREMIUM + MAIS CONECTADO 20GB',
    'VERO MAIS 800MB + HBO MAX + MÓVEL 20GB': 'VERO MAIS 800MB + HBO MAX + MAIS CONECTADO 20GB',
    'VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MÓVEL 30GB': 'VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MAIS CONECTADO 30GB',
    'OFERTA VERÃO 800MB + GLP PREMIUM + HBO MAX + MÓVEL 60GB': '', // sazonal, sem código fibra equivalente
    'VERO MAIS 800MB + DISNEY+ PADRÃO + MÓVEL 20GB': 'VERO MAIS 800MB + DISNEY+ PADRÃO + MAIS CONECTADO 20GB',
    'VERO MAIS 800MB + DISNEY+ PREMIUM + MÓVEL 20GB': 'VERO MAIS 800MB + DISNEY+ PREMIUM + MAIS CONECTADO 20GB',
    'VERO MAIS 850MB + DIVERSÃO + MÓVEL 20GB': 'VERO MAIS 850MB + DIVERSÃO + MAIS CONECTADO 20GB',
    'VERO MAIS 800MB - GLP PREMIUM + ASSISTÊNCIA RES. + MÓVEL 20GB': 'VERO MAIS 800MB + GLOBOPLAY PREMIUM + ASSISTENCIA RESIDENCIAL + MAIS CONECTADO 20GB',
    'VERO MAIS 1GB + GLP PREMIUM + EXITLAG + MÓVEL 60GB': 'VERO MAIS 1GB + GLOBOPLAY PREMIUM + EXIT LAG + MAIS CONECTADO 60GB',
    // 3 planos foram renomeados pra VERO DUO/VERO FULL no Rev7 (17/05)
    'VERO DUO 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB': 'VERO DUO 800MB + DISNEY+ COM ANÚNCIO + HBO MAX COM ANÚNCIO + MAIS CONECTADO 30GB',
    'VERO DUO 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB': 'VERO DUO 800MB + PRIME VIDEO + APPLE TV + MAIS CONECTADO 30GB',
    'VERO FULL 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB': 'VERO MAIS FULL 800MB + PRIME VIDEO + APPLE TV + HBO + GLP PREMIUM + MAIS CONECTADO 60GB',

    // FIBRA_ALONE
    '550MB MUNDO FIBRA': 'MUNDO FIBRA 550MB',
    '550MB ASSISTÊNCIA RESIDENCIAL': 'MUNDO FIBRA 550MB + ASSISTENCIA RESIDENCIAL',
    '750MB MUNDO FIBRA': 'MUNDO FIBRA 750MB',
    '600MB GLOBOPLAY PADRÃO COM ANÚNCIOS': 'MUNDO ENTRETENIMENTO 600MB + GLOBOPLAY PADRÃO COM ANÚNCIOS',
    '800MB YOUTUBE PREMIUM ou HBO MAX ou TELECINE': [
      'MUNDO ENTRETENIMENTO 800MB + YOUTUBE PREMIUM',
      'MUNDO ENTRETENIMENTO 800MB + HBO MAX',
      'MUNDO ENTRETENIMENTO 800MB + TELECINE'
    ],
    '800MB DISNEY+ PADRÃO': 'MUNDO ENTRETENIMENTO 800MB + DISNEY+ PADRÃO',
    '800MB DISNEY+ PREMIUM': 'MUNDO ENTRETENIMENTO 800MB + DISNEY+ PREMIUM',
    '800MB GLOBOPLAY PREMIUM': 'MUNDO ENTRETENIMENTO 800MB + GLOBOPLAY PREMIUM',
    '800MB GLOBOPLAY PREMIUM + ASSISTÊNCIA RESIDENCIAL': 'MUNDO ENTRETENIMENTO 800MB + GLOBOPLAY PREMIUM + ASSISTENCIA RESIDENCIAL',
    '800MB PREMIERE': 'MUNDO ENTRETENIMENTO 800MB + PREMIERE',
    '850MB FILMES': 'MUNDO COMPLETO 850MB + FILMES',
    '850MB ESPORTES': 'MUNDO COMPLETO 850MB + ESPORTES',
    '1GB DIVERSÃO': 'MUNDO COMPLETO 1GB + DIVERSÃO',
    '800MB GAMER': 'MUNDO GAMER 800MB'
    // MOVEL_ALONE / MOVEL_COMBO: NOME_VERO sempre "" — sweep VeroHub é fibra-only
  };

  var headerLegend = atual[0] || [];
  var headerCols = atual[1] || [];

  // estende headers (linhas 0 e 1) p/ ter col 14
  while (headerLegend.length < 15) headerLegend.push('');
  while (headerCols.length < 15) headerCols.push('');
  headerLegend[14] = 'NOME_VERO (sweep canônico)';
  headerCols[14] = 'NOME_VERO';

  var preenchidos = 0, vazios = 0, naoMapeados = [];
  for (var i = 2; i < atual.length; i++) {
    var nome = String(atual[i][0] || '');
    // padding caso a linha tenha menos colunas que o header
    while (atual[i].length < 15) atual[i].push('');
    if (MAPA.hasOwnProperty(nome)) {
      atual[i][14] = MAPA[nome];
      if (MAPA[nome] === '' || (Array.isArray(MAPA[nome]) && MAPA[nome].length === 0)) vazios++;
      else preenchidos++;
    } else {
      atual[i][14] = '';
      naoMapeados.push(nome);
    }
  }

  // atualiza legenda
  atual[0][0] = 'Última atualização: 26/05/2026 — Rev9: coluna 14 NOME_VERO adicionada (canônico do sweep VeroHub) p/ destravar resolver de código.';

  var conteudo = JSON.stringify(atual, null, 2);
  DriveApp.getFileById(fileId).setContent(conteudo);
  CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'tabela_v1');

  Logger.log('OK Rev9 — ' + atual.length + ' linhas, ' + conteudo.length + ' bytes.');
  Logger.log('  NOME_VERO preenchido: ' + preenchidos + ' (string ou array)');
  Logger.log('  NOME_VERO vazio (móvel/sazonal): ' + vazios);
  if (naoMapeados.length) {
    Logger.log('  ⚠️ Planos NÃO mapeados (NOME_VERO=""):');
    naoMapeados.forEach(function(n) { Logger.log('     - ' + n); });
  } else {
    Logger.log('  ✓ Todos os 41 planos cobertos pelo mapa.');
  }
  Logger.log('Cache "tabela_v1" invalidado.');
}

// Smoke test READ-ONLY: relê o JSON do Drive (sem cache) e printa os NOME_VERO
// preenchidos. Roda depois do Rev9 pra conferir a gravação.
function _verNomeVeroRev9() {
  var fileId = CONFIG.TABELA_JSON_FILE_ID;
  var rows = JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString());
  Logger.log('Total linhas: ' + rows.length + ' | header[14]: ' + (rows[1] && rows[1][14]));
  for (var i = 2; i < rows.length; i++) {
    var nome = rows[i][0];
    var nv = rows[i][14];
    if (nv && (typeof nv === 'string' ? nv.length : nv.length > 0)) {
      Logger.log('  ' + nome + '  →  ' + (Array.isArray(nv) ? '[' + nv.length + '] ' + JSON.stringify(nv) : nv));
    }
  }
}
