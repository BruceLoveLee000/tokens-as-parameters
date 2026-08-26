# Benchmarks

Benchmarks are versioned research inputs, not incidental test fixtures. The repository-level Apache-2.0 license does not automatically relicense third-party hardware designs, specifications, datasets, or traces.

Every case must include:

```text
<case>/
├── LICENSE or LICENSES/
├── PROVENANCE.md
├── MANIFEST.json
├── README.md
├── inputs/
├── verifier/
└── expected/
```

`PROVENANCE.md` must identify original sources, commits, licenses, authorship, transformations, and redistribution rights. `MANIFEST.json` must lock file hashes, toolchain versions, expected verdict, immutable inputs, and mutable proof surfaces.

A positive case must have a defensible reason to expect `PROVED`. A negative case must record a canonical counterexample or another independently replayable reason to expect `DISPROVED`. Unknown cases must not be silently relabeled to optimize success metrics.
