# =====================================================================
# exportar_conversas_botconversa.ps1
# Exporta conversas do Botconversa e gera JSONL para treinar a Renata
# Compativel com Windows PowerShell 5.x
#
# COMO USAR:
#   Opcao A (automatico): o script tenta listar contatos via API
#   Opcao B (manual):     edite a variavel $TELEFONES_CSV abaixo com
#                         o caminho para um CSV com coluna "telefone"
#
# Para rodar:
#   .\exportar_conversas_botconversa.ps1
# =====================================================================

$API_KEY   = "12f06fd2-c949-4923-8c2c-2a30dec207a5"
$BASE_URL  = "https://backend.botconversa.com.br/api/v1/webhook"
$HEADERS   = @{ "api-key" = $API_KEY }
$LIMITE    = 100
$JSONL_OUT = "conversas_renata.jsonl"
$RAW_OUT   = "conversas_raw.json"

# Opcional: caminho para CSV com coluna "telefone" (ex: exportado do seu CRM)
# Deixe vazio para usar a listagem automatica da API
$TELEFONES_CSV = ""

# =====================================================================
function Pegar {
    foreach ($v in $args) {
        if ($null -ne $v -and "$v" -ne "") { return $v }
    }
    return ""
}

function Invoke-BC {
    param([string]$Endpoint, [string]$Method = "Get", $Body = $null)
    $url = "$BASE_URL$Endpoint"
    $params = @{
        Uri     = $url
        Headers = $HEADERS
        Method  = $Method
        ErrorAction = "Stop"
    }
    if ($null -ne $Body) {
        $params.Body        = ($Body | ConvertTo-Json)
        $params.ContentType = "application/json"
    }
    for ($t = 1; $t -le 3; $t++) {
        try {
            return Invoke-RestMethod @params
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            if ($code -eq 429) {
                Write-Host "  [!] Rate limit - aguardando 10s..." -ForegroundColor Yellow
                Start-Sleep -Seconds 10
            } elseif ($code -eq 401) {
                Write-Host "[ERRO] API Key invalida." -ForegroundColor Red; exit 1
            } elseif ($t -eq 3) {
                return $null
            } else {
                Start-Sleep -Seconds 2
            }
        }
    }
    return $null
}

function Get-Items {
    param($data)
    if ($null -eq $data) { return @() }
    if ($data -is [System.Collections.IEnumerable] -and $data -isnot [string]) { return @($data) }
    $r = Pegar $data.results $data.subscribers $data.contacts $data.data
    if ($r) { return @($r) }
    return @()
}

# =====================================================================
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  EXPORTADOR BOTCONVERSA -> RENATA" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# --- Passo 1: verificar conexao com endpoint que sabemos que existe ---
Write-Host "[1/4] Verificando conexao (endpoint /flows/)..." -NoNewline
$flows = Invoke-BC "/flows/"
if ($null -eq $flows) {
    Write-Host " FALHOU." -ForegroundColor Red
    Write-Host ""
    Write-Host "Nao foi possivel conectar. Verifique:" -ForegroundColor Yellow
    Write-Host "  - Sua conexao com a internet"
    Write-Host "  - Se a API Key ainda e valida no painel do Botconversa"
    exit 1
}
$nFlows = if ($flows -is [System.Collections.IEnumerable]) { @($flows).Count } else { "?" }
Write-Host " OK! ($nFlows fluxos encontrados)" -ForegroundColor Green
Write-Host ""

# --- Passo 2: buscar lista de subscribers ---
Write-Host "[2/4] Buscando contatos..." -ForegroundColor Cyan

$subscribers = @()

