/**
 * _setupRev12FixNP30.js
 *
 * Rev12 — correção pós-migração NP 3.0 (16/06/2026).
 *
 * Objetivos:
 *   1) Preencher col 14 NOME_VERO do `planos_vero.json` com nomes canônicos do VeroHub
 *      (destrava `getCodigoVeroPorPlanoCidade` via passo (0) NOME_VERO em vez do fallback).
 *   2) Corrigir velocidades incorretas: VERO PRO 800MB→850MB e VERO PRO MAX (sem velocidade)→900MB.
 *   3) Substituir placeholders `NP30-*` em `pontuacao_planos.json` pelos códigos VeroHub reais
 *      (5000–5049 + 4678/4688 do legado).
 *
 * Fonte: extração VeroHub via venda #2027460 (17/06/2026) — 36 planos B2C + 11 B2B + Roku.
 *
 * Convenção: arquivo one-shot. Rodar UMA VEZ no editor Apps Script, depois remover do projeto.
 *   _verificarRev12_dryRun()                  ← rodar primeiro (só log, sem escrever)
 *   _atualizarPlanosVeroJsonRev12_FixNP30()   ← grava JSON no Drive + invalida cache
 *   _atualizarPontuacaoVeroHubRev12()         ← grava pontuacao_planos.json no Drive
 *
 * Idempotente: rodar 2x não muda nada além do log (verifica antes de escrever).
 */

/* eslint-disable no-undef */

