// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  CONFIG.GS â€” ConfiguraÃ§Ãµes mensais e anuais do CRM Mobile Digital
//  Edite aqui todo mÃªs antes de usar o Dashboard
//
// â”€â”€ LOG DE ALTERAÃ‡Ã•ES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Atualizado em: 16/03/2026 | Auditoria: PERFIS_MENUS centralizado aqui â€” fonte Ãºnica de verdade
// Atualizado em: 12/03/2026 16:35 | Adicionado: 'indicacao' nos perfis admin, supervisor e backoffice
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ VERSÃƒO / DEPLOY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  Atualizado automaticamente pelo salvar_010426_1930.bat a cada deploy
var DEPLOY_DATE = '08/04/2026 20:42';

// â”€â”€ USUÃRIOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SENHAS: use o campo senhaHash (SHA-256 em hex). Nunca armazene senha em texto puro.
// Para gerar o hash de uma nova senha: rode gerarHashesSenhas() no editor Apps Script
// ou use: https://emn178.github.io/online-tools/sha256.html
var USUARIOS = [
  {
    usuario:   'Joysse.Coelho',
    senhaHash: '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203', // sha256('000000') â€” trocar pela senha real
    nome:      'Joysse Coelho',
    perfil:    'backoffice',
    foto:      'https://drive.google.com/thumbnail?id=1tbXw1xEYbHduPyffnWcIMbU-kxZuGkTq&sz=s200'
  },
  {
    usuario:   'Ricardo.Andrade',
    senhaHash: '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203', // sha256('000000') â€” trocar pela senha real
    nome:      'Ricardo Andrade',
    perfil:    'admin',
    foto:      'https://drive.google.com/thumbnail?id=18dWp55djwpTrL5RT5hDaKO9XdMRGOwhO&sz=s200'
  },
  {
    usuario:   'Tuany.Rodrigues',
    senhaHash: '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203', // sha256('000000') â€” trocar pela senha real
    nome:      'Tuany Rodrigues',
    perfil:    'supervisor',
    foto:      'https://drive.google.com/thumbnail?id=1paq4_ynKCuYy2Huv5cvLcsfv_x57GV9B&sz=s200'
  },
  {
    usuario:   'Vanessa.Andrade',
    senhaHash: '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203', // sha256('000000') â€” trocar pela senha real
    nome:      'Vanessa Andrade',
    perfil:    'backoffice',
    foto:      'https://drive.google.com/thumbnail?id=1HAJQr4V_1wpSgXCV8u3CNbuXYIy-m7OL&sz=s200'
  },
];

// â”€â”€ PERFIS E MENUS â€” Fonte Ãºnica de verdade â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  Altere menus SOMENTE aqui. Code.js lÃª este objeto via validarLogin().
//  Menus disponÃ­veis: dash, formulario, lista, funil, leads, pap,
//                     indicacao, docs, cruzamento, tickets, novaVenda, extrato, config
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var PERFIS_MENUS = {
  'admin':      ['dash','formulario','lista','funil','leads','pap','indicacao','docs','cruzamento','tickets','novaVenda','extrato','config','filaPAP'],
  'supervisor': ['dash','formulario','lista','funil','leads','indicacao','docs','cruzamento','tickets','novaVenda','extrato','config','filaPAP'],
  'backoffice': ['dash','formulario','lista','funil','leads','indicacao','docs','cruzamento','tickets','novaVenda','config','filaPAP']
};

var DASHBOARD_CONFIG = {

  // Meta de instalaÃ§Ãµes do mÃªs definida pela Vero
  META_VERO: 60,

  // Fator multiplicador para TendÃªncia Receita (definido pela Vero)
  FATOR_VERO: 2.6,

  // BÃ´nus em R$ ao bater a Meta Vero
  BONUS_VERO: 5000,

  // Feriados nacionais + locais do ano (formato 'YYYY-MM-DD')
  // Atualize anualmente com os feriados de Juiz de Fora / MG
  FERIADOS: [
    '2026-01-01', // ConfraternizaÃ§Ã£o Universal
    '2026-02-16', // Carnaval (segunda)
    '2026-02-17', // Carnaval (terÃ§a)
    '2026-02-18', // Quarta de Cinzas (meio dia)
    '2026-04-03', // PaixÃ£o de Cristo
    '2026-04-21', // Tiradentes
    '2026-05-01', // Dia do Trabalho
    '2026-06-04', // Corpus Christi
    '2026-07-15', // AniversÃ¡rio de Juiz de Fora
    '2026-09-07', // IndependÃªncia do Brasil
    '2026-10-12', // Nossa Senhora Aparecida
    '2026-11-02', // Finados
    '2026-11-15', // ProclamaÃ§Ã£o da RepÃºblica
    '2026-11-20', // ConsciÃªncia Negra
    '2026-12-24', // VÃ©spera de Natal (meio dia)
    '2026-12-25', // Natal
    '2026-12-31', // VÃ©spera de Ano Novo (meio dia)
  ]
};

// â”€â”€ MENSAGEM DO SISTEMA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  Escreva aqui um recado rÃ¡pido para aparecer no topo do sistema.
//  Deixe em branco ('                                                           ') para nÃ£o mostrar nenhuma mensagem.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var MENSAGEM_SISTEMA = '';

// â”€â”€ TICKETS â€” Estrutura inicial â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  Os tickets sÃ£o salvos via PropertiesService pelo Apps Script.
//  Este array serve apenas como seed de exemplo para o primeiro uso.
//  ApÃ³s o primeiro carregamento, os dados vÃªm do PropertiesService.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var TICKETS = [
  {
    id:          'TKT-00001',
    titulo:      'Configurar integraÃ§Ã£o VeroHub',
    descricao:   'Verificar endpoints e autenticaÃ§Ã£o da API VeroHub.',
    prioridade:  'Alta',
    status:      'Aberto',
    criador:     'Ricardo Andrade',
    atribuido:   'Ricardo Andrade',
    dataCriacao: '12/03/2026',
    dataUpdate:  '12/03/2026'
  },
  {
    id:          'TKT-00002',
    titulo:      'Revisar relatÃ³rio de instalaÃ§Ãµes',
    descricao:   'Conferir dados de marÃ§o antes do fechamento.',
    prioridade:  'MÃ©dia',
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