# -- Opcao A: CSV fornecido pelo usuario
if ($TELEFONES_CSV -ne "" -and (Test-Path $TELEFONES_CSV)) {
    Write-Host "  Lendo telefones de: $TELEFONES_CSV"
    $csv = Import-Csv $TELEFONES_CSV
    $col = ($csv | Get-Member -MemberType NoteProperty).Name |
           Where-Object { $_ -match "telefone|phone|whats|celular" } |
           Select-Object -First 1
    if (-not $col) { $col = ($csv | Get-Member -MemberType NoteProperty).Name[0] }

    foreach ($row in $csv | Select-Object -First $LIMITE) {
        $fone = "$($row.$col)".Trim() -replace "\D",""
        if ($fone.Length -ge 8) {
            if ($fone.Length -le 11 -and -not $fone.StartsWith("55")) { $fone = "55$fone" }
            $sub = Invoke-BC "/subscriber/get_by_phone/$fone/"
            if ($null -ne $sub -and $null -ne $sub.id) {
                $subscribers += $sub
                Write-Host "  [+] $fone -> id $($sub.id)"
            }
        }
    }
}

# -- Opcao B: tentar endpoints de listagem da API
if ($subscribers.Count -eq 0) {
    $endpoints = @(
        "/subscriber/?page=1&page_size=50",
        "/subscribers/?page=1&page_size=50",
        "/contacts/?page=1&page_size=50",
        "/subscriber/list/",
        "/contact/"
    )
    $encontrou = $false
    foreach ($ep in $endpoints) {
        Write-Host "  Tentando: $ep" -NoNewline
        $resp = Invoke-BC $ep
        if ($null -ne $resp) {
            $items = Get-Items $resp
            if ($items.Count -gt 0) {
                Write-Host " -> $($items.Count) encontrados!" -ForegroundColor Green
                $subscribers += $items
                $encontrou = $true
                break
            } else {
                Write-Host " -> sem dados" -ForegroundColor Yellow
            }
        } else {
            Write-Host " -> sem resposta" -ForegroundColor Yellow
        }
    }

    if (-not $encontrou) {
        Write-Host ""
        Write-Host "=====================================================" -ForegroundColor Yellow
        Write-Host "  A API do Botconversa nao tem endpoint de listagem." -ForegroundColor Yellow
        Write-Host "=====================================================" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Para exportar as conversas, escolha uma opcao:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  OPCAO 1 - Export pelo painel do Botconversa:" -ForegroundColor White
        Write-Host "    1. Acesse app.botconversa.com.br"
        Write-Host "    2. Va em Contatos -> Exportar"
        Write-Host "    3. Salve o CSV na pasta do projeto"
        Write-Host "    4. Edite este script: defina `$TELEFONES_CSV = `"nome_do_arquivo.csv`""
        Write-Host "    5. Rode novamente"
        Write-Host ""
        Write-Host "  OPCAO 2 - Usar numeros do seu CRM (planilha Google):"
        Write-Host "    Exporte a coluna de WhatsApp da aba '1 - Vendas' como CSV"
        Write-Host "    e defina o caminho em `$TELEFONES_CSV"
        Write-Host ""
        exit 0
    }
}

$subscribers = $subscribers | Select-Object -First $LIMITE
Write-Host "  $($subscribers.Count) contatos prontos para processar." -ForegroundColor Green
Write-Host ""

# --- Passo 3: buscar mensagens ---
Write-Host "[3/4] Buscando historico de mensagens..." -ForegroundColor Cyan

$conversasFormatadas = New-Object System.Collections.ArrayList
$dadosBrutos         = New-Object System.Collections.ArrayList
$semMensagens = 0
$i = 0

