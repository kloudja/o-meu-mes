@echo off
call "%~dp0Iniciar.cmd" --restaurar %*
exit /b %errorlevel%
