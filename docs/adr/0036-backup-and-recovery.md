# ADR 0036: Backup and recovery

Back up PostgreSQL, MinIO, Qdrant, and non-secret deployment configuration as timestamped checksummed artifacts. Restores are explicit and manual; schema rollback is not automatic.
