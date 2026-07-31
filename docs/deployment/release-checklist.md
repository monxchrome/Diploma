# Release checklist

1. Review the production environment file and create or rotate every external Docker secret, including Stripe secrets when billing is enabled.
2. Run `scripts/production/migrate.sh .env.production`, then `scripts/production/deploy.sh .env.production`.
3. Run `scripts/production/verify.sh .env.production` and confirm `/api/health/ready` is ready through the public domain.
4. Send one signed fake event or a Stripe test event and confirm that the stored subscription and usage screens update without exposing provider payloads.
5. Record the deployed image digest, commit SHA, timestamp, backup location, and rollback image in the release log.
