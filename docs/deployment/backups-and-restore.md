# Backups and restore

`scripts/production/backup.sh` creates timestamped PostgreSQL, MinIO, and Qdrant artifacts plus SHA-256 checksums and a non-secret manifest. Store artifacts outside the VM in encrypted storage; never commit them. Retention is controlled by `BACKUP_RETENTION_DAYS`.

Target RPO is the backup interval (24 hours unless operators schedule more frequent runs). Target RTO is the time to provision a replacement VM, restore PostgreSQL, MinIO and Qdrant, apply any forward migrations, and pass readiness checks.

Restore is manual and requires `CONFIRM_RESTORE=yes`. Stop API and workers, verify checksums, restore PostgreSQL first, then object data and Qdrant, start services, run migration only when explicitly required by the runbook, and verify readiness. Log the restore through the operational audit procedure. Synthetic-data restore smoke tests must use an isolated non-production stack.
