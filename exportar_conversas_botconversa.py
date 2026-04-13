"""
exportar_conversas_botconversa.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Exporta conversas reais de clientes do Botconversa e gera
um arquivo JSONL pronto para treinar o atendente virtual (Renata).

Como rodar:
  pip install requests
  python exportar_conversas_botconversa.py

Saída:
  conversas_renata.jsonl   ← dados de treinamento
  conversas_raw.json       ← dados brutos para referência
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import requests
import json
import time
import sys
from datetime import datetime

# ── Configuração ─────────────────────────────────────────────────────────────
API_KEY  = "12f06fd2-c949-4923-8c2c-2a30dec207a5"
BASE_URL = "https://backend.botconversa.com.br/api/v1/webhook"
HEADERS  = {"api-key": API_KEY, "Content-Type": "application/json"}

TOTAL_CONVERSAS_DESEJADAS = 100   # quantas conversas exportar
ARQUIVO_JSONL = "conversas_renata.jsonl"
ARQUIVO_RAW   = "conversas_raw.json"

# ── Helpers ───────────────────────────────────────────────────────────────────
def get(endpoint, params=None):
    """Faz GET na API do Botconversa com retry automático."""
    url = f"{BASE_URL}{endpoint}"
    for tentativa in range(3):
        try:
            resp = requests.get(url, headers=HEADERS, params=params, timeout=15)
            if resp.status_code == 429:  # rate limit
                print("  ⚠️  Rate limit atingido, aguardando 10s...")
                time.sleep(10)
                continue
            return resp
        except requests.exceptions.RequestException as e:
            print(f"  ❌ Erro de conexão (tentativa {tentativa+1}/3): {e}")
            time.sleep(3)
    return None


def testar_conexao():
    """Verifica se a API key está funcionando."""
    print("🔌 Testando conexão com Botconversa...")
    resp = get("/subscriber/", params={"page": 1, "page_size": 1})
    if resp is None:
        print("❌ Não foi possível conectar à API. Verifique sua rede.")
        sys.exit(1)
    if resp.status_code == 401:
        print("❌ API Key inválida ou expirada.")
        sys.exit(1)
    if resp.status_code != 200:
        print(f"❌ Resposta inesperada: HTTP {resp.status_code}")
        print(resp.text[:300])
        sys.exit(1)
    print("✅ Conexão OK!\n")


# ── Busca de subscribers ──────────────────────────────────────────────────────
def listar_subscribers(limite=TOTAL_CONVERSAS_DESEJADAS):
    """
    Retorna lista de subscribers (contatos) da conta.
    Cada subscriber representa um cliente que teve conversa.
    """
    print(f"📋 Buscando até {limite} contatos com histórico...")
    subscribers = []
    page = 1

    while len(subscribers) < limite:
        resp = get("/subscriber/", params={"page": page, "page_size": 50})
        if resp is None or resp.status_code != 200:
            print(f"  ⚠️  Erro ao buscar página {page}, parando.")
            break

        data = resp.json()

        # Botconversa pode retornar lista direta ou objeto com 'results'
        if isinstance(data, list):
            items = data
            tem_mais = len(items) == 50
        elif isinstance(data, dict):
            items   = data.get("results", data.get("subscribers", []))
            tem_mais = bool(data.get("next"))
        else:
            break

        if not items:
            break

        subscribers.extend(items)
        print(f"  → Página {page}: {len(items)} contatos encontrados (total: {len(subscribers)})")

        if not tem_mais or len(subscribers) >= limite:
            break

        page += 1
        time.sleep(0.2)  # respeita rate limit de 600 RPM

    return subscribers[:limite]


# ── Busca de mensagens por subscriber ────────────────────────────────────────
def buscar_mensagens(subscriber_id):
    """
    Tenta buscar o histórico de mensagens de um subscriber.
    Testa dois endpoints possíveis da API do Botconversa.
    """
    # Endpoint principal de mensagens
    resp = get(f"/subscriber/{subscriber_id}/messages/")
    if resp and resp.status_code == 200:
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("results", data.get("messages", []))

    # Endpoint alternativo (algumas versões da API)
    resp = get(f"/subscriber/{subscriber_id}/chat/")
    if resp and resp.status_code == 200:
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("results", data.get("messages", []))

    return []


# ── Formatar para treinamento IA ──────────────────────────────────────────────
def formatar_conversa_para_treino(subscriber, mensagens):
    """
    Converte uma conversa em formato JSONL para treinamento.

    Formato gerado:
    {
      "conversation_id": "...",
      "cliente": { "nome": "...", "telefone": "..." },
      "messages": [
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "..."}
      ],
      "metadata": { "tags": [...], "data": "..." }
    }
    """
    sub_id   = subscriber.get("id", "")
    nome     = subscriber.get("name", subscriber.get("first_name", "Cliente"))
    telefone = subscriber.get("phone", subscriber.get("whatsapp_phone", ""))
    tags     = subscriber.get("tags", [])

    # Converte lista de mensagens brutas em pares role/content
    messages_formatadas = []
    for msg in mensagens:
        # Campos comuns no Botconversa
        texto    = msg.get("text", msg.get("content", msg.get("message", "")))
        direcao  = msg.get("direction", msg.get("type", ""))

        if not texto:
            continue

        # "in" = mensagem do cliente, "out" = resposta do bot/atendente
        if direcao in ("in", "received", "inbound", "user"):
            role = "user"
        elif direcao in ("out", "sent", "outbound", "bot", "assistant"):
            role = "assistant"
        else:
            # Se não tem direção clara, tenta pelo campo 'from_me'
            from_me = msg.get("from_me", msg.get("fromMe", None))
            if from_me is True:
                role = "assistant"
            elif from_me is False:
                role = "user"
            else:
                continue  # pula mensagens sem direção identificável

        messages_formatadas.append({"role": role, "content": str(texto).strip()})

    if not messages_formatadas:
        return None

    return {
        "conversation_id": str(sub_id),
        "cliente": {
            "nome":     nome,
            "telefone": telefone,
        },
        "messages": messages_formatadas,
        "metadata": {
            "tags":           tags,
            "exportado_em":   datetime.now().strftime("%Y-%m-%d %H:%M"),
            "total_mensagens": len(messages_formatadas),
        }
    }


def formatar_sem_mensagens(subscriber):
    """
    Fallback: quando a API não retorna mensagens individuais,
    usa os campos do subscriber como dados de contexto.
    """
    nome     = subscriber.get("name", subscriber.get("first_name", ""))
    last_msg = subscriber.get("last_message", subscriber.get("last_interaction", ""))
    tags     = subscriber.get("tags", [])
    status   = subscriber.get("status", subscriber.get("bot_status", ""))

    # Monta o que temos como "conversa sintética"
    messages = []
    if last_msg:
        messages.append({"role": "user", "content": str(last_msg).strip()})

    campos_extras = []
    for campo in ["notes", "observation", "custom_fields"]:
        val = subscriber.get(campo)
        if val:
            campos_extras.append(str(val))
    if campos_extras:
        messages.append({"role": "context", "content": " | ".join(campos_extras)})

    return {
        "conversation_id": str(subscriber.get("id", "")),
        "cliente": {
            "nome":     nome,
            "telefone": subscriber.get("phone", ""),
        },
        "messages": messages,
        "metadata": {
            "tags":    tags,
            "status":  status,
            "fonte":   "subscriber_fields",  # indica que é dados do perfil, não chat completo
            "exportado_em": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
    }


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  EXPORTADOR DE CONVERSAS — BOTCONVERSA → RENATA")
    print("=" * 60)
    print()

    testar_conexao()

    # 1. Busca subscribers
    subscribers = listar_subscribers()
    if not subscribers:
        print("❌ Nenhum contato encontrado na conta.")
        sys.exit(1)
    print(f"\n✅ {len(subscribers)} contatos encontrados.\n")

    # 2. Para cada subscriber, busca mensagens
    print("💬 Buscando histórico de conversas...")
    conversas_formatadas = []
    dados_brutos         = []
    sem_mensagens        = 0

    for i, sub in enumerate(subscribers, 1):
        sub_id = sub.get("id", "?")
        nome   = sub.get("name", sub.get("first_name", f"Sub-{sub_id}"))
        print(f"  [{i:3d}/{len(subscribers)}] {nome} (id: {sub_id})", end="")

        mensagens = buscar_mensagens(sub_id)

        if mensagens:
            conversa = formatar_conversa_para_treino(sub, mensagens)
            print(f" → {len(mensagens)} mensagens")
        else:
            # Fallback: usa dados do perfil do subscriber
            conversa = formatar_sem_mensagens(sub)
            sem_mensagens += 1
            print(f" → sem histórico (usando perfil)")

        if conversa:
            conversas_formatadas.append(conversa)
            dados_brutos.append({"subscriber": sub, "mensagens": mensagens})

        time.sleep(0.1)  # gentileza com o rate limit

    print(f"\n📊 Resumo:")
    print(f"   Total exportado:       {len(conversas_formatadas)}")
    print(f"   Com histórico de chat: {len(conversas_formatadas) - sem_mensagens}")
    print(f"   Só dados de perfil:    {sem_mensagens}")

    # 3. Salva JSONL para treinamento
    print(f"\n💾 Salvando {ARQUIVO_JSONL}...")
    with open(ARQUIVO_JSONL, "w", encoding="utf-8") as f:
        for conversa in conversas_formatadas:
            f.write(json.dumps(conversa, ensure_ascii=False) + "\n")
    print(f"   ✅ {len(conversas_formatadas)} conversas salvas em {ARQUIVO_JSONL}")

    # 4. Salva JSON bruto para referência
    print(f"💾 Salvando {ARQUIVO_RAW}...")
    with open(ARQUIVO_RAW, "w", encoding="utf-8") as f:
        json.dump(dados_brutos, f, ensure_ascii=False, indent=2, default=str)
    print(f"   ✅ Dados brutos salvos em {ARQUIVO_RAW}")

    print()
    print("=" * 60)
    print("  EXPORTAÇÃO CONCLUÍDA!")
    print(f"  → {ARQUIVO_JSONL}  (use este para treinar a Renata)")
    print(f"  → {ARQUIVO_RAW}    (referência e debug)")
    print("=" * 60)

    # 5. Mostra exemplo do primeiro registro
    if conversas_formatadas:
        print("\n📝 Exemplo do primeiro registro gerado:")
        print(json.dumps(conversas_formatadas[0], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
