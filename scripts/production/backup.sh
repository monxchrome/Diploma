#!/usr/bin/env sh
set -eu

ENV_FILE=${1:-.env.production}
set -a
. "$ENV_FILE"
set +a
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ROOT=${BACKUP_DIRECTORY:-/var/backups/dip}
TARGET="$ROOT/$STAMP"
COMPOSE="docker compose --env-file $ENV_FILE -f docker-compose.prod.yml"

mkdir -p "$TARGET"
$COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom >"$TARGET/postgres.dump"
$COMPOSE exec -T qdrant wget -q -O - http://localhost:6333/collections >/dev/null
$COMPOSE exec -T qdrant sh -ec 'wget -q -O /tmp/snapshot.json http://localhost:6333/collections; tar -C /qdrant/storage -cf - .' >"$TARGET/qdrant.tar"
$COMPOSE run --rm --no-deps --entrypoint /bin/sh minio-init -ec 'mc alias set dip http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null; mc mirror --overwrite "dip/$MINIO_BUCKET" /tmp/minio-backup; tar -C /tmp/minio-backup -cf - .' >"$TARGET/minio.tar"
printf '%s\n' "deployment_version=${DEPLOYMENT_VERSION:-unknown}" "created_at=$STAMP" >"$TARGET/manifest.txt"
(cd "$TARGET" && sha256sum postgres.dump qdrant.tar minio.tar manifest.txt >SHA256SUMS)
find "$ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"${BACKUP_RETENTION_DAYS:-30}" -exec rm -rf {} +
