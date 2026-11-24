"""Download the official KintsugiHealth/dam repo into ./models/dam."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("HF_HOME", str(ROOT / "models" / ".hf_cache"))

from huggingface_hub import snapshot_download  # noqa: E402

DEST = ROOT / "models" / "dam"
CKPT = DEST / "dam3.1.ckpt"


def main():
    marker = ROOT / "models" / ".hf_cache" / ".complete"
    if marker.exists() and CKPT.exists() and CKPT.stat().st_size > 500_000_000:
        print("Models already present (marker found); nothing to download.")
        return
    for attempt in range(2):
        snapshot_download("KintsugiHealth/dam", local_dir=str(DEST), force_download=attempt > 0)
        size_mb = CKPT.stat().st_size / 1e6 if CKPT.exists() else 0
        print(f"dam3.1.ckpt: {size_mb:.1f} MB")
        if size_mb > 500:
            # DAM builds on openai/whisper-small.en; cache it now so the server runs offline.
            snapshot_download("openai/whisper-small.en",
                              allow_patterns=["*.json", "*.txt", "model.safetensors"])
            print("Base model openai/whisper-small.en cached in models/.hf_cache")
            # Language check (backend/language_id.py): multilingual Whisper-tiny, ~150 MB.
            snapshot_download("openai/whisper-tiny", allow_patterns=["*.json", "model.safetensors"])
            print("Language-check model openai/whisper-tiny cached in models/.hf_cache")
            (ROOT / "models" / ".hf_cache" / ".complete").write_text("ok")
            return
        print("Checkpoint looks like a placeholder; re-downloading...")
    raise SystemExit("Checkpoint download failed (file too small).")


if __name__ == "__main__":
    main()
