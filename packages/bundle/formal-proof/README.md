# DSH Formal-Proof Bundle

English | [简体中文](README.zh-CN.md)

`@tokens-as-parameters/bundle-formal-proof` is an installable DeepSeek Harness Bundle. It composes the domain-neutral Core Training Runtime with independent Optimizer, Formal, Lean, and Tool packages over the official DSH Code Agent and Agent Loop. The Bundle itself contains no proof implementation.

## Compatibility

- DSH packages: exactly `0.1.1-rc.2` for this research-preview release.
- Node.js: `^22.19` or `>=24`.
- Experiment catalog: this repository's `benchmarks/` tree, with committed Case snapshots and Lake-managed Lean projects.

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

The package manifest's `dsh.bundle.patch` composes twelve runtime plugins:

- `core-optimization`: domain-neutral text-parameter, exposure, feedback, atomic-update, and Optimizer registry contracts;
- `optimizer-relative-reflection`: replaceable group-relative semantic Optimizer;
- `proof-observer`: durable domain-event ledger and run snapshots;
- `proof-agent` / `prover-code-agent`: replaceable Prover registry and default official-Code-Agent provider;
- `proof-loss` / `loss-lean-dual`: replaceable Loss registry and default per-rollout Lean plus white-box provider;
- `proof-verification`: stable Verifier registry;
- `verifier-lean`: deterministic Lean rule-check Provider;
- `proof-runtime`: Formal Case, DSH Session, Worktree, run-ledger, and result adapter over the `core-training-runtime` library;
- `tool-proof-run`: experiment-only `chip_proof`, `chip_proof_cases`, `proof_run_status`, `proof_run_list`, and `proof_run_stop`.
- `ui-proof-run`: projects Proof Runtime state, trusted progress, run history, and Agent-session links into DSH Web, with a model-free Stop button.

Libraries such as `core-training-runtime`, `proof-contracts`, `core-state-git`, and `core-telemetry` are dependencies of those plugins rather than Bundle rows. Core owns the policy-free `rollout → evaluate → optimize → apply` loop; it imports no Formal or Lean package.

## Case contract

Every runnable directory under the configured `benchmarkRoot` contains `case.json`. The runtime discovers it by exact `caseId`; callers cannot provide an arbitrary filesystem path. The Case directory must be clean at a Git commit when a Run starts.

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

Replace every example hash before committing a Case. `editableFiles` and `lockedInputs` must not overlap. `editableFiles` is a legacy starting hint; Agents may add proof-side sources. Locked hashes and the separately frozen theorem signature define the immutable boundary.

For each invocation, Runtime copies the Case—excluding `.git`, `.lake`, generated builds, dependencies, and previous Run state—to `.tokens-as-parameters/runs/<runId>/workspace`. It validates the copied manifest and locked hashes, initializes a fresh Git repository, and uses that commit as the only Run baseline. The source Case is never writable proof state.

## Start and observe a run

From a DSH Code Agent conversation, use the experiment convention:

```text
/chip_proof lean-smoke-positive
```

The installed system-prompt section instructs the Code Agent to translate this into `chip_proof({ case_id: "lean-smoke-positive" })`. Use `chip_proof_cases` to inspect available ids. Search budgets remain optional `chip_proof` arguments. This is a conversation convention over the DSH Tool API in `0.1.1-rc.2`, not a second Agent Loop or a client-side slash-command implementation.

Each invocation receives a new immutable `runId`. DSH Web's **Proof Run** tab streams Prover, per-rollout Loss Judge, and Reflector Sessions together with trusted obligations, Candidate/Loss status, model steps, tokens, and Epoch. Refreshing the page does not stop the background run. The Stop button executes `/proof-stop <runId>` directly against the controller without invoking the main model.

Every Prover, Reflector, and Reviewer is an official DSH Session. The native conversation/session surface owns raw model and tool history. The Bundle persists a research ledger under `.tokens-as-parameters/runs/<runId>/`:

