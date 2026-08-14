"""Smoke-evaluate the five labelled examples bundled with SoccerNet."""

from __future__ import annotations

import json
from pathlib import Path

from infer_mv_foul import load_model, predict


WEIGHTS = Path("vendor/sn-mvfoul/VARS interface/interface/14_model.pth.tar")
DATASET = Path("vendor/sn-mvfoul/VARS interface/dataset")
OUTPUT = Path("outputs/bundled_sample_evaluation.json")


def main() -> None:
    model = load_model(WEIGHTS)
    results = [
        predict(action_dir, WEIGHTS, maximum_views=2, model=model)
        for action_dir in sorted(DATASET.glob("action_*"))
    ]
    exact_matches = sum(
        result["official_decision"] == result["model_prediction"] for result in results
    )
    accepted = [result for result in results if result["accepted"]]
    accepted_matches = sum(
        result["official_decision"] == result["model_prediction"] for result in accepted
    )
    report = {
        "scope": "Five labelled examples bundled with the interface; smoke check only",
        "examples": len(results),
        "top_class_exact_matches": exact_matches,
        "top_class_accuracy": exact_matches / len(results),
        "accepted_at_0_80": len(accepted),
        "accepted_accuracy": accepted_matches / len(accepted) if accepted else None,
        "results": results,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
