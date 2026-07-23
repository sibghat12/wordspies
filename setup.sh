#!/usr/bin/env bash
# WordSpies server setup — Ubuntu 24.04. Installs Node, Redis, Caddy, the app,
# and wires everything as always-on services. Safe to re-run (idempotent).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DOMAIN="wordspies.co.uk"
APP_DIR="/opt/wordspies"
REPO="https://github.com/sibghat12/wordspies.git"

echo "==> apt update + base packages"
apt-get update -y
apt-get install -y curl git ufw

echo "==> Node.js 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Redis"
apt-get install -y redis-server
systemctl enable --now redis-server

echo "==> Caddy (auto-HTTPS reverse proxy)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> App code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
npm install --omit=dev

echo "==> systemd service (always-on, auto-restart)"
cat >/etc/systemd/system/wordspies.service <<UNIT
[Unit]
Description=WordSpies game server
After=network.target redis-server.service
[Service]
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Environment=REDIS_URL=redis://127.0.0.1:6379
Restart=always
RestartSec=3
User=root
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now wordspies
systemctl restart wordspies

echo "==> Caddy config for $DOMAIN"
cat >/etc/caddy/Caddyfile <<CADDY
$DOMAIN, www.$DOMAIN {
	encode gzip zstd
	reverse_proxy localhost:3000
}
CADDY
systemctl reload caddy || systemctl restart caddy

echo "==> firewall (allow SSH, HTTP, HTTPS, and :3000 for pre-DNS testing)"
ufw allow OpenSSH || true
ufw allow 80,443,3000/tcp || true
ufw --force enable || true

echo "==> DONE. Test now at http://\$(curl -s ifconfig.me):3000  (before DNS cutover)"
