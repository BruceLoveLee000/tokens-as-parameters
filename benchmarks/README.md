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
├── expected/
└── <case-specific source layout>/
```

Small synthetic cases should prefer `inputs/` and `verifier/`. A larger Case
may preserve a native build layout such as `formal/`, `rtl/`, and `tests/` when
changing it would alter the experiment or toolchain. `case.json`, rather than a
directory name, is authoritative for locked inputs, editable proof surfaces,
the theorem identity, and verifier commands.

`PROVENANCE.md` must identify original sources, commits, licenses, authorship, transformations, and redistribution rights. `case.json` is the runtime manifest and must lock file hashes, theorem identity, immutable inputs, and mutable proof surfaces. Experiment manifests separately lock toolchain/model versions, budgets, and expected verdicts.

The first-release Runtime treats this tree as its experiment Case catalog. Only directories containing a valid `case.json` are discoverable. A Run starts only from an exact `caseId` whose directory is clean at a Git commit; the directory is copied into a Run-owned workspace and is never edited in place. Generated state such as `.git`, `.lake`, `node_modules`, build output, and `.tokens-as-parameters` is not part of the materialized Case.

A positive case must have a defensible reason to expect `PROVED`. A negative case must record a canonical counterexample or another independently replayable reason to expect `DISPROVED`. Unknown cases must not be silently relabeled to optimize success metrics.

## Published cases

- `lean-smoke-positive`: minimal infrastructure smoke test.
- `fdiv-r14-raw-top1-audited-rebaseline-v1`: public from-zero FDIV
  proof-architecture showcase with one top-level obligation. Its reference
  solution is published separately under `experiments/`, so it is a regression
  target rather than a contamination-free blind benchmark.
