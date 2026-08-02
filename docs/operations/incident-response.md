# Incident Response Runbook

1. Declare the incident, assign a coordinator, and preserve timestamps, release version, request IDs, and safe logs.
2. Assess user impact and whether to disable an already server-owned capability through an approved configuration change; do not expose keys, reports, or raw prompts in incident channels.
3. For availability failure, inspect `/api/health/*`, AI health, database, Redis, Qdrant, MinIO, and worker state. For suspected leakage, revoke affected sessions/share links and rotate the affected secret through the deployment secret process.
4. For bad application deployment, use the previous schema-compatible image as described in [rollback](../deployment/rollback.md). Never auto-reverse Prisma migrations.
5. For data loss, restore into a controlled recovery environment first, validate checksums and synthetic flow, then obtain explicit approval before touching production.
6. Record actions, scope, evidence, recovery time, follow-up owner, and a redacted post-incident review.

No incident drill was executed for this release candidate.
