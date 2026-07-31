# Production reference deployment

The reference deployment targets one Ubuntu VM and Docker Compose. Only Caddy publishes ports `80` and `443`; PostgreSQL, Redis, Qdrant, MinIO, Ollama, FastAPI, API, and workers have no host ports.

1. Copy `.env.production.example` to an ignored `.env.production` and set non-secret deployment values.
2. Create external Docker secrets named in `docker-compose.prod.yml` (`jwt_access_secret`, `refresh_token_pepper`, `ingestion_internal_secret`, `billing_fake_webhook_secret`, MinIO credentials, and provider keys when used).
3. Point DNS for `APP_DOMAIN` to the VM and allow inbound TCP 80/443 only.
4. Run `scripts/production/deploy.sh .env.production`.

Caddy obtains and renews certificates automatically, redirects HTTP to HTTPS, and forwards `/api/*` to NestJS. The application trusts exactly one proxy in this topology. Use `scripts/production/verify.sh` after each release.

The `migrate` Compose profile is the sole production migration path. Migrations are forward-compatible: application rollback may use the previous image only when it remains compatible with the schema. Database schema rollback is never automatic.
