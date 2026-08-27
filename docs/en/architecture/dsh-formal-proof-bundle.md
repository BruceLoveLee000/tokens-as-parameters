# DSH-native formal-proof Bundle architecture

[简体中文](../../zh-CN/architecture/dsh-formal-proof-bundle.md)

## Decision

The first implementation is one installable DSH Bundle that composes independent Core, Formal, and Lean packages. The Bundle contains only a patch manifest. It reuses the official Code Agent, Agent Loop, Session, filesystem/shell tools, compaction, token accounting, credentials, and Web trajectory surface.

```text
Official DSH Web / Code Agent
            |
     proof_run_* tools
            |
     ProofRunService
       /     |      \
  Provers  Optimizer  Reviewer       official DSH Sessions
     |        |          |
 Git nodes semantic    veto-only
     |      update       review
     +--------+----------+
              |
     controller-owned LeanVerifier
              |
     run.json + events.jsonl + Git commits
```

## Plugin boundaries

| Package/plugin | Responsibility | Must not own |
|---|---|---|
| `core-optimization` | Token-parameter vocabulary and Optimizer registry | Formal, Lean, or hardware semantics |
| `optimizer-relative-reflection` | Evidence exploration and one structured group-relative textual update | Proof acceptance or benchmark-specific hints |
| `proof-observer` | Run snapshots and domain-event ledger linked to DSH Session events | Raw chat persistence or a replacement UI |
| `proof-verification` | Verifier registry selected by stable id | Lean implementation details or search policy |
| `proof-roles` | Scoped Prover/Reviewer prompts and proof-domain tools | Agent Loop or global Code Agent tools |
| `proof-runtime` | Run state machine, worktrees, sessions, budgets, consolidation, stopping | A concrete Optimizer, LLM adapter, shell, or compaction |
| `verifier-lean` | Lean Provider for deterministic checks and declaration-level consolidation | Search policy or proof verdict from model prose |
| `tool-proof-run` | User-facing start/status/list/stop controls | A second control plane or web server |

The Runtime selects an Optimizer by stable id (`relative-reflection` by default) through `ctx.optimization`; it does not import the implementation package. See the [Core architecture](token-optimization-core.md).

## State and update model

Every Run has a new `runId`; Runs do not inherit mutable proof state implicitly. Within a Run, every epoch starts from the last controller-accepted Git commit. Each Lane receives its own Git worktree and DSH Session.

`record_insight(summary, insight)` turns a model-selected cognitive/evidence update into a Git node:

1. the runtime writes a versioned insight artifact;
2. the summary becomes the commit message;
3. current editable proof files and the insight are committed together;
4. the Reflector can list nodes and inspect selected transition diffs.

This preserves model-selected semantic anchors without treating all hidden reasoning tokens or all filesystem writes as equally important.

After reflection, the controller creates a multi-parent commit. Its tree is based on the current trusted proof and adds only the reflection state; its parents include the trusted proof and every consumed Lane tip. The commit becomes `searchBaseCommit`, while `trustedCommit` remains independently verifier-gated. Thus the DAG records information flow without using `git merge` or importing unverified Lane proof trees.

## Relative reflection

Reflection consumes terminal lane outputs, checker receipts, Git state nodes, and on-demand trace slices. The Reflector plans its own read-only tool sequence. Its result is textual—not a numeric scalar—because the consumer is a language model. It encodes:

- transferable evidence and invalidated assumptions;
- one dense common update;
- one non-homogeneous next route for every rollout.

The route contract requires coverage, not forced theorem assignment. Wrong convergence remains observable experimental behavior rather than being hidden by case-specific heuristics.

## Trust boundary

The controller treats model output, shell claims, reflection, and reviewer approval as untrusted. A checkpoint advances only after controller-owned deterministic checks, including a clean Lean axiom audit for each obligation counted as closed. This prevents a syntactically complete lemma that still depends on another `sorryAx` from inflating trusted progress. Final acceptance requires every obligation, including the top theorem, to pass. White-box review can veto a deterministic success but can never create one.

The current claim scope is explicit. A `lean-model-vs-spec` proof does not become an RTL-fidelity claim without a separately versioned RTL-to-Lean certificate or adapter.

## Deliberate first-release limits

- no automatic RTL-to-Lean translation;
- no certified `DISPROVED` adapter yet;
- no cross-Run proof inheritance;
- no benchmark-specific Lean Skill or FDIV hint in the generic Bundle;
- no claim that historical FDIV results have already been reproduced through this implementation.
