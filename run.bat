@echo off
setlocal
title Voice Wellness Check (Prototype)
cd /d "%~dp0"

set "HF_HOME=%~dp0models\.hf_cache"
set "CKPT=models\dam\dam3.1.ckpt"
set "CACHE_MARKER=models\.hf_cache\.complete"

rem ---- 1. Python environment ----
if exist ".venv\.installed" goto venv_ok
echo [setup] Creating virtual environment in .venv ...
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto err_nopython
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" || goto err_pyversion
if not exist ".venv\Scripts\python.exe" %PY% -m venv .venv || goto err_venv
echo [setup] Installing packages - this takes several minutes the first time ...
".venv\Scripts\python.exe" -m pip install --upgrade pip || goto err_pip
".venv\Scripts\python.exe" -m pip install -r requirements-app.txt --extra-index-url https://download.pytorch.org/whl/cpu || goto err_pip
echo ok> ".venv\.installed"
:venv_ok

call ".venv\Scripts\activate.bat" || goto err_venv

rem ---- 2. Model files ----
set "NEED_DL=0"
if not exist "%CKPT%" set "NEED_DL=1"
if exist "%CKPT%" for %%F in ("%CKPT%") do if %%~zF LSS 700000000 set "NEED_DL=1"
if not exist "%CACHE_MARKER%" set "NEED_DL=1"
if "%NEED_DL%"=="1" (
  echo [setup] Downloading the DAM model and base model - about 1.7 GB ...
  python scripts\download_model.py || goto err_download
)

rem ---- 3. Offline mode when the cache is complete ----
if exist "%CACHE_MARKER%" (
  set "HF_HUB_OFFLINE=1"
  set "TRANSFORMERS_OFFLINE=1"
) else (
  set "DAM_ALLOW_DOWNLOAD=1"
)

rem ---- 4. Start server; a background helper opens the browser when the model is ready ----
echo.
echo Loading model, please wait...
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\wait_and_open.ps1"
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
if errorlevel 1 goto err_server
goto end

:err_nopython
echo [ERROR] Python 3.10 or newer was not found. Install it from python.org and tick "Add to PATH".
goto fail
:err_pyversion
echo [ERROR] Python 3.10 or newer is required.
goto fail
:err_venv
echo [ERROR] Could not create or activate the virtual environment in .venv.
goto fail
:err_pip
echo [ERROR] Package install failed. Check your internet connection, then run run.bat again.
goto fail
:err_download
echo [ERROR] Model download failed. Check your internet connection and disk space, then run run.bat again.
goto fail
:err_server
echo [ERROR] The server stopped with an error. Port 8000 may already be in use - see the log above.
goto fail
:fail
pause
exit /b 1
:end
endlocal
