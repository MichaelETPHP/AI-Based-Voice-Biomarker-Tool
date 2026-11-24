"""Threshold tuning, following the "Tuning Thresholds" section of the KintsugiHealth/dam model card.

Runs, using the official `tuning` package in models/dam and the public KintsugiHealth/dam-dataset
(model scores + PHQ-9/GAD-7 ground truth; no audio):

  A. The model card's "Tuning Sensitivity, Specificity, and Indeterminate Fraction" example,
     for depression (PHQ-9 >= 10) and anxiety (GAD-7 >= 10).
  B. The model card's "Optimal Tuning for Multi-class Tasks" example (MinAbsoluteError on GAD-7 / PHQ-9 sums).
  C. App-level tuning: MaxMacroF1 thresholds for the app's 3 depression / 4 anxiety levels, compared on the
     test split against the official thresholds in config.py.

Writes backend/thresholds_tuned.json, which the app uses for the screening result (always) and for the
levels when DAM_THRESHOLDS=tuned. Usage:  python scripts/tune_thresholds.py
"""
import datetime
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models" / "dam"
OUT = ROOT / "backend" / "thresholds_tuned.json"
os.environ.setdefault("HF_HOME", str(ROOT / "models" / ".hf_cache"))
sys.path.insert(0, str(MODEL_DIR))

import numpy as np  # noqa: E402
import torch  # noqa: E402
from datasets import load_dataset  # noqa: E402

from config import default_config  # noqa: E402  (official thresholds)
from tuning.indet_roc import BinaryLabeledScores  # noqa: E402
from tuning.optimal_ordinal import MaxMacroF1OrdinalThresholding, MinAbsoluteErrorOrdinalThresholding  # noqa: E402

COLS = ["phq", "gad", "scores_depression", "scores_anxiety", "quantized_labels_depression", "quantized_labels_anxiety"]
INDET_BUDGET = 0.2


def f(x):
    return float(np.asarray(x).ravel()[0])


def load(fmt):
    """Load both splits as plain numpy arrays or torch tensors (datasets 4.x returns lazy Column objects)."""
    out = {}
    for name, split in (("val", "validation"), ("test", "test")):
        ds = load_dataset("KintsugiHealth/dam-dataset", split=split)
        cols = {c: np.asarray(ds[c]) for c in COLS}
        out[name] = cols if fmt == "numpy" else {c: torch.from_numpy(a) for c, a in cols.items()}
    return out


def macro_f1_and_acc(labels, preds, n):
    labels, preds = np.asarray(labels), np.asarray(preds)
    f1s = []
    for c in range(n):
        tp = np.sum((preds == c) & (labels == c))
        fp = np.sum((preds == c) & (labels != c))
        fn = np.sum((preds != c) & (labels == c))
        f1s.append(2 * tp / max(2 * tp + fp + fn, 1))
    return {"macro_f1": round(float(np.mean(f1s)), 4), "accuracy": round(float(np.mean(labels == preds)), 4)}


# ---------------------------------------------------------------- A. indeterminate ROC (binary screening)
def screening(data, task, label_col, cutoff):
    print(f"\n=== A. {task}: {label_col.upper()} >= {cutoff}, {int(INDET_BUDGET * 100)}% indeterminate budget ===")
    scores_labeled = {
        k: BinaryLabeledScores(y_score=v[f"scores_{task}"], y_true=(v[label_col] >= cutoff).astype(int))
        for k, v in data.items()
    }
    issa = scores_labeled["val"].indet_sn_sp_array()
    roc = issa.roc_curve(INDET_BUDGET)
    print(f"Area under the ROC curve with 20% indeterminate budget: {roc.auc():.1%}")
    pt = roc.sn_eq_sp()
    lo, hi = f(pt.lower_thresh), f(pt.upper_thresh)
    print(f"Thresholds balancing sensitivity and specificity on val: lower={lo:.3}, upper={hi:.3}")
    print(f"Val:  sensitivity={f(pt.sn):.1%}, specificity={f(pt.sp):.1%}, indeterminate={f(pt.indet_frac):.1%}")
    t = pt.eval(**scores_labeled["test"]._asdict())
    print(f"Test: sensitivity={f(t.sn):.1%}, specificity={f(t.sp):.1%}, indeterminate={f(t.indet_frac):.1%}")
    constrained = issa[(issa.sn >= 0.8) & (issa.indet_frac <= 0.35)]
    if constrained.sp.size:
        opt = constrained[np.argmax(constrained.sp)]
        print(f"Highest specificity with sensitivity >= 80% and 35% indeterminate budget: {f(opt.sp):.1%} "
              f"at thresholds {f(opt.lower_thresh):.3}, {f(opt.upper_thresh):.3}")
    issa.sn_eq_sp_graph()  # as in the model card (balanced Sn=Sp as a function of indeterminate fraction)
    return {
        "label": f"{'PHQ-9' if label_col == 'phq' else 'GAD-7'} >= {cutoff}",
        "lower": lo, "upper": hi, "indet_budget": INDET_BUDGET,
        "auc_at_budget": round(float(roc.auc()), 4),
        "val": {"sensitivity": round(f(pt.sn), 4), "specificity": round(f(pt.sp), 4), "indeterminate": round(f(pt.indet_frac), 4)},
        "test": {"sensitivity": round(f(t.sn), 4), "specificity": round(f(t.sp), 4), "indeterminate": round(f(t.indet_frac), 4)},
    }


