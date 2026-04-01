@echo off
echo Salvando no Google Apps Script...
clasp push
echo.
echo Preparando arquivos para o GitHub...
git add .
set /p msg="Digite o que voce mudou: "
git commit -m "%msg%"
echo.
echo Enviando para o GitHub...
git push origin main
echo.
echo Tudo pronto, Ricardo!
pause
