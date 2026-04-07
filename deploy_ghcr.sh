#!/usr/bin/env bash
# AI by zb

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

IMAGE="${OUTLOOK_MAIL_STATION_IMAGE:-ghcr.io/simple199589-maker/outlook-mail-station:latest}"
PORT="${OUTLOOK_MAIL_STATION_PORT:-8015}"
FORCE="${FORCE_DEPLOY_FILES:-0}"
ENV_FILE="$ROOT_DIR/.env"
COMPOSE_FILE="$ROOT_DIR/docker-compose.ghcr.yml"
DATA_DIR="$ROOT_DIR/data"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] docker command not found. Please install Docker first." >&2
  exit 1
fi

mkdir -p "$DATA_DIR"

ADMIN_PASSWORD="${OUTLOOK_MAIL_STATION_ADMIN_PASSWORD:-admin-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')}"
ADMIN_JWT_SECRET="${OUTLOOK_MAIL_STATION_ADMIN_JWT_SECRET:-$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')}"

if [ ! -f "$ENV_FILE" ] || [ "$FORCE" = "1" ]; then
  cat > "$ENV_FILE" <<EOF
OUTLOOK_MAIL_STATION_DB=sqlite:////app/data/outlook_mail_station.db
OUTLOOK_MAIL_STATION_ADMIN_PASSWORD=$ADMIN_PASSWORD
OUTLOOK_MAIL_STATION_ADMIN_JWT_SECRET=$ADMIN_JWT_SECRET
OUTLOOK_MAIL_STATION_OPEN_API_SYNC_COOLDOWN_SECONDS=60
OUTLOOK_MAIL_STATION_AUTO_REFRESH=10
EOF
  CREATED_ENV=1
else
  CREATED_ENV=0
fi

if [ ! -f "$COMPOSE_FILE" ] || [ "$FORCE" = "1" ]; then
  cat > "$COMPOSE_FILE" <<EOF
services:
  app:
    image: $IMAGE
    container_name: outlook-mail-station
    restart: unless-stopped
    ports:
      - "$PORT:8015"
    env_file:
      - .env
    environment:
      OUTLOOK_MAIL_STATION_DB: sqlite:////app/data/outlook_mail_station.db
    volumes:
      - ./data:/app/data
EOF
  CREATED_COMPOSE=1
else
  CREATED_COMPOSE=0
fi

echo "[INFO] Deploy root: $ROOT_DIR"
echo "[INFO] Pulling image: $IMAGE"
docker pull "$IMAGE"

echo "[INFO] Starting container..."
docker compose -f "$COMPOSE_FILE" up -d

echo "[INFO] Deployment completed."
echo "[INFO] URL: http://localhost:$PORT"
echo "[INFO] Data dir: $DATA_DIR"

if [ "$CREATED_ENV" = "1" ]; then
  echo "[INFO] Created .env with generated defaults."
  echo "[INFO] Admin password: $ADMIN_PASSWORD"
  echo "[INFO] User API Key is managed in the admin UI after deployment."
else
  echo "[INFO] Reused existing .env"
fi

if [ "$CREATED_COMPOSE" = "1" ]; then
  echo "[INFO] Created docker-compose.ghcr.yml"
else
  echo "[INFO] Reused existing docker-compose.ghcr.yml"
fi
