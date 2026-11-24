#!/usr/bin/env bash
# One-command start for Linux/macOS (same steps as run.bat).
cd "$(dirname "$0")" || exit 1
ROOT="$PWD"
export HF_HOME="$ROOT/models/.hf_cache"
CKPT="models/dam/dam3.1.ckpt"
MARKER="models/.hf_cache/.complete"
fail() { echo "[ERROR] $1"; read -r -p "Press Enter to close..." _; exit 1; }

if [ ! -f .venv/.installed ]; then
  PY=$(command -v python3 || command -v python) || fail "Python 3.10 or newer was not found."
  "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' || fail "Python 3.10 or newer is required."
  [ -d .venv ] || "$PY" -m venv .venv || fail "Could not create .venv."
  echo "[setup] Installing packages - this takes several minutes the first time ..."
  .venv/bin/python -m pip install --upgrade pip || fail "Package install failed."
  REQ=requirements-app.txt
  # macOS has no +cpu wheels: install the same versions without the local tag.
  if [ "$(uname)" = "Darwin" ]; then sed 's/+cpu//' requirements-app.txt > .venv/req-mac.txt; REQ=.venv/req-mac.txt; fi
  .venv/bin/python -m pip install -r "$REQ" --extra-index-url https://download.pytorch.org/whl/cpu \
    || fail "Package install failed. Check your internet connection."
  touch .venv/.installed
fi
. .venv/bin/activate || fail "Could not activate .venv."

size=$( [ -f "$CKPT" ] && wc -c < "$CKPT" || echo 0 )
if [ "$size" -lt 700000000 ] || [ ! -f "$MARKER" ]; then
  echo "[setup] Downloading the DAM model and base model - about 1.7 GB ..."
  python scripts/download_model.py || fail "Model download failed."
fi
if [ -f "$MARKER" ]; then export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1; else export DAM_ALLOW_DOWNLOAD=1; fi

echo; echo "Loading model, please wait..."
(
  for _ in $(seq 60); do
    sleep 2
    if curl -fs http://127.0.0.1:8000/api/health | grep -q '"model_loaded":true'; then
      (command -v xdg-open >/dev/null && xdg-open http://localhost:8000 || open http://localhost:8000) >/dev/null 2>&1
      echo; echo "Model ready at http://localhost:8000 - Press Ctrl+C to stop."; exit 0
    fi
  done
  echo "[ERROR] The model did not become ready within 120 seconds - see the log above."
) &
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 || fail "The server stopped with an error (port 8000 in use?)."
