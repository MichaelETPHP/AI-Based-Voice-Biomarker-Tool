@echo off
setlocal
title AI-Based Voice Biomarker Tool (Docker)
cd /d "%~dp0"
set "COMPOSE=docker compose -f docker-compose.local.yml"

if /i "%~1"=="stop" (
  %COMPOSE% down
  echo Stopped.
  goto end
)

rem ---- 1. Docker available and running? Start Docker Desktop if needed ----
where docker >nul 2>nul || goto err_nodocker
docker info >nul 2>nul && goto docker_ok
echo Starting Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
for /l %%i in (1,1,60) do (
  docker info >nul 2>nul && goto docker_ok
  timeout /t 3 /nobreak >nul
)
goto err_engine
:docker_ok

rem ---- 2. Build and start (first run downloads models if ./models is empty) ----
echo Building and starting containers - the first build takes a few minutes...
%COMPOSE% up -d --build || goto err_up

rem ---- 3. Wait for the AI model, then open the browser ----
echo.
echo Loading model, please wait...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\wait_and_open.ps1" -Port 8080 -TimeoutSec 300 || goto err_ready
echo.
echo Running at http://localhost:8080
echo Logs:  docker compose -f docker-compose.local.yml logs -f app
echo Stop:  run-docker.bat stop
goto end

:err_nodocker
echo [ERROR] Docker is not installed. Install Docker Desktop from docker.com, then run this again.
goto fail
:err_engine
echo [ERROR] Docker Desktop did not start. Open Docker Desktop manually, wait until it says "running", then run this again.
goto fail
:err_up
echo [ERROR] Could not build or start the containers - see the messages above.
goto fail
:err_ready
echo [ERROR] The app did not become ready. Check: docker compose -f docker-compose.local.yml logs app
goto fail
:fail
pause
exit /b 1
:end
endlocal
