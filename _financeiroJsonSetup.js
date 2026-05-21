// ONE-SHOT — Módulo Financeiro Fase 2 (21/05/2026). Rodar UMA VEZ no editor.
// Pina os file IDs dos JSONs do Drive nas Script Properties e roda um self-test
// dos readers. Depois de validar, DELETAR este arquivo e dar novo push.
// (Vai pro GAS de propósito — não está no .claspignore — pra aparecer no editor.)
//
// Pré-requisito: pontuacao_planos.json e cartas_meta_pap.json sincronizados no
// Drive (Drive Desktop sincroniza a pasta do repo; ou suba manual). getFilesByName
// acha por nome em todo o Drive.
function financeiroSetupFase2() {
  var props = PropertiesService.getScriptProperties();
  var out = [];
  var mapa = {
    'pontuacao_planos.json': 'PONTUACAO_PLANOS_FILE_ID',
    'cartas_meta_pap.json':  'CARTAS_META_FILE_ID'
  };
  Object.keys(mapa).forEach(function(nome) {
    var iter = DriveApp.getFilesByName(nome);
    var ids = [];
    while (iter.hasNext()) ids.push(iter.next().getId());
    out.push(nome + ': ' + ids.length + ' arquivo(s) no Drive' + (ids.length ? ' — ' + ids.join(', ') : ' (NÃO ENCONTRADO — suba o arquivo)'));
    if (ids.length === 1) {
      props.setProperty(mapa[nome], ids[0]);
      out.push('   → ' + mapa[nome] + ' fixado.');
    } else if (ids.length > 1) {
      out.push('   ⚠ AMBÍGUO: ' + ids.length + ' arquivos com esse nome. Apague as cópias extras no Drive e rode de novo (não fixei ID).');
    }
  });

  // Invalida cache pra forçar releitura do Drive.
  try {
    var c = CacheService.getScriptCache();
    c.remove(CONFIG.CACHE_PREFIX + 'pontuacao_planos_v1');
    c.remove(CONFIG.CACHE_PREFIX + 'cartas_meta_v1');
  } catch (e) {}

  // Self-test dos readers (valores esperados do extrato de março).
  try {
    var t1 = getPontuacaoVenda('4279', 'PADRAO');           // esperado: bl=70, mv=40 (FIBRA_COMBO)
    var t2 = getPontuacaoVenda('4470', 'OURO');             // esperado: bl=90, mv=0 (FIBRA_ALONE)
    var t3 = resolverEstrelaPorInstalacoes(75, '2026-05');  // esperado: 3_ESTRELAS, fator_base 2,6
    out.push('TEST getPontuacaoVenda(4279,PADRAO): ' + JSON.stringify(t1) + '  [esperado bl=70 mv=40]');
    out.push('TEST getPontuacaoVenda(4470,OURO):   ' + JSON.stringify(t2) + '  [esperado bl=90 mv=0]');
    out.push('TEST resolverEstrela(75,2026-05):    ' + JSON.stringify(t3) + '  [esperado 3_ESTRELAS fator_base 2.6]');
    out.push('Receita exemplo 4279 @ fator 2,6 = (70+40)×2,6 = R$ ' + ((t1.pontos_bl + t1.pontos_movel) * 2.6).toFixed(2) + '  [esperado 286,00]');
  } catch (eT) {
    out.push('SELF-TEST FALHOU: ' + (eT && eT.message || eT));
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
