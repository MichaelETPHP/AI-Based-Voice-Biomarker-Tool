"""Spoken-language check with OpenAI Whisper-tiny (multilingual), run before DAM.

DAM only supports English speech. This module estimates the spoken language from the
first 30 s of audio using Whisper's language-token probabilities. It never transcribes
and never stores audio. Fully offline once the model is cached in models/.hf_cache.
"""
import threading
import time

MODEL_ID = "openai/whisper-tiny"
SAMPLE_RATE = 16000

# Lenient on purpose: accented English must never be rejected.
# Calibrated on real speech (FLEURS Amharic/Spanish, English TTS): English scores >= 0.99,
# Amharic 0.04-0.16 (Whisper-tiny spreads Amharic over several languages), Spanish ~0.002.
FINAL_MIN_EN_PROB = 0.30          # full recording: reject only if P(English) is below this and top language != en
EARLY_MAX_EN_PROB = 0.10          # partial (live) check: reject when P(English) is clearly tiny...
EARLY_ALT_MAX_EN_PROB = 0.15      # ...or a little higher but another language is confidently on top
EARLY_MIN_TOP_PROB = 0.60
NAME_MIN_PROB = 0.35              # name the language only if it clearly leads (noise gives flat, random guesses)
NAME_MIN_LEAD = 2.0

_model = None
_extractor = None
_lang_ids = None
_lang_codes = None
_names = {}
_lock = threading.Lock()
_load_error = None


def load():
    """Load Whisper-tiny once. Returns load time in seconds, or raises."""
    global _model, _extractor, _lang_ids, _lang_codes, _names, _load_error
    with _lock:
        if _model is not None:
            return 0.0
        import torch
        from transformers import WhisperFeatureExtractor, WhisperForConditionalGeneration
        from transformers.models.whisper.tokenization_whisper import LANGUAGES

        start = time.perf_counter()
        try:
            _extractor = WhisperFeatureExtractor.from_pretrained(MODEL_ID)
            model = WhisperForConditionalGeneration.from_pretrained(MODEL_ID).eval()
        except Exception as exc:  # missing cache etc.
            _load_error = str(exc)
            raise
        lang_to_id = model.generation_config.lang_to_id  # {"<|en|>": 50259, ...}
        _lang_codes = [tok.strip("<|>") for tok in lang_to_id]
        _lang_ids = torch.tensor(list(lang_to_id.values()))
        _names = {code: name.title() for code, name in LANGUAGES.items()}
        _model = model
        return time.perf_counter() - start


def is_loaded():
    return _model is not None


def load_error():
    return _load_error


def detect(audio):
    """audio: 1-D float tensor/array at 16 kHz. Returns language probabilities (top 3 + English)."""
    import torch

    if _model is None:
        load()
    samples = audio.reshape(-1).float().numpy() if hasattr(audio, "numpy") else audio
    feats = _extractor(samples[: 30 * SAMPLE_RATE], sampling_rate=SAMPLE_RATE, return_tensors="pt").input_features
    sot = torch.tensor([[_model.generation_config.decoder_start_token_id]])
    with _lock, torch.inference_mode():
        logits = _model(input_features=feats, decoder_input_ids=sot).logits[0, -1]
    probs = torch.softmax(logits[_lang_ids], dim=-1)
    top = torch.topk(probs, 3)
    top3 = [{"code": _lang_codes[i], "name": _names.get(_lang_codes[i], _lang_codes[i]), "prob": round(float(p), 4)}
            for p, i in zip(top.values.tolist(), top.indices.tolist())]
    en_prob = float(probs[_lang_codes.index("en")])
    return {"top": top3, "english_prob": round(en_prob, 4)}


def decide(result, early=False):
    """Apply the acceptance policy. Returns dict with is_english / reject / language name."""
    top, second = result["top"][0], result["top"][1]
    en = result["english_prob"]
    if early:
        reject = top["code"] != "en" and (
            en < EARLY_MAX_EN_PROB or (en < EARLY_ALT_MAX_EN_PROB and top["prob"] >= EARLY_MIN_TOP_PROB))
    else:
        reject = top["code"] != "en" and en < FINAL_MIN_EN_PROB
    named = top["prob"] >= NAME_MIN_PROB and top["prob"] >= NAME_MIN_LEAD * second["prob"]
    return {
        "language": top["code"], "name": top["name"] if named else None, "confidence": top["prob"],
        "english_prob": en, "is_english": not reject, "reject": reject,
    }
