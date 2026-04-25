// ══════════════════════════════════════════════════════════════════════════
//  CONFIG.GS — Configurações mensais e anuais do CRM Mobile Digital
//  Edite aqui todo mês antes de usar o Dashboard
//
// ── LOG DE ALTERAÇÕES ─────────────────────────────────────────────────────
// Atualizado em: 16/03/2026 | Auditoria: PERFIS_MENUS centralizado aqui — fonte única de verdade
// Atualizado em: 12/03/2026 16:35 | Adicionado: 'indicacao' nos perfis admin, supervisor e backoffice
// ══════════════════════════════════════════════════════════════════════════

// ── VERSÃO / DEPLOY ────────────────────────────────────────────────────────
//  Atualizado automaticamente pelo salvar_010426_1930.bat a cada deploy
var DEPLOY_DATE = '25/04/2026 18:05';

// ── USUÁRIOS ───────────────────────────────────────────────────────────────
// SENHAS: use o campo senhaHash (SHA-256 em hex). Nunca armazene senha em texto puro.
// Para gerar o hash de uma nova senha: rode gerarHashesSenhas() no editor Apps Script
// ou use: https://emn178.github.io/online-tools/sha256.html
var USUARIOS = [
  {
    usuario:   'Joysse.Coelho',
    senhaHash: '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203', // sha256('000000') — trocar pela senha real
    nome:      'Joysse Coelho',
    perfil:    'backoffice',
    foto:      'https://drive.google.com/thumbnail?id=1tbXw1xEYbHduPyffnWcIMbU-kxZuGkTq&sz=s200'
  },
  {
    usuario:   'Ricardo.Andrade',
    senhaHash: '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203', // sha256('000000') — trocar pela senha real
    nome:      'Ricardo Andrade',
    perfil:    'admin',
    foto:      'https://drive.google.com/thumbnail?id=18dWp55djwpTrL5RT5hDaKO9XdMRGOwhO&sz=s200'
  },
  {
    usuario:   'Tuany.Rodrigues',
    senhaHash: '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203', // sha256('000000') — trocar pela senha real
    nome:      'Tuany Rodrigues',
    perfil:    'supervisor',
    foto:      'https://drive.google.com/thumbnail?id=1paq4_ynKCuYy2Huv5cvLcsfv_x57GV9B&sz=s200'
  },
  {
    usuario:   'Vanessa.Andrade',
    senhaHash: '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203', // sha256('000000') — trocar pela senha real
    nome:      'Vanessa Andrade',
    perfil:    'backoffice',
    foto:      'https://drive.google.com/thumbnail?id=1HAJQr4V_1wpSgXCV8u3CNbuXYIy-m7OL&sz=s200'
  },
];

// ── PERFIS E MENUS — Fonte única de verdade ────────────────────────────────
//  Altere menus SOMENTE aqui. Code.js lê este objeto via validarLogin().
//  Menus disponíveis: dash, formulario, lista, funil, leads, pap,
//                     indicacao, docs, cruzamento, tickets, novaVenda, extrato, config
// ──────────────────────────────────────────────────────────────────────────
var PERFIS_MENUS = {
  'admin':      ['dash','formulario','lista','funil','leads','pap','indicacao','docs','cruzamento','tickets','novaVenda','extrato','config','filaPAP','metaads','painelads','disparos','usuarios'],
  'supervisor': ['dash','formulario','lista','funil','leads','indicacao','docs','cruzamento','tickets','novaVenda','extrato','config','filaPAP','metaads','painelads','disparos'],
  'backoffice': ['dash','formulario','lista','funil','leads','indicacao','docs','cruzamento','tickets','novaVenda','config','filaPAP','metaads','painelads','disparos']
};

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

// ── ALERTAS E SLA ─────────────────────────────────────────────────────────
//  Thresholds para o sistema de alertas internos (sino 🔔) e SLA do Funil.
//  Ajuste os valores conforme a operação sem alterar o código.
// ──────────────────────────────────────────────────────────────────────────

/** SLA do Funil de Instalações (em dias).
 *  atencao  = dias que acionam badge amarelo
 *  critico  = dias que acionam badge vermelho
 *  Para '2- Aguardando Instalação' a contagem começa na data de agenda.
 *  Para 'Pendencia Vero' a contagem começa na data de ativação (dataAtiv).
 */
var SLA_FUNIL = {
  '2- Aguardando Instalação': { atencao: 3, critico: 7  },
  'Pendencia Vero':           { atencao: 2, critico: 5  }
};

/** Configuração dos alertas automáticos.
 *  LEAD_PARADO_DIAS   — dias de atraso para gerar alerta por status
 *  CAMPANHA_CPL_MAX   — CPL (R$) máximo antes de gerar alerta de campanha
 *  WABA_SCORES_ALERTA — quality scores que disparam alerta de WABA
 */
var ALERTAS_CONFIG = {
  LEAD_PARADO_DIAS: {
    '2- Aguardando Instalação': 1,   // 1+ dia após data de agenda = alerta no sino
    'Pendencia Vero':           3    // 3+ dias em pendência Vero
  },
  // WABA: scores que disparam alerta (GREEN = ok, YELLOW = atenção, RED = crítico)
  WABA_SCORES_ALERTA:      ['YELLOW', 'RED'],
  // Disparo em massa: thresholds de qualidade
  CAMPANHA_FAIL_RATE_MAX:  20,   // % de falha que dispara alerta (ex: 20 = acima de 20%)
  CAMPANHA_OPTOUT_MAX:      5    // % de opt-out que dispara alerta
};

// ── MENSAGEM DO SISTEMA ────────────────────────────────────────────────────
//  Escreva aqui um recado rápido para aparecer no topo do sistema.
//  Deixe em branco ('                                                           ') para não mostrar nenhuma mensagem.
// ──────────────────────────────────────────────────────────────────────────
var MENSAGEM_SISTEMA = '';

// ── TICKETS — Estrutura inicial ────────────────────────────────────────────
//  Os tickets são salvos via PropertiesService pelo Apps Script.
//  Este array serve apenas como seed de exemplo para o primeiro uso.
//  Após o primeiro carregamento, os dados vêm do PropertiesService.
// ──────────────────────────────────────────────────────────────────────────
var TICKETS = [
  {
    id:          'TKT-00001',
    titulo:      'Configurar integração VeroHub',
    descricao:   'Verificar endpoints e autenticação da API VeroHub.',
    prioridade:  'Alta',
    status:      'Aberto',
    criador:     'Ricardo Andrade',
    atribuido:   'Ricardo Andrade',
    dataCriacao: '12/03/2026',
    dataUpdate:  '12/03/2026'
  },
  {
    id:          'TKT-00002',
    titulo:      'Revisar relatório de instalações',
    descricao:   'Conferir dados de março antes do fechamento.',
    prioridade:  'Média',
    status:      'Progresso',
    criador:     'Tuany Rodrigues',
    atribuido:   'Joysse Coelho',
    dataCriacao: '12/03/2026',
    dataUpdate:  '12/03/2026'
  },
  {
    id:          'TKT-00003',
    titulo:      'Atualizar base de leads frios',
    descricao:   '',
    prioridade:  'Baixa',
    status:      'Aberto',
    criador:     'Vanessa Andrade',
    atribuido:   '',
    dataCriacao: '12/03/2026',
    dataUpdate:  '12/03/2026'
  }
];