# ---------------------------------------------------------------- B. model card multi-class example
def card_ordinal_example(data, task, label_col):
    print(f"\n=== B. Model card example: MinAbsoluteError thresholds predicting {label_col.upper()} sum from {task} score ===")
    val, test = data["val"], data["test"]
    scores, labels = val[f"scores_{task}"], val[label_col].long()
    opt = MinAbsoluteErrorOrdinalThresholding(num_classes=int(labels.max()) + 1)
    best_cost, best_const = opt.best_constant_output_classifier(labels)
    print(f"Always predicting sum = {best_const} gives val mean absolute error {best_cost:.3}.")
    mean_error = opt.tune_thresholds(labels=labels, scores=scores)
    print(f"Val mean absolute error with tuned thresholds: {mean_error:.3}")
    preds = opt(test[f"scores_{task}"])
    print(f"Test mean absolute error with tuned thresholds: {opt.mean_cost(labels=test[label_col].long(), preds=preds):.3}")


# ---------------------------------------------------------------- C. app levels (MaxMacroF1)
def app_levels(data, task):
    print(f"\n=== C. App levels for {task}: MaxMacroF1 on quantized labels ===")
    val, test = data["val"], data["test"]
    labels = val[f"quantized_labels_{task}"].long()
    n = len(default_config["inference_thresholds"][task]) + 1
    opt = MaxMacroF1OrdinalThresholding(num_classes=n)
    opt.tune_thresholds(labels=labels, scores=val[f"scores_{task}"])
    tuned = [round(float(x), 4) for x in opt.thresholds]
    official = default_config["inference_thresholds"][task]
    t_scores, t_labels = test[f"scores_{task}"], test[f"quantized_labels_{task}"].long()
    tuned_m = macro_f1_and_acc(t_labels, torch.searchsorted(opt.thresholds, t_scores), n)
    off_m = macro_f1_and_acc(t_labels, torch.searchsorted(torch.tensor(official, dtype=t_scores.dtype), t_scores), n)
    print(f"Official thresholds {official}: test {off_m}")
    print(f"Tuned thresholds    {tuned}: test {tuned_m}")
    return {"thresholds": tuned, "method": "MaxMacroF1OrdinalThresholding (val)", "test": tuned_m,
            "official_thresholds": official, "official_test": off_m}


def main():
    np_data = load("numpy")
    result = {
        "created": datetime.date.today().isoformat(),
        "source": "KintsugiHealth/dam-dataset (validation for tuning, test for evaluation) + models/dam/tuning",
        "screening": {
            "depression": screening(np_data, "depression", "phq", 10),
            "anxiety": screening(np_data, "anxiety", "gad", 10),
        },
    }
    t_data = load("torch")
    card_ordinal_example(t_data, "anxiety", "gad")
    card_ordinal_example(t_data, "depression", "phq")
    result["levels"] = {"depression": app_levels(t_data, "depression"), "anxiety": app_levels(t_data, "anxiety")}
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\nSaved {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
