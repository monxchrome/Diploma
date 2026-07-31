# Production hardening

Caddy is the only internet-facing service and terminates modern TLS. NestJS sets a strict CORS allowlist, Helmet CSP/HSTS/security headers, trusted proxy count, request body limits, Redis-backed route policies, secure HttpOnly refresh cookies, and optional same-origin CSRF protection for cookie-only refresh/logout paths.

Containers run non-root with dropped capabilities, `no-new-privileges`, explicit writable volumes or tmpfs, health checks, resource limits, and no exposed internal ports. Runtime configuration rejects production placeholders and reports only configuration presence/provider/version—not secret values.

Rotate JWT and refresh secrets by accepting a maintenance window that invalidates sessions, rotate the internal service secret in both API and FastAPI together, rotate MinIO credentials and redeploy dependent services, rotate Stripe webhook signing secrets after endpoint updates, and rotate research keys at the provider before the old key is revoked. Validate readiness after each rotation.
