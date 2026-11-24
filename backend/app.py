"""FastAPI app: serves the frontend and runs DAM voice analysis."""
import hmac
import json
import io
import logging
import mimetypes
import uuid
import os
import tempfile
import threading
import time
import wave
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from backend import analyzer, language_id

# Slim Docker images lack some web types; register them so fonts and icons get correct Content-Types.
for _ext, _type in ((".woff2", "font/woff2"), (".woff", "font/woff"), (".ttf", "font/ttf"),
                    (".svg", "image/svg+xml"), (".webmanifest", "application/manifest+json")):
    mimetypes.add_type(_type, _ext)

log = logging.getLogger("dam")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
MAX_BYTES = 10 * 1024 * 1024
MIN_SECONDS, MAX_SECONDS = 25.0, 40.0
MIN_RMS = 0.003  # on a -1..1 scale; below this we treat the clip as silent

MIN_LANG_SECONDS = 3.0  # live language check during recording
_analysis_lock = threading.Lock()
_load_error = None

# ---- Production settings (all via environment variables, safe defaults for local use)
PRODUCTION = os.environ.get("APP_ENV", "development").lower() == "production"
TORCH_THREADS = int(os.environ.get("TORCH_THREADS", "0"))           # 0 = PyTorch default
MAX_WAITING = int(os.environ.get("MAX_WAITING_ANALYSES", "4"))      # queue limit before "busy"
RATE_ANALYZE = int(os.environ.get("RATE_LIMIT_ANALYZE_PER_HOUR", "20"))
RATE_LANGUAGE = int(os.environ.get("RATE_LIMIT_LANGUAGE_PER_HOUR", "120"))

_waiting = 0
_waiting_lock = threading.Lock()


class RateLimiter:
    """Small in-memory sliding-window limiter per client IP (single-process server)."""

    def __init__(self, limit, window_s=3600):
        self.limit, self.window = limit, window_s
        self.hits = {}
        self.lock = threading.Lock()

    def allow(self, key):
        if self.limit <= 0:
            return True
        now = time.monotonic()
        with self.lock:
            q = [t for t in self.hits.get(key, []) if now - t < self.window]
            if len(q) >= self.limit:
                self.hits[key] = q
                return False
            q.append(now)
            self.hits[key] = q
            if len(self.hits) > 10000:  # bound memory
                self.hits = {k: v for k, v in self.hits.items() if v and now - v[-1] < self.window}
            return True


analyze_limiter = RateLimiter(RATE_ANALYZE)
language_limiter = RateLimiter(RATE_LANGUAGE)


def client_ip(request):
    # Uvicorn runs with --proxy-headers behind Caddy, so request.client is the real visitor IP.
    return request.client.host if request.client else "unknown"


@asynccontextmanager
async def lifespan(app):
    global _load_error
    if TORCH_THREADS > 0:
        import torch
        torch.set_num_threads(TORCH_THREADS)
        log.info("PyTorch threads: %d", TORCH_THREADS)
    try:
        log.info("Loading DAM model...")
        secs = await run_in_threadpool(analyzer.load)
        log.info("DAM model loaded in %.1f s", secs)
    except Exception as exc:  # keep serving the page; /api/health reports the failure
        _load_error = str(exc)
        log.exception("Model failed to load")
    try:
        secs = await run_in_threadpool(language_id.load)
        log.info("Language-check model (%s) loaded in %.1f s", language_id.MODEL_ID, secs)
    except Exception:  # the app still works; analysis just skips the language check
        log.warning("Language-check model not available; run scripts/download_model.py. English check disabled.")
    yield


app = FastAPI(
    title="AI-Based Voice Biomarker Tool",
    lifespan=lifespan,
    # No public API explorer in production.
    docs_url=None if PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if PRODUCTION else "/openapi.json",
)

# CORS for browser apps on other domains calling /v1 (server-to-server callers like MuleSoft/AWS/Salesforce
# don't need it). CORS_ORIGINS="https://app.example.com,https://crm.example.com" or "*". Default: off.
_cors = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if _cors:
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(CORSMiddleware, allow_origins=_cors, allow_methods=["GET", "POST"],
                       allow_headers=["Authorization", "X-API-Key", "Content-Type", "X-Request-ID"],
                       expose_headers=["X-Request-ID"], allow_credentials=False, max_age=600)

