// ══════════════════════════════════════════════════════════════════════════════
//  ONE-SHOT — Correção de VALOR mãe corrompido em Fibra Combo (15/06/2026)
//
//  Contexto: alguns combos têm na col O (VALOR) da linha-mãe Fibra Combo o
//  valor da Fibra PURA (R$ 72,90) em vez do FACE do combo (R$ 112,90).
//  Sintoma: card mostra Fibra = Total = R$ 72,90 e Móvel sem valor.
//  Provável causa: criação manual antes do auto-fill do v562 ou edição errada.
//
//  Fluxo:
//   1. Rodar `diagnosticarValorComboMaeCorrupto()` no editor — read-only.
//      Loga até 50 casos suspeitos com linha, cliente, plano, valor atual,
//      face sugerido.
//   2. Revisar log. Se concordar, rodar `corrigirValorComboMaeBatch()` —
//      idempotente, só toca rows flagged como confiança ALTA.
//   3. Avisar e remover este arquivo no próximo push.
//
//  Detecção:
//   - Confiança ALTA  → |VALOR_mae − sweepFibra| < 0.5 (mãe == Fibra pura)
//                       AND inferência do Móvel resolve (faceCorreto definido)
//   - Confiança MEDIA → VALOR_mae == sweepFibra mas Móvel não infere
//                       (precisa decisão manual sobre o Móvel)
//   - Filhas com VALOR vazio quando há inferência → também marca pra preencher
// ══════════════════════════════════════════════════════════════════════════════

function _decompDiagAlvo_(row, c) {
  var produto = String(row[c.PRODUTO] || '').trim();
  if (produto !== 'Fibra Combo') return false;
  var status = String(row[c.STATUS] || '').trim().toUpperCase();
  if (status.indexOf('CANCEL') !== -1) return false;
  if (status.indexOf('CHURN') !== -1) return false;
  if (status.indexOf('DEVOLVID') !== -1) return false;
  return true;
}

function _decompDiagLinhaPropor_(row, numeroLinha, c, vinculosMap) {
  var valorMae = _normalizarValorParaNumero_(row[c.VALOR]);
  if (typeof valorMae !== 'number' || valorMae <= 0) return null;

  var plano  = String(row[c.PLANO]  || '').trim();
  var cidade = String(row[c.CIDADE] || '').trim();
  var cod    = String(row[c.FAT]    || '').trim();
  if (!cod && plano && cidade) {
    try { cod = getCodigoVeroPorPlanoCidade(plano, cidade) || ''; } catch(e) {}
  }
  if (!cod) return null; // sem cod, não dá pra validar via sweep

  var vh   = _getVerohubCodigos();
  var info = vh && vh.codigos && vh.codigos[cod];
  if (!info || typeof info.price !== 'number' || info.price <= 0) return null;
  var sweepFibra = info.price;

  // Mãe é suspeita quando VALOR atual ≈ sweepFibra (== fibra pura).
  var dif = Math.abs(valorMae - sweepFibra);
  if (dif >= 0.5) return null; // não é o caso corrupto que estamos caçando

  // Tenta inferir Móvel pelo nome do plano.
  var infer = null;
  try { infer = _inferirMovelComboFromFibra_(plano); } catch(e) {}
  var priceMovel = (infer && !infer.erro && infer.valor > 0) ? infer.valor : 0;
  var faceCorreto = priceMovel > 0 ? sweepFibra + priceMovel : 0;

  // Filha vinculada (pra também preencher VALOR vazio quando inferência rolou)
  var linhaFilha = 0;
  var valorFilha = '';
  var filhas = (vinculosMap.filhasPorMae && vinculosMap.filhasPorMae[numeroLinha]) || [];
  if (filhas.length) {
    linhaFilha = filhas[filhas.length - 1].vendaFilhaLinha || 0;
  }
  if (linhaFilha) {
    try {
      var sh = _getSheet();
      var raw = sh.getRange(linhaFilha, c.VALOR + 1).getValue();
      valorFilha = _normalizarValorParaNumero_(raw);
    } catch(e) {}
  }

  return {
    linha:        numeroLinha,
    cliente:      String(row[c.CLIENTE] || '').trim(),
    plano:        plano,
    cidade:       cidade,
    cod:          cod,
    valorMaeAtual:    valorMae,
    sweepFibra:       sweepFibra,
    priceMovel:       priceMovel,
    faceCorreto:      faceCorreto,
    confianca:        priceMovel > 0 ? 'ALTA' : 'MEDIA',
    linhaFilha:       linhaFilha,
    valorFilhaAtual:  (typeof valorFilha === 'number') ? valorFilha : 0,
    valorFilhaSugerido: priceMovel > 0 ? priceMovel : 0
  };
}

