# Reproducibility

A manifest records schema version, frozen suite/dataset/evidence hashes, exact profiles, prompt hashes, parameters, cost-profile version, local hardware information, protocol, seed, execution order and environment snapshot. Raw provider payloads, secrets, hidden reasoning and private evidence are excluded. A dirty working-tree flag and code/dependency hashes distinguish a reproducible configuration record from a claim of exact cloud determinism.

An authorized user may request a private ZIP export. It contains the manifest, structured decision outputs, safe invocation accounting, evaluations and statistical comparisons. Object storage remains private; download access is a short-lived signed URL and every request is audited.
