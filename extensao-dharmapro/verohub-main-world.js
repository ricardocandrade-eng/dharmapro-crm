// ══════════════════════════════════════════════════════════════════════════════
//  verohub-main-world.js — roda no MAIN world de https://hub.veronet.com.br/*
//
//  Content scripts normais (isolated world) NÃO enxergam as variáveis JS da
//  página. O objeto com o pedido inteiro vive em window.__SALE — só acessível no
//  MAIN world. Este script lê o __SALE sob demanda, remove campos sensíveis, e
//  devolve um subconjunto limpo pro content-verohub.js (isolated) via postMessage.
//
//  Mesma arquitetura do par content-ping.js / ping-main-world.js.
//
//  SEGURANÇA: auth_token e demais dados sensíveis (selfie, documentos, 2FA,
//  serasa, liveness) são REMOVIDOS aqui — nunca saem do MAIN world.
// ══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Campos do __SALE que interessam pra captura. Whitelist explícita: o que não
  // estiver aqui não é lido nem transmitido (auth_token, selfie, *_document,
  // *_2fa, serasa_*, liveness_* ficam de fora por construção).
  var CAMPOS = [
    'id', 'proposal_number', 'created_at',
    'name', 'cpf', 'rg', 'birthday', 'mother_name', 'gender',
    // PJ (venda com CNPJ): nome/documento vêm aqui, não em name/cpf
    'company_name', 'fantasy_name', 'cnpj', 'state_registration',
    'city_registration', 'foundation_date', 'activity_kind',
    'email', 'phone', 'phone_optional', 'phone_contact',
    'zip_code', 'state', 'city', 'ibge_code', 'neighborhood', 'street',
    'number', 'complement', 'reference', 'coordinates', 'address_kind', 'block_lot',
    'plan', 'mvno_plan', 'total_price', 'due_date', 'payment_method',
    'modality', 'connection', 'region', 'telephony', 'ip_fixed',
    'scheduling_date', 'schedule_time', 'seller', 'status', 'only_chip_sale'
  ];

  function lerSaleLimpo() {
    var s = window.__SALE;
    if (!s || typeof s !== 'object') return null;
    var out = {};
    for (var i = 0; i < CAMPOS.length; i++) {
      var k = CAMPOS[i];
      if (s[k] !== undefined) out[k] = s[k];
    }
    // landline: só ddd/phone/portabilidade (objeto pequeno, sem sensível)
    if (s.landline && typeof s.landline === 'object') {
      out.landline = {
        ddd: s.landline.ddd || '',
        phone_number: s.landline.phone_number || '',
        is_portability: !!s.landline.is_portability
      };
    }
    // mvno_phone_data: chip do combo — só campos operacionais
    if (Array.isArray(s.mvno_phone_data)) {
      out.mvno_phone_data = s.mvno_phone_data.map(function (m) {
        m = m || {};
        return {
          ddd: m.ddd || '',
          phone_number: m.phone_number || '',
          is_portability: !!m.is_portability,
          mvno_plan: (m.mvno_plan != null ? m.mvno_plan : null),
          item_type: m.item_type || ''
        };
      });
    }
    return out;
  }

  // Anexa o NOME real do plano lido da própria API da página (/api/plans_svas).
  // Isso torna a captura independente do dicionário do backend (que fica defasado
  // quando a Vero troca códigos). Same-origin + credentials — mesma chamada que a
  // página já faz. Falha silenciosa: sem plan_name, o backend cai no dicionário.
  async function anexarNomePlano(sale) {
    if (sale.city == null || sale.id == null) return;
    var conn = sale.connection || 'Minas';
    var url = '/api/plans_svas/' + encodeURIComponent(sale.city) +
              '?sale=' + encodeURIComponent(sale.id) +
              '&connection=' + encodeURIComponent(conn);
    var r = await fetch(url, { credentials: 'include' });
    if (!r.ok) return;
    var j = await r.json();
    var plans = (j && j.plans) || [];
    for (var i = 0; i < plans.length; i++) {
      if (String(plans[i].id) === String(sale.plan)) {
        sale.plan_name = plans[i].name || '';
        sale.plan_speed = plans[i].speed || '';
        sale.plan_price_base = (plans[i].price != null ? plans[i].price : '');
        break;
      }
    }
  }

  // Responde a pedidos do content script (isolated world).
  window.addEventListener('message', async function (ev) {
    if (ev.source !== window) return;
    var data = ev.data;
    if (!data || data.source !== 'dhp-verohub-req') return;

    var sale = null, erro = null;
    try { sale = lerSaleLimpo(); } catch (e) { erro = String(e && e.message || e); }
    if (sale && sale.plan) {
      try { await anexarNomePlano(sale); } catch (e) { /* segue sem nome — backend usa o dicionário */ }
    }

    window.postMessage({
      source: 'dhp-verohub-res',
      reqId: data.reqId,
      sale: sale,
      erro: erro || (sale ? null : 'window.__SALE ausente nesta página')
    }, '*');
  });

  // Sinaliza presença (útil pra debug no console).
  try { window.__DHP_VEROHUB_MAIN__ = true; } catch (e) {}
})();
