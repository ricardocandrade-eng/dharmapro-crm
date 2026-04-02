$d = Get-Date -Format 'dd/MM/yyyy HH:mm'
$content = Get-Content 'Config.js' -Raw
$updated = $content -replace "var DEPLOY_DATE = '[^']*'", "var DEPLOY_DATE = '$d'"
Set-Content 'Config.js' $updated -NoNewline
Write-Host "[OK] DEPLOY_DATE atualizado para: $d"
