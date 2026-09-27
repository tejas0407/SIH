"""Publish this repo to a Hugging Face Docker Space.

A Space expects its Dockerfile and a README.md with Space metadata at the
repo root, which would clash with this repo's own README, so the Space is
built from a staging copy instead: every git-tracked file, plus
docker/hf/Dockerfile promoted to ./Dockerfile and docker/hf/SPACE_README.md
promoted to ./README.md.

One-time setup:
    pip install huggingface_hub
    hf auth login          # paste a *write* token from huggingface.co/settings/tokens

Then:
    python scripts/deploy_hf_space.py <hf-username>/<space-name>
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]


def stage(dest: Path) -> None:
    tracked = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    ).stdout.decode().split("\0")
    for rel in filter(None, tracked):
        src = ROOT / rel
        if src.is_file():
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, target)
    shutil.copy2(ROOT / "docker/hf/Dockerfile", dest / "Dockerfile")
    shutil.copy2(ROOT / "docker/hf/SPACE_README.md", dest / "README.md")


def main() -> None:
    if len(sys.argv) != 2 or "/" not in sys.argv[1]:
        sys.exit("usage: python scripts/deploy_hf_space.py <hf-username>/<space-name>")
    repo_id = sys.argv[1]

    api = HfApi()
    api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        stage(Path(tmp))
        api.upload_folder(
            repo_id=repo_id,
            repo_type="space",
            folder_path=tmp,
            commit_message="Deploy from GitHub main",
            delete_patterns="*",  # drop files that no longer exist in the repo
        )

    owner, name = repo_id.split("/")
    print(f"Uploaded. Build logs: https://huggingface.co/spaces/{repo_id}")
    print(f"App URL once built:  https://{owner}-{name}.hf.space".lower().replace("_", "-"))


if __name__ == "__main__":
    main()
