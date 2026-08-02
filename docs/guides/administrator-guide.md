# Administrator Guide

Administrators control deployment configuration, model profile eligibility, billing/provider secrets, quotas, and release approval. They must keep secrets outside Git, review `docs/release/release-readiness-audit.md`, and stop release when BLOCKER or CRITICAL findings are open.

Before production: create external Docker secrets, set HTTPS origins/cookie domain, set exact `DEPLOYMENT_VERSION`, commit SHA, UTC build timestamp, and `DEPLOYMENT_DIRTY=false`; run the release preflight and Compose validation; rehearse migrations and restore with synthetic data. Fake billing, demo accounts, and unapproved remote Ollama hosts are prohibited in production.

After deployment: check `/api/version`, liveness/readiness/billing health, logs for redaction, backups, and alert routing. Use the incident and rollback guides for failures. Do not create a public share link, real payment, or provider call merely to satisfy a documentation checklist.
