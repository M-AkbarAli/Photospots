#!/usr/bin/env bash
set -euo pipefail

# Load environment variables from .env if present
if [ -f ".env" ]; then
  # Portable way to export variables from .env (works on macOS / Linux)
  set -o allexport
  # shellcheck disable=SC1091
  . .env
  set +o allexport
fi

echo "⏳ Starting Postgres + Redis via docker-compose..."
docker-compose up -d

echo "⏳ Waiting 5s for services to initialize..."
sleep 5

echo "🚀 Running Spring Boot (mvn spring-boot:run). Press Ctrl+C to stop."
mvn spring-boot:run
