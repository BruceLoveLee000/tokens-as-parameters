# Benchmarks

English | [简体中文](README.zh-CN.md)

Benchmarks are versioned research inputs, not incidental test fixtures. The repository-level Apache-2.0 license does not automatically relicense third-party hardware designs, specifications, datasets, or traces.

Every case must include:

```text
<case>/
├── LICENSE or LICENSES/
├── PROVENANCE.md
├── PROVENANCE.zh-CN.md
├── case.json
├── README.md
├── README.zh-CN.md
├── inputs/
├── verifier/
└── expected/
```

`PROVENANCE.md` must identify original sources, commits, licenses, authorship, transformations, and redistribution rights. `case.json` is the runtime manifest and must lock file hashes, theorem identity, immutable inputs, and mutable proof surfaces. Experiment manifests separately lock toolchain/model versions, budgets, and expected verdicts.

A positive case must have a defensible reason to expect `PROVED`. A negative case must record a canonical counterexample or another independently replayable reason to expect `DISPROVED`. Unknown cases must not be silently relabeled to optimize success metrics.
