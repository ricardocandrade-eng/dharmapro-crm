@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

set "DEPLOYMENT_ID=AKfycbyOB1HP_wIn0Haxw14npDgY7imWJL7wCEDvrnrVvU8WiXyDwXWa36PAo7Kd06sxEoMTKw"

echo.
echo ============================================
echo   DharmaPro CRM - Salvar e Publicar Local
echo ============================================
echo.

REM Verifica arquivos obrigatorios
set COUNT=0
for %%f in (Code.js Config.js ParceirosAPI.js Index.html JS.html Dashboard.html Cruzamento.html Docs.html Extrato.html FilaPAP.html Indicacoes.html Mobile.html Nova_venda.html Parceiros.html Tickets.html appsscript.json .clasp.json) do (
    if exist %%f (set /a COUNT+=1) else (echo [FALTANDO] %%f)
)

if %COUNT% LSS 17 (
    echo.
    echo [BLOQUEADO] Faltam arquivos obrigatorios. Corrija antes de continuar.
    pause
    exit /b 1
)

echo [OK] Arquivos obrigatorios encontrados.
echo.

REM Verifica se o clasp esta disponivel
where clasp >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] O comando "clasp" nao foi encontrado.
    echo Instale com: npm install -g @google/clasp
    pause
    exit /b 1
)

echo [OK] clasp encontrado.
echo.

REM Atualiza DEPLOY_DATE em Config.js com data/hora atual
for /f "tokens=1-2 delims= " %%a in ("%date% %time%") do (
    set DT_DATE=%%a
    set DT_TIME=%%b
)
set DT_TIME=%DT_TIME:~0,5%
set DEPLOY_NOW=%DT_DATE% %DT_TIME%
powershell -Command "(Get-Content 'Config.js') -replace \"var DEPLOY_DATE = '.*';\", \"var DEPLOY_DATE = '%DEPLOY_NOW%';\" | Set-Content 'Config.js' -Encoding UTF8"
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao atualizar DEPLOY_DATE.
    pause
    exit /b 1
)

echo [OK] DEPLOY_DATE atualizado: %DEPLOY_NOW%
echo.

set /p msg="O que voce mudou? "
if "%msg%"=="" set "msg=Atualizacao local DharmaPro"

echo.
echo [1/4] Enviando arquivos locais para o Apps Script...
clasp push --force
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] clasp push falhou.
    echo Verifique autenticacao, .clasp.json e permissoes do projeto GAS.
    pause
    exit /b 1
)

echo [OK] Arquivos enviados para o GAS.
echo.

echo [2/4] Publicando nova versao do Web App...
clasp deploy --deploymentId %DEPLOYMENT_ID% -d "%msg% - %DEPLOY_NOW%"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] clasp deploy falhou.
    echo Verifique autenticacao do clasp e o deployment ID configurado.
    pause
    exit /b 1
)

echo [OK] Deploy publicado no Apps Script.
echo.

echo [3/4] Salvando alteracoes no Git...
git add .
git commit -m "%msg%"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [AVISO] Nao houve commit novo. Seguindo para sincronizacao remota.
)

echo.
echo [4/4] Sincronizando com o repositorio remoto...
git pull --rebase origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] git pull falhou. Resolva antes de continuar.
    pause
    exit /b 1
)

git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] git push falhou. Verifique sua conexao ou credenciais Git.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Publicacao concluida com sucesso
echo.
echo   GAS atualizado localmente via clasp
echo   Repositorio remoto sincronizado
echo ============================================
echo.
pause
