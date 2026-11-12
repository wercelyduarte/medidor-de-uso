@echo off
rem Gera o instalador .msi com o WiX 3.14 (https://github.com/wixtoolset/wix3/releases).
rem Uso: gerar-msi.cmd PASTA_DO_WIX VERSAO   (ex.: gerar-msi.cmd D:\ferramentas\wix314 0.4.2)
setlocal
cd /d "%~dp0"
set WIX=%~1
set VERSAO=%~2
if "%VERSAO%"=="" set VERSAO=0.4.2
"%WIX%\candle.exe" -nologo -dVersao=%VERSAO% -out obj\ medidor-de-uso.wxs || exit /b 1
"%WIX%\light.exe" -nologo -ext WixUIExtension -cultures:pt-BR -sice:ICE38 -sice:ICE64 -sice:ICE91 -out MedidorDeUso-%VERSAO%.msi obj\medidor-de-uso.wixobj || exit /b 1
echo Gerado: %~dp0MedidorDeUso-%VERSAO%.msi
