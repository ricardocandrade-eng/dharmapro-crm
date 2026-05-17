/**
 * Testes do ViabilidadeParser — runner mínimo com `assert` nativo do Node.
 *
 * Roda contra os 5 fixtures reais em extensao-dharmapro/fixtures/ping/.
 * Edge cases §11.5 que tocam o parser cobertos como testes; itens de
 * autocomplete (#8, #9, #10, #16) ficam para Sprint 2.
 *
 * Uso:
 *   cd dharmapro-crm
 *   node ViabilidadeParser.test.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var assert = require("assert");
var P = require("./ViabilidadeParser.js");

var FIX_DIR = path.join(__dirname, "extensao-dharmapro", "fixtures", "ping");

function carregar(nome) {
  return JSON.parse(fs.readFileSync(path.join(FIX_DIR, nome), "utf8"));
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

var ok = 0, fail = 0;
var falhas = [];

function teste(nome, fn) {
  var warnsCapturados = [];
  var origWarn = console.warn;
  console.warn = function (x) { warnsCapturados.push(x); };
  try {
    fn({ warnsCapturados: warnsCapturados });
    console.warn = origWarn;
    ok++;
    process.stdout.write("[PASS] " + nome + "\n");
  } catch (e) {
    console.warn = origWarn;
    fail++;
    falhas.push({ nome: nome, e: e });
    process.stdout.write("[FAIL] " + nome + ": " + e.message + "\n");
  }
}

function assertNoWarns(warns, contexto) {
  var parserWarns = warns.filter(function (w) { return w && w.viabilidadeParserWarn === true; });
  if (parserWarns.length > 0) {
    throw new Error("Warnings inesperados em " + contexto + ": " + JSON.stringify(parserWarns));
  }
}

function assertWarnPara(warns, campo) {
  var found = warns.some(function (w) { return w && w.viabilidadeParserWarn === true && w.campo === campo; });
  if (!found) {
    throw new Error("Esperava warn estruturado para campo '" + campo + "'. Capturados: " + JSON.stringify(warns));
  }
}

// ------------------------------------------------------------
// A. Fixtures reais (5 testes)
// ------------------------------------------------------------

teste("01 — disponivel.detalhes-numero.json → DISPONIVEL com 9 CTOs", function (ctx) {
  var fx = carregar("disponivel.detalhes-numero.json");
  var r = P.normalizar(fx.response);
  assert.strictEqual(r.resultado, "DISPONIVEL");
  assert.strictEqual(r.resultado, fx.meta.expectedParserResult);
  assert.strictEqual(r.ctos.length, 9);
  assert.strictEqual(r.ctos[0].nome, "38/2");
  assert.strictEqual(r.endereco.cidade, "Florianópolis");
  assert.strictEqual(r.endereco.uf, "SC");
  assert.strictEqual(r.endereco.numero, 100);
  assert.strictEqual(r.fonte, "PING");
  assertNoWarns(ctx.warnsCapturados, "disponivel");
});

teste("02 — provavel-portas-limitadas.detalhes-numero.json → PROVAVEL (1ª CTO few_ports)", function (ctx) {
  var fx = carregar("provavel-portas-limitadas.detalhes-numero.json");
  var r = P.normalizar(fx.response);
  assert.strictEqual(r.resultado, "PROVAVEL");
  assert.strictEqual(r.resultado, fx.meta.expectedParserResult);
  assert.strictEqual(r.ctos.length, 2);
  assert.strictEqual(r.endereco.cidade, "Juiz de Fora");
  assert.strictEqual(r.endereco.uf, "MG");
  assertNoWarns(ctx.warnsCapturados, "provavel");
});

teste("03 — sem-cobertura.detalhes-numero.json → SEM_COBERTURA, ctos=[]", function (ctx) {
  var fx = carregar("sem-cobertura.detalhes-numero.json");
  var r = P.normalizar(fx.response);
  assert.strictEqual(r.resultado, "SEM_COBERTURA");
  assert.strictEqual(r.resultado, fx.meta.expectedParserResult);
  assert.strictEqual(r.ctos.length, 0);
  assert.strictEqual(r.endereco.cidade, "Manaus");
  assert.strictEqual(r.endereco.uf, "AM");
  assertNoWarns(ctx.warnsCapturados, "sem-cobertura");
});

teste("04 — area-proibida-floripa: autocomplete[0] cai dentro do polígono forbidden", function (ctx) {
  var fx = carregar("area-proibida-floripa.flow.json");
  var sug = fx.autocomplete[0];
  var inside = P.pointInForbidden(sug.latitude, sug.longitude, fx.coverageArea);
  assert.strictEqual(inside, true);
  assert.strictEqual(fx.meta.expectedParserResult, "AREA_PROIBIDA");
  assertNoWarns(ctx.warnsCapturados, "area-proibida-floripa");
});

teste("05 — area-proibida-sao-paulo: centróide do polígono cai dentro (positivo), autocomplete[0] não cai (negativo)", function (ctx) {
  var fx = carregar("area-proibida-sao-paulo.flow.json");
  var ring = fx.coverageArea[0].coordinates[0];
  var sx = 0, sy = 0;
  for (var i = 0; i < ring.length; i++) { sx += ring[i][0]; sy += ring[i][1]; }
  var cLng = sx / ring.length, cLat = sy / ring.length;
  assert.strictEqual(P.pointInForbidden(cLat, cLng, fx.coverageArea), true);
  // Limitação do fixture: as 8 sugestões do autocomplete não caem no polígono
  // capturado (o polígono cobre um cluster distinto). Documenta isso.
  var sug = fx.autocomplete[0];
  assert.strictEqual(P.pointInForbidden(sug.latitude, sug.longitude, fx.coverageArea), false);
  assert.strictEqual(fx.meta.expectedParserResult, "AREA_PROIBIDA");
  assertNoWarns(ctx.warnsCapturados, "area-proibida-sao-paulo");
});

// ------------------------------------------------------------
// B. Campos derivados específicos (2 testes)
// ------------------------------------------------------------

teste("06 — CTO 38/2 (disponivel): validada/portasLivres/tecnologia/arquitetura/provedor", function (ctx) {
  var fx = carregar("disponivel.detalhes-numero.json");
  var r = P.normalizar(fx.response);
  var c = r.ctos[0];
  assert.strictEqual(c.nome, "38/2");
  assert.strictEqual(c.validada, true);
  assert.strictEqual(c.portasLivres, 13, "16 - 3 = 13, NÃO 16");
  assert.strictEqual(c.portasDisponiveis, 16, "available_ports cru exposto");
  assert.strictEqual(c.tecnologia, "GPON");
  assert.strictEqual(c.arquitetura, undefined, "raw=null → expor undefined");
  assert.strictEqual(c.provedor, "SU SC LITORAL", "preserva case real (all caps)");
  assert.strictEqual(typeof c.lat, "number");
  assert.strictEqual(typeof c.lng, "number");
  assert.strictEqual(c.status, "DISPONIVEL");
  assertNoWarns(ctx.warnsCapturados, "cto 38/2");
});

teste("07 — CTO #0 (provavel): status=PROVAVEL_PORTAS_LIMITADAS, portasLivres=1, validada=true", function (ctx) {
  var fx = carregar("provavel-portas-limitadas.detalhes-numero.json");
  var r = P.normalizar(fx.response);
  var c = r.ctos[0];
  assert.strictEqual(c.nome, "JF07-026-3-2");
  assert.strictEqual(c.status, "PROVAVEL_PORTAS_LIMITADAS", "NÃO é DISPONIVEL — availability_status é available_few_ports");
  assert.strictEqual(c.portasLivres, 1, "8 - 7 = 1");
  assert.strictEqual(c.validada, true);
  assertNoWarns(ctx.warnsCapturados, "cto JF07-026-3-2");
});

// ------------------------------------------------------------
// C. pointInForbidden ponto fora (1 teste)
// ------------------------------------------------------------

teste("08 — pointInForbidden(0, 0, floripa.coverageArea) → false", function (ctx) {
  var fx = carregar("area-proibida-floripa.flow.json");
  assert.strictEqual(P.pointInForbidden(0, 0, fx.coverageArea), false);
  assertNoWarns(ctx.warnsCapturados, "point (0,0) fora");
});

// ------------------------------------------------------------
// D. Edge cases §11.5 (8 testes, subset que toca o parser)
// ------------------------------------------------------------

teste("09 — Edge #1: numero top-level como string '100' → endereco.numero === 100 (number)", function (ctx) {
  var fx = carregar("disponivel.detalhes-numero.json");
  assert.strictEqual(typeof fx.response.numero, "string", "fixture confirma: numero é string crua");
  var r = P.normalizar(fx.response);
  assert.strictEqual(typeof r.endereco.numero, "number");
  assert.strictEqual(r.endereco.numero, 100);
  assertNoWarns(ctx.warnsCapturados, "numero string→number");
});

teste("10 — Edge #2: coordinates CTO [lng,lat] (GeoJSON) → cto.lng/.lat normalizados corretamente (não invertidos)", function (ctx) {
  var fx = carregar("disponivel.detalhes-numero.json");
  var raw0 = fx.response.disponibilidade.ctos_within_range[0];
  assert.ok(Array.isArray(raw0.coordinates) && raw0.coordinates.length === 2, "raw é [lng,lat]");
  var rawLng = raw0.coordinates[0], rawLat = raw0.coordinates[1];
  var r = P.normalizar(fx.response);
  var c = r.ctos[0];
  assert.strictEqual(c.lng, rawLng);
  assert.strictEqual(c.lat, rawLat);
  // Sanity: Floripa lat é ~-27 (negativo, sul), lng é ~-48 (negativo, oeste).
  // Se invertidos, lat seria ~-48 e lng ~-27 (absurdo).
  assert.ok(c.lat < -20 && c.lat > -30, "lat de Floripa deve ser ~-27");
  assert.ok(c.lng < -40 && c.lng > -50, "lng de Floripa deve ser ~-48");
  assertNoWarns(ctx.warnsCapturados, "coords [lng,lat]");
});

teste("11 — Edge #3: architecture=null no fixture disponivel → cto.arquitetura === undefined (sem warn)", function (ctx) {
  var fx = carregar("disponivel.detalhes-numero.json");
  assert.strictEqual(fx.response.disponibilidade.ctos_within_range[0].architecture, null, "fixture confirma raw=null");
  var r = P.normalizar(fx.response);
  assert.strictEqual(r.ctos[0].arquitetura, undefined);
  assertNoWarns(ctx.warnsCapturados, "architecture null");
});

teste("12 — Edge #4: cto_validation ausente → cto.validada === false (sem erro)", function (ctx) {
  var fx = clone(carregar("provavel-portas-limitadas.detalhes-numero.json"));
  delete fx.response.disponibilidade.ctos_within_range[1].cto_validation;
  var r = P.normalizar(fx.response);
  assert.strictEqual(r.ctos[1].validada, false);
  // CTO #0 não foi mexido — segue validada=true
  assert.strictEqual(r.ctos[0].validada, true);
  assertNoWarns(ctx.warnsCapturados, "cto_validation ausente");
});

teste("13 — Edge #5: available_ports !== ports - occupied_ports → portasLivres = ports-occupied; portasDisponiveis = cru", function (ctx) {
  var fx = carregar("disponivel.detalhes-numero.json");
  var raw0 = fx.response.disponibilidade.ctos_within_range[0];
  assert.strictEqual(raw0.ports, 16);
  assert.strictEqual(raw0.occupied_ports, 3);
  assert.strictEqual(raw0.available_ports, 16, "cru divergente — não é 16-3=13");
  var r = P.normalizar(fx.response);
  var c = r.ctos[0];
  assert.strictEqual(c.portasLivres, 13);
  assert.strictEqual(c.portasDisponiveis, 16);
  assertNoWarns(ctx.warnsCapturados, "available_ports divergente");
});

teste("14 — Edge #7: disponibilidade ausente → resultado=INDETERMINADO + warn estruturado", function (ctx) {
  var fx = clone(carregar("disponivel.detalhes-numero.json"));
  delete fx.response.disponibilidade;
  var r = P.normalizar(fx.response);
  assert.strictEqual(r.resultado, "INDETERMINADO");
  assert.strictEqual(r.motivo, "Bloco disponibilidade ausente");
  assert.strictEqual(r.ctos.length, 0);
  assertWarnPara(ctx.warnsCapturados, "disponibilidade");
});

teste("15 — Edge #6: ctos=[] + forbidden=[] + disp='available' → INDETERMINADO (resposta inconsistente)", function (ctx) {
  var fx = clone(carregar("disponivel.detalhes-numero.json"));
  fx.response.disponibilidade.ctos_within_range = [];
  fx.response.disponibilidade.forbidden_areas = [];
  // disp continua 'available' — incoerente, mas é o teste
  var r = P.normalizar(fx.response);
  assert.strictEqual(r.resultado, "INDETERMINADO");
  assert.ok(/inconsistente/i.test(r.motivo), "motivo deve sinalizar inconsistência: " + r.motivo);
  assertNoWarns(ctx.warnsCapturados, "ctos=[] + forbidden=[] + available");
});

teste("16 — Edge #12: cache:true no top-level → ping.cache=true, cacheHit=false (campos separados)", function (ctx) {
  var fx = carregar("disponivel.detalhes-numero.json");
  assert.strictEqual(fx.response.cache, true, "fixture confirma cache=true");
  var r = P.normalizar(fx.response);
  assert.strictEqual(r.ping.cache, true, "gateway cache propagado");
  assert.strictEqual(r.cacheHit, false, "cacheHit é nosso — sempre false aqui");
  assertNoWarns(ctx.warnsCapturados, "cache propagado");
});

// ------------------------------------------------------------
// Final
// ------------------------------------------------------------

process.stdout.write("\n" + ok + " passou, " + fail + " falhou\n");
if (fail > 0) {
  process.stdout.write("\nFalhas:\n");
  falhas.forEach(function (f) {
    process.stdout.write("  - " + f.nome + "\n    " + (f.e && f.e.stack ? f.e.stack : f.e) + "\n");
  });
}
process.exit(fail > 0 ? 1 : 0);
