# License Inventory

Status: **GENERATED FOR REVIEW on 2026-08-02.** `pnpm licenses list --prod` produced the JavaScript report, and `pip-licenses --python .venv\\Scripts\\python.exe --format=markdown --with-urls` produced the AI-service report. The commands used the installed lockfile-resolved dependency trees; their full terminal output is not committed because it is regenerated from the locks.

The observed JavaScript licenses include MIT, Apache-2.0, BSD variants, ISC, MPL-2.0, 0BSD, CC0-1.0, Unlicense, and Python-2.0. The report includes `@img/sharp-win32-x64` under `Apache-2.0 AND LGPL-3.0-or-later`; this and all non-MIT/Apache/BSD terms require legal review appropriate to the distribution model. The Python report includes MIT, Apache-2.0, BSD variants, MPL-2.0, and PSF-2.0 dependencies. Some metadata URLs were reported as `UNKNOWN`; review those packages directly before release.

Before release, attach the generated JavaScript/Python reports to the release artifact, record tool versions, lockfile hashes, and exceptions, and include container base-image licenses separately. Review copyleft, unknown, and non-commercial terms with the project owner.
