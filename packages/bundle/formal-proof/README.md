# DSH Formal-Proof Bundle

English | [简体中文](README.zh-CN.md)

`@tokens-as-parameters/bundle-formal-proof` is an installable DeepSeek Harness Bundle. It composes independent Core Optimizer, Formal, Lean, and Tool packages over the official DSH Code Agent and Agent Loop. The Bundle itself contains no proof implementation.

## Compatibility

- DSH packages: exactly `0.1.1-rc.2` for this research-preview release.
- Node.js: `^22.19` or `>=24`.
- Case repository: Git worktree support and a Lake-managed Lean project.

The exact DSH peer versions are intentional. Public extension APIs are still pre-release, so compatibility must be revalidated before widening the range.

## Install into DSH Web

Build and pack from this checkout:

```bash
npm ci
npm run check
npm run pack:local
dsh plugin --profile web add ./tokens-as-parameters-*.tgz
```

Restart the profile after installation:

```bash
dsh web
```

The package manifest's `dsh.bundle.patch` composes eight runtime plugins:

- `core-optimization`: stable Token Optimizer registry and contracts;
- `optimizer-relative-reflection`: replaceable group-relative semantic Optimizer;
- `proof-observer`: durable domain-event ledger and run snapshots;
- `proof-verification`: stable Verifier registry;
- `verifier-lean`: Lean Provider for deterministic checks and declaration consolidation;
- `proof-roles`: scoped Prover and read-only Reviewer prompts/tools;
- `proof-runtime`: background lifecycle, isolated worktrees/sessions, checker gates, consolidation, and stop policy;
- `tool-proof-run`: `proof_run_start`, `proof_run_status`, `proof_run_list`, and `proof_run_stop`.

Libraries such as `proof-contracts`, `core-state-git`, and `core-telemetry` are dependencies of those plugins rather than Bundle rows.

## Case contract

The case root must be a Git repository. By default the runtime reads `<case-root>/case.json`.

```json
{
  "schemaVersion": "1.0",
  "caseId": "fdiv-r14-checkpoint",
  "claimScope": "lean-model-vs-spec",
  "description": "Versioned Lean equivalence proof checkpoint",
  "git": { "baselineCommit": "0123456789abcdef0123456789abcdef01234567" },
  "editableFiles": ["formal/FdivProof.lean"],
  "lockedInputs": [
    { "path": "formal/FdivModel.lean", "sha256": "0000000000000000000000000000000000000000000000000000000000000000" },
    { "path": "formal/FdivSpec.lean", "sha256": "0000000000000000000000000000000000000000000000000000000000000000" }
  ],
  "lean": {
    "workingDirectory": "formal",
    "proofFile": "formal/FdivProof.lean",
    "theoremFile": "formal/FdivProof.lean",
    "module": "FdivProof",
    "theoremName": "rtlEquivSpec",
    "theoremSignatureSha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "obligations": ["lemma_1", "rtlEquivSpec"],
    "buildArgv": ["lake", "build"],
    "allowedAxioms": ["propext", "Classical.choice", "Quot.sound"]
  },
  "provenance": { "license": "replace-with-the-case-license" }
}
```

Replace every example hash and commit before running. `editableFiles` and `lockedInputs` must not overlap. The theorem signature is frozen separately so rewriting the theorem into an easier claim cannot earn progress.

## Start and observe a run

Ask the DSH Code Agent to invoke:

```text
proof_run_start({
  case_root: "/absolute/path/to/versioned-case",
  rollouts: 2,
  max_parallel: 2,
  max_lane_tokens: 20000000,
  total_token_budget: 300000000
})
```

Each invocation receives a new immutable `runId`. Refreshing the Web page does not stop the background run. Use `proof_run_status` or `proof_run_list` after reconnecting; use `proof_run_stop` for an explicit cancellation. Historical snapshots under the default run root are rediscovered after process restart. A formerly active snapshot is then reported as `ABORTED`, because this release does not pretend to resume an Agent Loop that the process no longer owns.

Every Prover, Reflector, and Reviewer is an official DSH Session. The native conversation/session surface owns raw model and tool history. The Bundle persists a research ledger under `.tokens-as-parameters/runs/<runId>/`:

- `run.json`: latest controller snapshot, trusted commit, progress, input/output/cache/reasoning token accounting, budget, session ids, and terminal reason;
- `events.jsonl`: ordered domain and linked DSH session events.

## Trust and stopping rules

- Prover text is never proof evidence.
- Only controller-owned checks can advance a checkpoint: frozen-input hashes, theorem-signature hash, authorized-change audit against the Epoch base, textual hygiene, successful `lake build`, and a per-obligation `#print axioms` receipt with no forbidden dependency. Merely removing a local `sorry` is insufficient if the declaration still depends on `sorryAx` elsewhere.
- A final `PROVED` requires every declared obligation—including the top theorem—to pass that axiom gate. White-box review is a veto-only second layer when enabled.
- Lanes are isolated by Git worktree and DSH Session. The runtime performs declaration-level semantic consolidation and rechecks the result; it does not use `git merge` as a proof combiner.
- A run stops on accepted proof, user cancellation, total-token or wall-time exhaustion, or an unrecoverable infrastructure error. Lack of progress and route similarity remain observable behavior; they do not stop an otherwise funded experiment.
- This release does not yet contain an independently certified counterexample adapter; therefore it does not emit `DISPROVED` merely from model prose.

## Comparative reflection

The Reflector is an autonomous DSH agent, not a one-shot summarizer. Its default context contains structured checker outcomes. It can then search or page through the full bounded observable trace, list Git state nodes, and inspect a selected transition diff. `record_insight(summary, insight)` creates an insight file and an automatic Git commit, making evidence/cognitive updates explicit state nodes.

After comparison, the controller creates a multi-parent Reflection commit. Its tree starts from the trusted proof, while its parents record every consumed Lane tip. This node becomes the next Epoch's `searchBaseCommit` without falsely advancing `trustedCommit` or importing unverified proof trees.

After the reflection soft-token boundary, inspection tools disappear and a current-step message asks the agent to call `submit_reflection`. A valid submission ends the turn; a second invalid submission falls back to a neutral update. The reflection carries one common direction plus one route per rollout, but does not hard-code theorem assignments or FDIV-specific proof hints.

## Current limitation

The packaged mechanism has unit and contract coverage, but the historical FDIV 14/14 result has not yet been rerun through this Bundle. Follow the versioned [reproduction protocol](../../../experiments/fdiv-reproduction/README.md); do not cite the old result as a Bundle reproduction until its evidence gate is complete.
