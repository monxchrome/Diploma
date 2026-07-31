#!/usr/bin/env sh
set -eu

ENV_FILE=${1:-.env.production}
COMPOSE="docker compose --env-file $ENV_FILE -f docker-compose.prod.yml"

test -f "$ENV_FILE"
$COMPOSE config --quiet
$COMPOSE --profile operations run --rm migrate
$COMPOSE up -d --build --remove-orphans
"$(dirname "$0")/verify.sh" "$ENV_FILE"