// Read-only. Loga até MAX casos pra revisão. Não escreve nada.
function diagnosticarValorComboMaeCorrupto() {
  var MAX_LOG = 60;
  var sheet = _getSheet();
  var ultima = sheet.getLastRow();
  if (ultima < 3) { Logger.log('Planilha vazia.'); return; }
  var raw = sheet.getRange(3, 1, ultima - 2, CONFIG.TOTAL_COLUNAS).getValues();
  var c = CONFIG.COLUNAS;
  var vinculosMap = _getVinculosVendasMap_();

  var alta = [], media = [];
  for (var i = 0; i < raw.length; i++) {
    var row = raw[i];
    if (!_decompDiagAlvo_(row, c)) continue;
    var numeroLinha = i + 3;
    var p = _decompDiagLinhaPropor_(row, numeroLinha, c, vinculosMap);
    if (!p) continue;
    if (p.confianca === 'ALTA') alta.push(p);
    else media.push(p);
  }

  Logger.log('═══ DIAGNÓSTICO VALOR COMBO MÃE CORROMPIDO ═══');
  Logger.log('Encontrados: ' + alta.length + ' ALTA confiança / ' + media.length + ' MÉDIA confiança');
  Logger.log('');

  Logger.log('── ALTA confiança (correção automatizável) ──');
  for (var a = 0; a < Math.min(alta.length, MAX_LOG); a++) {
    var x = alta[a];
    Logger.log('L.' + x.linha + ' ' + x.cliente + ' | ' + x.plano +
               ' (cidade=' + x.cidade + ', cod=' + x.cod + ')' +
               ' | VALOR_mae ATUAL=R$ ' + x.valorMaeAtual.toFixed(2) +
               ' → SUGERIDO=R$ ' + x.faceCorreto.toFixed(2) +
               ' (sweepFibra ' + x.sweepFibra.toFixed(2) + ' + Móvel inferido ' + x.priceMovel.toFixed(2) + ')' +
               (x.linhaFilha ? ' | filha L.' + x.linhaFilha +
                  ' VALOR_filha=' + (x.valorFilhaAtual ? 'R$ ' + x.valorFilhaAtual.toFixed(2) : 'VAZIA') +
                  ' → SUGERIDO=R$ ' + x.valorFilhaSugerido.toFixed(2) : ' | (sem filha)'));
  }
  if (alta.length > MAX_LOG) Logger.log('  ... +' + (alta.length - MAX_LOG) + ' linhas omitidas');

  Logger.log('');
  Logger.log('── MÉDIA confiança (revisar manualmente — Móvel não inferiu) ──');
  for (var m = 0; m < Math.min(media.length, MAX_LOG); m++) {
    var y = media[m];
    Logger.log('L.' + y.linha + ' ' + y.cliente + ' | ' + y.plano +
               ' (cidade=' + y.cidade + ', cod=' + y.cod + ')' +
               ' | VALOR_mae ATUAL=R$ ' + y.valorMaeAtual.toFixed(2) +
               ' (= sweepFibra, mas Móvel não inferiu — checar nome do plano)');
  }
  if (media.length > MAX_LOG) Logger.log('  ... +' + (media.length - MAX_LOG) + ' linhas omitidas');

  Logger.log('');
  Logger.log('FIM. Próximo: revisar log; se OK, rodar corrigirValorComboMaeBatch().');
  return { alta: alta.length, media: media.length };
}

