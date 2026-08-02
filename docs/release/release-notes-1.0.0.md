# Release Notes — 1.0.0 (Not Released)

This is a source preparation note, not a published release announcement.

## Release-management changes

- Declared `1.0.0` consistently across workspace package metadata and the AI package.
- Added safe API `GET /api/version` and AI `GET /health/version` metadata responses. They expose version, build timestamp, commit SHA, dirty flag, environment, API/database schema versions, and feature-set version only.
- Added version consistency and static release-preflight commands.
- Added pinned Node and Python version files and image version labels supplied from `DEPLOYMENT_VERSION`.
- Added a static synthetic demo source pack and verification command.
- Added release, operations, demo, and defence documentation with explicit evidence boundaries.

## Not included

No new product workflow, provider, billing architecture, database migration, authentication scheme, model-training feature, deployment, payment, public share link, tag, commit, push, or pull request was created. The final release gate remains blocked by the issues in [known issues](known-issues.md).
