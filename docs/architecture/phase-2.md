# Phase 2 Architecture

## Scope

Phase 2 adds identity, access, sessions, profile management, and project management. It does not add document ingestion, MinIO workflows, Qdrant retrieval, RAG, LLM providers, agents, web search, billing, or subscriptions.

## Runtime Flow

```text
Browser
  -> Next.js application pages
  -> NestJS /api/auth, /api/users, /api/projects
  -> PostgreSQL through Prisma
```

The Phase 1 status path remains available. The FastAPI AI service does not receive authorization data or new Phase 2 endpoints.

## Authentication

Passwords are hashed with Argon2id. Access tokens are short-lived HMAC-signed JWTs returned in response bodies and held only in frontend memory. Refresh tokens are random opaque values stored only in an HttpOnly cookie; PostgreSQL stores only HMAC-SHA256 refresh token hashes with a pepper.

Refresh calls rotate the stored hash and cookie value. A reused old refresh token is detected through the session id embedded in the opaque token and revokes the session family. Logout revokes the current cookie session idempotently, and logout-all revokes all active sessions for the user.

Cookie settings are environment controlled. Production rejects insecure cookie configuration and placeholder secrets during startup validation.

## Data Model

Phase 2 adds:

- `User`
- `AuthSession`
- `Project`
- `ProjectMember`
- `AuditLog`
- `GlobalRole`
- `UserStatus`
- `ProjectMemberRole`

Project creation creates `Project` and the owner's `ProjectMember` row in a single Prisma transaction.

## Authorization

NestJS guards enforce access tokens and project membership. Missing or foreign projects return not found so the API does not disclose whether a project exists. Project roles are:

- `OWNER`: view, update, archive, restore
- `EDITOR`: view and update
- `VIEWER`: view only

## Frontend

The web app adds `/login`, `/register`, `/dashboard`, `/projects`, `/projects/new`, `/projects/[projectId]`, `/settings/profile`, and `/settings/sessions`.

The `AuthProvider` performs an initial refresh, stores access tokens only in memory, sends `credentials: "include"`, and performs one refresh-and-retry after a 401. Tokens are not written to `localStorage`, `sessionStorage`, IndexedDB, or persisted Zustand state.

## Contracts

TypeScript Zod contracts now include safe user, auth, session, project, member, and pagination DTOs. Python schemas remain limited to the Phase 1 AI service boundary because the AI service does not exchange Phase 2 auth/project messages.
