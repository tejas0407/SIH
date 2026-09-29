#!/usr/bin/env bash
# Run on any Ubuntu VM (Azure, Oracle, ...) from the repo root:  bash deploy/vm/setup.sh
#
# Installs Docker, opens ports 80/443 in the host firewall, writes the .env
# (public host + secrets, generated once and kept on re-runs) and builds and
# starts the stack. Safe to re-run after pulling new code.
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# Some images (Oracle's Ubuntu, for one) ship an iptables REJECT rule ahead of
# everything but SSH, so opening the ports in the cloud firewall alone is not
# enough. Insert the ACCEPT at the top of INPUT: that works whether or not such
# a rule exists (a fixed position fails on images with a short or empty chain).
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
  fi
done
if command -v netfilter-persistent >/dev/null; then
  sudo netfilter-persistent save >/dev/null
fi

if [[ ! -f .env ]]; then
  ip=$(curl -fsS https://api.ipify.org)
  # sslip.io resolves <a-b-c-d>.sslip.io to a.b.c.d, which gives Caddy a real
  # hostname to get a certificate for without owning a domain.
  cat > .env <<EOF
PUBLIC_HOST=${PUBLIC_HOST:-${ip//./-}.sslip.io}
JWT_SECRET_KEY=$(openssl rand -hex 32)
AADHAAR_HASH_SALT=$(openssl rand -hex 32)
EOF
  chmod 600 .env
fi

# Keys added after the first release are appended to an existing .env, so
# re-running this on an older deployment upgrades it without touching the rest.
add_if_missing() { grep -q "^$1=" .env || echo "$1=$2" >> .env; }
# Object-store keys live here (not generated per boot) so that commands run
# with `docker exec` — such as the nightly demo reset — can reach the store.
add_if_missing MINIO_ROOT_USER "app$(openssl rand -hex 8)"
add_if_missing MINIO_ROOT_PASSWORD "$(openssl rand -hex 24)"
# Public sandbox: put the three demo records back every night. Set to 0 for a
# deployment that holds real records.
add_if_missing DEMO_NIGHTLY_RESET 1

sudo docker compose up -d --build

if grep -q '^DEMO_NIGHTLY_RESET=1' .env; then
  # 20:30 UTC = 02:00 IST.
  job="docker exec bhu-validate-app-1 python -m app.seed.reset_demo"
  echo "30 20 * * * root $job >> /var/log/bhu-validate-reset.log 2>&1" \
    | sudo tee /etc/cron.d/bhu-validate-reset >/dev/null
  echo "Nightly demo reset scheduled for 02:00 IST."
else
  sudo rm -f /etc/cron.d/bhu-validate-reset
fi

host=$(grep '^PUBLIC_HOST=' .env | cut -d= -f2)
echo
echo "Started. First boot seeds the demo data (about a minute after the build)."
echo "App: https://${host}"
