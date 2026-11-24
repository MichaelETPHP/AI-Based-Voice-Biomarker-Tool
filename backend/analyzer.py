"""Loads the Kintsugi Health DAM pipeline once and analyzes WAV files."""
import json
import os
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models" / "dam"
CKPT = MODEL_DIR / "dam3.1.ckpt"
TUNED_FILE = Path(__file__).resolve().parent / "thresholds_tuned.json"
# Level thresholds: "official" (models/dam/config.py, default) or "tuned" (scripts/tune_thresholds.py output).
THRESHOLD_SET = os.environ.get("DAM_THRESHOLDS", "official").lower()

# Keep every cache inside the project. Run fully offline once the base model is cached
# (scripts/download_model.py caches it). Set DAM_ALLOW_DOWNLOAD=1 to allow a first fetch.
os.environ.setdefault("HF_HOME", str(ROOT / "models" / ".hf_cache"))
if os.environ.get("DAM_ALLOW_DOWNLOAD") != "1":
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

DEPRESSION_LABELS = {
    0: "No signs detected",
    1: "Possible signs of mild to moderate depression",
    2: "Possible signs of severe depression",
}
ANXIETY_LABELS = {
    0: "No signs detected",
    1: "Possible signs of mild anxiety",
    2: "Possible signs of moderate anxiety",
    3: "Possible signs of severe anxiety",
}

_pipeline = None
_load_lock = threading.Lock()


def load():
    """Load the DAM pipeline once (thread-safe). Returns load time in seconds."""
    global _pipeline
    with _load_lock:
        if _pipeline is not None:
            return 0.0
        if not CKPT.exists() or CKPT.stat().st_size < 500_000_000:
            raise RuntimeError(f"Model checkpoint missing or incomplete: {CKPT}. Run scripts/download_model.py")
        if str(MODEL_DIR) not in sys.path:
            sys.path.insert(0, str(MODEL_DIR))
        import torch
        from pipeline import Pipeline  # official DAM code in models/dam

        start = time.perf_counter()
        # The checkpoint is a pickle: load ONLY the official file from KintsugiHealth/dam.
        _pipeline = Pipeline(checkpoint=CKPT, device=torch.device("cpu"))
        return time.perf_counter() - start


def is_loaded():
    return _pipeline is not None


def _tuned():
    """Thresholds from scripts/tune_thresholds.py (model card "Tuning Thresholds"), or None."""
    try:
        return json.loads(TUNED_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def threshold_info():
    """Which level thresholds are active, for /api/health."""
    tuned = _tuned()
    return {"levels": "tuned" if (THRESHOLD_SET == "tuned" and tuned) else "official",
            "screening_available": bool(tuned and "screening" in tuned)}


def _screen(score, cfg):
    """Model card indeterminate-ROC rule: score < lower -> negative, score >= upper -> positive, else indeterminate."""
    result = "negative" if score < cfg["lower"] else "positive" if score >= cfg["upper"] else "indeterminate"
    return {"result": result, "label": cfg["label"], "lower": cfg["lower"], "upper": cfg["upper"],
            "sensitivity": cfg["test"]["sensitivity"], "specificity": cfg["test"]["specificity"]}


def analyze(wav_path):
    """Run DAM on one WAV file: raw scores from the official Pipeline, then levels and screening."""
    import torch
    from config import default_config  # official DAM thresholds (models/dam/config.py)

    load()
    with torch.inference_mode():
        raw = _pipeline.run_on_file(str(wav_path), quantize=False)
        official_levels = _pipeline.model.quantize_scores(raw)  # the model's own quantization
    tuned = _tuned()
    use_tuned = THRESHOLD_SET == "tuned" and tuned is not None

    out = {"threshold_set": "tuned" if use_tuned else "official"}
    for task, labels in (("depression", DEPRESSION_LABELS), ("anxiety", ANXIETY_LABELS)):
        # quantize_scores averages over 30 s chunks, so report the same mean as the raw score
        score = float(raw[task].float().mean().item())
        if use_tuned:
            thresholds = tuned["levels"][task]["thresholds"]
            level = int(torch.searchsorted(torch.tensor(thresholds), torch.tensor(score)).item())  # same rule as the model
        else:
            thresholds = list(default_config["inference_thresholds"][task])
            level = int(official_levels[task].flatten()[0].item())
        out[f"{task}_raw"] = score
        out[f"{task}_level"] = level
        out[f"{task}_label"] = labels.get(level, "Unknown")
        out[f"{task}_thresholds"] = thresholds
        out[f"{task}_screen"] = _screen(score, tuned["screening"][task]) if tuned and "screening" in tuned else None
    return out
