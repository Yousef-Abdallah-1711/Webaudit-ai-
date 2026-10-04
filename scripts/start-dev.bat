@echo off
cd /d H:\Projects\Webaudit-ai-
set "NODE=C:\Program Files\nodejs\node.exe"
set "ROOT=H:\Projects\Webaudit-ai-"

start "webaudit-api" /min cmd /c "cd /d %ROOT%\apps\api && "%NODE%" --env-file-if-exists=../../.env --import tsx src/index.ts > %ROOT%\logs\api.log 2>&1 < nul"
start "webaudit-worker" /min cmd /c "cd /d %ROOT%\apps\worker && "%NODE%" --env-file-if-exists=../../.env --import tsx src/index.ts > %ROOT%\logs\worker.log 2>&1 < nul"
start "webaudit-sandbox" /min cmd /c "cd /d %ROOT%\apps\sandbox-runner && "%NODE%" --env-file-if-exists=../../.env --import tsx src/serve.ts > %ROOT%\logs\sandbox.log 2>&1 < nul"
start "webaudit-web" /min cmd /c "cd /d %ROOT%\apps\web && "%NODE%" node_modules\next\dist\bin\next dev --port 7100 > %ROOT%\logs\web.log 2>&1 < nul"
