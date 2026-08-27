# Packages

English | [简体中文](README.zh-CN.md)

The workspace follows the DeepSeek Harness convention of grouping independent npm packages by capability domain. A package can be a contract library, Cordis service plugin, provider plugin, model-facing tool, or Bundle. `package.json` and the runtime exports define its role; there is no generic `plugins/` directory.

```text
packages/
├── core/
│   ├── optimization/                   optimizer seam and token-training vocabulary
│   ├── optimizer-relative-reflection/ relative-reflection provider plugin
│   ├── state-git/                      Git-backed parameter and insight state
│   └── telemetry/                      domain-neutral DSH trajectory projection
├── formal/
│   ├── proof-contracts/                case, receipt, run, and trust contracts
│   ├── proof-observer/                 durable proof events and snapshots
│   ├── proof-roles/                    Prover and Reviewer role plugin
│   ├── proof-runtime/                  formal-proof Epoch/Rollout engine
│   ├── proof-verification/             verifier service and provider registry
│   └── tool-proof-run/                 model-facing run controls
├── lean/
│   └── verifier-lean/                  Lean verifier and declaration consolidation
├── chips/                              reserved hardware-domain boundary
└── bundle/
    └── formal-proof/                   composition only; no domain implementation
```

The dependency direction is `core <- formal <- lean-aware runtime/tool composition`; the Bundle depends on plugins but plugins never depend on the Bundle. Hardware-specific capabilities will live under `chips/` only when an actual RTL-fidelity or equivalence adapter exists. FDIV cases remain under `benchmarks/` and do not leak into generic packages.

See the [Core architecture](../docs/en/architecture/token-optimization-core.md) and [formal-proof Bundle architecture](../docs/en/architecture/dsh-formal-proof-bundle.md).
