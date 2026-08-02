# Backup, Restore, and Recovery Runbook

Use the existing `scripts/production/backup.sh` and `scripts/production/restore.sh` only on an operator-approved target. The scripts use production Compose, create/check SHA-256 checksums, and the restore script requires `CONFIRM_RESTORE=yes` because it replaces database, object, and Qdrant data.

## Backup

1. Confirm the target environment and free storage; never write archives into the repository.
2. Run `scripts/production/backup.sh .env.production`.
3. Verify the generated `SHA256SUMS`, encrypt and copy the archive to approved off-host storage, and record its timestamp and checksum.
4. Confirm PostgreSQL dump, MinIO archive, Qdrant archive, and manifest are present. Redis is not treated as the source of record for persistent business data; queues are recovered from durable database state and idempotency controls.

## Restore drill

1. Use a disposable isolated stack populated only with synthetic data.
2. Review the exact backup directory and run `sha256sum --check SHA256SUMS`.
3. Set `CONFIRM_RESTORE=yes`, execute the restore script, and run `scripts/production/verify.sh`.
4. Check a synthetic project, its object, vector collection, completed/failed jobs, and duplicate-prevention behavior after worker restart.
5. Record the actual RTO/RPO observation; do not substitute targets for measurements.

The restore drill was **not executed** in this release-preparation audit. The database schema is forward-only: do not attempt an automatic Prisma migration rollback. See [deployment rollback](../deployment/rollback.md).
