"""Smoke test: python scripts/smoke_test.py path/to/file.wav  (or --synthetic to generate a test tone).

NOTE: scores on synthetic audio are MEANINGLESS. They only prove the pipeline runs end to end.
"""
import math
import struct
import sys
import tempfile
import time
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend import analyzer  # noqa: E402


def make_synthetic(path, seconds=30, rate=16000):
    """Voice-like harmonic tone with a slow pitch wobble and syllable-like amplitude envelope."""
    frames = bytearray()
    phase = 0.0
    for n in range(seconds * rate):
        t = n / rate
        f0 = 140 + 25 * math.sin(2 * math.pi * 0.7 * t)
        phase += 2 * math.pi * f0 / rate
        env = max(0.0, math.sin(2 * math.pi * 3 * t)) * (0.6 + 0.4 * math.sin(2 * math.pi * 0.2 * t))
        s = sum(math.sin(k * phase) / k for k in range(1, 6)) * env * 0.25
        frames += struct.pack("<h", int(max(-1, min(1, s)) * 32767))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python scripts/smoke_test.py <file.wav> | --synthetic")
    tmp = None
    if sys.argv[1] == "--synthetic":
        tmp = Path(tempfile.gettempdir()) / "dam_synthetic_test.wav"
        make_synthetic(tmp)
        wav = tmp
        print("WARNING: synthetic audio -> scores are meaningless (pipeline check only).")
    else:
        wav = Path(sys.argv[1])
    try:
        t0 = time.perf_counter()
        print(f"Model loaded in {analyzer.load():.1f} s")
        t1 = time.perf_counter()
        result = analyzer.analyze(wav)
        print(result)
        print(f"Analysis took {time.perf_counter() - t1:.1f} s (total {time.perf_counter() - t0:.1f} s)")
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