foreach ($sub in $subscribers) {
    $i++
    $subId = $sub.id
    $nome  = Pegar $sub.name $sub.first_name $sub.full_name "Sub-$subId"
    Write-Host ("  [{0,3}/{1}] {2}" -f $i, $subscribers.Count, $nome) -NoNewline

    $mensagens = @()

    # Tenta diferentes endpoints de historico
    foreach ($ep in @("/subscriber/$subId/messages/", "/subscriber/$subId/chat/", "/subscriber/$subId/history/")) {
        $r = Invoke-BC $ep
        if ($null -ne $r) {
            $items = Get-Items $r
            if ($items.Count -gt 0) { $mensagens = $items; break }
        }
    }

    $messagesFormatadas = New-Object System.Collections.ArrayList

    if ($mensagens.Count -gt 0) {
        Write-Host " -> $($mensagens.Count) mensagens" -ForegroundColor Green
        foreach ($msg in $mensagens) {
            $texto  = Pegar $msg.text $msg.content $msg.message $msg.body
            $dir    = Pegar $msg.direction $msg.type $msg.kind
            $fromMe = if ($null -ne $msg.from_me) { $msg.from_me } else { $msg.fromMe }

            $role = $null
            if     ($dir -in @("in","received","inbound","user"))          { $role = "user"      }
            elseif ($dir -in @("out","sent","outbound","bot","assistant")) { $role = "assistant" }
            elseif ($fromMe -eq $true)                                     { $role = "assistant" }
            elseif ($fromMe -eq $false)                                    { $role = "user"      }

            if ($role -and $texto) {
                [void]$messagesFormatadas.Add(@{ role = $role; content = "$texto".Trim() })
            }
        }
    } else {
        $semMensagens++
        Write-Host " -> sem historico" -ForegroundColor Yellow
        $lastMsg = Pegar $sub.last_message $sub.last_interaction $sub.last_text
        if ($lastMsg) {
            [void]$messagesFormatadas.Add(@{ role = "user"; content = "$lastMsg".Trim() })
        }
    }

    if ($messagesFormatadas.Count -gt 0 -or $mensagens.Count -gt 0) {
        $telefone = Pegar $sub.phone $sub.whatsapp_phone $sub.telephone
        $tags     = if ($null -ne $sub.tags) { @($sub.tags) } else { @() }

        $conversa = @{
            conversation_id = "$subId"
            cliente  = @{ nome = "$nome"; telefone = "$telefone" }
            messages = $messagesFormatadas.ToArray()
            metadata = @{
                tags         = $tags
                exportado_em = (Get-Date -Format "yyyy-MM-dd HH:mm")
                fonte        = if ($mensagens.Count -gt 0) { "chat_history" } else { "subscriber_fields" }
            }
        }
        [void]$conversasFormatadas.Add($conversa)
        [void]$dadosBrutos.Add(@{ subscriber = $sub; mensagens = $mensagens })
    }
    Start-Sleep -Milliseconds 100
}

# --- Passo 4: salvar ---
Write-Host ""
Write-Host "  Exportados:        $($conversasFormatadas.Count)"
Write-Host "  Com chat completo: $($conversasFormatadas.Count - $semMensagens)"
Write-Host "  So perfil:         $semMensagens"
Write-Host ""
Write-Host "[4/4] Salvando arquivos..." -ForegroundColor Cyan

$linhas  = $conversasFormatadas | ForEach-Object { $_ | ConvertTo-Json -Compress -Depth 10 }
$pathJL  = Join-Path (Get-Location) $JSONL_OUT
[System.IO.File]::WriteAllLines($pathJL, $linhas, [System.Text.Encoding]::UTF8)
Write-Host "  Salvo: $JSONL_OUT" -ForegroundColor Green

$pathRaw = Join-Path (Get-Location) $RAW_OUT
[System.IO.File]::WriteAllText($pathRaw, ($dadosBrutos.ToArray() | ConvertTo-Json -Depth 20), [System.Text.Encoding]::UTF8)
Write-Host "  Salvo: $RAW_OUT" -ForegroundColor Green

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  CONCLUIDO!" -ForegroundColor Green
Write-Host "  -> $JSONL_OUT  (use para treinar a Renata)"
Write-Host "  -> $RAW_OUT    (referencia e debug)"
Write-Host "=====================================================" -ForegroundColor Cyan

if ($conversasFormatadas.Count -gt 0) {
    Write-Host ""
    Write-Host "Exemplo do primeiro registro:"
    $conversasFormatadas[0] | ConvertTo-Json -Depth 10
}
