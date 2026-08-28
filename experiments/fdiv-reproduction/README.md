# FDIV R14 Bundle reproduction protocol

English | [简体中文](README.zh-CN.md)

## Status

`PENDING-RUN`. The DSH Bundle and keyless mechanism tests are implemented. The historical FDIV 14/14 trajectory has not yet been reproduced through the packaged Bundle, so this document defines the evidence gate rather than claiming a result.

## Hypothesis

Under a fixed model and inference budget, two independent proof trajectories plus agentic comparative reflection and verifier-gated semantic consolidation make more trusted progress than a single trajectory or two independent trajectories without information exchange.

## Frozen inputs

Before a run, record in an experiment manifest:

- benchmark repository and exact baseline commit;
- every locked-input SHA-256 and top-theorem signature SHA-256;
- expected claim scope (`lean-model-vs-spec` for the current checkpoint);
- Lean/Lake toolchain, DSH version, Bundle commit, model/provider route;
- rollout count, parallelism, per-request output cap, per-lane cumulative budget, total budget, wall-time limit, reflection settings, and white-box-review setting.

Do not mutate the benchmark to make the plugin load. If its historical manifest differs, add a new versioned `case.json` adapter commit while preserving the original theorem and locked files.

The first-release Runtime does not accept an external checkout path. After provenance and licensing are complete, commit the adapted Case under `benchmarks/`, verify that `chip_proof_cases` lists its exact id, and start every condition with `/chip_proof <case-id>`. Each invocation materializes a fresh Run baseline, so Runs cannot inherit prior proof state.

## Minimum run matrix

| Condition | Rollouts | Cross-lane reflection | Persistent insight | Semantic consolidation |
|---|---:|---:|---:|---:|
| Single | 1 | no | yes | no-op |
| Independent | 2 | no | yes | checker-gated only |
| Group relative | 2 | yes | yes | checker-gated |

Use equal total-token and wall-time ceilings for comparisons. Record actual input, output, cache-read, and cache-write tokens separately when DSH exposes them; do not compare only configured maxima.

## Acceptance gate

A reproduction is complete only when the archived evidence contains:

1. immutable run configuration and all version/hash identities;
2. `run.json`, `events.jsonl`, and the DSH Session ids for every role;
3. the final Git commit and proof source;
4. successful controller-owned `lake build` receipt;
5. top theorem `#print axioms` receipt with no forbidden dependencies;
6. white-box review result and all findings;
7. theorem-by-theorem closure table, elapsed time, and token accounting;
8. an explicit statement that this proves Lean Model ↔ Lean Spec only unless RTL fidelity is separately certified.

If any item is missing, label the run `INCOMPLETE`, not reproduced.
