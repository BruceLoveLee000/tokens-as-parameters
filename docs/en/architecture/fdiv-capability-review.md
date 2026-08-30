# FDIV capability regression review

[简体中文](../../zh-CN/architecture/fdiv-capability-review.md)

## Review baseline

This review compares the refactored Bundle with the assisted FDIV run that advanced a checker-trusted checkpoint from 9/14 to 14/14. That historical run used DeepSeek V4 Flash, approximately 198.85 million total tokens including cache traffic, approximately 3.216 million output tokens, and about 6 hours 7 minutes. It ended with 14/14 Lean-kernel-checked obligations and a low-risk white-box assessment.

The comparison concerns mechanisms that contributed to the result. It does not copy benchmark-specific prompts or claim a new reproduction.

## Capability matrix

| Historical capability or lesson | Refactored status | Evidence / consequence |
|---|---|---|
| official DSH Code Agent, Agent Loop, Sessions, tools, compaction, and telemetry | retained | Bundle composes official DSH packages instead of replacing them |
| independent rollout Sessions and Git worktrees | retained | every lane gets a stable session id and detached worktree |
| continuation after per-request max-token termination | retained | the same Session continues while model-step depth remains |
| long search depth, total-token, and wall-time budgets | improved | model steps are primary depth; cache-read volume no longer prematurely ends a lane |
| controller-owned Lean build and locked-input/signature/hygiene checks | retained | model claims cannot advance progress |
| per-obligation axiom audit and all-obligation final gate | retained | a declaration depending on forbidden axioms cannot inflate trusted progress |
| read-only white-box reward-hacking review | improved | now part of replaceable Loss after every rollout, so findings feed the next optimization step |
| cross-lane solution-state integration | redesigned | no regex transplantation; Optimizer selects parents and semantic integration is an ordinary Prover task followed by Loss |
| autonomous multi-tool Reflector | improved | adds complete Loss inspection, bounded commit-file reads, and cross-state file comparison |
| reflection submit-only boundary and deterministic fallback | retained | model-step boundary, one schema retry, then neutral decision |
| Prover-selected `record_insight` Git nodes | improved | safe changed proof sources, concise summary, and Insight artifact are committed together |
| multi-parent reflection provenance DAG | retained | lane tips are parents; unverified branch trees are not semantically merged |
| trusted proof commit separated from search/provenance state | retained | reflection cannot itself create proof progress |
| durable Run id, snapshots, events, and native session history | retained | refresh/reconnect does not erase controller evidence |
| exact attribution from text parameter revision to rollout result | improved | new context snapshots and parameter-usage inspection remove a previous ambiguity |
| generic reflection output | improved | Reflector updates parameter subsets and selects each next lane's eligible parent/task atomically |
| FDIV-specific Skill or leaked solution route | deliberately absent | the generic Bundle contains no benchmark answer; this supports cleaner ablations |
| dedicated side-by-side SpecRefine UI | scope change | official DSH Sessions replace the custom UI; research evidence remains durable, but UX parity is not claimed |
| checker-clean helper-only state retention | retained without fake reward | helper states remain `VERIFIED` and selectable, but do not advance named-obligation reward automatically |
| richer Proof Capsule integration from multiple lanes | redesigned | full candidate commits remain branches; Optimizer can inspect and schedule semantic integration without a standalone Capsule schema |
| certified counterexample and `DISPROVED` path | **missing** | model-proposed counterexamples cannot produce a terminal refutation verdict |
| proof-interface rebaseline workflow for Lean kernel recursion/pathological reducibility | **missing** | the successful experiment required a separately versioned proof-facing interface candidate; the Bundle does not automate this governance path |
| historical case schema migration and end-to-end FDIV 14/14 replay | **not yet demonstrated** | unit/contract tests are green, but empirical parity remains an open reproduction gate |

## Deferred semantic coverage

The first reproduction keeps the historical 8/14 Lean Model ↔ Lean Spec claim byte-for-byte stable. Two broader claims are deliberately TODOs, not silently folded into this experiment:

1. upgrade the frozen arithmetic profile from binary32 RNE with flush-to-zero behavior to complete IEEE-754 semantics, including gradual underflow and an independently reviewed oracle boundary;
2. certify RTL fidelity separately, either by a checked RTL-to-Lean translation or an explicit equivalence chain from the Verilog implementation to the locked Lean Model.

FloatSpec remains an external proof dependency in this Case. The adapted manifest pins its exact repository commit and Runtime refuses a dirty or mismatched checkout. This improves reproducibility; it does not by itself enlarge the theorem's claim scope.

## Regression judgment

There is no regression in the basic parallel-search, reflection, deterministic-trust, budget, or persistence loop. The refactor makes the research variables explicit: Prover, Loss, and Optimizer are independently replaceable; parameters are versioned and attributable; and each next rollout parent/task is part of the optimizer decision.

The helper-only gap is handled without a merger: the verifier discovers and axiom-audits concrete helper changes, the candidate commit remains selectable, and named progress remains unchanged until a real obligation closes.

The remaining `DISPROVED`, arbitrary-definition Capsule, and proof-interface rebaseline gaps are meaningful, but they concern task coverage, integration breadth, and recovery rather than the soundness of a positive proof accepted by the current pipeline.

## Validation completed in this refactor

- TypeScript project-reference build and typecheck;
- contract tests for parameter definition, instance feedback selection, frozen/stale rejection, exact exposure, atomic replacement, and Formal-owned parameter ids;
- Git DAG tests for reflection provenance and parameter-state persistence;
- Lean parsing, all-changed-source hygiene, obligation, axiom, helper-state, plugin-seam, package-boundary, and step/token telemetry tests;
- package dependency rule that Core does not depend on Formal, Lean, Chips, or Bundle packages.

## Reproduction gate

Do not label this implementation “FDIV reproduced” until all of the following are archived under one new Run id:

1. a licensed, versioned case accepted by the current manifest schema;
2. immutable baseline commit and locked-input hashes;
3. complete Prover/Loss-Judge/Optimizer Sessions and run ledger;
4. 14/14 final Lean receipt with per-obligation and top-theorem axiom audits;
5. per-rollout Loss reports, white-box findings, and Optimizer decisions;
6. exact input, output, cache, reasoning, wall-time, and configuration accounting.
