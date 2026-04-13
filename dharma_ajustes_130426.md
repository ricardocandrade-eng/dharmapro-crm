# DharmaPro — Ajustes para Rastreamento Meta Ads
**Mobile Digital / Mobile Fibra | Abril/2026 — v2.0**
*Implementar via Google Apps Script. Cole cada bloco no Claude Code do projeto DharmaPro.*

---

## Arquitetura adotada

**Aba "Leads Meta Ads"** — nova aba que recebe automaticamente todos os leads vindos de anúncios via webhook da Renata. Time comercial preenche só o status quando resolve o lead.

**Aba "Vendas"** — continua exatamente como está. Zero mudança no workflow do time.

Motivo: não poluir a lista de vendas com leads frios, manter o workflow do time intacto, e capturar o dado de leads ruins (que hoje se perdem) — esse dado é o que vai dizer qual anúncio atrai lixo.

---

## 1. Criar a aba "Leads Meta Ads"

Na planilha do DharmaPro: clique com botão direito numa aba → **Inserir planilha** → nomear `Leads Meta Ads`.

Criar os seguintes cabeçalhos na linha 1 (uma coluna por célula, A até L):

| Col | Cabeçalho |
|---|---|
| A | data_entrada |
| B | nome |
| C | telefone |
| D | cidade |
| E | utm_source |
| F | utm_campaign |
| G | utm_ad |
| H | utm_medium |
| I | status_final |
| J | motivo_desqualificacao |
| K | data_status |
| L | observacao |

### Validação de dados — dropdowns

**Coluna I (status_final):** selecione I2:I5000 → Dados → Validação → Lista:
```
Converteu,Desqualificado,Em negociação,Sem contato
```

**Coluna J (motivo_desqualificacao):** selecione J2:J5000 → Dados → Validação → Lista:
```
Preço alto,Sem cobertura,Já tem internet,Sem interesse,Não atendeu,Outro
```

---

## 2. Código GAS — cole no editor do projeto DharmaPro

```javascript
// ============================================================
// DHARMA PRO — MÓDULO META ADS TRACKING v2.0
// Aba dedicada: "Leads Meta Ads"
// Abril/2026
// ============================================================

const CFG = {
  ABA_LEADS_META: 'Leads Meta Ads',
};


/**
 * Webhook — recebe lead da Renata (n8n) via POST.
 * Cria uma nova linha na aba "Leads Meta Ads".
 *
 * Payload esperado:
 * {
 *   "nome":         "João Silva",
 *   "telefone":     "32999001122",
 *   "cidade":       "Juiz de Fora",
 *   "utm_source":   "meta_ads",
 *   "utm_campaign": "120208xxxxxxx",
 *   "utm_ad":       "120209xxxxxxx",
 *   "utm_medium":   "cpc"
 * }
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const linha = registrarLeadMetaAds(payload);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, linha }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, erro: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


/**
 * Cria nova linha na aba "Leads Meta Ads".
 * Chamado pelo doPost quando a Renata envia um lead.
 */
function registrarLeadMetaAds(payload) {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(CFG.ABA_LEADS_META);

  if (!aba) {
    throw new Error(`Aba "${CFG.ABA_LEADS_META}" não encontrada. Crie a aba primeiro.`);
  }

  const agora = new Date();
  const novaLinha = [
    agora,                        // A: data_entrada
    payload.nome      || '',      // B: nome
    payload.telefone  || '',      // C: telefone
    payload.cidade    || '',      // D: cidade
    payload.utm_source   || 'meta_ads', // E: utm_source
    payload.utm_campaign || '',   // F: utm_campaign
    payload.utm_ad       || '',   // G: utm_ad
    payload.utm_medium   || 'cpc',// H: utm_medium
    '',                           // I: status_final (time preenche)
    '',                           // J: motivo_desqualificacao
    '',                           // K: data_status (auto via onEdit)
    '',                           // L: observacao
  ];

  aba.appendRow(novaLinha);
  const ultimaLinha = aba.getLastRow();

  console.log(`Lead Meta Ads registrado: ${payload.nome} | ${payload.cidade} | linha ${ultimaLinha}`);
  return ultimaLinha;
}


/**
 * Trigger onEdit — grava timestamp automático quando
 * o time comercial preenche o status_final (col I) ou motivo (col J).
 *
 * Instalar: Extensões → Apps Script → Gatilhos → onEdit → Ao editar
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const aba = e.range.getSheet();
  if (aba.getName() !== CFG.ABA_LEADS_META) return;

  const col = e.range.getColumn();
  const row = e.range.getRow();

  // Colunas I (9) e J (10) — status_final e motivo
  if ((col === 9 || col === 10) && row > 1) {
    aba.getRange(row, 11).setValue(new Date()); // col K: data_status
  }
}


/**
 * Exporta todos os leads Meta Ads para análise do Claude Ads.
 * Retorna array de objetos com todos os campos.
 * Chamar via trigger diário às 07:00 ou manualmente.
 */
function exportarLeadsMetaAds() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const aba  = ss.getSheetByName(CFG.ABA_LEADS_META);
  const rows = aba.getDataRange().getValues();

  const leads = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue; // linha vazia
    leads.push({
      data_entrada:        r[0],
      nome:                r[1],
      telefone:            r[2],
      cidade:              r[3],
      utm_source:          r[4],
      utm_campaign:        r[5],
      utm_ad:              r[6],
      utm_medium:          r[7],
      status_final:        r[8],
      motivo_desq:         r[9],
      data_status:         r[10],
      observacao:          r[11],
    });
  }

  // Resumo para o Claude Ads
  const total        = leads.length;
  const convertidos  = leads.filter(l => l.status_final === 'Converteu').length;
  const desq         = leads.filter(l => l.status_final === 'Desqualificado').length;
  const pendentes    = leads.filter(l => !l.status_final).length;
  const taxa_conv    = total > 0 ? ((convertidos / total) * 100).toFixed(1) : 0;

  console.log(`Leads Meta Ads | Total: ${total} | Convertidos: ${convertidos} (${taxa_conv}%) | Desq: ${desq} | Pendentes: ${pendentes}`);
  return { resumo: { total, convertidos, desq, pendentes, taxa_conv }, leads };
}


/**
 * Teste manual — chame esta função no editor GAS para
 * simular um lead chegando da Renata e verificar se está funcionando.
 */
function testeRegistrarLead() {
  const leadTeste = {
    nome:         'Lead Teste Claude Ads',
    telefone:     '32999000000',
    cidade:       'Juiz de Fora',
    utm_source:   'meta_ads',
    utm_campaign: 'campanha_teste_001',
    utm_ad:       'anuncio_teste_001',
    utm_medium:   'cpc',
  };

  const linha = registrarLeadMetaAds(leadTeste);
  console.log(`✅ Teste OK — linha criada: ${linha}`);
  console.log('Verifique a aba "Leads Meta Ads" na planilha.');
}
```

