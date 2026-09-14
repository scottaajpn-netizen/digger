@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Installe Node.js LTS depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if not errorlevel 1 goto npm
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" goto bundled
echo npm est introuvable. Reinstalle Node.js LTS avec npm.
pause
exit /b 1
:npm
if exist node_modules\next\package.json goto start
call npm.cmd install
if errorlevel 1 goto failed
goto start
:bundled
if exist node_modules\next\package.json goto start
call "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" install
if errorlevel 1 goto failed
:start
echo Ouvre http://localhost:3000 quand le serveur indique Ready.
echo Garde cette fenetre ouverte. Ctrl+C pour arreter.
node node_modules\next\dist\bin\next dev --hostname 127.0.0.1
if errorlevel 1 goto failed
exit /b 0
:failed
echo Le lancement a echoue. Lis le message ci-dessus.
pause
exit /b 1
