// ══════════════════════════════════════════════════════════════════════════
//  CONFIG.GS — Configurações mensais e anuais do CRM Mobile Digital
//  Edite aqui todo mês antes de usar o Dashboard
// ══════════════════════════════════════════════════════════════════════════

// ── USUÁRIOS ───────────────────────────────────────────────────────────────
//  usuario : login digitado na tela
//  senha   : senha em texto puro
//  nome    : nome exibido no sistema após login
// ──────────────────────────────────────────────────────────────────────────
// Perfis disponíveis e seus menus permitidos
var PERFIS = {
  'admin':      ['dash','formulario','lista','funil','leads','pap','docs'],
  'supervisor': ['dash','formulario','lista','funil','leads','docs'],
  'backoffice': ['dash','formulario','lista','funil','leads','docs']
};

var USUARIOS = [
  {
    usuario: 'Joysse.Coelho',
    senha:   '000000',
    nome:    'Joysse Coelho',
    perfil:  'backoffice',
    foto:    'https://drive.google.com/thumbnail?id=18ZhwhCb9TqTJ4q27eplYzVguFzfXlPWo&sz=s200'
  },
  {
    usuario: 'Ricardo.Andrade',
    senha:   '000000',
    nome:    'Ricardo Andrade',
    perfil:  'admin',
    foto:    'https://drive.google.com/thumbnail?id=1WsBnWbnGx2gzK8P8c6tzXoL9HBt7DQCN&sz=s200'
  },
  {
    usuario: 'Tuany.Rodrigues',
    senha:   '000000',
    nome:    'Tuany Rodrigues',
    perfil:  'supervisor',
    foto:    'https://drive.google.com/thumbnail?id=16VfXn_1ghqjaYAjI-S4ZgP7Eu5pIJblT&sz=s200'
  },
  {
    usuario: 'Vanessa.Andrade',
    senha:   '000000',
    nome:    'Vanessa Andrade',
    perfil:  'backoffice',
    foto:    'https://drive.google.com/thumbnail?id=1PsFoDhQPue-D5CC0Bzxux172scBDB9bx&sz=s200'
  },
];


var DASHBOARD_CONFIG = {

  // Meta de instalações do mês definida pela Vero
  META_VERO: 60,

  // Fator multiplicador para Tendência Receita (definido pela Vero)
  FATOR_VERO: 2.6,

  // Bônus em R$ ao bater a Meta Vero
  BONUS_VERO: 5000,

  // Feriados nacionais + locais do ano (formato 'YYYY-MM-DD')
  // Atualize anualmente com os feriados de Juiz de Fora / MG
  FERIADOS: [
    '2026-01-01', // Confraternização Universal
    '2026-02-16', // Carnaval (segunda)
    '2026-02-17', // Carnaval (terça)
    '2026-02-18', // Quarta de Cinzas (meio dia)
    '2026-04-03', // Paixão de Cristo
    '2026-04-21', // Tiradentes
    '2026-05-01', // Dia do Trabalho
    '2026-06-04', // Corpus Christi
    '2026-07-15', // Aniversário de Juiz de Fora
    '2026-09-07', // Independência do Brasil
    '2026-10-12', // Nossa Senhora Aparecida
    '2026-11-02', // Finados
    '2026-11-15', // Proclamação da República
    '2026-11-20', // Consciência Negra
    '2026-12-24', // Véspera de Natal (meio dia)
    '2026-12-25', // Natal
    '2026-12-31', // Véspera de Ano Novo (meio dia)
  ]
};

// ── MENSAGEM DO SISTEMA ────────────────────────────────────────────────────
//  Escreva aqui um recado rápido para aparecer no topo do sistema.
//  Deixe em branco ('') para não mostrar nenhuma mensagem.
// ──────────────────────────────────────────────────────────────────────────
var MENSAGEM_SISTEMA = 'Blindar vendas no VeroHub! 📢';