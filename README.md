# Tokens as Parameters

English | [简体中文](README.zh-CN.md)

> Tokens Are All You Need — If You Can Optimize Them.

Can a fixed-weight language model learn during inference?

Tokens as Parameters is an experimental system for studying whether persistent textual state can function as inference-time adaptive parameters. It uses parallel reasoning trajectories, verifiable feedback, comparative reflection, textual updates, and context consolidation to optimize an agent's future behavior without changing model weights.

Our first research testbed is long-horizon hardware formal verification with Lean and DeepSeek Harness.

Not every token is a parameter. A token becomes parameter-like when it is optimized from evidence, retained across future decisions, and measurably changes the model's action distribution.

## Status

Research preview. The first release is intentionally **experiment-only**. It runs repository-versioned immutable Cases, materializes a fresh Run-owned Git workspace for each invocation, and never edits or merges back into the Case. Production operation on user-selected workspaces is deferred to [Issue #4](https://github.com/BruceLoveLee000/tokens-as-parameters/issues/4).

The DSH-native formal-proof system is a workspace of independent Core, Formal, Lean, Tool, and Bundle packages targeting the `0.1.1-rc.2` public extension APIs. A domain-neutral Core Training Runtime drives replaceable Prover, Loss, and Optimizer plugins; Formal adapters add isolated search states, commit-bound Lean plus white-box feedback, optimizer-selected Git parents, and durable run evidence.

## Research question

Given fixed model weights, can a verifier-guided optimizer update persistent textual state so that later trajectories achieve higher expected reward under an equal inference budget?

## Implemented first slice

- DSH-native orchestration over the official Code Agent and Agent Loop.
- A `packages/core/optimization` kernel where domain Agents register versioned text parameters, select feedback eligibility per instance, record exact context exposure, and accept atomic semantic updates from replaceable Optimizers.
- A `packages/core/training-runtime` loop that composes Rollout, Evaluation, Optimization, state application, and guaranteed Epoch cleanup without importing Formal or Lean semantics.
- Parallel, isolated reasoning trajectories with persistent run identity.
- Verifier-gated trusted progress and reward-hacking defenses.
- Comparative reflection as a directional textual update.
- Git-backed evidence, cognitive state, and transition history.
- Lean and hardware formal verification as the first verifier adapter and benchmark family.

The Bundle deliberately does not ship another Code Agent, Agent Loop, chat UI, shell, filesystem, compactor, or token meter. Those remain owned by official DSH.

## Quick start

Prerequisites: Node.js `^22.19` or `>=24`, DSH `0.1.1-rc.2`, Git, and a Lean project managed by Lake.

```bash
npm ci
npm run check
npm run pack:local
dsh plugin --profile web add ./tokens-as-parameters-*.tgz
dsh web
```

Launch DSH from this checkout so the default Case catalog resolves to `./benchmarks`, then write this in a DSH Code Agent conversation:

```text
/chip_proof lean-smoke-positive
```

The integration translates this convention into the model-facing `chip_proof({ case_id })` tool. The Runtime accepts only an exact registered Case id—not an arbitrary workspace path. It checks that the Case is committed, copies it to `.tokens-as-parameters/runs/<runId>/workspace`, validates the locked hashes again, and initializes a new Git baseline before any Prover starts. The official DSH Session UI remains the trajectory surface; the Bundle additionally persists `run.json` and `events.jsonl` for every Run.

Lean dependency packages are reused only through a local cache fingerprinted by the locked Lake manifest, toolchain, lakefile, and declared external dependency commits. Proof build outputs are never shared across Runs.

See the [Core architecture and Optimizer provider contract](docs/en/architecture/token-optimization-core.md), [Bundle guide](packages/bundle/formal-proof/README.md), [formal architecture](docs/en/architecture/dsh-formal-proof-bundle.md), and [FDIV reproduction protocol](experiments/fdiv-reproduction/README.md).

The first public end-to-end Optimizer showcase closed a from-zero FDIV top
theorem after seven Epochs and six comparative reflections. Read the bounded
[case-study result](experiments/fdiv-raw-top1-showcase/results/2026-09-13-deepseek-v4-flash/README.md)
and inspect its redistributable Case and reference proof. This single Run is
mechanism evidence, not a statistical claim that the framework outperforms
SpecRefine.

## Next research work

- Repeat the public raw-top1 FDIV study under aligned ablations and multiple seeds.
- Publish sanitized event-level evidence without leaking local paths or credentials.
- Add reward-oriented context consolidation rather than generic summarization.
- Execute equal-budget ablations across Prover, Loss, Optimizer, parent-selection, reflection, and persistent-Insight conditions.
- Add user-workspace production mode only after the experiment path is stable ([Issue #4](https://github.com/BruceLoveLee000/tokens-as-parameters/issues/4)).

## Repository map

```text
packages/       DSH plugins, runtime services, and verifier adapters
benchmarks/     Versioned cases with per-case provenance and licensing
experiments/    Reproducible protocols, ablations, and result schemas
docs/           Theory, architecture, research notes, and reports
```

## Licensing

- Software and original code examples: Apache License 2.0.
- Documentation and original research figures under `docs/`: CC BY 4.0.
- Benchmark cases: licensed per case; every case must include provenance and a license manifest.
- Contributions: Apache-2.0 under Developer Certificate of Origin 1.1 sign-off.

See [LICENSE](LICENSE), [NOTICE](NOTICE), [docs/LICENSE.md](docs/LICENSE.md), and [CONTRIBUTING.md](CONTRIBUTING.md).
