# AI-Based Voice Biomarker Tool (Prototype)

A mobile-first web page records 30 s of speech and sends it to a local FastAPI server. The server runs the open-source **Kintsugi Health DAM** model and returns possible signs of depression and anxiety. Everything runs locally and no audio is stored. **This is a research prototype, not a medical device.**

## Start (one click)
**Windows:** double-click `run.bat`. **Linux/macOS:** `./run.sh`.
On the first run it creates `.venv`, installs `requirements-app.txt` (exact versions), and downloads DAM (736 MB) and whisper-small.en (about 1 GB) into `./models`. After that it starts offline (`HF_HUB_OFFLINE=1`), shows "Loading model, please wait...", and opens http://localhost:8000 when `/api/health` reports `model_loaded: true`. Press Ctrl+C to stop.
To reinstall packages, delete `.venv\.installed`. `requirements.txt` in the model card pins torch 2.6 together with torchaudio 2.7, which pip cannot install together, so this project uses torch and torchaudio 2.7.1 (CPU builds).
The server listens on 127.0.0.1 only. For a VPS, change `--host` to 0.0.0.0 behind an HTTPS proxy.

Smoke test: `python scripts/smoke_test.py my_voice.wav` (use `--synthetic` for a pipeline check only; those scores are meaningless).

## Structure
```
backend/app.py        routes, WAV validation, temp file deleted in finally
backend/analyzer.py   loads DAM once, analyze(wav_path)
frontend/             index.html, style.css, app.js (STRINGS for translations, SUPPORT_CONTACTS for clinics/helplines)
frontend/assets/      logo.png   frontend/vendor/fontawesome/  local icons
scripts/              download_model.py, smoke_test.py
models/dam/           downloaded model (git-ignored)
```

## Font (one-time, optional)
The UI uses the free **Excon** font, but its license doesn't allow redistributing it in a repository. Download it from [Fontshare](https://www.fontshare.com/fonts/excon) and copy `Excon-Variable.woff2` and `Excon-Variable.woff` into `frontend/assets/fonts/excon/` (see the README there). Without it, the app uses the system font.

## Public API for other applications
Developer docs: **`/developers/`**, linked from the app's top bar and from the top-right corner on desktop. The docs cover quickstart, authentication, audio spec, endpoints, errors, and MuleSoft, AWS Lambda and Salesforce Apex guides.
- Endpoints: `GET /v1/health` (public), `POST /v1/analyze`, `POST /v1/language` (API key), `GET /v1/openapi.json` (OpenAPI 3 spec for Postman, MuleSoft, AWS API Gateway).
- Enable it with `API_KEYS=client-a:KEY1,client-b:KEY2` in `.env` (generate keys with `openssl rand -hex 32`). Optional settings: `CORS_ORIGINS` and `RATE_LIMIT_API_PER_HOUR` (default 200 per key). In production, the API stays disabled (`503`) until keys are set.

## Run with Docker on this PC
Double-click **`run-docker.bat`**. It starts Docker Desktop if needed, builds, waits for the AI, and opens **http://localhost:8080**. Stop it with `run-docker.bat stop`. It uses `docker-compose.local.yml`, the same hardened image without a domain or HTTPS (browsers allow the mic on localhost), and reuses `./models`.

## Production (VPS, Docker Compose, HTTPS)
`docker compose up -d --build` with `.env` (DOMAIN and ACME_EMAIL) runs the hardened stack: model download job, then the app, then Caddy with automatic HTTPS. Full guide: **[deploy/DEPLOY.md](deploy/DEPLOY.md)**. Files: `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`, `.env.example`, `requirements-server.txt`.

## Model card "Usage" (how each step is covered)
| Card step | In this project |
|---|---|
| `git clone` with LFS/XET | `scripts/download_model.py` (snapshot_download). It checks that `dam3.1.ckpt` is about 736 MB, not a pointer file. |
| `mamba env create ... -c pytorch -c nvidia` | A pip venv in `.venv` with the same packages (`requirements-app.txt`). There is no conda here and no global installs. |
| `Pipeline().run_on_file("sample.wav", quantize=True)` | `python scripts/dam_example.py sample.wav` runs the card's code verbatim. The app calls the same Pipeline. |
| Tuning: sensitivity, specificity, indeterminate | `python scripts/tune_thresholds.py` (section A) runs on `KintsugiHealth/dam-dataset` and drives the app's **Screen** line. |
| Tuning: optimal multi-class | Same script: section B is the card's MinAbsoluteError example, and section C tunes MaxMacroF1 for the app's levels. |

Results are saved to `backend/thresholds_tuned.json` and measured on the dataset's test split (7,034 recordings):
- **Screening** (20% unclear budget, sensitivity = specificity): depression PHQ-9 ≥ 10 gives 71% sensitivity and 74% specificity; anxiety GAD-7 ≥ 10 gives 73% and 75%.
- **Levels:** the official thresholds give depression macro-F1 0.49 (accuracy 61%) and anxiety macro-F1 0.38 (accuracy 45%). The tuned thresholds are almost the same (0.49 and 0.40) but less accurate, so the app keeps **official** by default. Set `DAM_THRESHOLDS=tuned` to switch.

## English-only language check
DAM supports English speech only. Before DAM runs, `backend/language_id.py` uses **Whisper-tiny** (multilingual, about 150 MB, offline) to detect the spoken language:
- **Live:** at 8 s and 16 s into the recording, the page sends the audio so far to `POST /api/language`. If it is clearly not English (P(English) < 15% and another language ≥ 60%), recording stops and a small red message appears under the mic, for example "We heard Amharic…".
- **Final:** `POST /api/analyze` checks again and returns `422 not_english` if P(English) < 30% and the top language is not English. DAM is not run.
- The thresholds are lenient so that accented English is accepted. Both checks run in memory, and nothing is stored.

## Manual test (browser mic)
1. Open http://localhost:8000 on a 375 px viewport (DevTools device mode) or a phone.
2. Start stays disabled until you tick consent. Tick it and press Start.
3. Tap the mic and allow access. The level meter moves and the ring counts 30 to 0.
4. Speak English for the full 30 s. The page shows Analyzing and then two result cards.
5. Open Details to see the raw scores. The help box appears for depression level 2 or anxiety level 2 or higher.
6. Test the errors: deny mic permission, record in silence, stop the server mid-upload (Retry), and press Cancel during recording.
7. Check that `%TEMP%` has no `dam_*.wav` left behind.

## Phone demo (HTTPS needed for the microphone)
- **Quick tunnel:** `cloudflared tunnel --url http://localhost:8000` gives a temporary https URL to open on the phone.
- **Own VPS:** run the server behind a reverse proxy with TLS (for example Caddy: `reverse_proxy localhost:8000`).

## Limitations
- English speech only, one speaker, about 30 s of speech. Noise lowers quality.
- No published accuracy for this setup. Thresholds come from the model card.
- CPU inference takes several seconds to a minute. One analysis runs at a time.
- Not a medical device and not a diagnosis.
