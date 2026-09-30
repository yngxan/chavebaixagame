@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale Node.js 20 ou mais recente e tente de novo.
  echo https://nodejs.org/
  pause
  exit /b 1
)
node server.mjs
pause
