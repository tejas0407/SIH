#!/usr/bin/env bash
#
# Creates a GitHub repository named "SIH" and pushes this project to it.
#
#   bash scripts/create_github_repo.sh              # public repo
#   bash scripts/create_github_repo.sh --private
#
# Needs the GitHub CLI, authenticated once with:  gh auth login
#
set -euo pipefail

VISIBILITY="--public"
REPO_NAME="SIH"

for arg in "$@"; do
  case "$arg" in
    --private) VISIBILITY="--private" ;;
    --public)  VISIBILITY="--public" ;;
    --name=*)  REPO_NAME="${arg#*=}" ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."

if ! command -v gh >/dev/null 2>&1; then
  cat <<'MSG'
The GitHub CLI is not installed.

  macOS          brew install gh
  Debian/Ubuntu  sudo apt install gh
  Windows        winget install GitHub.cli

Or create the repository by hand at https://github.com/new, name it SIH, then:

  git init
  git add -A
  git commit -m "SIH26018: Intelligent Land Record Digitization and Validation System"
  git branch -M main
  git remote add origin https://github.com/<your-username>/SIH.git
  git push -u origin main
MSG
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Not signed in to GitHub. Run: gh auth login"
  exit 1
fi

if [ ! -d .git ]; then
  git init -q
  git branch -M main
fi

# .env holds credentials and is gitignored; make sure that actually held.
if git check-ignore -q .env 2>/dev/null || [ ! -f .env ]; then
  :
else
  echo "Refusing to push: .env is not ignored. Check .gitignore." >&2
  exit 1
fi

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit."
else
  git commit -q -m "SIH26018: Intelligent Land Record Digitization and Validation System

Full-stack DILRMP land record pipeline: OpenCV preprocessing and layout
segmentation, dual printed/handwritten OCR, regional unit normalisation,
mathematical validation, ULPIN generation, hash-chained audit ledger, and a
dual-pane human-in-the-loop reviewer console. Runs fully offline."
fi

OWNER="$(gh api user --jq .login)"

if gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  echo "Repository $OWNER/$REPO_NAME already exists; pushing to it."
  git remote get-url origin >/dev/null 2>&1 || \
    git remote add origin "https://github.com/$OWNER/$REPO_NAME.git"
  git push -u origin main
else
  gh repo create "$REPO_NAME" $VISIBILITY --source=. --remote=origin --push \
    --description "SIH26018 — Intelligent Land Record Digitization and Validation System (DILRMP)"
fi

echo
echo "Done: https://github.com/$OWNER/$REPO_NAME"