// --------------------------------------------------------------------------
// MAPA CANÔNICO: nome do PLANO no JSON → { codigo VeroHub, novoPlano (opcional, fix velocidade), nomeVero (col 14) }
// --------------------------------------------------------------------------
var _REV12_MAP_NP30 = {
  // VERO FAST (5000-5006) — nomes do PLANO permanecem; só preenche NOME_VERO
  'VERO FAST 550MB':
    { codigo: 5000, nomeVero: '5000 - VERO FAST 550MB' },
  'VERO FAST 700MB':
    { codigo: 5001, nomeVero: '5001 - VERO FAST 700MB' },
  'VERO FAST 700MB + MEDIQUO':
    { codigo: 5002, nomeVero: '5002 - VERO FAST 700MB + MEDIQUO' },
  'VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL':
    { codigo: 5003, nomeVero: '5003 - VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL' },
  'VERO FAST 700MB + MÓVEL 20GB':
    { codigo: 5004, nomeVero: '5004 - VERO FAST 700MB + MAIS CONECTADO 20GB' },
  'VERO FAST 700MB + MEDIQUO + MÓVEL 20GB':
    { codigo: 5005, nomeVero: '5005 - VERO FAST 700MB + MEDIQUO + MAIS CONECTADO 20GB' },
  'VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL + MÓVEL 20GB':
    { codigo: 5006, nomeVero: '5006 - VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL + MAIS CONECTADO 20GB' },

  // VERO FAST PLUS (5028-5039) — Vero usa "FAST MAIS" internamente; PLANO comercial fica "FAST PLUS"
  'VERO FAST PLUS 800MB + DISNEY+ ADS + MÓVEL 30GB':
    { codigo: 5028, nomeVero: '5028 - VERO FAST MAIS 800MB + DISNEY+ COM ANÚNCIOS + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + HBO MAX ADS + MÓVEL 30GB':
    { codigo: 5029, nomeVero: '5029 - VERO FAST MAIS 800MB + HBO MAX COM ANÚNCIOS + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + GLOBOPLAY ADS + MÓVEL 30GB':
    { codigo: 5030, nomeVero: '5030 - VERO FAST MAIS 800MB + GLOBOPLAY COM ANÚNCIOS + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + DISNEY+ PADRÃO + MÓVEL 30GB':
    { codigo: 5031, nomeVero: '5031 - VERO FAST MAIS 800MB + DISNEY+ PADRÃO + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + HBO MAX + MÓVEL 30GB':
    { codigo: 5032, nomeVero: '5032 - VERO FAST MAIS 800MB + HBO MAX + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + GLOBOPLAY PREMIUM + MÓVEL 30GB':
    { codigo: 5033, nomeVero: '5033 - VERO FAST MAIS 800MB + GLOBOPLAY PREMIUM + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + YOUTUBE PREMIUM + MÓVEL 30GB':
    { codigo: 5034, nomeVero: '5034 - VERO FAST MAIS 800MB + YOUTUBE PREMIUM + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + PRIME VIDEO + MÓVEL 30GB':
    { codigo: 5035, nomeVero: '5035 - VERO FAST MAIS 800MB + PRIME VIDEO + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + APPLE TV + MÓVEL 30GB':
    { codigo: 5036, nomeVero: '5036 - VERO FAST MAIS 800MB + APPLE TV + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + TELECINE + MÓVEL 30GB':
    { codigo: 5037, nomeVero: '5037 - VERO FAST MAIS 800MB + TELECINE + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + DISNEY+ PREMIUM + MÓVEL 30GB':
    { codigo: 5038, nomeVero: '5038 - VERO FAST MAIS 800MB + DISNEY+ PREMIUM + MAIS CONECTADO 30GB' },
  'VERO FAST PLUS 800MB + PREMIERE + MÓVEL 30GB':
    { codigo: 5039, nomeVero: '5039 - VERO FAST MAIS 800MB + PREMIERE + MAIS CONECTADO 30GB' },

  // VERO PRO (5040-5045) — FIX velocidade: 800MB → 850MB conforme spec Vero
  'VERO PRO ONE 800MB + MÓVEL 60GB':
    { codigo: 5042, novoPlano: 'VERO PRO ONE 850MB + MÓVEL 60GB',
      nomeVero: '5042 - VERO PRO ONE 850MB + MESH + MAIS CONECTADO 60GB' },
  'VERO PRO TECH 800MB + MÓVEL 60GB':
    { codigo: 5041, novoPlano: 'VERO PRO TECH 850MB + MÓVEL 60GB',
      nomeVero: '5041 - VERO PRO TECH 850MB + MESH + MAIS CONECTADO 60GB' },
  'VERO PRO GAME 800MB + MÓVEL 60GB':
    { codigo: 5040, novoPlano: 'VERO PRO GAME 850MB + MÓVEL 60GB',
      nomeVero: '5040 - VERO PRO GAME 850MB + MESH + MAIS CONECTADO 60GB' },
  'VERO PRO SPORTS 800MB + MÓVEL 60GB':
    { codigo: 5044, novoPlano: 'VERO PRO SPORTS 850MB + MÓVEL 60GB',
      nomeVero: '5044 - VERO PRO ESPORTES 850MB + MESH + MAIS CONECTADO 60GB' },
  'VERO PRO FILMS 800MB + MÓVEL 60GB':
    { codigo: 5043, novoPlano: 'VERO PRO FILMS 850MB + MÓVEL 60GB',
      nomeVero: '5043 - VERO PRO FILMES 850MB + MESH + MAIS CONECTADO 60GB' },
  'VERO PRO LIVE 800MB + MÓVEL 60GB':
    { codigo: 5045, novoPlano: 'VERO PRO LIVE 850MB + MÓVEL 60GB',
      nomeVero: '5045 - VERO PRO LIVE 850MB + MESH + MAIS CONECTADO 60GB' },

  // VERO PRO MAX (5046-5049) — FIX: adicionar 900MB no nome
  'VERO PRO MAX FAMILY + MÓVEL 100GB':
    { codigo: 5046, novoPlano: 'VERO PRO MAX FAMILY 900MB + MÓVEL 100GB',
      nomeVero: '5046 - VERO PRO MAX FAMILIY 900MB + MAIS CONECTADO FAMILIA 100GB' },
  'VERO PRO MAX TECH + MÓVEL 60GB':
    { codigo: 5047, novoPlano: 'VERO PRO MAX TECH 900MB + MÓVEL 60GB',
      nomeVero: '5047 - VERO PRO MAX TECH 900MB + MAIS CONECTADO 60GB' },
  'VERO PRO MAX VIP + MÓVEL 100GB':
    { codigo: 5048, novoPlano: 'VERO PRO MAX VIP 900MB + MÓVEL 100GB',
      nomeVero: '5048 - VERO PRO MAX VIP 900MB + MAIS CONECTADO FAMILIA 100GB' },
  'VERO PRO MAX VIP PREMIUM + MÓVEL 100GB':
    { codigo: 5049, novoPlano: 'VERO PRO MAX VIP PREMIUM 900MB + MÓVEL 100GB',
      nomeVero: '5049 - VERO PRO MAX VIP PREMIUM 900MB + MAIS CONECTADO FAMILIA 100GB' },

  // VERO MAIS legado (4678/4688) — mapeia os 2 SKUs comerciais nossos pros códigos VeroHub mais próximos
  'VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MÓVEL 30GB':
    { codigo: 4678, nomeVero: '4678 - VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MAIS CONECTADO 30GB' },
  'VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + ROKU/TV BOX + MÓVEL 30GB':
    { codigo: 4688, nomeVero: '4688 - VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + ROKU + MAIS CONECTADO 30GB' }

  // STARLINK e VERO CONTROLE MAIS 40/60/100 ficam sem código VeroHub —
  // Vero ainda não emitiu (pedir e adicionar em Rev13). Placeholders NP30-* permanecem na pontuação.
};

// --------------------------------------------------------------------------
// DRY-RUN: lista o que mudaria sem escrever nada
// --------------------------------------------------------------------------
function _verificarRev12_dryRun() {
  Logger.log('=== DRY-RUN Rev12 Fix NP 3.0 ===');

  // 1) planos_vero.json
  var fileTabela = DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID);
  var tabela = JSON.parse(fileTabela.getBlob().getDataAsString());
  Logger.log('Linhas no JSON: ' + tabela.length);

  var fixPlano = 0, fixNomeVero = 0, semMap = [];
  for (var i = 2; i < tabela.length; i++) {
    var row = tabela[i];
    if (!row || row[8] !== true) continue; // só ativos
    var nome = row[0];
    var m = _REV12_MAP_NP30[nome];
    if (!m) {
      // sem mapping mas pode ser STARLINK/CONTROLE MAIS (esperado)
      if (nome && (/STARLINK/i.test(nome) || /CONTROLE MAIS/i.test(nome) || /B2B/i.test(nome))) continue;
      semMap.push(nome);
      continue;
    }
    if (m.novoPlano && m.novoPlano !== nome) {
      Logger.log('PLANO mudaria: "' + nome + '" → "' + m.novoPlano + '"');
      fixPlano++;
    }
    var nomeVeroAtual = row.length > 14 ? row[14] : '';
    if (nomeVeroAtual !== m.nomeVero) {
      Logger.log('NOME_VERO mudaria: [' + nome + '] "' + (nomeVeroAtual || '') + '" → "' + m.nomeVero + '"');
      fixNomeVero++;
    }
  }
  Logger.log('Resumo planos_vero.json: ' + fixPlano + ' PLANOs renomeados, ' + fixNomeVero + ' NOME_VERO atualizados.');
  if (semMap.length) {
    Logger.log('Sem mapping (precisa atenção):');
    semMap.forEach(function (n) { Logger.log('  - ' + n); });
  }

  // 2) pontuacao_planos.json
  var ponteId = CONFIG.PONTUACAO_JSON_FILE_ID;
  var filePonte = DriveApp.getFileById(ponteId);
  var ponte = JSON.parse(filePonte.getBlob().getDataAsString());
  var trocados = 0, semCodigo = [];
  for (var j = 0; j < ponte.planos.length; j++) {
    var e = ponte.planos[j];
    if (!e || typeof e.codigo !== 'string') continue;
    if (e.codigo.indexOf('NP30-') !== 0) continue;
    var nm = e.nome_crm;
    var mm = _REV12_MAP_NP30[nm];
    if (mm && mm.codigo) {
      Logger.log('Pontuação codigo: ' + e.codigo + ' → ' + mm.codigo + ' (' + nm + ')');
      trocados++;
    } else {
      semCodigo.push(nm);
    }
  }
  Logger.log('Resumo pontuacao_planos.json: ' + trocados + ' códigos resolvidos.');
  if (semCodigo.length) {
    Logger.log('Pontuação sem código VeroHub (mantém placeholder NP30-*):');
    semCodigo.forEach(function (n) { Logger.log('  - ' + n); });
  }

  Logger.log('=== fim dry-run — nada foi escrito ===');
}

// --------------------------------------------------------------------------
// EXECUÇÃO: atualiza planos_vero.json (col O = NOME_VERO + fix velocidade PRO/PRO MAX)
// --------------------------------------------------------------------------
function _atualizarPlanosVeroJsonRev12_FixNP30() {
  var fileTabela = DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID);
  var tabela = JSON.parse(fileTabela.getBlob().getDataAsString());

  // Garante que linha 0 (metadata) e linha 1 (header) tenham col 14
  if (tabela[0].length < 15) tabela[0].push('NP 3.0 (Rev12 fix 17/06/2026)');
  if (tabela[1].length < 15) tabela[1].push('NOME_VERO');

  var fixPlano = 0, fixNomeVero = 0;
  for (var i = 2; i < tabela.length; i++) {
    var row = tabela[i];
    if (!row || row[8] !== true) continue;
    var nome = row[0];
    var m = _REV12_MAP_NP30[nome];
    if (!m) continue;

    if (m.novoPlano && m.novoPlano !== nome) {
      row[0] = m.novoPlano;
      fixPlano++;
    }
    // Garante len >= 15 antes de gravar col 14
    while (row.length < 15) row.push('');
    if (row[14] !== m.nomeVero) {
      row[14] = m.nomeVero;
      fixNomeVero++;
    }
  }

  // Atualiza metadata linha 0
  tabela[0][0] = 'Última atualização: 17/06/2026 — Rev12 fix NP 3.0: NOME_VERO canônico + velocidade PRO 850MB + PRO MAX 900MB.';

  var conteudo = JSON.stringify(tabela);
  fileTabela.setContent(conteudo);

  // Invalida cache
  try {
    CacheService.getScriptCache().remove('planos_vero_json_v1');
  } catch (e) { /* noop */ }

  Logger.log('OK Rev12 — planos_vero.json: ' + fixPlano + ' PLANOs renomeados, ' +
             fixNomeVero + ' NOME_VERO atualizados, ' + conteudo.length + ' bytes.');
}

// --------------------------------------------------------------------------
// EXECUÇÃO: substitui placeholders NP30-* em pontuacao_planos.json pelos códigos VeroHub reais
// --------------------------------------------------------------------------
function _atualizarPontuacaoVeroHubRev12() {
  var filePonte = DriveApp.getFileById(CONFIG.PONTUACAO_JSON_FILE_ID);
  var ponte = JSON.parse(filePonte.getBlob().getDataAsString());

  var trocados = 0;
  for (var j = 0; j < ponte.planos.length; j++) {
    var e = ponte.planos[j];
    if (!e || typeof e.codigo !== 'string') continue;
    if (e.codigo.indexOf('NP30-') !== 0) continue;
    var mm = _REV12_MAP_NP30[e.nome_crm];
    if (!mm || !mm.codigo) continue;
    e.codigo = String(mm.codigo);
    e.nome_vero = mm.nomeVero;
    if (!e._prov) e._prov = {};
    e._prov.fonte = 'verohub_venda_2027460_17_06_26';
    e._prov.confianca = 'alta';
    e._prov.nome_tabela = mm.nomeVero;
    trocados++;
  }

  ponte._meta.atualizado_em = new Date().toISOString();
  ponte._meta.nota = (ponte._meta.nota || '') +
    ' | Rev12 (17/06/2026): ' + trocados + ' placeholders NP30-* substituídos por códigos VeroHub reais.';

  var conteudo = JSON.stringify(ponte);
  filePonte.setContent(conteudo);

  // Invalida cache do reader (Code.js _getPontuacaoPlanos cacheia chunked)
  try {
    var c = CacheService.getScriptCache();
    // Limpa qualquer cache chunked relacionado
    c.remove('pontuacao_planos_v1');
    c.remove('pontuacao_planos_v2');
  } catch (e) { /* noop */ }

  Logger.log('OK Rev12 — pontuacao_planos.json: ' + trocados + ' placeholders resolvidos, ' +
             conteudo.length + ' bytes.');
}

// --------------------------------------------------------------------------
// EXECUÇÃO: roda os 2 helpers em sequência (atalho)
// --------------------------------------------------------------------------
function _executarRev12_Completo() {
  Logger.log('--- 1/2 atualizando planos_vero.json ---');
  _atualizarPlanosVeroJsonRev12_FixNP30();
  Logger.log('--- 2/2 atualizando pontuacao_planos.json ---');
  _atualizarPontuacaoVeroHubRev12();
  Logger.log('--- Rev12 concluída ---');
}