---

## 3. Publicar como Web App

Para a Renata conseguir chamar o DharmaPro:

1. **Implantar → Nova implantação**
2. Tipo: **Aplicativo da Web**
3. Executar como: **Eu**
4. Quem tem acesso: **Qualquer pessoa**
5. Copiar a URL — formato: `https://script.google.com/macros/s/XXXXXX/exec`
6. Guardar essa URL — vai no n8n da Renata

---

## 4. Instalar o trigger onEdit

1. No editor Apps Script → **Gatilhos (ícone de relógio)**
2. **+ Adicionar gatilho**
3. Função: `onEdit` | Evento: **Da planilha → Ao editar**
4. Salvar

---

## 5. Testar antes de ligar as campanhas

1. No editor GAS, selecione a função `testeRegistrarLead` e clique em **Executar**
2. Abra a aba "Leads Meta Ads" — deve aparecer uma linha com os dados de teste
3. Preencha o dropdown **status_final** nessa linha → confirme que a coluna K recebe o timestamp automaticamente
4. Se ambos funcionaram: ✅ pronto

---

## 6. O que a Renata envia (para configurar no n8n)

Quando o lead clica num anúncio e inicia conversa no WhatsApp, o link tem UTMs:
```
https://wa.me/5532XXXXXXXX?utm_source=meta_ads&utm_campaign=ID_campanha&utm_ad=ID_anuncio&utm_medium=cpc
```

O n8n da Renata deve:
1. Capturar os parâmetros UTM do primeiro contato do lead
2. Após qualificar e coletar nome/telefone/cidade, fazer um POST:

```json
POST https://script.google.com/macros/s/XXXXXX/exec
Content-Type: application/json

{
  "nome":         "Nome do Lead",
  "telefone":     "32999001122",
  "cidade":       "Juiz de Fora",
  "utm_source":   "meta_ads",
  "utm_campaign": "120208xxxxxxx",
  "utm_ad":       "120209xxxxxxx",
  "utm_medium":   "cpc"
}
```

---

## 7. Workflow do time comercial (não muda quase nada)

O time continua operando na aba **Vendas** normalmente.

A única coisa nova: quando um lead da aba "Leads Meta Ads" fechar, alguém marca `status_final = Converteu` lá. Pode ser a própria Renata ao encaminhar o lead, ou um membro do time ao fechar.

**Dica:** Adicionar um filtro na aba "Leads Meta Ads" mostrando só os sem status — assim o time vê rapidamente os pendentes de atualização.

---

*Documento gerado por Claude Ads | Abril/2026 | v2.0*
*Substitui a versão anterior (colunas na aba Vendas) — arquitetura mais limpa e sem impacto no workflow.*
