# Rollback and disaster recovery

For a failed readiness check, stop only the new web/API/worker images and redeploy the previous compatible image tag. Do not reverse a Prisma migration automatically. If an incompatible database migration has already run, use the documented forward fix or restore a verified backup into a controlled recovery environment.

Disaster recovery order: provision VM and network, restore Docker secrets, restore PostgreSQL, MinIO, and Qdrant, deploy the compatible release, run controlled migrations if needed, verify `/api/health/live`, `/ready`, and `/billing`, then validate a synthetic authenticated flow. Record deployment and restore events without secrets.
