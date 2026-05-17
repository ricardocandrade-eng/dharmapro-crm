/**
 * ViabilidadeParser — parser puro JS V8 para respostas do gateway PinG.
 *
 * Roda em Node (testes) e no Apps Script (V8). Sem dependência de
 * SpreadsheetApp/UrlFetchApp/PropertiesService/Utilities. Sem imports.
 *
 * Spec: dharmapro-crm/prompt-viabilidade-ping.v2.md §3, §4, §11.5.
 * Decisão Sprint 1: a CTO mais próxima (item [0] de ctos_within_range,
 * que o gateway ordena por distance ascendente) define a agregação top-level
 * quando disponibilidade === "available".
 */
(function (root) {
  "use strict";

  function ViabilidadeParseError(msg) {
    var e = new Error(msg);
    e.name = "ViabilidadeParseError";
    return e;
  }
  ViabilidadeParseError.prototype = Object.create(Error.prototype);

  function _warn(campo, valorRecebido, esperado, fixtureId) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn({
        viabilidadeParserWarn: true,
        campo: campo,
        valorRecebido: valorRecebido,
        esperado: esperado,
        fixtureId: fixtureId || "?"
      });
    }
  }

  function _findAddrComponent(components, type) {
    if (!Array.isArray(components)) return null;
    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      if (c && Array.isArray(c.types) && c.types.indexOf(type) !== -1) return c;
    }
    return null;
  }

  function _normalizarEndereco(raw) {
    var endereco = {
      completo: typeof raw.completo === "string" ? raw.completo : "",
      rua: undefined,
      numero: undefined,
      bairro: undefined,
      cidade: undefined,
      uf: undefined,
      cep: undefined,
      ibge: undefined,
      lat: undefined,
      lng: undefined
    };

    var rg = raw.resultado_google;
    var comps = rg && rg.address_components;
    if (Array.isArray(comps)) {
      var route = _findAddrComponent(comps, "route");
      if (route) endereco.rua = route.long_name;
      var subloc = _findAddrComponent(comps, "sublocality_level_1") || _findAddrComponent(comps, "sublocality");
      if (subloc) endereco.bairro = subloc.long_name;
      var city = _findAddrComponent(comps, "administrative_area_level_2");
      if (city) endereco.cidade = city.long_name;
      var state = _findAddrComponent(comps, "administrative_area_level_1");
      if (state && typeof state.short_name === "string") endereco.uf = state.short_name;
      var cep = _findAddrComponent(comps, "postal_code");
      if (cep) endereco.cep = cep.long_name;
    } else {
      _warn("resultado_google.address_components", comps, "array");
    }

    if (raw.numero != null) {
      var n = parseInt(raw.numero, 10);
      if (isNaN(n)) {
        _warn("numero", raw.numero, "string parseável a int");
      } else {
        endereco.numero = n;
      }
    }

    if (raw.coordenadas && typeof raw.coordenadas.lat === "number" && typeof raw.coordenadas.lng === "number") {
      endereco.lat = raw.coordenadas.lat;
      endereco.lng = raw.coordenadas.lng;
    } else if (typeof raw.latitude === "number" && typeof raw.longitude === "number") {
      endereco.lat = raw.latitude;
      endereco.lng = raw.longitude;
    } else {
      _warn("coordenadas", raw.coordenadas, "{lat:number,lng:number} ou latitude/longitude top-level");
    }

    return endereco;
  }

  function derivarStatusCto(ctoRaw) {
    if (!ctoRaw || typeof ctoRaw !== "object") {
      _warn("cto", ctoRaw, "objeto");
      return "INDISPONIVEL";
    }
    var ports = typeof ctoRaw.ports === "number" ? ctoRaw.ports : 0;
    var occ = typeof ctoRaw.occupied_ports === "number" ? ctoRaw.occupied_ports : 0;
    var livres = Math.max(0, ports - occ);
    var av = ctoRaw.availability_status;
    if (av === "available") {
      return livres > 0 ? "DISPONIVEL" : "PROVAVEL_PORTAS_LIMITADAS";
    }
    if (av === "available_few_ports") return "PROVAVEL_PORTAS_LIMITADAS";
    if (av === "probable") return "PROVAVEL";
    if (av == null) {
      _warn("availability_status", av, "string enum");
    } else if (typeof av !== "string") {
      _warn("availability_status", av, "string");
    }
    return "INDISPONIVEL";
  }

  function _normalizarCto(ctoRaw) {
    var cto = {
      id: undefined,
      nome: undefined,
      status: derivarStatusCto(ctoRaw),
      tecnologia: undefined,
      arquitetura: undefined,
      distanciaMetros: undefined,
      portasTotais: undefined,
      portasOcupadas: undefined,
      portasLivres: undefined,
      portasDisponiveis: undefined,
      maxDropDistance: undefined,
      validada: false,
      provedor: undefined,
      corOcupacao: undefined,
      lat: undefined,
      lng: undefined
    };

    if (typeof ctoRaw.id === "number") {
      cto.id = ctoRaw.id;
    } else if (typeof ctoRaw.id === "string") {
      var idn = parseInt(ctoRaw.id, 10);
      if (!isNaN(idn)) {
        cto.id = idn;
        _warn("cto.id", ctoRaw.id, "number (recebeu string)");
      } else {
        _warn("cto.id", ctoRaw.id, "number");
      }
    }

    if (typeof ctoRaw.name === "string") cto.nome = ctoRaw.name;
    if (typeof ctoRaw.technology === "string") cto.tecnologia = ctoRaw.technology;

    if (ctoRaw.architecture != null && typeof ctoRaw.architecture === "string") {
      cto.arquitetura = ctoRaw.architecture;
    }
    // architecture === null é silencioso (§11.5 #3)

    if (typeof ctoRaw.distance === "number") cto.distanciaMetros = ctoRaw.distance;
    if (typeof ctoRaw.ports === "number") cto.portasTotais = ctoRaw.ports;
    if (typeof ctoRaw.occupied_ports === "number") cto.portasOcupadas = ctoRaw.occupied_ports;

    var ports = typeof ctoRaw.ports === "number" ? ctoRaw.ports : 0;
    var occ = typeof ctoRaw.occupied_ports === "number" ? ctoRaw.occupied_ports : 0;
    cto.portasLivres = Math.max(0, ports - occ);

    if (typeof ctoRaw.available_ports === "number") cto.portasDisponiveis = ctoRaw.available_ports;
    if (typeof ctoRaw.max_drop_distance === "number") cto.maxDropDistance = ctoRaw.max_drop_distance;

    cto.validada = ctoRaw.cto_validation === "valid";

    if (typeof ctoRaw.provider_name === "string") cto.provedor = ctoRaw.provider_name;
    if (typeof ctoRaw.occupation_color === "string") cto.corOcupacao = ctoRaw.occupation_color;

    var coords = ctoRaw.coordinates;
    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
      cto.lng = coords[0];
      cto.lat = coords[1];
    } else if (coords != null) {
      _warn("cto.coordinates", coords, "[lng,lat] (GeoJSON)");
    }

    return cto;
  }

  function derivarResultado(rawDisponibilidade, ctosNormalizadas) {
    if (!rawDisponibilidade || typeof rawDisponibilidade !== "object") {
      _warn("disponibilidade", rawDisponibilidade, "objeto");
      return "INDETERMINADO";
    }
    var disp = rawDisponibilidade.disponibilidade;
    if (disp === "no coverage") return "SEM_COBERTURA";
    if (disp === "forbidden") return "AREA_PROIBIDA";
    if (disp === "probable") return "PROVAVEL";
    if (disp === "available") {
      if (!Array.isArray(ctosNormalizadas) || ctosNormalizadas.length === 0) {
        return "INDETERMINADO";
      }
      var primeira = ctosNormalizadas[0];
      switch (primeira && primeira.status) {
        case "DISPONIVEL": return "DISPONIVEL";
        case "PROVAVEL_PORTAS_LIMITADAS": return "PROVAVEL";
        case "PROVAVEL": return "PROVAVEL";
        case "INDISPONIVEL": return "PROVAVEL";
        default: return "INDETERMINADO";
      }
    }
    _warn("disponibilidade.disponibilidade", disp, "enum: available|no coverage|probable|forbidden");
    return "INDETERMINADO";
  }

  function gerarMotivo(resultado, ctos, forbiddenAreaName) {
    var arr = Array.isArray(ctos) ? ctos : [];
    var primeira = arr[0];
    if (resultado === "DISPONIVEL") {
      var d = primeira && typeof primeira.distanciaMetros === "number"
        ? Math.round(primeira.distanciaMetros) : "?";
      var livres = primeira && typeof primeira.portasLivres === "number" ? primeira.portasLivres : "?";
      return "Disponível — " + arr.length + " CTO(s) no raio, mais próxima a " + d + "m com " + livres + " portas livres";
    }
    if (resultado === "PROVAVEL") {
      if (primeira && primeira.status === "PROVAVEL_PORTAS_LIMITADAS") {
        var liv = typeof primeira.portasLivres === "number" ? primeira.portasLivres : "?";
        var tot = typeof primeira.portasTotais === "number" ? primeira.portasTotais : "?";
        return "Cobertura provável — atenção a portas (CTO mais próxima com " + liv + " livre(s) de " + tot + ")";
      }
      return "Cobertura provável — confirmar com vistoria";
    }
    if (resultado === "SEM_COBERTURA") return "Endereço sem cobertura no PinG";
    if (resultado === "AREA_PROIBIDA") {
      var nome = (typeof forbiddenAreaName === "string" && forbiddenAreaName) ? forbiddenAreaName : "sem nome";
      return "Endereço dentro de área proibida (" + nome + ")";
    }
    return "Resposta inconsistente do PinG";
  }

  function _rayCast(lng, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var pi = ring[i], pj = ring[j];
      if (!Array.isArray(pi) || !Array.isArray(pj)) continue;
      var xi = pi[0], yi = pi[1], xj = pj[0], yj = pj[1];
      var intersect = ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInForbidden(lat, lng, coverageAreaArr) {
    if (typeof lat !== "number" || typeof lng !== "number") {
      _warn("pointInForbidden.coords", { lat: lat, lng: lng }, "number,number");
      return false;
    }
    if (!Array.isArray(coverageAreaArr)) {
      _warn("pointInForbidden.coverageAreaArr", coverageAreaArr, "array");
      return false;
    }
    for (var p = 0; p < coverageAreaArr.length; p++) {
      var poly = coverageAreaArr[p];
      if (!poly || poly.coverage_type !== "forbidden") continue;
      var coords = poly.coordinates;
      if (!Array.isArray(coords) || coords.length === 0) {
        _warn("poly.coordinates", coords, "array de rings (não vazio)");
        continue;
      }
      for (var r = 0; r < coords.length; r++) {
        var ring = coords[r];
        if (!Array.isArray(ring) || ring.length < 3) {
          _warn("poly.coordinates[" + r + "]", ring, "ring com ≥3 pontos");
          continue;
        }
        if (_rayCast(lng, lat, ring)) return true;
      }
    }
    return false;
  }

  function normalizar(rawDetalhesNumero) {
    if (rawDetalhesNumero == null || typeof rawDetalhesNumero !== "object") {
      throw ViabilidadeParseError("Schema inválido — response não é objeto");
    }
    var raw = rawDetalhesNumero;

    var endereco = _normalizarEndereco(raw);

    var disp = raw.disponibilidade;
    var ctos = [];
    var resultado;
    var motivo;

    if (!disp || typeof disp !== "object") {
      _warn("disponibilidade", disp, "objeto");
      resultado = "INDETERMINADO";
      motivo = "Bloco disponibilidade ausente";
    } else {
      var ctosRaw = disp.ctos_within_range;
      if (Array.isArray(ctosRaw)) {
        for (var i = 0; i < ctosRaw.length; i++) {
          ctos.push(_normalizarCto(ctosRaw[i]));
        }
      } else if (ctosRaw != null) {
        _warn("ctos_within_range", ctosRaw, "array");
      }
      if (ctos.length > 0 && typeof ctos[0].lat === "number" && endereco.ibge == null) {
        // ibge não está no top-level; usa o do 1º CTO se houver
      }
      // ibge: pega do 1º CTO se houver
      if (ctosRaw && Array.isArray(ctosRaw) && ctosRaw[0] && typeof ctosRaw[0].ibge === "number") {
        endereco.ibge = ctosRaw[0].ibge;
      }

      // Edge case §11.5 #14: endereço fora do Brasil (UF ausente)
      if (!endereco.uf) {
        resultado = "INDETERMINADO";
        motivo = "Endereço fora do Brasil";
      } else {
        resultado = derivarResultado(disp, ctos);
        if (resultado === "INDETERMINADO" && Array.isArray(disp.ctos_within_range) && disp.ctos_within_range.length === 0 && Array.isArray(disp.forbidden_areas) && disp.forbidden_areas.length === 0 && disp.disponibilidade !== "no coverage") {
          motivo = "Resposta inconsistente do PinG (sem CTOs e sem área proibida e sem 'no coverage')";
        } else {
          motivo = gerarMotivo(resultado, ctos);
        }
      }
    }

    return {
      resultado: resultado,
      motivo: motivo,
      endereco: endereco,
      ctos: ctos,
      fonte: "PING",
      consultadoEm: new Date().toISOString(),
      cacheHit: false,
      ping: { cache: !!raw.cache }
    };
  }

  var api = {
    normalizar: normalizar,
    derivarResultado: derivarResultado,
    derivarStatusCto: derivarStatusCto,
    pointInForbidden: pointInForbidden,
    gerarMotivo: gerarMotivo,
    ViabilidadeParseError: ViabilidadeParseError
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ViabilidadeParser = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
