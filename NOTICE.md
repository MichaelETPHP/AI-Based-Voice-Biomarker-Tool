# NOTICE

This prototype uses third-party models. It does not include their weights in source control; they are downloaded into `models/`.

## Kintsugi Health DAM (Depression-Anxiety Model)
- Source: https://huggingface.co/KintsugiHealth/dam (checkpoint `dam3.1.ckpt` and code `pipeline.py`, `config.py`, `featex.py`, `model.py`)
- License: Apache License 2.0, as declared in the model card metadata (`license: apache-2.0`).
- The downloaded repository has no separate LICENSE file, so the full license text is not copied here. See https://www.apache.org/licenses/LICENSE-2.0
- Copyright Kintsugi Health. This project is not endorsed by Kintsugi Health.

## OpenAI Whisper-Small EN (base model)
- Source: https://huggingface.co/openai/whisper-small.en, used by DAM as its backbone.
- This project has **not** checked the license of the base model.

## OpenAI Whisper-tiny (language check)
- Source: https://huggingface.co/openai/whisper-tiny. It is used only to detect the spoken language before DAM runs (`backend/language_id.py`). It never transcribes and runs fully offline from `models/.hf_cache`.
- This project has **not** checked the license of this model.

## KintsugiHealth/dam-dataset
- Used by `scripts/tune_thresholds.py` for threshold tuning, as the DAM model card describes. It contains model scores and questionnaire labels only, no audio. It is downloaded into `models/.hf_cache` and never shipped to users.
- This project has **not** checked the license of this dataset.

## Font Awesome Free 6.7.2 (frontend/vendor/fontawesome)
- Served locally, so there is no CDN call. Icons are CC BY 4.0, fonts are SIL OFL 1.1, and code is MIT. See `frontend/vendor/fontawesome/LICENSE.txt`.

## Prism.js 1.29.0 (frontend/vendor/prism)
- Syntax highlighting on the API docs page, self-hosted (no CDN). MIT license; see `frontend/vendor/prism/LICENSE`.

## Excon typeface (frontend/assets/fonts/excon)
- Excon by Alisa Nowak, © Indian Type Foundry, distributed via Fontshare under the **ITF Free Font License (FFL) 2.0**. That license allows free personal and commercial use, including self-hosting as a web font. The official files are used unmodified. The license text comes with the Fontshare download (`License/FFL.txt`).
- The font files are **not** in the git repository, because the license forbids redistribution through repositories. Each deployment downloads Excon from Fontshare and self-hosts it (see `frontend/assets/fonts/excon/README.md`). Only the variable WOFF2/WOFF files are served.

## Kintsugi logo (desktop credits corner)
- `frontend/assets/kintsugi-logo.svg` was downloaded once from Kintsugi's website and is served locally. It is shown only to credit the DAM model as the source of the voice analysis.
- The logo is Kintsugi Health's trademark. It is not covered by the model's Apache-2.0 license, which does not grant trademark rights. Get Kintsugi Health's permission before any public or commercial use. The credit always says "Not endorsed by Kintsugi Health".

## App logo
- `frontend/assets/logo-mark.png` (and the generated `icon-192.png` / `favicon-32.png`) is the logo supplied by the project owner for the "AI-Based Voice Biomarker Tool" app. The old photo `logo.png` is no longer used.

## Not a medical device
DAM is a research model. This prototype gives no diagnosis and is not a medical device.
