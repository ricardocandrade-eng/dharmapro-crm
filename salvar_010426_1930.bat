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
