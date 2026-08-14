"""Download the official public SoccerNet MV-Fouls archives."""

from huggingface_hub import snapshot_download


snapshot_download(
    repo_id="SoccerNet/SN-MVFouls-2024",
    repo_type="dataset",
    local_dir="data/mvfoul",
    allow_patterns=["train.zip", "valid.zip", "test.zip"],
)
