# ADR 0005: Authentication Strategy

## Status

Accepted

## Decision

Use first-party email/password authentication for Phase 2. Passwords are hashed with Argon2id. The API issues a short-lived JWT access token and an opaque refresh token. The access token is returned to the web app and held only in memory. The refresh token is set only as an HttpOnly cookie.

Refresh tokens are never stored directly. The database stores an HMAC-SHA256 hash of the full opaque token using `REFRESH_TOKEN_PEPPER`.

## Consequences

- Browser storage is not part of the token trust boundary.
- Cross-origin local development requires `credentials: "include"` and CORS credentials.
- Production requires non-placeholder JWT and refresh pepper values.
- OAuth, email verification, password changes, and account recovery remain out of scope for Phase 2.
