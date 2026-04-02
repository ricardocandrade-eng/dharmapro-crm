@echo off
chcp 65001 >nul

echo.
echo ============================================
echo   DharmaPro CRM - Salvar e Publicar
echo ============================================
echo.

REM Verifica arquivos obrigatorios
set COUNT=0
for %%f in (Code.js Config.js ParceirosAPI.js Index.html JS.html Dashboard.html Cruzamento.html Docs.html Extrato.html FilaPAP.html Indicacoes.html Mobile.html Nova_venda.html Parceiros.html Tickets.html appsscript.json) do (
    if exist %%f (set /a COUNT+=1) else (echo [FALTANDO] %%f)
)

if %COUNT% LSS 16 (
    echo.
    echo [BLOQUEADO] Faltam arquivos. Corrija antes de continuar.
    pause
    exit /b 1
)

echo [OK] Todos os arquivos presentes.
echo.

REM Atualiza DEPLOY_DATE em Config.js com data/hora atual
for /f "tokens=1-2 delims= " %%a in ("%date% %time%") do (
    set DT_DATE=%%a
    set DT_TIME=%%b
)
set DT_TIME=%DT_TIME:~0,5%
set DEPLOY_NOW=%DT_DATE% %DT_TIME%
powershell -Command "(Get-Content 'Config.js') -replace \"var DEPLOY_DATE = '.*';\", \"var DEPLOY_DATE = '%DEPLOY_NOW%';\" | Set-Content 'Config.js' -Encoding UTF8"
echo [OK] DEPLOY_DATE atualizado: %DEPLOY_NOW%
echo.

REM Git
git add .
echo.
set /p msg="O que voce mudou? "
git commit -m "%msg%"
git push origin main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] git push falhou. Verifique sua conexao.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Codigo enviado! Deploy automatico
echo   iniciado no GitHub Actions.
echo.
echo   Acompanhe em:
echo   github.com/[seu-usuario]/dharmapro-crm/actions
echo ============================================
echo.
pause
