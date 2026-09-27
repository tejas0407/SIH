#!/usr/bin/env bash
# Container entrypoint: prepares the data
# directories, initialises Postgres on first boot, then hands off to supervisord.
set -euo pipefail

mkdir -p "$DATA_DIR/redis" "$DATA_DIR/minio" /tmp/nginx

# A restarted container keeps /tmp and the data volume, so lock and pid files
# from the previous run are still there; nothing is running yet, so they are
# all stale, and Postgres refuses to start while they exist.
rm -f /tmp/.s.PGSQL.* /tmp/supervisord.pid /tmp/nginx.pid "$DATA_DIR/pg/postmaster.pid"

# PUBLIC_HOST is the host name the site is served on (e.g. "1-2-3-4.sslip.io").
# Presigned scan URLs must be signed against it so the reviewer's browser can
# open them.
if [[ -z "${PUBLIC_HOST:-}" ]]; then
  echo "PUBLIC_HOST is not set; scan images will only load from localhost:7860" >&2
  PUBLIC_HOST=localhost:7860
fi
export MINIO_PUBLIC_ENDPOINT="$PUBLIC_HOST"
# Plain HTTP when testing the image locally.
if [[ -n "${LOCAL_HTTP:-}" ]]; then
  export MINIO_PUBLIC_SECURE=false
fi

# Fallback secrets for a throwaway run. Set both explicitly for any deployment
# with a persistent data volume (deploy/oracle/setup.sh does): a salt that
# changes between boots no longer matches the hashes already stored.
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-$(python -c 'import secrets;print(secrets.token_hex(32))')}"
export AADHAAR_HASH_SALT="${AADHAAR_HASH_SALT:-$(python -c 'import secrets;print(secrets.token_hex(32))')}"

if [[ ! -s "$DATA_DIR/pg/PG_VERSION" ]]; then
  pwfile=$(mktemp)
  printf '%s' "$POSTGRES_PASSWORD" > "$pwfile"
  initdb -D "$DATA_DIR/pg" -U "$POSTGRES_USER" --pwfile="$pwfile" \
    --auth-local=trust --auth-host=scram-sha-256 --encoding=UTF8 >/dev/null
  rm -f "$pwfile"
fi

exec supervisord -c /opt/app/supervisord.conf
