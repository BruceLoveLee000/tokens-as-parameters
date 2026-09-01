# FDIV R14 Bundle reproduction protocol

English | [简体中文](README.zh-CN.md)

## Status

`PENDING-RUN`. The DSH Bundle and keyless mechanism tests are implemented. The historical FDIV 14/14 trajectory has not yet been reproduced through the packaged Bundle, so this document defines the evidence gate rather than claiming a result.

## Hypothesis

Under a fixed model and inference budget, two proof rollouts plus per-rollout dual Loss and an agentic Optimizer that selects the next textual parameters, Git parents, and tasks make more trusted progress than single or non-communicating rollouts.

## Frozen inputs

Before a run, record in an experiment manifest:

- benchmark repository and exact baseline commit;
- every locked-input SHA-256 and top-theorem signature SHA-256;
- expected claim scope (`lean-model-vs-spec` for the current checkpoint);
- Lean/Lake toolchain, DSH version, Bundle commit, model/provider route;
- every external proof repository (including FloatSpec), its exact commit, and clean-worktree verification;
- exact Prover/Loss/Optimizer ids, rollout count, parallelism, per-request output cap, Prover/Judge/Reflector step budgets, total cost/token guard, wall-time limit, and feedback-enabled parameters.

Do not mutate the benchmark to make the plugin load. If its historical manifest differs, add a new versioned `case.json` adapter commit while preserving the original theorem and locked files.

The adapter is control-plane metadata, not a new proof input: it names the initial proof surface, frozen hashes, target obligations, checker command, allowed axioms, and pinned external repositories. Agents may add proof-side sources, but cannot modify locked inputs or the theorem signature.

The first-release Runtime does not accept an external checkout path. After provenance and licensing are complete, commit the adapted Case under `benchmarks/`, verify that `chip_proof_cases` lists its exact id, and start every condition with `/chip_proof <case-id>`. Each invocation materializes a fresh Run baseline, so Runs cannot inherit prior proof state.

Pin the same provider, model, and adapter reasoning effort for every condition. The FDIV comparison uses `deepseek-official`, `deepseek-v4-flash`, and `max`; the Runtime records and applies that effort independently to Prover, Loss Judge, and Reflector sessions.

## Minimum run matrix

| Condition | Prover | Loss | Optimizer | Rollouts | Next-parent policy |
|---|---|---|---|---:|---|
| Single | `formal-code-agent` | `lean-dual-check` | reflection disabled | 1 | own eligible state |
| Independent | `formal-code-agent` | `lean-dual-check` | reflection disabled | 2 | each lane continues independently |
| Group relative | `formal-code-agent` | `lean-dual-check` | `relative-reflection` | 2 | Optimizer-selected parent/task per lane |
| Rule-only Loss | `formal-code-agent` | `lean-rule-only` | `relative-reflection` | 2 | Optimizer-selected parent/task per lane |

Use equal total-token and wall-time ceilings for comparisons. Record actual input, output, cache-read, and cache-write tokens separately when DSH exposes them; do not compare only configured maxima.

## Acceptance gate

A reproduction is complete only when the archived evidence contains:

1. immutable run configuration and all version/hash identities;
2. `run.json`, `events.jsonl`, and the DSH Session ids for every role;
3. the final Git commit and proof source;
4. successful controller-owned `lake build` receipt;
5. top theorem `#print axioms` receipt with no forbidden dependencies;
6. per-rollout structured Loss reports, white-box findings where enabled, and Optimizer decisions;
7. theorem-by-theorem closure table, elapsed time, and token accounting;
8. an explicit statement that this proves Lean Model ↔ Lean Spec only unless RTL fidelity is separately certified.

If any item is missing, label the run `INCOMPLETE`, not reproduced.
