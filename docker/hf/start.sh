#!/usr/bin/env bash
# Container entrypoint for the Hugging Face Space: prepares the data
# directories, initialises Postgres on first boot, then hands off to supervisord.
set -euo pipefail

mkdir -p "$DATA_DIR/redis" "$DATA_DIR/minio" /tmp/nginx

# Hugging Face injects SPACE_HOST (e.g. "user-space.hf.space"). Presigned scan
# URLs must be signed against that host so the reviewer's browser can open them.
if [[ -z "${SPACE_HOST:-}" ]]; then
  echo "SPACE_HOST is not set; scan images will only load from localhost:7860" >&2
  SPACE_HOST=localhost:7860
fi
export MINIO_PUBLIC_ENDPOINT="$SPACE_HOST"
# Plain HTTP when testing the image locally.
if [[ -n "${HF_LOCAL_TEST:-}" ]]; then
  export MINIO_PUBLIC_SECURE=false
fi

# Free Spaces have no persistent disk, so the session secret and hash salt only
# need to live as long as the container. Space secrets override these.
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-$(python -c 'import secrets;print(secrets.token_hex(32))')}"
export AADHAAR_HASH_SALT="${AADHAAR_HASH_SALT:-$(python -c 'import secrets;print(secrets.token_hex(32))')}"

if [[ ! -s "$DATA_DIR/pg/PG_VERSION" ]]; then
  pwfile=$(mktemp)
  printf '%s' "$POSTGRES_PASSWORD" > "$pwfile"
  initdb -D "$DATA_DIR/pg" -U "$POSTGRES_USER" --pwfile="$pwfile" \
    --auth-local=trust --auth-host=scram-sha-256 --encoding=UTF8 >/dev/null
  rm -f "$pwfile"
fi

exec supervisord -c /opt/hf/supervisord.conf
