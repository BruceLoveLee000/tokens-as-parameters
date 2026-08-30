# Packages

[English](README.md) | 简体中文

Workspace 遵循 DeepSeek Harness 的方式，按照能力领域组织独立 npm 包。Package 可以是契约库、Cordis Service Plugin、Provider Plugin、模型工具或 Bundle；具体身份由 `package.json` 和运行时导出决定，因此不设置笼统的 `plugins/` 目录。

```text
packages/
├── core/
│   ├── optimization/                   文本参数、反馈、更新与优化器契约
│   ├── training-runtime/               领域无关的 Rollout/Evaluate/Optimize/Apply 循环
│   ├── optimizer-relative-reflection/ 相对反思 Optimizer Provider Plugin
│   ├── state-git/                      Git 参数与 Insight 状态
│   └── telemetry/                      领域无关的 DSH 轨迹投影
├── formal/
│   ├── proof-contracts/                Case、Receipt、Run 与信任契约
│   ├── proof-agent/                    可替换 Prover Provider 注册中心
│   ├── prover-code-agent/              官方 Code Agent Prover Provider
│   ├── proof-loss/                     可替换 Loss Provider 注册中心
│   ├── loss-lean-dual/                 Lean + 白盒 Loss Provider
│   ├── proof-observer/                 持久化证明事件与快照
│   ├── proof-runtime/                  Core Runtime 之上的 Formal Case/Session/Worktree Adapter
│   ├── proof-verification/             Verifier Service 与 Provider 注册中心
│   └── tool-proof-run/                 面向模型的运行控制工具
├── lean/
│   └── verifier-lean/                  确定性 Lean 规则 Checker
├── chips/                              预留的硬件领域边界
└── bundle/
    └── formal-proof/                   只负责组装，不承载领域实现
```

依赖方向为 `core <- formal/lean adapter <- Bundle`。Bundle 依赖插件，插件绝不能反向依赖 Bundle。`core-training-runtime` 只理解 Rollout、Evaluation、Optimization、状态应用和生命周期 Hook。只有真正实现 RTL Fidelity 或等价性 Adapter 后，才会在 `chips/` 下增加硬件专属能力。FDIV Case 继续放在 `benchmarks/`，不会泄漏到通用包。

参见 [Core 架构](../docs/zh-CN/architecture/token-optimization-core.md)和[形式化证明 Bundle 架构](../docs/zh-CN/architecture/dsh-formal-proof-bundle.md)。
