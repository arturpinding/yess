"""Create deterministic fictional data for the hackathon demonstration."""

from __future__ import annotations

import csv
import json
import random
from pathlib import Path


LABELS = ["no_offence", "foul_no_card", "yellow", "red"]
TEAMS = ["Blue", "Red", "Green", "Gold", "Black", "White"]
REFEREES = [f"R{i:02d}" for i in range(1, 9)]


def _normal_incident(rng: random.Random, referee: str, number: int) -> dict:
    offending, opponent = rng.sample(TEAMS, 2)
    model_score = rng.choices(range(4), weights=[20, 45, 30, 5], k=1)[0]
    draw = rng.random()
    if draw < 0.76:
        official_score = model_score
    elif draw < 0.88 and model_score > 0:
        official_score = model_score - 1
    elif model_score < 3:
        official_score = model_score + 1
    else:
        official_score = model_score - 1
    confidence = rng.uniform(0.61, 0.77) if rng.random() < 0.08 else rng.uniform(0.82, 0.98)
    return {
        "incident_id": f"I{number:04d}",
        "match_id": f"M{number:04d}",
        "referee_id": referee,
        "offending_team": offending,
        "opponent_team": opponent,
        "official_decision": LABELS[official_score],
        "model_decision": LABELS[model_score],
        "model_confidence": round(confidence, 3),
        "data_origin": "synthetic",
    }


def build_rows(seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    rows: list[dict] = []
    number = 1
    for referee in REFEREES:
        if referee == "R04":
            for index in range(60):
                opponent = rng.choice([team for team in TEAMS if team != "Blue"])
                official_score = 1 if index < 20 else 3 if index < 22 else 2
                rows.append(
                    {
                        "incident_id": f"I{number:04d}",
                        "match_id": f"M{number:04d}",
                        "referee_id": referee,
                        "offending_team": "Blue",
                        "opponent_team": opponent,
                        "official_decision": LABELS[official_score],
                        "model_decision": "yellow",
                        "model_confidence": round(rng.uniform(0.90, 0.98), 3),
                        "data_origin": "synthetic",
                    }
                )
                number += 1
            other_teams = [team for team in TEAMS if team != "Blue"]
            for _ in range(60):
                row = _normal_incident(rng, referee, number)
                row["offending_team"], row["opponent_team"] = rng.sample(other_teams, 2)
                rows.append(row)
                number += 1
        else:
            for _ in range(120):
                rows.append(_normal_incident(rng, referee, number))
                number += 1
    return rows


def probabilities(prediction: str, confidence: float) -> dict[str, float]:
    remainder = (1.0 - confidence) / 3.0
    values = {label: remainder for label in LABELS}
    values[prediction] = confidence
    return {key: round(value, 4) for key, value in values.items()}


def write_demo_files(
    csv_path: Path = Path("data/demo/incidents.csv"),
    predictions_path: Path = Path("outputs/predictions.json"),
) -> None:
    rows = build_rows()
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=list(rows[0]), lineterminator="\n"
        )
        writer.writeheader()
        writer.writerows(rows)

    selected = rows[:3] + rows[360:366] + rows[-3:]
    examples = []
    for row in selected:
        confidence = float(row["model_confidence"])
        examples.append(
            {
                "incident_id": row["incident_id"],
                "official_decision": row["official_decision"],
                "model_prediction": row["model_decision"],
                "probabilities": probabilities(row["model_decision"], confidence),
                "confidence": confidence,
                "accepted": confidence >= 0.80,
                "data_origin": "synthetic",
            }
        )
    evaluation_path = predictions_path.parent / "bundled_sample_evaluation.json"
    real_inference_path = predictions_path.parent / "real_inference.json"
    if evaluation_path.exists():
        evaluation = json.loads(evaluation_path.read_text(encoding="utf-8"))
        examples = evaluation["results"] + examples
    elif real_inference_path.exists():
        examples.insert(
            0, json.loads(real_inference_path.read_text(encoding="utf-8"))
        )
    predictions_path.parent.mkdir(parents=True, exist_ok=True)
    predictions_path.write_text(json.dumps(examples, indent=2), encoding="utf-8")


if __name__ == "__main__":
    write_demo_files()
