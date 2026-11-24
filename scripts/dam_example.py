"""The model card's "Load and run pipeline" example, verbatim, run from this project.

Usage: python scripts/dam_example.py path/to/sample.wav
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("HF_HOME", str(ROOT / "models" / ".hf_cache"))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
sys.path.insert(0, str(ROOT / "models" / "dam"))  # same as running from inside the cloned repo

from pipeline import Pipeline  # noqa: E402

pipeline = Pipeline()
result = pipeline.run_on_file(sys.argv[1] if len(sys.argv) > 1 else "sample.wav", quantize=True)
print(result)
