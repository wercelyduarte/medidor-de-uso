@echo off
setlocal
chcp 65001 >nul
echo.
echo  Medidor de uso para Claude Code - instalador
echo  ============================================
echo.

where claude >nul 2>nul
if errorlevel 1 (
  echo  O Claude Code nao foi encontrado neste computador.
  echo  Instale primeiro: https://claude.com/claude-code
  echo.
  pause
  exit /b 1
)

echo  Adicionando o catalogo wercelyduarte/medidor-de-uso...
call claude plugin marketplace add wercelyduarte/medidor-de-uso
echo.
echo  Instalando o medidor-de-uso para o seu usuario...
call claude plugin install medidor-de-uso@mods-wercely --scope user
if errorlevel 1 (
  echo.
  echo  A instalacao falhou. Veja a mensagem acima.
  pause
  exit /b 1
)

echo.
echo  Pronto! Abra uma nova sessao no Claude Code para ver o painel.
echo  Para reabrir o painel, digite /consumo.
echo  Para desligar: botao + ao lado da caixa de mensagem, Plugins.
echo.
pause
