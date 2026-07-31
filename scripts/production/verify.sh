#!/usr/bin/env sh
set -eu

ENV_FILE=${1:-.env.production}
set -a
. "$ENV_FILE"
set +a

test -n "${APP_BASE_URL:-}"
curl --fail --silent --show-error "$APP_BASE_URL/api/health/live" >/dev/null
curl --fail --silent --show-error "$APP_BASE_URL/api/health/ready" >/dev/null
curl --fail --silent --show-error "$APP_BASE_URL/api/health/billing" >/dev/null