# Strict CSP: everything is self-hosted. blob: is needed for the AudioWorklet module created in app.js.
CSP = ("default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; style-src 'self'; "
       "img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; "
       "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    supplied = "".join(c for c in request.headers.get("x-request-id", "")[:64] if c.isalnum() or c in "-_.")
    request_id = supplied or uuid.uuid4().hex
    response = await call_next(request)
    h = response.headers
    h["X-Request-ID"] = request_id  # quote this when reporting a problem; it is in the server log too
    h["Content-Security-Policy"] = CSP
    h["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=(), payment=()"
    h["Referrer-Policy"] = "no-referrer"
    h["X-Content-Type-Options"] = "nosniff"
    h["X-Frame-Options"] = "DENY"
    h["Cross-Origin-Opener-Policy"] = "same-origin"
    path = request.url.path
    if path.startswith(("/api/", "/v1/")):
        h["Cache-Control"] = "no-store"  # results are personal; never cache them
    elif path.startswith(("/vendor/", "/assets/")):
        h["Cache-Control"] = "public, max-age=604800"
    else:
        # App shell (/, index.html, app.js, style.css): always revalidate so updates show immediately.
        h["Cache-Control"] = "no-cache"
    return response


def err(status, code, message):
    return JSONResponse(status_code=status, content={"error": code, "message": message})


def inspect_wav(data):
    """Return (duration_s, rms, mono_samples, rate) or raise ValueError with a friendly message."""
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("The file is not a valid WAV recording.")
    try:
        with wave.open(io.BytesIO(data)) as w:
            rate, width, channels, frames = w.getframerate(), w.getsampwidth(), w.getnchannels(), w.getnframes()
            pcm = w.readframes(frames)
    except (wave.Error, EOFError) as exc:
        raise ValueError(f"Could not read the WAV file ({exc}). Use 16-bit PCM WAV.")
    if width != 2 or rate <= 0:
        raise ValueError("Only 16-bit PCM WAV audio is supported.")
    if channels != 1:
        raise ValueError(f"The WAV file has {channels} channels. Please send mono (1 channel) audio.")
    duration = frames / rate
    samples = np.frombuffer(pcm[: len(pcm) - len(pcm) % 2], dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        samples = samples[: len(samples) - len(samples) % channels].reshape(-1, channels).mean(axis=1)
    rms = float(np.sqrt(np.mean(samples**2))) if samples.size else 0.0
    return duration, rms, samples, rate


def check_language(samples, rate, early):
    """Run Whisper-tiny language ID in memory (no file is written). Returns the decision dict."""
    import torch
    import torchaudio

    audio = torch.from_numpy(samples)
    if rate != language_id.SAMPLE_RATE:
        audio = torchaudio.functional.resample(audio, rate, language_id.SAMPLE_RATE)
    return language_id.decide(language_id.detect(audio), early=early)


def not_english(lang):
    name = lang["name"]  # None unless the detector clearly identified a language (see language_id.decide)
    return JSONResponse(status_code=422, content={
        "error": "not_english",
        "message": f"We heard {name}. Please speak in English." if name else "This did not sound like English speech. Please speak in English.",
        "language": lang["language"], "language_name": name,
        "english_prob": lang["english_prob"],
    })


async def read_upload(audio, min_s, max_s):
    """Read and validate an uploaded WAV. Returns (data, duration, samples, rate) or a JSONResponse error."""
    return validate_wav_bytes(await audio.read(MAX_BYTES + 1), min_s, max_s)


def validate_wav_bytes(data, min_s, max_s):
    """Validate raw WAV bytes. Returns (data, duration, samples, rate) or a JSONResponse error."""
    if not data:
        return err(400, "missing_audio", "No audio was sent. Send a WAV file as multipart field 'audio' or as the raw request body.")
    if len(data) > MAX_BYTES:
        return err(413, "too_large", "The recording is larger than 10 MB.")
    try:
        duration, rms, samples, rate = inspect_wav(data)
    except ValueError as exc:
        return err(400, "invalid_wav", str(exc))
    if not min_s <= duration <= max_s:
        return err(400, "bad_duration", f"The recording is {duration:.1f} s long. Please record about 30 seconds (25-40 s).")
    if rms < MIN_RMS:
        return err(400, "silent", "We could not hear any speech. Check your microphone and speak a little louder.")
    return data, duration, samples, rate


@app.get("/api/health")
def health():
    return {"status": "ok" if _load_error is None else "error", "model_loaded": analyzer.is_loaded(),
            "language_check": language_id.is_loaded(),
            "thresholds": analyzer.threshold_info(),
            "error": None if PRODUCTION else _load_error}  # no internal details publicly


def rate_limited():
    return err(429, "rate_limited", "Too many checks from this device. Please wait a while and try again.")


@app.post("/api/language")
async def language(request: Request, audio: UploadFile = File(...)):
    """Live check while recording: a few seconds of audio -> is it English? Nothing is stored."""
    if not language_id.is_loaded():
        return {"checked": False, "reject": False}
    if not language_limiter.allow(client_ip(request)):
        return rate_limited()
    upload = await read_upload(audio, MIN_LANG_SECONDS, MAX_SECONDS)
    if isinstance(upload, JSONResponse):
        return upload
    _, _, samples, rate = upload
    lang = await run_in_threadpool(check_language, samples, rate, True)
    del samples
    return {"checked": True, **lang}


@app.post("/api/analyze")
async def analyze(request: Request, audio: UploadFile = File(...)):
    if not analyzer.is_loaded():
        return err(503, "model_not_loaded", "The analysis model is not ready yet. Please try again in a minute.")
    if not analyze_limiter.allow(client_ip(request)):
        return rate_limited()
    return await run_analysis(await read_upload(audio, MIN_SECONDS, MAX_SECONDS))


async def run_analysis(upload):
    """Shared pipeline for the web app and the public API: language check -> DAM -> JSON result."""
    if isinstance(upload, JSONResponse):
        return upload
    data, duration, samples, rate = upload

    # DAM supports English only: check the language first (in memory) and stop early if it is not English.
    lang = None
    if language_id.is_loaded():
        lang = await run_in_threadpool(check_language, samples, rate, False)
        log.info("Language: %s (%.2f), P(en)=%.2f", lang["language"], lang["confidence"], lang["english_prob"])
        if lang["reject"]:
            return not_english(lang)
    del samples

    # Bounded queue: one analysis runs at a time; refuse politely instead of piling up requests.
    global _waiting
    with _waiting_lock:
        if _waiting >= MAX_WAITING:
            return err(503, "busy", "Many people are using the tool right now. Please try again in a minute.")
        _waiting += 1

    fd, tmp_path = tempfile.mkstemp(suffix=".wav", prefix="dam_")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        del data

        def run():
            with _analysis_lock:  # only one analysis at a time
                start = time.perf_counter()
                res = analyzer.analyze(tmp_path)
                return res, time.perf_counter() - start

        result, elapsed = await run_in_threadpool(run)
    except Exception:
        log.exception("Analysis failed")
        return err(500, "analysis_failed", "Something went wrong while analyzing. Please try again.")
    finally:
        with _waiting_lock:
            _waiting -= 1
        try:
            os.remove(tmp_path)  # audio is never kept
        except FileNotFoundError:
            pass

    log.info("Analyzed %.1f s clip in %.1f s", duration, elapsed)
    return {
        **{task: {"level": result[f"{task}_level"], "label": result[f"{task}_label"],
                  "raw": round(result[f"{task}_raw"], 4), "thresholds": result[f"{task}_thresholds"],
                  "screen": result[f"{task}_screen"]}
           for task in ("depression", "anxiety")},
        "threshold_set": result["threshold_set"],
        "language": ({"code": lang["language"], "name": lang["name"], "english_prob": lang["english_prob"]}
                     if lang else None),
        "duration_s": round(duration, 2),
        "elapsed_s": round(elapsed, 2),
    }


# =====================================================================================
# Public API v1: for other applications (MuleSoft, AWS, Salesforce, your own backend).
# Auth: API key via "Authorization: Bearer <key>" or "X-API-Key: <key>".
# Audio: raw WAV body (Content-Type: audio/wav) or multipart field "audio".
# Docs: /developers/   OpenAPI: /developers/openapi.json
# =====================================================================================
def _parse_api_keys(raw):
    """API_KEYS="client-a:key1,client-b:key2" (names are for logs) or just "key1,key2"."""
    keys = {}
    for i, item in enumerate(filter(None, (x.strip() for x in raw.split(",")))):
        name, _, key = item.rpartition(":")
        keys[key] = name or f"client-{i + 1}"
    return keys


API_KEYS = _parse_api_keys(os.environ.get("API_KEYS", ""))
RATE_API = int(os.environ.get("RATE_LIMIT_API_PER_HOUR", "200"))
api_limiter = RateLimiter(RATE_API)


def authenticate(request):
    """Returns (client_name, None) or (None, JSONResponse error)."""
    if not API_KEYS:
        if PRODUCTION:
            return None, err(503, "api_not_configured",
                             "The public API is not enabled on this server. The administrator must set API_KEYS.")
        return "dev", None  # local development: open
    auth = request.headers.get("authorization", "")
    key = auth[7:].strip() if auth.lower().startswith("bearer ") else request.headers.get("x-api-key", "").strip()
    if not key:
        return None, err(401, "unauthorized", "Missing API key. Send 'Authorization: Bearer <key>' or 'X-API-Key: <key>'.")
    for known, name in API_KEYS.items():
        if hmac.compare_digest(key.encode(), known.encode()):
            return name, None
    return None, err(401, "unauthorized", "Invalid API key.")


async def read_api_audio(request):
    """Accept multipart field 'audio' or a raw WAV body. Never more than MAX_BYTES is read."""
    ctype = request.headers.get("content-type", "").lower()
    if ctype.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("audio")
        if upload is None or not hasattr(upload, "read"):
            return err(400, "missing_audio", "Multipart requests must include the WAV file in a field named 'audio'.")
        return await upload.read(MAX_BYTES + 1)
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BYTES:
            break
    return bytes(body)


async def api_guard(request, limiter_scope):
    client, denied = authenticate(request)
    if denied:
        return None, denied
    if not api_limiter.allow(f"{limiter_scope}:{client}"):
        return None, err(429, "rate_limited", f"Rate limit reached ({RATE_API} requests per hour). Please retry later.")
    return client, None


OPENAPI_FILE = Path(__file__).resolve().parent / "openapi_v1.json"


@app.get("/v1/openapi.json", tags=["v1"])
def v1_openapi(request: Request):
    """OpenAPI 3 spec for import into MuleSoft Anypoint, Postman, AWS API Gateway, Salesforce, etc."""
    spec = json.loads(OPENAPI_FILE.read_text(encoding="utf-8"))
    base = str(request.base_url).rstrip("/")  # correct scheme/host behind Caddy thanks to --proxy-headers
    spec["servers"] = [{"url": base, "description": "This server"}]
    return JSONResponse(spec, headers={"Content-Disposition": 'inline; filename="voice-biomarker-openapi.json"'})


@app.get("/v1/health", tags=["v1"])
def v1_health():
    """Public: is the service up and the model loaded?"""
    return {"status": "ok" if _load_error is None and analyzer.is_loaded() else "unavailable",
            "model_loaded": analyzer.is_loaded(), "language_check": language_id.is_loaded(), "api_version": "1"}


@app.post("/v1/analyze", tags=["v1"])
async def v1_analyze(request: Request):
    """Analyze 25-40 s of English speech (16-bit PCM mono WAV) for depression/anxiety voice biomarkers."""
    client, denied = await api_guard(request, "analyze")
    if denied:
        return denied
    if not analyzer.is_loaded():
        return err(503, "model_not_loaded", "The analysis model is not ready yet. Please retry in a minute.")
    data = await read_api_audio(request)
    if isinstance(data, JSONResponse):
        return data
    log.info("API analyze request from %s (%d bytes)", client, len(data))
    return await run_analysis(validate_wav_bytes(data, MIN_SECONDS, MAX_SECONDS))


@app.post("/v1/language", tags=["v1"])
async def v1_language(request: Request):
    """Check whether 3-40 s of audio is English speech (no depression/anxiety analysis)."""
    client, denied = await api_guard(request, "language")
    if denied:
        return denied
    if not language_id.is_loaded():
        return err(503, "language_check_unavailable", "The language-check model is not loaded on this server.")
    data = await read_api_audio(request)
    if isinstance(data, JSONResponse):
        return data
    upload = validate_wav_bytes(data, MIN_LANG_SECONDS, MAX_SECONDS)
    if isinstance(upload, JSONResponse):
        return upload
    _, _, samples, rate = upload
    lang = await run_in_threadpool(check_language, samples, rate, False)
    return {"language": lang["language"], "language_name": lang["name"], "confidence": lang["confidence"],
            "english_prob": lang["english_prob"], "is_english": lang["is_english"]}


app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
