@echo off
setlocal
cd /d "%~dp0"
set "OMEUMES_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  set "OMEUMES_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if not exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    echo Instale Node.js 24 e volte a abrir Iniciar.cmd. Consulte README.md.
    pause
    exit /b 1
  )
)
"%OMEUMES_NODE%" scripts/start-local.mjs %*
set "OMEUMES_EXIT=%errorlevel%"
if not "%OMEUMES_EXIT%"=="0" pause
exit /b %OMEUMES_EXIT%