// Aplica correção em batch nas linhas confiança ALTA do diagnóstico anterior.
// Política de segurança:
//   - VALOR_mae sempre corrigido (sweep é fonte canônica da Fibra pura).
//   - VALOR_filha: só preenchido quando atual está VAZIO. Se filha tem valor
//     divergente (ex: 50 quando deveria ser 40, ou 72,90 = Fibra pura por engano),
//     é LOGADA pra revisão manual e NÃO sobrescrita — pode indicar filha
//     vinculada errada ou plano divergente no Móvel.
function corrigirValorComboMaeBatch() {
  var sheet = _getSheet();
  var ultima = sheet.getLastRow();
  if (ultima < 3) { Logger.log('Planilha vazia.'); return; }
  var raw = sheet.getRange(3, 1, ultima - 2, CONFIG.TOTAL_COLUNAS).getValues();
  var c = CONFIG.COLUNAS;
  var vinculosMap = _getVinculosVendasMap_();

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Lock timeout — abortando.'); return; }

  try {
    var corrMae = 0, corrFilhaVazia = 0, filhasDivergentes = [];
    for (var i = 0; i < raw.length; i++) {
      var row = raw[i];
      if (!_decompDiagAlvo_(row, c)) continue;
      var numeroLinha = i + 3;
      var p = _decompDiagLinhaPropor_(row, numeroLinha, c, vinculosMap);
      if (!p || p.confianca !== 'ALTA') continue;

      // (1) Mãe: troca VALOR para face correto.
      sheet.getRange(numeroLinha, c.VALOR + 1).setValue(p.faceCorreto);
      corrMae++;

      // (2) Filha: só preenche se VAZIA.
      if (p.linhaFilha && p.valorFilhaSugerido > 0) {
        if (!p.valorFilhaAtual) {
          sheet.getRange(p.linhaFilha, c.VALOR + 1).setValue(p.valorFilhaSugerido);
          corrFilhaVazia++;
        } else if (Math.abs(p.valorFilhaAtual - p.valorFilhaSugerido) >= 0.5) {
          filhasDivergentes.push({
            linhaMae: numeroLinha, cliente: p.cliente,
            linhaFilha: p.linhaFilha,
            atual: p.valorFilhaAtual, sugerido: p.valorFilhaSugerido,
            plano: p.plano
          });
        }
      }

      Logger.log('✓ L.' + numeroLinha + ' (' + p.cliente + ') VALOR_mae ' +
                 p.valorMaeAtual.toFixed(2) + ' → ' + p.faceCorreto.toFixed(2));
    }
    SpreadsheetApp.flush();

    Logger.log('');
    Logger.log('═══ CORREÇÃO APLICADA ═══');
    Logger.log('Mães corrigidas: ' + corrMae);
    Logger.log('Filhas preenchidas (estavam vazias): ' + corrFilhaVazia);
    Logger.log('Filhas divergentes (PULADAS — revisar manual): ' + filhasDivergentes.length);
    Logger.log('');
    if (filhasDivergentes.length) {
      Logger.log('── FILHAS DIVERGENTES (NÃO sobrescritas) ──');
      filhasDivergentes.forEach(function(d) {
        Logger.log('L.' + d.linhaMae + ' (' + d.cliente + ') filha L.' + d.linhaFilha +
                   ' VALOR_filha=R$ ' + d.atual.toFixed(2) +
                   ' ≠ esperado pelo plano mãe (R$ ' + d.sugerido.toFixed(2) + '): "' + d.plano + '"');
      });
      Logger.log('');
      Logger.log('Análise: pode ser filha vinculada errada (plano do Móvel ≠ plano mencionado na mãe) ' +
                 'OU operador editou manualmente. Avaliar caso a caso na UI antes de corrigir.');
    }

    // Invalida caches da Lista pra refletir já no próximo carregamento
    try { _limparCache(); } catch(e) {}
    return { mae: corrMae, filhaVazia: corrFilhaVazia, divergentes: filhasDivergentes.length };
  } finally {
    lock.releaseLock();
  }
}
