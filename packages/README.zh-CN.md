# Packages

[English](README.md) | 简体中文

Workspace 遵循 DeepSeek Harness 的方式，按照能力领域组织独立 npm 包。Package 可以是契约库、Cordis Service Plugin、Provider Plugin、模型工具或 Bundle；具体身份由 `package.json` 和运行时导出决定，因此不设置笼统的 `plugins/` 目录。

```text
packages/
├── core/
│   ├── optimization/                   优化器接口与 Token 训练词汇
│   ├── optimizer-relative-reflection/ 相对反思 Optimizer Provider Plugin
│   ├── state-git/                      Git 参数与 Insight 状态
│   └── telemetry/                      领域无关的 DSH 轨迹投影
├── formal/
│   ├── proof-contracts/                Case、Receipt、Run 与信任契约
│   ├── proof-observer/                 持久化证明事件与快照
│   ├── proof-roles/                    Prover 与 Reviewer 角色插件
│   ├── proof-runtime/                  形式化证明 Epoch/Rollout 引擎
│   ├── proof-verification/             Verifier Service 与 Provider 注册中心
│   └── tool-proof-run/                 面向模型的运行控制工具
├── lean/
│   └── verifier-lean/                  Lean Verifier 与声明级整合
├── chips/                              预留的硬件领域边界
└── bundle/
    └── formal-proof/                   只负责组装，不承载领域实现
```

依赖方向为 `core <- formal <- Lean 感知的 Runtime/Tool 组合`。Bundle 依赖插件，插件绝不能反向依赖 Bundle。只有真正实现 RTL Fidelity 或等价性 Adapter 后，才会在 `chips/` 下增加硬件专属能力。FDIV Case 继续放在 `benchmarks/`，不会泄漏到通用包。

参见 [Core 架构](../docs/zh-CN/architecture/token-optimization-core.md)和[形式化证明 Bundle 架构](../docs/zh-CN/architecture/dsh-formal-proof-bundle.md)。
