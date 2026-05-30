// One-shot: corrige o combo cruzado WEXLEY (29/05/2026).
//  - Arquiva o vínculo errado L.4025→L.4026 (gravado 28/05 14:10 quando
//    L.4026 ainda era o Móvel da JOANA; mudou de dono após arquivamento
//    intermediário que renumerou linhas).
//  - Cria o vínculo correto WEXLEY L.4026 (Fibra Combo) → L.4027 (Móvel
//    Combo). _registrarVinculoVenda_ valida A3 (CPF bate, produtos certos).
// Rodar UMA VEZ no editor → conferir log → remover este arquivo.
function _fixWexley() {
  var shV = _getSheetVinculosVendas_(false);
  if (!shV) throw new Error('Aba Vinculos Vendas não encontrada.');

  // Confere que vincLinha=547 ainda é o vínculo Joana→4026 antes de mexer.
  var rowAlvo = shV.getRange(547, 1, 1, 10).getValues()[0];
  Logger.log('Vínculo na linha 547 antes: ' + rowAlvo.join(' | '));
  var maeAlvo = parseInt(rowAlvo[2], 10);
  var filhaAlvo = parseInt(rowAlvo[3], 10);
  var statusAlvo = _normalizarTexto(rowAlvo[6] || 'ATIVO');
  if (maeAlvo !== 4025 || filhaAlvo !== 4026 || statusAlvo !== 'ATIVO') {
    throw new Error('Vínculo em vincLinha=547 mudou (mae=' + maeAlvo + ', filha=' + filhaAlvo +
                    ', status=' + statusAlvo + '). Abortando — pode ter sido tocado por algum reparo.');
  }

  shV.getRange(547, 7).setValue('ARQUIVADO');
  var obsAnterior = String(rowAlvo[7] || '').trim();
  var motivo = 'Vínculo cruzado: L.4026 trocou de cliente (JOANA→WEXLEY) por arquivamento intermediário. Corrigido 30/05/2026 via _fixWexley.';
  shV.getRange(547, 8).setValue(obsAnterior ? (obsAnterior + ' | ' + motivo) : motivo);
  Logger.log('Vínculo errado arquivado.');

  // Cria vínculo correto WEXLEY 4026→4027. A3 valida produto + CPF.
  _registrarVinculoVenda_(4026, 4027, 'COMBO_MOVEL');
  Logger.log('Vínculo WEXLEY L.4026→L.4027 registrado.');

  // Invalidação extra (defesa em profundidade — _registrarVinculoVenda_ já faz)
  _limparCacheVinculosVendas_();
  try { _limparCacheListaV3(); } catch (e) {}

  Logger.log('OK. Próximo refresh da Lista de Vendas mostra o combo WEXLEY agrupado.');
}
