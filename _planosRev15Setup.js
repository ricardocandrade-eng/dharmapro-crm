/**
 * _planosRev15Setup.js - ONE-SHOT (rodar no editor Apps Script e depois remover).
 *
 * Rev15 do `planos_vero.json` + nova segmentacao ESSENCIAL nas cidades.
 * Origem: `260811_TABELA_DE_PRECOS_PORTFOLIO_B2C.xlsx` + `260811_MAPA_OFERTAS_
 * VERO_PORTFOLIO_B2C_2.0.pdf` (tabela Vero de 11/08/2026).
 *
 * O QUE MUDA
 *   1. Categoria nova VERO ESSENCIAL (4 planos, 420MB/550MB) - preco so na
 *      segmentacao nova ESSENCIAL; nas demais o campo fica VAZIO de proposito
 *      (a Vero marca "NAO CONTEM"), o que ja exclui o plano dos dropdowns e,
 *      com a guarda nova em `_serveActionPlanos_`, tambem do endpoint publico.
 *   2. Colunas 15 (`ESSENCIAL`) e 16 (`ESSENCIAL_REC`) APENDADAS no fim - os
 *      indices fixos usados no codigo (0 nome, 1 TIPO, 2 ESPECIAIS, 6 NOME_LP,
 *      7 FEATURES) continuam validos. Para todo plano pre-existente, ESSENCIAL
 *      = ESPECIAIS (conferido celula a celula contra a tabela nova), entao
 *      cidade ESSENCIAL mantem Fibra legada + todo o Movel.
 *   3. `VERO FAST PLUS 800MB + DISNEY+ ADS + MOVEL 30GB`: 147,99 -> 139,99
 *      (rec 137,99 -> 129,99). O preco do PROMO virou o preco de tabela.
 *      DECISAO PENDENTE: a linha publicada hoje continua sendo a "... PROMO"
 *      (VeroHub 5201) e a linha normal (5726) segue PUBLICAR=false. Se o 5726
 *      estiver ativo a 139,99 no VeroHub, inverter as duas flags e aposentar
 *      o rotulo "PROMO".
 *   4. 18 cidades passam a SEGMENTACAO = ESSENCIAL (15 vinham de ESPECIAIS,
 *      2 de PRATA - Brasilia e Catalao - e 1 de OURO - Xanxere). Nenhuma em
 *      MG/JF: a operacao de Juiz de Fora nao muda nada.
 *
 * ============================ ATENCAO: 2 FASES ============================
 * As duas metades sao INDEPENDENTES de proposito. Rodar a FASE 2 sozinha nao
 * quebra nada, mas rodar a FASE 2 antes de acertar a Renata quebra.
 *
 * FASE 1 - so o JSON (SEGURA, pode rodar sozinha):
 *   1) _rev15DryRun()                  -> confere o diff, nao grava nada
 *   2) _atualizarPlanosVeroJsonRev15() -> grava o JSON no Drive
 *   Efeito: ZERO mudanca de comportamento em qualquer cidade. Enquanto nenhuma
 *   cidade estiver marcada como ESSENCIAL, a coluna 15 nunca e lida e os 4
 *   planos VERO ESSENCIAL ficam dormentes. So o preco do DISNEY+ ADS (linha
 *   despublicada) muda no arquivo.
 *
 * FASE 2 - virar as 18 cidades (COORDENADA, exige mexer na Renata ANTES):
 *   3) _rev15SegmentacaoDryRun()             -> confere as 18 cidades
 *   4) _atualizarSegmentacaoEssencialRev15() -> grava CIDADES + cidades_vero.json
 *
 *   PRE-REQUISITO OBRIGATORIO da FASE 2 (`agente-ia-vero`): a Renata guarda os
 *   planos em cache com chave = SEGMENTACAO (`no5_montar_payload:227`) mas
 *   busca por CIDADE (`:238`), e le a segmentacao do SUPABASE, nao do DharmaPro.
 *   Se as 18 cidades virarem ESSENCIAL aqui e continuarem ESPECIAIS/PRATA/OURO
 *   no `cidades_seed.sql`, a primeira dessas cidades a popular o cache faz TODA
 *   cidade da mesma segmentacao antiga receber a lista ESSENCIAL - a Renata
 *   passa a cotar VERO ESSENCIAL R$69,99 em cidade que nao tem o plano.
 *   Antes da FASE 2: reseed das 18 cidades no Supabase + incluir ESSENCIAL nos
 *   DOIS marcadores `[INJETAR: ... (PADRAO, PRATA, OURO ou ESPECIAIS) ...]`
 *   (`no5` linhas 327 e 910), que precisam ficar byte-identicos entre si.
 * ==========================================================================
 *
 *   5) avisar o Claude Code p/ remover este arquivo no push seguinte
 */

// Cidades que passam a ter segmentacao ESSENCIAL (tabela Vero 11/08/2026).
var _REV15_CIDADES_ESSENCIAL = [
    "ARUJA",
    "BRASÍLIA",
    "CATALAO",
    "CRUZEIRO",
    "FERNANDOPOLIS",
    "JALES",
    "LEME",
    "LORENA",
    "PIEDADE",
    "PINDAMONHANGABA",
    "PORANGATU",
    "SANTA FE DO SUL",
    "SAO JOSE DO RIO PRETO",
    "SAO JOSE DOS CAMPOS",
    "TATUI",
    "UBERLANDIA",
    "VENÂNCIO AIRES",
    "XANXERÊ"
];