- `run.json`: latest controller snapshot, trusted commit, progress, input/output/cache/reasoning token accounting, budget, session ids, and terminal reason;
- `events.jsonl`: ordered domain and linked DSH session events.

## Trust and stopping rules

- Prover text is never proof evidence.
- `lean-dual-check` owns the ordered evaluation of one immutable Candidate Commit: Lean locked/signature/hygiene/build/axiom checks followed by a read-only white-box Judge. `lean-rule-only` is the explicit black-box-only ablation.
- Loss metrics distinguish `whiteboxReviewed` from `whiteboxApproved`; an omitted Judge is never recorded as an approval, including in Rule-only ablations.
- `ProofReceipt` and `ProofLossReport` both bind the exact Candidate Commit. A final `PROVED` requires a commit-matched `solved` Loss that closes every declared obligation, including the top theorem; Runtime does not repeat the Lean build after that Loss.
- Lanes are isolated by Git Worktree and DSH Session. There is no automatic consolidation. The Optimizer chooses each next parent; semantic integration is an ordinary Prover task followed by the same Loss.
- A run stops on accepted proof, user cancellation, total-token or wall-time exhaustion, or an unrecoverable infrastructure error. Lack of progress and route similarity remain observable behavior; they do not stop an otherwise funded experiment.
- This release does not yet contain an independently certified counterexample adapter; therefore it does not emit `DISPROVED` merely from model prose.

## Comparative reflection

The Reflector is an autonomous DSH Agent, not a one-shot summarizer. Its default context contains structured Loss reports, parameter exposures, and eligible state ids. It can search/page traces, list Git nodes, inspect transitions, read files at commits, and compare a path across two rollout states. A Prover autonomously chooses ordinary checkpoints through `git_commit(message)`. `record_insight(summary, insight)` commits safe changed proof sources with an explicit cognitive/evidence node. Both are untrusted until evaluated by Loss; neither pushes or mutates a remote.

After comparison, the Reflector submits an atomic `OptimizationDecision`: text-parameter updates plus one eligible parent/task directive per next lane. The Reflection commit records the decision and consumed tips, but each next Prover starts from the selected solution commit rather than from a synthetic merged tree.

The Formal Prover Agent registers `task.memory`, `task.plan`, and one `lane.<id>.route` parameter per rollout; their trainability is selected at Agent instantiation rather than hard-coded in Core. Every Session records the exact revisions it consumed. The Reflector can inspect parameter usage as well as trajectory and Git evidence, then atomically replace any justified subset while preserving omitted parameters.

`chip_proof` exposes this experiment boundary through `feedback_memory`, `feedback_plan`, and `feedback_routes`. At least one must remain enabled when reflection is enabled.

Model steps are the primary depth budget: 200 per Prover, 24 per white-box Judge, and 32 per Reflector by default. At a role boundary, exploratory tools disappear and only its submit tool remains. Cache-read tokens remain cost/context telemetry and do not terminate a rollout. Neither Core nor the generic Bundle hard-codes theorem assignments or FDIV-specific proof hints.

## Current limitation

The packaged mechanism has unit and contract coverage and locally reproduced 14/14 from the same frozen 9/14 FDIV warm start as the SpecRefine control. All Runs completed in Epoch 1, however, so this pilot validates the Prover/Runtime path rather than Optimizer effectiveness. The licensed Case, proof, and Session trace remain restricted local evidence; this is not yet a third-party downloadable reproduction. See the versioned [reproduction protocol and report](../../../experiments/fdiv-reproduction/README.md) and the [capability regression review](../../../docs/en/architecture/fdiv-capability-review.md).

This release has no production workspace mode. User-selected repositories, dirty-worktree handling, and explicit result application are tracked in [Issue #4](https://github.com/BruceLoveLee000/tokens-as-parameters/issues/4).
