// ════════════════════════════════════════════════════════════════════════════
//  DIAGNÓSTICO — acesso do token do DharmaPro às contas Meta.
//  Rodar _diagAcessoContasMeta_() no editor e colar o Log.
//  Remover este arquivo depois.
// ════════════════════════════════════════════════════════════════════════════
function _diagAcessoContasMeta_() {
  var contas = _getContasMetaAds_();
  Logger.log('Contas configuradas (_getContasMetaAds_): ' + JSON.stringify(contas));
  Logger.log('CFG_META.AD_ACCOUNT_ID (primária): ' + CFG_META.AD_ACCOUNT_ID);

  contas.forEach(function(conta) {
    Logger.log('──────── ' + conta + ' (' + _nomeContaMeta_(conta) + ') ────────');
    try {
      var j = _metaApiGet_('/' + conta, { fields: 'name,account_status,amount_spent' });
      Logger.log('  conta OK → ' + j.name + ' | status ' + j.account_status +
                 ' | gasto acum R$ ' + (Number(j.amount_spent || 0) / 100).toFixed(2));
    } catch (e) {
      Logger.log('  ERRO acesso à conta → ' + e.message);
    }
    try {
      var ins = _metaApiGet_('/' + conta + '/insights',
        { fields: 'spend,impressions,clicks', date_preset: 'today', level: 'account', limit: 1 });
      var d = (ins.data && ins.data[0]) || {};
      Logger.log('  insights HOJE → spend R$ ' + (d.spend || '0') +
                 ' | impr ' + (d.impressions || '0') + ' | cliques ' + (d.clicks || '0'));
    } catch (e2) {
      Logger.log('  ERRO insights hoje → ' + e2.message);
    }
    try {
      var camps = _listarCampanhasAtivas_(conta);
      Logger.log('  campanhas ativas (' + camps.length + '): ' + camps.join(' · '));
    } catch (e3) {
      Logger.log('  ERRO campanhas ativas → ' + e3.message);
    }
  });
  Logger.log('──────── fim ────────');
}
