# ADR 0027: External evidence and citations

External evidence is persisted separately from internal retrieval evidence. Every external citation points to a source and immutable snapshot, retains its extraction hash and retrieval timestamp, and uses a stable `W` identifier. This preserves provenance, makes exports auditable, and prevents a changing public page from silently altering a completed report.
