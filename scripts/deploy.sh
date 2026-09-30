#!/usr/bin/env bash
# Pull the latest code from GitHub, rebuild, and restart under pm2.
# Usage (from anywhere):  /var/www/CTOApplication/cto-app/scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env - copy .env.example to .env and fill it in first." >&2
  exit 1
fi

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Installing dependencies"
npm ci --no-audit --no-fund

echo "==> Building"
npm run build

echo "==> Restarting"
if pm2 describe cto-app > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo "==> Done. Logs: pm2 logs cto-app"
