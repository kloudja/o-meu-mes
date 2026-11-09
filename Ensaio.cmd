@echo off
setlocal
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Rede.ps1" OpenTrial
set "OMEUMES_EXIT=%errorlevel%"
if not "%OMEUMES_EXIT%"=="0" pause
exit /b %OMEUMES_EXIT%

