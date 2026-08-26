# Tokens as Parameters

English | [简体中文](README.zh-CN.md)

> Tokens Are All You Need — If You Can Optimize Them.

Can a fixed-weight language model learn during inference?

Tokens as Parameters is an experimental system for studying whether persistent textual state can function as inference-time adaptive parameters. It uses parallel reasoning trajectories, verifiable feedback, comparative reflection, textual updates, and context consolidation to optimize an agent's future behavior without changing model weights.

Our first research testbed is long-horizon hardware formal verification with Lean and DeepSeek Harness.

Not every token is a parameter. A token becomes parameter-like when it is optimized from evidence, retained across future decisions, and measurably changes the model's action distribution.

## Status

Research preview. The repository is being initialized around a reproducible plugin suite and experiment framework. APIs and experimental protocols will change.

## Research question

Given fixed model weights, can a verifier-guided optimizer update persistent textual state so that later trajectories achieve higher expected reward under an equal inference budget?

## Planned system

- DSH-native orchestration over the official Code Agent and Agent Loop.
- Parallel, isolated reasoning trajectories with persistent run identity.
- Verifier-gated trusted progress and reward-hacking defenses.
- Comparative reflection as a directional textual update.
- Git-backed evidence, cognitive state, and transition history.
- Reward-oriented context consolidation rather than generic summarization.
- Equal-budget ablations across single-agent, independent-parallel, self-reflection, group-reflection, persistent-insight, and consolidation conditions.
- Lean and hardware formal verification as the first verifier adapter and benchmark family.

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
