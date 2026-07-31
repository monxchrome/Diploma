#!/usr/bin/env sh
set -eu

ENV_FILE=${1:-.env.production}
BACKUP_DIR=${2:?Usage: restore.sh [env-file] BACKUP_DIR}
if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
  echo "Set CONFIRM_RESTORE=yes after reviewing the recovery runbook." >&2
  exit 2
fi
set -a
. "$ENV_FILE"
set +a
test -f "$BACKUP_DIR/SHA256SUMS"
(cd "$BACKUP_DIR" && sha256sum --check SHA256SUMS)
COMPOSE="docker compose --env-file $ENV_FILE -f docker-compose.prod.yml"
$COMPOSE stop api worker
cat "$BACKUP_DIR/postgres.dump" | $COMPOSE exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner
$COMPOSE exec -T qdrant sh -ec 'rm -rf /qdrant/storage/*'
cat "$BACKUP_DIR/qdrant.tar" | $COMPOSE exec -T qdrant tar -C /qdrant/storage -xf -
$COMPOSE run --rm --no-deps --entrypoint /bin/sh minio-init -ec 'rm -rf /tmp/minio-restore && mkdir -p /tmp/minio-restore; tar -C /tmp/minio-restore -xf -; mc alias set dip http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null; mc mirror --overwrite --remove /tmp/minio-restore "dip/$MINIO_BUCKET"' <"$BACKUP_DIR/minio.tar"
$COMPOSE up -d api worker
"$(dirname "$0")/verify.sh" "$ENV_FILE"
