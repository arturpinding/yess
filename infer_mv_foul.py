"""Run the published SoccerNet VARS model headlessly on one action directory."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch
from torchvision.io import read_video
from torchvision.models.video import MViT_V2_S_Weights


PROJECT_ROOT = Path(__file__).resolve().parent
INTERFACE_ROOT = PROJECT_ROOT / "vendor" / "sn-mvfoul" / "VARS interface"
sys.path.insert(0, str(INTERFACE_ROOT))

from interface.model import MVNetwork  # noqa: E402


OFFENCE_LABELS = [
    "no_offence",
    "foul_no_card",
    "yellow",
    "red",
]
ACTION_LABELS = [
    "tackling",
    "standing_tackling",
    "high_leg",
    "holding",
    "pushing",
    "elbowing",
    "challenge",
    "dive",
]


def official_annotation(action_dir: Path) -> tuple[str | None, str | None]:
    annotations_path = action_dir.parent / "annotations.json"
    if not annotations_path.exists():
        return None, None
    action_index = action_dir.name.rsplit("_", 1)[-1]
    annotations = json.loads(annotations_path.read_text(encoding="utf-8"))
    record = annotations["Actions"].get(action_index)
    if record is None:
        return None, None
    if record["Offence"].lower() == "no offence":
        decision = "no_offence"
    else:
        decision = {"1.0": "foul_no_card", "3.0": "yellow", "5.0": "red"}.get(
            record["Severity"]
        )
    return decision, record["Action class"]


def sample_view(path: Path) -> torch.Tensor:
    video, _, _ = read_video(str(path), output_format="THWC")
    frames = video[65:85]
    if len(frames) < 20:
        raise ValueError(f"{path} has only {len(video)} frames; at least 85 are required")

    factor = (85 - 65) / (((85 - 65) / 25) * 21)
    chosen = [frames[index] for index in range(len(frames)) if index % factor < 1]
    sampled = torch.stack(chosen).permute(0, 3, 1, 2)
    transform = MViT_V2_S_Weights.KINETICS400_V1.transforms()
    return transform(sampled)


def load_model(weights_path: Path) -> torch.nn.Module:
    model = MVNetwork(net_name="mvit_v2_s", agr_type="attention")
    checkpoint = torch.load(weights_path, map_location=torch.device("cpu"))
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()
    return model


def predict(
    action_dir: Path, weights_path: Path, maximum_views: int = 2,
    model: torch.nn.Module | None = None,
) -> dict:
    clip_paths = sorted(action_dir.glob("clip_*.mp4"))[:maximum_views]
    if not clip_paths:
        raise FileNotFoundError(f"No clip_*.mp4 files found in {action_dir}")

    views = torch.stack([sample_view(path) for path in clip_paths]).unsqueeze(0)
    model = model or load_model(weights_path)

    with torch.inference_mode():
        offence_logits, action_logits, _ = model(views)
        offence_probabilities = torch.softmax(offence_logits.reshape(1, -1), dim=1)[0]
        action_probabilities = torch.softmax(action_logits.reshape(1, -1), dim=1)[0]

    offence_index = int(offence_probabilities.argmax())
    action_index = int(action_probabilities.argmax())
    official_decision, official_action = official_annotation(action_dir)
    return {
        "incident_id": f"SN_{action_dir.parent.name.upper()}_{action_dir.name.upper()}",
        "official_decision": official_decision,
        "official_action": official_action,
        "model_prediction": OFFENCE_LABELS[offence_index],
        "action_prediction": ACTION_LABELS[action_index],
        "probabilities": {
            label: round(float(probability), 6)
            for label, probability in zip(OFFENCE_LABELS, offence_probabilities)
        },
        "action_probabilities": {
            label: round(float(probability), 6)
            for label, probability in zip(ACTION_LABELS, action_probabilities)
        },
        "confidence": round(float(offence_probabilities[offence_index]), 6),
        "accepted": bool(offence_probabilities[offence_index] >= 0.80),
        "data_origin": "Official sample bundled with SoccerNet sn-mvfoul",
        "views": [str(path) for path in clip_paths],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--action-dir",
        type=Path,
        default=Path("data/mvfoul/Test/action_0"),
    )
    parser.add_argument(
        "--weights",
        type=Path,
        default=Path(
            "vendor/sn-mvfoul/VARS interface/interface/14_model.pth.tar"
        ),
    )
    parser.add_argument("--output", type=Path, default=Path("outputs/real_inference.json"))
    parser.add_argument("--maximum-views", type=int, default=2)
    args = parser.parse_args()

    result = predict(args.action_dir, args.weights, args.maximum_views)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
