# Dependency Audit

Status: **PARTIALLY EXECUTED on 2026-08-02.** `pnpm audit --prod` was run against the final updated `pnpm-lock.yaml`; it reported no known JavaScript vulnerabilities after the targeted override remediation. `pip-audit --local` was run against the AI-service virtual environment and reported no known Python vulnerabilities. Container/base-image CVE scanning was not run because no approved scanner/image digest was available.

## Remediated JavaScript findings

The initial `pnpm audit --prod` found five HIGH and two MODERATE findings. The following lockfile-resolved, advisory-specific overrides were added in `pnpm-workspace.yaml`, then the frozen install, package tree, and audit were re-run:

| Package       | Initial affected path                  | Resolution | Exploitability / mitigation                                                                                               |
| ------------- | -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `sharp`       | `apps/web → next`                      | `0.35.0`   | HIGH libvips issues; overridden to the advisory minimum patched version.                                                  |
| `postcss`     | `apps/web → next`                      | `8.5.18`   | HIGH source-map file disclosure/path traversal and MODERATE XSS advisories; one patched version deduplicated in the tree. |
| `find-my-way` | Prisma transitive path in API          | `9.7.0`    | HIGH HTTP/2 DoS issue; `9.6.1` did not exist in the registry, so the available same-major `9.7.0` was selected.           |
| `js-yaml`     | `@nestjs/swagger`                      | `5.2.2`    | HIGH exponential parsing issue; overridden to the advisory minimum patched version.                                       |
| `valibot`     | Prisma and `@hookform/resolvers` paths | `1.4.2`    | MODERATE inherited-property issue; overridden to the advisory minimum patched version.                                    |

The dependency-resolution changes are intentionally narrow; no broad framework upgrade was performed. `pnpm why` confirmed the patched resolved versions. Retest the application and scan the final container images before release.

Required release evidence:

```bash
pnpm audit --prod
cd apps/ai-service && uv export --locked --format requirements-txt
docker scout cves --only-severity critical,high <final-image> # if Docker Scout is available
```

Assess production container base images by immutable digest after the build, not only their source tags. The source audit must also check duplicate critical dependencies and deprecated packages. The final release artifact still needs an SBOM and container scan; see [SBOM status](sbom-status.md).
