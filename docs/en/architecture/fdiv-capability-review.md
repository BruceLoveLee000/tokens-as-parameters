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
| continuation after per-request max-token termination | retained | the same Session continues while cumulative lane budget remains |
| long per-lane, total-token, and wall-time budgets | retained | all remain explicit run controls; stagnation is not an implicit stop |
| controller-owned Lean build and locked-input/signature/hygiene checks | retained | model claims cannot advance progress |
| per-obligation axiom audit and all-obligation final gate | retained | a declaration depending on forbidden axioms cannot inflate trusted progress |
| read-only white-box reward-hacking review | retained | veto-only after deterministic success |
| declaration-level semantic integration instead of `git merge` | retained | newly closed obligations and checker/axiom-clean changed helper theorems are transplanted and fully rechecked |
| autonomous multi-tool Reflector | retained | parameter usage, lane receipts, trace ranges/search, state nodes, and transition diffs are available |
| reflection submit-only boundary and deterministic fallback | retained | current-step soft instruction, one schema retry, then neutral update |
| Prover-selected `record_insight` Git nodes | retained | proof state, concise summary, and Insight artifact are committed together |
| multi-parent reflection provenance DAG | retained | lane tips are parents; unverified branch trees are not semantically merged |
| trusted proof commit separated from search/provenance state | retained | reflection cannot itself create proof progress |
| durable Run id, snapshots, events, and native session history | retained | refresh/reconnect does not erase controller evidence |
| exact attribution from text parameter revision to rollout result | improved | new context snapshots and parameter-usage inspection remove a previous ambiguity |
| generic reflection output | improved | Reflector updates any subset of domain-registered parameters atomically; Core no longer assumes common prompt/routes |
| FDIV-specific Skill or leaked solution route | deliberately absent | the generic Bundle contains no benchmark answer; this supports cleaner ablations |
| dedicated side-by-side SpecRefine UI | scope change | official DSH Sessions replace the custom UI; research evidence remains durable, but UX parity is not claimed |
| checker-clean helper-only checkpoint promotion | restored | changed/new helper theorems are compared with the Epoch base, axiom-audited, semantically transplanted, rechecked, and promoted without inflating named-obligation counts |
| richer Proof Capsule integration from multiple lanes | partially retained | theorem/lemma units are integrated across lanes; arbitrary definitions and a standalone Capsule schema are not yet supported |
| certified counterexample and `DISPROVED` path | **missing** | model-proposed counterexamples cannot produce a terminal refutation verdict |
| proof-interface rebaseline workflow for Lean kernel recursion/pathological reducibility | **missing** | the successful experiment required a separately versioned proof-facing interface candidate; the Bundle does not automate this governance path |
| historical case schema migration and end-to-end FDIV 14/14 replay | **not yet demonstrated** | unit/contract tests are green, but empirical parity remains an open reproduction gate |

## Regression judgment

There is no regression in the basic parallel-search, reflection, deterministic-trust, budget, persistence, or final-review loop. The Core refactor improves the main research variable: parameters are now explicitly defined by the target Agent, individually frozen or opened, versioned, attributed to exact Rollouts, and updated atomically.

The helper-only gap found during this review was fixed rather than waived: the verifier now discovers changed concrete helper theorems relative to the Epoch base, audits their axioms, and the integrator transplants only accepted units before a full recheck. Named progress remains unchanged for a helper-only checkpoint.

The remaining `DISPROVED`, arbitrary-definition Capsule, and proof-interface rebaseline gaps are meaningful, but they concern task coverage, integration breadth, and recovery rather than the soundness of a positive proof accepted by the current pipeline.

## Validation completed in this refactor

- TypeScript project-reference build and typecheck;
- contract tests for parameter definition, instance feedback selection, frozen/stale rejection, exact exposure, atomic replacement, and Formal-owned parameter ids;
- Git DAG tests for reflection provenance and parameter-state persistence;
- existing Lean parsing, hygiene, obligation, axiom, unauthorized-change, consolidation, helper-checkpoint, package-boundary, and telemetry tests;
- package dependency rule that Core does not depend on Formal, Lean, Chips, or Bundle packages.

## Reproduction gate

Do not label this implementation “FDIV reproduced” until all of the following are archived under one new Run id:

1. a licensed, versioned case accepted by the current manifest schema;
2. immutable baseline commit and locked-input hashes;
3. complete Prover/Reflector/Reviewer Sessions and run ledger;
4. 14/14 final Lean receipt with per-obligation and top-theorem axiom audits;
5. white-box review;
6. exact input, output, cache, reasoning, wall-time, and configuration accounting.
