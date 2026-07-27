# ADR 0007: Project Authorization

## Status

Accepted

## Decision

Use `ProjectMember` rows for project-level authorization. Each project has an owner user and at least one member row with `OWNER`. Role permissions are:

- `OWNER`: view, update, archive, restore, view members
- `EDITOR`: view, update, view members
- `VIEWER`: view and view members

The API checks membership through `ProjectAccessGuard` and performs operation-specific role checks in the projects service.

## Consequences

- Foreign projects return not found instead of forbidden to avoid unnecessary disclosure.
- Project creation must create the project and owner membership in one transaction.
- Invitations and email workflows are intentionally left for a later phase.
- Hard delete is not supported in Phase 2; delete routes perform soft archive.