var _REV15_PLANOS = [
    ["Última atualização: 13/08/2026 — Rev15: tabela Vero 11/08/2026 (MAPA DE OFERTAS B2C 2.0). Nova categoria VERO ESSENCIAL (420MB/550MB) + nova segmentação ESSENCIAL (cols 15/16, 18 cidades SP/GO/DF). VERO FAST PLUS DISNEY+ ADS 147,99→139,99 (preço do PROMO virou oficial). Demais preços inalterados.", "", "NG / ADAPTER", "NG / ADAPTER", "NG / ADAPTER", "NG / ADAPTER", "LANDING PAGE", "", "", "", "", "", "", "", "NOME_VERO (sweep canônico)", "SEGMENTAÇÃO NOVA 11/08/2026", ""],
    ["Valores para pagamento via boleto", "TIPO", "ESPECIAIS", "OURO", "PRATA", "PADRÃO", "NOME_LP", "FEATURES", "PUBLICAR", "ESPECIAIS_REC", "OURO_REC", "PRATA_REC", "PADRÃO_REC", "PRODUTO_TIPO", "NOME_VERO", "ESSENCIAL", "ESSENCIAL_REC"],
    ["VERO MAIS 550MB + MÓVEL 20GB", "VERO MAIS", 112.9, 112.9, 112.9, 112.9, "Vero Mais", "20GB Celular | Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis", false, "102.9", "102.9", "102.9", "102.9", "FIBRA_COMBO", "VERO MAIS 550MB + MAIS CONECTADO 20GB", 112.9, "102.9"],
    ["VERO MAIS 800MB + GLP PREMIUM + MÓVEL 20GB", "VERO MAIS", 149.9, 149.9, 149.9, 149.9, "Vero Mais", "Globo Play Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis", false, "139.9", "139.9", "139.9", "139.9", "FIBRA_COMBO", "VERO MAIS 800MB + GLOBOPLAY PREMIUM + MAIS CONECTADO 20GB", 149.9, "139.9"],
    ["VERO MAIS 800MB + HBO MAX + MÓVEL 20GB", "VERO MAIS", 149.9, 149.9, 149.9, 149.9, "Vero Mais", "HBO Max | 20GB Celular | Wi-Fi 6 | Instalação Grátis", false, "139.9", "139.9", "139.9", "139.9", "FIBRA_COMBO", "VERO MAIS 800MB + HBO MAX + MAIS CONECTADO 20GB", 149.9, "139.9"],
    ["VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MÓVEL 30GB", "VERO MAIS", 159.99, 159.99, 159.99, 159.99, "Vero Mais", "Esportes Futebol | YouTube Premium | 30GB Celular | Wi-Fi 6 | Instalação Grátis", true, "149.99", "149.99", "149.99", "149.99", "FIBRA_COMBO", "VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + MAIS CONECTADO 30GB", 159.99, "149.99"],
    ["VERO MAIS 800MB + DISNEY+ PADRÃO + MÓVEL 20GB", "VERO MAIS", 144.9, 144.9, 144.9, 144.9, "Vero Mais", "Disney Padrão | 20GB Celular | Wi-Fi 6 | Instalação Grátis", false, "134.9", "134.9", "134.9", "134.9", "FIBRA_COMBO", "VERO MAIS 800MB + DISNEY+ PADRÃO + MAIS CONECTADO 20GB", 144.9, "134.9"],
    ["VERO MAIS 800MB + DISNEY+ PREMIUM + MÓVEL 20GB", "VERO MAIS", 149.9, 149.9, 149.9, 149.9, "Vero Mais", "Disney Premium | 20GB Celular | Wi-Fi 6 | Instalação Grátis", false, "139.9", "139.9", "139.9", "139.9", "FIBRA_COMBO", "VERO MAIS 800MB + DISNEY+ PREMIUM + MAIS CONECTADO 20GB", 149.9, "139.9"],
    ["VERO MAIS 850MB + DIVERSÃO + MÓVEL 20GB", "VERO MAIS", 189.9, 189.9, 189.9, 189.9, "Vero Mais", "Vero Video Diversão | 20GB Celular | Wi-Fi 6 | Instalação Grátis", false, "179.9", "179.9", "179.9", "179.9", "FIBRA_COMBO", "VERO MAIS 850MB + DIVERSÃO + MAIS CONECTADO 20GB", 189.9, "179.9"],
    ["VERO MAIS 800MB - GLP PREMIUM + ASSISTÊNCIA RES. + MÓVEL 20GB", "VERO MAIS", 154.9, 154.9, 154.9, 154.9, "Vero Mais", "Globoplay Premium | Assistência Residencial | 20GB Celular | Wi-Fi 6 | Instalação Grátis", false, "144.9", "144.9", "144.9", "144.9", "FIBRA_COMBO", "VERO MAIS 800MB + GLOBOPLAY PREMIUM + ASSISTENCIA RESIDENCIAL + MAIS CONECTADO 20GB", 154.9, "144.9"],
    ["VERO MAIS 1GB + GLP PREMIUM + EXITLAG + MÓVEL 60GB", "VERO MAIS", "209,9 (Bauru)", "", "", "", "Vero Mais", "Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "199,9 (Bauru)", "", "", "", "FIBRA_COMBO", "VERO MAIS 1GB + GLOBOPLAY PREMIUM + EXIT LAG + MAIS CONECTADO 60GB", "209,9 (Bauru)", "199,9 (Bauru)"],
    ["VERO DUO 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB", "VERO DUO", 159.9, 159.9, 159.9, 159.9, "Vero Duo", "Disney com Ads | HBO Max com Ads | 30GB Celular | Wi-Fi 6 | Instalação Grátis", false, "149.9", "149.9", "149.9", "149.9", "FIBRA_COMBO", "VERO DUO 800MB + DISNEY+ COM ANÚNCIO + HBO MAX COM ANÚNCIO + MAIS CONECTADO 30GB", 159.9, "149.9"],
    ["VERO DUO 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB", "VERO DUO", 159.9, 159.9, 159.9, 159.9, "Vero Duo", "Prime Video | Apple TV | 30GB Celular | Wi-Fi 6 | Instalação Grátis", false, "149.9", "149.9", "149.9", "149.9", "FIBRA_COMBO", "VERO DUO 800MB + PRIME VIDEO + APPLE TV + MAIS CONECTADO 30GB", 159.9, "149.9"],
    ["VERO FULL 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB", "VERO FULL", 209.9, 209.9, 209.9, 209.9, "Vero Full", "Prime Video | Apple TV | HBO Max | Globoplay Premium | 60GB Celular | Wi-Fi 6 | Instalação Grátis", false, "199.9", "199.9", "199.9", "199.9", "FIBRA_COMBO", "VERO MAIS FULL 800MB + PRIME VIDEO + APPLE TV + HBO + GLP PREMIUM + MAIS CONECTADO 60GB", 209.9, "199.9"],
    ["550MB MUNDO FIBRA", "MUNDO FIBRA", 107.9, 107.9, 107.9, 107.9, "Mundo Fibra", "Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis", false, "97.9", "97.9", "97.9", "97.9", "FIBRA_ALONE", "MUNDO FIBRA 550MB", 107.9, "97.9"],
    ["550MB ASSISTÊNCIA RESIDENCIAL", "MUNDO FIBRA", 117.9, 120.9, 128.9, 130.9, "Mundo Fibra", "Assistência Residencial | Wi-Fi 6 | Instalação Grátis", false, "107.9", "110.9", "118.9", "120.9", "FIBRA_ALONE", "MUNDO FIBRA 550MB + ASSISTENCIA RESIDENCIAL", 117.9, "107.9"],
    ["750MB MUNDO FIBRA", "MUNDO FIBRA", 127.9, 127.9, 127.9, 127.9, "Mundo Fibra", "Wi-Fi 6 | Kiddle | Estuda Mais | Instalação Grátis", false, "117.9", "117.9", "117.9", "117.9", "FIBRA_ALONE", "MUNDO FIBRA 750MB", 127.9, "117.9"],
    ["600MB GLOBOPLAY PADRÃO COM ANÚNCIOS", "ENTRETENIMENTO", 137.9, 137.9, 137.9, 137.9, "Mundo Entrenimento", "Globo Play | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "127.9", "127.9", "127.9", "127.9", "FIBRA_ALONE", "MUNDO ENTRETENIMENTO 600MB + GLOBOPLAY PADRÃO COM ANÚNCIOS", 137.9, "127.9"],
    ["800MB YOUTUBE PREMIUM ou HBO MAX ou TELECINE", "ENTRETENIMENTO", 144.9, 144.9, 144.9, 144.9, "Mundo Entrenimento", "Youtube Premium | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "134.9", "134.9", "134.9", "134.9", "FIBRA_ALONE", ["MUNDO ENTRETENIMENTO 800MB + YOUTUBE PREMIUM", "MUNDO ENTRETENIMENTO 800MB + HBO MAX", "MUNDO ENTRETENIMENTO 800MB + TELECINE"], 144.9, "134.9"],
    ["800MB DISNEY+ PADRÃO", "ENTRETENIMENTO", 144.9, 144.9, 144.9, 144.9, "Mundo Entrenimento", "Disney | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "134.9", "134.9", "134.9", "134.9", "FIBRA_ALONE", "MUNDO ENTRETENIMENTO 800MB + DISNEY+ PADRÃO", 144.9, "134.9"],
    ["800MB DISNEY+ PREMIUM", "ENTRETENIMENTO", 165, 165, 165, 165, "Mundo Entrenimento", "Disney Premium | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "155", "155", "155", "155", "FIBRA_ALONE", "MUNDO ENTRETENIMENTO 800MB + DISNEY+ PREMIUM", 165, "155"],
    ["800MB GLOBOPLAY PREMIUM", "ENTRETENIMENTO", 144.9, 144.9, 144.9, 144.9, "Mundo Entrenimento", "Globoplay Premium | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "134.9", "134.9", "134.9", "134.9", "FIBRA_ALONE", "MUNDO ENTRETENIMENTO 800MB + GLOBOPLAY PREMIUM", 144.9, "134.9"],
    ["800MB GLOBOPLAY PREMIUM + ASSISTÊNCIA RESIDENCIAL", "ENTRETENIMENTO", 149.9, 149.9, 149.9, 149.9, "Mundo Entrenimento", "Globoplay Premium | Assistência Residencial | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "139.9", "139.9", "139.9", "139.9", "FIBRA_ALONE", "MUNDO ENTRETENIMENTO 800MB + GLOBOPLAY PREMIUM + ASSISTENCIA RESIDENCIAL", 149.9, "139.9"],
    ["800MB PREMIERE", "ENTRETENIMENTO", 160, 160, 160, 160, "Mundo Entrenimento", "Premiere | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "150", "150", "150", "150", "FIBRA_ALONE", "MUNDO ENTRETENIMENTO 800MB + PREMIERE", 160, "150"],
    ["850MB FILMES", "COMPLETO", 170, 170, 170, 170, "Mundo Completo", "Vero Video + Filmes | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "160", "160", "160", "160", "FIBRA_ALONE", "MUNDO COMPLETO 850MB + FILMES", 170, "160"],
    ["850MB ESPORTES", "COMPLETO", 185, 185, 185, 185, "Mundo Completo", "Vero Video + Esportes | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "175", "175", "175", "175", "FIBRA_ALONE", "MUNDO COMPLETO 850MB + ESPORTES", 185, "175"],
    ["1GB DIVERSÃO", "COMPLETO", 210, 210, 210, 210, "Mundo Completo", "Vero Video + Diversão | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "200", "200", "200", "200", "FIBRA_ALONE", "MUNDO COMPLETO 1GB + DIVERSÃO", 210, "200"],
    ["800MB GAMER", "GAMER", 160, 160, 160, 160, "Mundo Gamer", "Exitlag | Oneplay | Wi-Fi 6 | Kiddle | Instalação Grátis", false, "150", "150", "150", "150", "FIBRA_ALONE", "MUNDO GAMER 800MB", 160, "150"],
    ["VERO CONTROLE 10GB", "MÓVEL", 30, 30, 30, 30, "", "", false, 30, 30, 30, 30, "MOVEL_ALONE", "", 30, 30],
    ["VERO CONTROLE 20GB", "MÓVEL", 40, 40, 40, 40, "", "", false, 40, 40, 40, 40, "MOVEL_ALONE", "", 40, 40],
    ["VERO CONTROLE 30GB", "MÓVEL", 50, 50, 50, 50, "", "", false, 50, 50, 50, 50, "MOVEL_ALONE", "", 50, 50],
    ["VERO CONTROLE 60GB", "MÓVEL", 80, 80, 80, 80, "", "", false, 80, 80, 80, 80, "MOVEL_ALONE", "", 80, 80],
    ["VERO CONTROLE + CHIPS 20GB", "MÓVEL", 40, 40, 40, 40, "", "", false, 40, 40, 40, 40, "MOVEL_ALONE", "", 40, 40],
    ["ASSINATURA + CHIPS 20GB", "MÓVEL", 12, 12, 12, 12, "", "", false, 12, 12, 12, 12, "MOVEL_ALONE", "", 12, 12],
    ["VERO CONTROLE + CHIPS 30GB", "MÓVEL", 50, 50, 50, 50, "", "", false, 50, 50, 50, 50, "MOVEL_ALONE", "", 50, 50],
    ["ASSINATURA + CHIPS 30GB", "MÓVEL", 12, 12, 12, 12, "", "", false, 12, 12, 12, 12, "MOVEL_ALONE", "", 12, 12],
    ["VERO CONTROLE + CHIPS 60GB", "MÓVEL", 80, 80, 80, 80, "", "", false, 80, 80, 80, 80, "MOVEL_ALONE", "", 80, 80],
    ["ASSINATURA + CHIPS 60GB", "MÓVEL", 12, 12, 12, 12, "", "", false, 12, 12, 12, 12, "MOVEL_ALONE", "", 12, 12],
    ["10GB | MAIS CONECTADO | COMBO", "MÓVEL COMBO", 30, 30, 30, 30, "", "", false, 30, 30, 30, 30, "MOVEL_COMBO", "", 30, 30],
    ["20GB | MAIS CONECTADO | COMBO", "MÓVEL COMBO", 40, 40, 40, 40, "", "", false, 40, 40, 40, 40, "MOVEL_COMBO", "", 40, 40],
    ["30GB | MAIS CONECTADO | COMBO", "MÓVEL COMBO", 50, 50, 50, 50, "", "", false, 50, 50, 50, 50, "MOVEL_COMBO", "", 50, 50],
    ["60GB | MAIS CONECTADO | COMBO", "MÓVEL COMBO", 80, 80, 80, 80, "", "", false, 80, 80, 80, 80, "MOVEL_COMBO", "", 80, 80],
    ["VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + ROKU/TV BOX + MÓVEL 30GB", "VERO MAIS", 169.99, 169.99, 169.99, 169.99, "Vero Mais", "Esportes Futebol | YouTube Premium | ROKU/TV Box | 30GB Celular | Wi-Fi 6 | Instalação Grátis", true, "159.99", "159.99", "159.99", "159.99", "FIBRA_COMBO", "4688 - VERO MAIS 800MB + ESPORTES FUTEBOL + YOUTUBE PREMIUM + ROKU + MAIS CONECTADO 30GB", 169.99, "159.99"],
    ["VERO B2B IP FIXO 550MB", "B2B", 178, 178, 178, 178, "Vero B2B", "IP Fixo | 24 meses | Empresarial | Instalação Grátis", true, "", "", "", "", "FIBRA_ALONE", "", 178, ""],
    ["VERO B2B COMBO 750MB + 1 LINHA", "B2B", 99, 99, 99, 99, "Vero B2B", "750MB | 1 Linha Empresarial | 24 meses | Instalação Grátis", true, "", "", "", "", "FIBRA_ALONE", "", 99, ""],
    ["VERO ESSENCIAL 420MB", "VERO ESSENCIAL", "", "", "", "", "Vero Essencial", "Wi-Fi 5 | Pequenos Leitores | Estuda Mais | UBOOK GO | Instalação Grátis", true, "", "", "", "", "FIBRA_ALONE", "VERO ESSENCIAL 420MB", 69.99, "59.99"],
    ["VERO ESSENCIAL 420MB + GLOBOPLAY ADS", "VERO ESSENCIAL", "", "", "", "", "Vero Essencial", "Globoplay com Anúncios | Wi-Fi 5 | Pequenos Leitores | Estuda Mais | UBOOK GO | Instalação Grátis", true, "", "", "", "", "FIBRA_ALONE", "VERO ESSENCIAL 420MB + GLOBOPLAY COM ANÚNCIOS", 89.99, "79.99"],
    ["VERO ESSENCIAL 420MB + MÓVEL 20GB", "VERO ESSENCIAL", "", "", "", "", "Vero Essencial", "20GB Celular | Wi-Fi 5 | Pequenos Leitores | UBOOK GO | Instalação Grátis", true, "", "", "", "", "FIBRA_COMBO", "VERO ESSENCIAL 420MB + MAIS CONECTADO 20GB", 89.99, "79.99"],
    ["VERO ESSENCIAL 550MB + MÓVEL 30GB", "VERO ESSENCIAL", "", "", "", "", "Vero Essencial", "30GB Celular | Wi-Fi 5 | Pequenos Leitores | Kiddle | Instalação Grátis", true, "", "", "", "", "FIBRA_COMBO", "VERO ESSENCIAL 550MB + MAIS CONECTADO 30GB", 109.99, "99.99"],
    ["VERO FAST 550MB", "VERO FAST", 109.99, 109.99, 113.99, 114.99, "Vero Fast", "Wi-Fi 6 | Kiddle | Pequenos Leitores | Estuda Mais | UBOOK GO | Instalação Grátis", true, "99.99", "99.99", "103.99", "104.99", "FIBRA_ALONE", "VERO FAST 550MB", 109.99, "99.99"],
    ["VERO FAST 700MB", "VERO FAST", 118.99, 119.99, 123.99, 124.99, "Vero Fast", "Wi-Fi 6 | Estuda Mais | Pequenos Leitores | Kiddle | UBOOK GO | Instalação Grátis", true, "108.99", "109.99", "113.99", "114.99", "FIBRA_ALONE", "VERO FAST 700MB", 118.99, "108.99"],
    ["VERO FAST 700MB + MEDIQUO", "VERO FAST", 123.99, 124.99, 128.99, 129.99, "Vero Fast", "Mediquo | Wi-Fi 6 | Estuda Mais | Kiddle | UBOOK GO | Instalação Grátis", true, "113.99", "114.99", "118.99", "119.99", "FIBRA_ALONE", "VERO FAST 700MB + MEDIQUO", 123.99, "113.99"],
    ["VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL", "VERO FAST", 123.99, 124.99, 128.99, 129.99, "Vero Fast", "Assistência Residencial | Wi-Fi 6 | Pequenos Leitores | Kiddle | UBOOK GO | Instalação Grátis | Exceto PR", true, "113.99", "114.99", "118.99", "119.99", "FIBRA_ALONE", "VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL", 123.99, "113.99"],
    ["VERO FAST 700MB + MÓVEL 20GB", "VERO FAST", 123.99, 124.99, 128.99, 129.99, "Vero Fast", "20GB Celular | Wi-Fi 6 | Pequenos Leitores | Estuda Mais | Instalação Grátis", true, "113.99", "114.99", "118.99", "119.99", "FIBRA_COMBO", "VERO FAST 700MB + MAIS CONECTADO 20GB", 123.99, "113.99"],
    ["VERO FAST 700MB + MEDIQUO + MÓVEL 20GB", "VERO FAST", 128.99, 129.99, 133.99, 134.99, "Vero Fast", "20GB Celular | Mediquo | Wi-Fi 6 | Estuda Mais | UBOOK GO | Instalação Grátis", true, "118.99", "119.99", "123.99", "124.99", "FIBRA_COMBO", "VERO FAST 700MB + MEDIQUO + MAIS CONECTADO 20GB", 128.99, "118.99"],
    ["VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL + MÓVEL 20GB", "VERO FAST", 128.99, 129.99, 133.99, 134.99, "Vero Fast", "20GB Celular | Assistência Residencial | Wi-Fi 6 | Estuda Mais | Instalação Grátis | Exceto PR", true, "118.99", "119.99", "123.99", "124.99", "FIBRA_COMBO", "VERO FAST 700MB + ASSISTÊNCIA RESIDENCIAL + MAIS CONECTADO 20GB", 128.99, "118.99"],
    ["VERO FAST PLUS 800MB + DISNEY+ ADS + MÓVEL 30GB", "VERO FAST PLUS", 139.99, 139.99, 139.99, 139.99, "Vero Fast Plus", "Disney+ com Anúncios | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Estuda Mais | Instalação Grátis", false, "129.99", "129.99", "129.99", "129.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + DISNEY+ COM ANÚNCIOS + MAIS CONECTADO 30GB", 139.99, "129.99"],
    ["VERO FAST PLUS 800MB + DISNEY+ ADS + MÓVEL 30GB PROMO", "VERO FAST PLUS", 139.99, 139.99, 139.99, 139.99, "Vero Fast Plus", "Disney+ com Anúncios | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Estuda Mais | Instalação Grátis", true, "129.99", "129.99", "129.99", "129.99", "FIBRA_COMBO", "VERO FAST PLUS 800MB + DISNEY+ COM ANÚNCIOS + MAIS CONECTADO 30GB PROMO", 139.99, "129.99"],
    ["VERO FAST PLUS 800MB + HBO MAX ADS + MÓVEL 30GB", "VERO FAST PLUS", 147.99, 147.99, 147.99, 147.99, "Vero Fast Plus", "HBO Max com Anúncios | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Kiddle | Instalação Grátis", true, "137.99", "137.99", "137.99", "137.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + HBO MAX COM ANÚNCIOS + MAIS CONECTADO 30GB", 147.99, "137.99"],
    ["VERO FAST PLUS 800MB + GLOBOPLAY ADS + MÓVEL 30GB", "VERO FAST PLUS", 147.99, 147.99, 147.99, 147.99, "Vero Fast Plus", "Globoplay com Anúncios | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | UBOOK GO | Instalação Grátis", true, "137.99", "137.99", "137.99", "137.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + GLOBOPLAY COM ANÚNCIOS + MAIS CONECTADO 30GB", 147.99, "137.99"],
    ["VERO FAST PLUS 800MB + DISNEY+ PADRÃO + MÓVEL 30GB", "VERO FAST PLUS", 149.99, 149.99, 149.99, 149.99, "Vero Fast Plus", "Disney+ Padrão | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Instalação Grátis", true, "139.99", "139.99", "139.99", "139.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + DISNEY+ PADRÃO + MAIS CONECTADO 30GB", 149.99, "139.99"],
    ["VERO FAST PLUS 800MB + HBO MAX + MÓVEL 30GB", "VERO FAST PLUS", 149.99, 149.99, 149.99, 149.99, "Vero Fast Plus", "HBO Max | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Kiddle | Instalação Grátis", true, "139.99", "139.99", "139.99", "139.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + HBO MAX + MAIS CONECTADO 30GB", 149.99, "139.99"],
    ["VERO FAST PLUS 800MB + GLOBOPLAY PREMIUM + MÓVEL 30GB", "VERO FAST PLUS", 149.99, 149.99, 149.99, 149.99, "Vero Fast Plus", "Globoplay Premium | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Estuda Mais | Instalação Grátis", true, "139.99", "139.99", "139.99", "139.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + GLOBOPLAY PREMIUM + MAIS CONECTADO 30GB", 149.99, "139.99"],
    ["VERO FAST PLUS 800MB + YOUTUBE PREMIUM + MÓVEL 30GB", "VERO FAST PLUS", 149.99, 149.99, 149.99, 149.99, "Vero Fast Plus", "YouTube Premium | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | UBOOK GO | Instalação Grátis", true, "139.99", "139.99", "139.99", "139.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + YOUTUBE PREMIUM + MAIS CONECTADO 30GB", 149.99, "139.99"],
    ["VERO FAST PLUS 800MB + PRIME VIDEO + MÓVEL 30GB", "VERO FAST PLUS", 149.99, 149.99, 149.99, 149.99, "Vero Fast Plus", "Prime Video | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Video Up | UBOOK GO | Instalação Grátis", true, "139.99", "139.99", "139.99", "139.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + PRIME VIDEO + MAIS CONECTADO 30GB", 149.99, "139.99"],
    ["VERO FAST PLUS 800MB + APPLE TV + MÓVEL 30GB", "VERO FAST PLUS", 149.99, 149.99, 149.99, 149.99, "Vero Fast Plus", "Apple TV | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Estuda Mais | Instalação Grátis", true, "139.99", "139.99", "139.99", "139.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + APPLE TV + MAIS CONECTADO 30GB", 149.99, "139.99"],
    ["VERO FAST PLUS 800MB + TELECINE + MÓVEL 30GB", "VERO FAST PLUS", 149.99, 149.99, 149.99, 149.99, "Vero Fast Plus", "Telecine | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Estuda Mais | Instalação Grátis", true, "139.99", "139.99", "139.99", "139.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + TELECINE + MAIS CONECTADO 30GB", 149.99, "139.99"],
    ["VERO FAST PLUS 800MB + DISNEY+ PREMIUM + MÓVEL 30GB", "VERO FAST PLUS", 159.99, 159.99, 159.99, 159.99, "Vero Fast Plus", "Disney+ Premium | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Instalação Grátis", true, "149.99", "149.99", "149.99", "149.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + DISNEY+ PREMIUM + MAIS CONECTADO 30GB", 159.99, "149.99"],
    ["VERO FAST PLUS 800MB + PREMIERE + MÓVEL 30GB", "VERO FAST PLUS", 159.99, 159.99, 159.99, 159.99, "Vero Fast Plus", "Premiere | 30GB Celular | Wi-Fi 6 | Pequenos Leitores | Instalação Grátis", true, "149.99", "149.99", "149.99", "149.99", "FIBRA_COMBO", "VERO FAST MAIS 800MB + PREMIERE + MAIS CONECTADO 30GB", 159.99, "149.99"],
    ["VERO PRO ONE 850MB + MÓVEL 60GB", "VERO PRO", 159.99, 159.99, 159.99, 159.99, "Vero Pro", "Prime Video | 60GB Celular | Wi-Fi 6 | Kiddle | Video Up | Sky Mais | One Play | Instalação Grátis", true, "149.99", "149.99", "149.99", "149.99", "FIBRA_COMBO", "VERO PRO ONE 850MB + MAIS CONECTADO 60GB", 159.99, "149.99"],
    ["VERO PRO TECH 850MB + MÓVEL 60GB", "VERO PRO", 159.99, 159.99, 159.99, 159.99, "Vero Pro", "Inner AI Lite | 60GB Celular | Wi-Fi 6 | Pequenos Leitores | Kiddle | UBOOK GO | Instalação Grátis", true, "149.99", "149.99", "149.99", "149.99", "FIBRA_COMBO", "VERO PRO TECH 850MB + MAIS CONECTADO 60GB", 159.99, "149.99"],
    ["VERO PRO GAME 850MB + MÓVEL 60GB", "VERO PRO", 159.99, 159.99, 159.99, 159.99, "Vero Pro", "Disney+ ADS | Globoplay ADS | HBO ADS | 60GB Celular | Wi-Fi 6 | Pequenos Leitores | Estuda Mais | Instalação Grátis", true, "149.99", "149.99", "149.99", "149.99", "FIBRA_COMBO", "VERO PRO GAME 850MB + MAIS CONECTADO 60GB", 159.99, "149.99"],
    ["VERO PRO SPORTS 850MB + MÓVEL 60GB", "VERO PRO", 209.99, 209.99, 209.99, 209.99, "Vero Pro", "Vero Vídeo Esportes | 60GB Celular | Wi-Fi 6 | Kiddle | Estuda Mais | UBOOK GO | Instalação Grátis", true, "199.99", "199.99", "199.99", "199.99", "FIBRA_COMBO", "VERO PRO ESPORTES 850MB + MAIS CONECTADO 60GB", 209.99, "199.99"],
    ["VERO PRO FILMS 850MB + MÓVEL 60GB", "VERO PRO", 219.99, 219.99, 219.99, 219.99, "Vero Pro", "Disney+ ADS | HBO Max ADS | Telecine | Prime Video | Apple TV | 60GB Celular | Wi-Fi 6 | Estuda Mais | Instalação Grátis", true, "209.99", "209.99", "209.99", "209.99", "FIBRA_COMBO", "VERO PRO FILMES 850MB + MAIS CONECTADO 60GB", 219.99, "209.99"],
    ["VERO PRO LIVE 850MB + MÓVEL 60GB", "VERO PRO", 259.99, 259.99, 259.99, 259.99, "Vero Pro", "Vero Vídeo Diversão | YouTube Premium | 60GB Celular | Wi-Fi 6 | Pequenos Leitores | Estuda Mais | UBOOK GO | Instalação Grátis", true, "249.99", "249.99", "249.99", "249.99", "FIBRA_COMBO", "VERO PRO LIVE 850MB + MAIS CONECTADO 60GB", 259.99, "249.99"],
    ["VERO PRO MAX FAMILY 900MB + MÓVEL 100GB", "VERO PRO MAX", 229.99, 229.99, 229.99, 229.99, "Vero Pro Max", "Prime Video | HBO Max | Globoplay Premium | 100GB Celular | Wi-Fi 7 | Pequenos Leitores | Estuda Mais | Instalação Grátis", true, "219.99", "219.99", "219.99", "219.99", "FIBRA_COMBO", "VERO PRO MAX FAMILIY 900MB + MAIS CONECTADO FAMILIA 100GB", 229.99, "219.99"],
    ["VERO PRO MAX TECH 900MB + MÓVEL 60GB", "VERO PRO MAX", 259.99, 259.99, 259.99, 259.99, "Vero Pro Max", "YouTube Premium | Inner AI Pro | 60GB Celular | Wi-Fi 7 | Pequenos Leitores | Kiddle | Estuda Mais | Instalação Grátis", true, "249.99", "249.99", "249.99", "249.99", "FIBRA_COMBO", "VERO PRO MAX TECH 900MB + MAIS CONECTADO 60GB", 259.99, "249.99"],
    ["VERO PRO MAX VIP 900MB + MÓVEL 100GB", "VERO PRO MAX", 329.99, 329.99, 329.99, 329.99, "Vero Pro Max", "Disney+ ADS | HBO Max ADS | Telecine | Prime Video | Apple TV | Premiere | Móvel Família 100GB | Wi-Fi 7 | Estuda Mais | Instalação Grátis", true, "319.99", "319.99", "319.99", "319.99", "FIBRA_COMBO", "VERO PRO MAX VIP 900MB + MAIS CONECTADO FAMILIA 100GB", 329.99, "319.99"],
    ["VERO PRO MAX VIP PREMIUM 900MB + MÓVEL 100GB", "VERO PRO MAX", 449.99, 449.99, 449.99, 449.99, "Vero Pro Max", "Telecine | YouTube Premium | Prime Video | Apple TV | HBO Max | Globoplay Premium | Disney+ Premium | Premiere | 100GB Celular | Wi-Fi 7 | Estuda Mais | Instalação Grátis", true, "439.99", "439.99", "439.99", "439.99", "FIBRA_COMBO", "VERO PRO MAX VIP PREMIUM 900MB + MAIS CONECTADO FAMILIA 100GB", 449.99, "439.99"],
    ["VERO CONTROLE MAIS 40GB", "MÓVEL", 60, 60, 60, 60, "", "Móvel 40GB | NG-only | Vero Vídeo UP | Globoplay com Anúncios", true, 60, 60, 60, 60, "MOVEL_ALONE", "", 60, 60],
    ["VERO CONTROLE MAIS 60GB", "MÓVEL", 80, 80, 80, 80, "", "Móvel 60GB | NG-only | Estuda Mais | Vero Vídeo LIFELINE | Globoplay com Anúncios", true, 80, 80, 80, 80, "MOVEL_ALONE", "", 80, 80],
    ["VERO CONTROLE MAIS 100GB", "MÓVEL", 100, 100, 100, 100, "", "Móvel 100GB | NG-only | Estuda Mais | Vero Vídeo FULL | Globoplay Premium", true, 100, 100, 100, 100, "MOVEL_ALONE", "", 100, 100],
    ["STARLINK", "STARLINK", "-", "-", "-", "-", "", "Internet via satélite | Consultar disponibilidade e preço", true, "-", "-", "-", "-", "FIBRA_ALONE", "", "-", "-"]
];

/** Normalizacao igual a do Code.js (sem acento, upper, espacos colapsados). */
function _rev15Norm_(s) {
  return String(s == null ? '' : s)
           .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
           .toUpperCase().replace(/\s+/g, ' ').trim();
}

/** (1) Dry-run do JSON: compara o que esta no Drive com a Rev15. */
function _rev15DryRun() {
  var atual = JSON.parse(DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID)
                                 .getBlob().getDataAsString());
  var novo  = _REV15_PLANOS;
  Logger.log('Drive atual: ' + atual.length + ' linhas x ' + atual[1].length + ' cols');
  Logger.log('Rev15      : ' + novo.length  + ' linhas x ' + novo[1].length  + ' cols');

  var mapA = {}, i;
  for (i = 2; i < atual.length; i++) mapA[_rev15Norm_(atual[i][0])] = atual[i];
  var novos = [], alterados = [];
  for (i = 2; i < novo.length; i++) {
    var r = novo[i], k = _rev15Norm_(r[0]), a = mapA[k];
    if (!a) { novos.push(r[0]); continue; }
    if (String(a[2]) !== String(r[2]) || String(a[9]) !== String(r[9])) {
      alterados.push(r[0] + ': boleto ' + a[2] + '->' + r[2] + ' | rec ' + a[9] + '->' + r[9]);
    }
    delete mapA[k];
  }
  var removidos = Object.keys(mapA);
  Logger.log('PLANOS NOVOS (' + novos.length + '): ' + JSON.stringify(novos));
  Logger.log('PRECOS ALTERADOS (' + alterados.length + '): ' + JSON.stringify(alterados));
  Logger.log('SUMIRAM (' + removidos.length + '): ' + JSON.stringify(removidos));
  Logger.log('Esperado: 4 novos (VERO ESSENCIAL), 1 alterado (DISNEY+ ADS), 0 sumidos.');
  return { novos: novos, alterados: alterados, removidos: removidos };
}

/** (2) Grava a Rev15 no Drive e invalida o cache do _getTabela(). */
function _atualizarPlanosVeroJsonRev15() {
  var conteudo = JSON.stringify(_REV15_PLANOS, null, 2);
  DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID).setContent(conteudo);
  try { CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'tabela_v1'); } catch (e) {}
  var msg = 'OK Rev15 - ' + _REV15_PLANOS.length + ' linhas, ' +
            conteudo.length + ' bytes. Cache invalidado.';
  Logger.log(msg);
  return msg;
}

/** (3) Dry-run da segmentacao: mostra a segmentacao atual das 18 cidades. */
function _rev15SegmentacaoDryRun() {
  return _rev15AplicarSegmentacao_(true);
}

/** (4) Grava SEGMENTACAO = ESSENCIAL na aba CIDADES e no cidades_vero.json. */
function _atualizarSegmentacaoEssencialRev15() {
  return _rev15AplicarSegmentacao_(false);
}

function _rev15AplicarSegmentacao_(dryRun) {
  var alvo = {};
  for (var i = 0; i < _REV15_CIDADES_ESSENCIAL.length; i++) {
    alvo[_rev15Norm_(_REV15_CIDADES_ESSENCIAL[i])] = true;
  }

  // -- a) aba CIDADES (fonte de getOfertasCidade / getValorPlano / dropdown) --
  // Layout: col 2 SISTEMA, col 3 SEGMENTACAO, col 6 CIDADE (0-based), igual ao
  // que getOfertasCidade ja le hoje.
  var sh   = _getSpreadsheet_().getSheetByName('CIDADES');
  var vals = sh.getDataRange().getValues();
  var achadas = [], naoAchadas = [], jaOk = [];
  var vistos = {};
  for (var r = 0; r < vals.length; r++) {
    var nome = _rev15Norm_(vals[r][6]);
    if (!nome || !alvo[nome]) continue;
    vistos[nome] = true;
    var atualSeg = String(vals[r][3] || '').trim();
    if (_rev15Norm_(atualSeg) === 'ESSENCIAL') { jaOk.push(vals[r][6]); continue; }
    achadas.push({ linha: r + 1, cidade: vals[r][6], de: atualSeg, para: 'ESSENCIAL' });
    if (!dryRun) sh.getRange(r + 1, 4).setValue('ESSENCIAL'); // col D = indice 3
  }
  for (var k in alvo) if (!vistos[k]) naoAchadas.push(k);

  Logger.log('=== aba CIDADES ===');
  Logger.log(achadas.length + ' alteradas: ' + JSON.stringify(achadas));
  Logger.log(jaOk.length + ' ja ESSENCIAL: ' + JSON.stringify(jaOk));
  Logger.log(naoAchadas.length + ' NAO encontradas: ' + JSON.stringify(naoAchadas));

  // -- b) cidades_vero.json no Drive (fonte de getSegmentacaoPorCidade) --
  var jsonRes = 'CIDADES_JSON_FILE_ID vazio - pulado.';
  if (CONFIG.CIDADES_JSON_FILE_ID) {
    var file = DriveApp.getFileById(CONFIG.CIDADES_JSON_FILE_ID);
    var data = JSON.parse(file.getBlob().getDataAsString());
    var lista = data.cidades || [], mudou = 0, faltando = [];
    var vistos2 = {};
    for (var j = 0; j < lista.length; j++) {
      var n2 = _rev15Norm_(lista[j].nome);
      if (!alvo[n2]) continue;
      vistos2[n2] = true;
      if (_rev15Norm_(lista[j].segmentacao) === 'ESSENCIAL') continue;
      if (!dryRun) lista[j].segmentacao = 'ESSENCIAL';
      mudou++;
    }
    for (var k2 in alvo) if (!vistos2[k2]) faltando.push(k2);
    if (!dryRun) {
      data.geradoEm = new Date().toISOString();
      file.setContent(JSON.stringify(data, null, 2));
      try { CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'cidades_json_v1'); } catch (e) {}
    }
    jsonRes = mudou + ' alteradas no cidades_vero.json; ' +
              faltando.length + ' nao encontradas: ' + JSON.stringify(faltando);
  }
  Logger.log('=== cidades_vero.json ===');
  Logger.log(jsonRes);

  if (!dryRun) {
    try { CacheService.getScriptCache().remove(CONFIG.CACHE_PREFIX + 'cidades_v1'); } catch (e) {}
    Logger.log('Caches cidades_v1 / cidades_json_v1 invalidados.');
  } else {
    Logger.log('>>> DRY-RUN: nada foi gravado. <<<');
  }
  return { dryRun: !!dryRun, sheet: achadas, jaOk: jaOk, naoAchadas: naoAchadas, json: jsonRes };
}
