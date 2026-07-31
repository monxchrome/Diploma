#!/usr/bin/env sh
set -eu

ENV_FILE=${1:-.env.production}
test -f "$ENV_FILE"
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml --profile operations run --rm migrate
