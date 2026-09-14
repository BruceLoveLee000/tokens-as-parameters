# Tokens as Parameters

[English](README.md) | 简体中文

> Tokens Are All You Need — If You Can Optimize Them.

固定权重的语言模型，能否在推理阶段继续学习？

Tokens as Parameters 是一个实验性研究系统，用于验证：经过证据驱动的优化、能够跨后续决策保留，并可测量地改变模型行为的文本状态，能否承担“推理时自适应参数”的功能。

系统通过多路推理轨迹、可靠 Verifier、跨轨迹比较、文本方向更新和上下文整合，在不修改模型权重的前提下优化 Agent 的后续行为。第一个研究试验场是基于 Lean 与 DeepSeek Harness 的长时芯片形式化验证。

并非所有 Token 都是参数。只有当 Token 被证据和目标驱动地更新、被保留，并对未来动作分布产生可重复的方向性影响时，它才具备参数式功能。

## 状态

研究预览版。第一版有意限定为**仅支持实验模式**：只运行仓库内版本化的不可变 Case；每次调用都会物化新的 Run 专属 Git 工作区；不会修改 Case，也不会把结果自动合回 Case。针对用户指定工作区的生产模式推迟到 [Issue #4](https://github.com/BruceLoveLee000/tokens-as-parameters/issues/4)。

第一套 DSH 原生形式化证明系统已经重构为相互独立的 Core、Formal、Lean、Tool 与 Bundle Workspace Package，目标是 DSH `0.1.1-rc.2` 公开扩展接口。领域无关的 Core Training Runtime 驱动可替换的 Prover、Loss 与 Optimizer Plugin；Formal Adapter 增加隔离搜索状态、绑定 Commit 的逐 Rollout Lean + 白盒反馈、Optimizer 选择的 Git 父状态以及持久 Run 证据。

## 核心研究问题

在模型权重固定时，Verifier 引导的优化器能否更新持久文本状态，使后续轨迹在相同推理预算下获得更高的期望奖励？

## 已实现的第一阶段

- 基于 DSH 官方 Code Agent 和 Agent Loop 的原生编排；
- `packages/core/optimization` 内核：领域 Agent 注册版本化文本参数，逐实例选择是否接受反馈，记录精确上下文暴露，并接收可替换 Optimizer 的原子语义更新；
- `packages/core/training-runtime` 循环：组合 Rollout、Evaluation、Optimization、状态应用与有保证的 Epoch 清理，不导入 Formal 或 Lean 语义；
- 多路隔离推理轨迹与持久 Run 身份；
- Verifier 门控的受信进度和 reward hacking 防御；
- 作为方向性文本更新的跨轨迹反思；
- Git 支撑的证据状态、认知状态和状态转移历史；
- 以 Lean 和芯片形式化验证作为第一个 Verifier 与 Benchmark 家族。

Bundle 不会重复实现 Code Agent、Agent Loop、对话 UI、Shell、文件系统、上下文压缩器或 Token 计量器；这些能力继续由 DSH 官方实现提供。

## 快速开始

前置条件：Node.js `^22.19` 或 `>=24`、DSH `0.1.1-rc.2`、Git，以及由 Lake 管理的 Lean 工程。

```bash
npm ci
npm run check
npm run pack:local
dsh plugin --profile web add ./tokens-as-parameters-*.tgz
dsh web
```

从本仓库 Checkout 启动 DSH，使默认 Case Catalog 指向 `./benchmarks`，然后在 DSH Code Agent 对话中输入：

```text
/chip_proof lean-smoke-positive
```

集成层会把这个约定转换成模型可见的 `chip_proof({ case_id })` Tool。Runtime 只接受精确注册的 Case id，不接受任意工作区路径。它会检查 Case 已提交，把 Case 复制到 `.tokens-as-parameters/runs/<runId>/workspace`，再次校验锁定 Hash，并在任何 Prover 启动前初始化新的 Git Baseline。官方 DSH Session UI 继续承担轨迹展示；Bundle 还会为每个 Run 持久化 `run.json` 与 `events.jsonl`。

Lean 依赖包只能通过本地共享缓存复用；缓存键由锁定的 Lake manifest、toolchain、lakefile 和声明的外部依赖提交共同确定。证明构建产物不会跨 Run 共享。

进一步阅读：[Core 架构与 Optimizer Provider 契约](docs/zh-CN/architecture/token-optimization-core.md)、[Bundle 指南](packages/bundle/formal-proof/README.zh-CN.md)、[形式化证明架构](docs/zh-CN/architecture/dsh-formal-proof-bundle.md)和 [FDIV 复现实验协议](experiments/fdiv-reproduction/README.zh-CN.md)。

第一个公开的端到端 Optimizer Showcase 从零开始，经过 7 个 Epoch 和 6 次比较式反思，
关闭了 FDIV 顶层定理。可阅读具有明确结论边界的
[案例结果](experiments/fdiv-raw-top1-showcase/results/2026-09-13-deepseek-v4-flash/README.zh-CN.md)，
并检查可再分发的 Case 和参考证明。该单次 Run 是机制证据，不是新框架优于 SpecRefine
的统计结论。

## 下一步研究工作

- 在公开 raw-top1 FDIV Case 上进行条件对齐、多 Seed 的重复消融实验；
- 发布经过脱敏的事件级证据，同时避免泄漏本机路径或凭据；
- 增加面向未来 Reward 的上下文整合，而不是普通摘要；
- 对 Prover、Loss、Optimizer、父状态选择、反思和持久 Insight 执行等预算消融实验。
- 仅在实验链路稳定后增加用户工作区生产模式（[Issue #4](https://github.com/BruceLoveLee000/tokens-as-parameters/issues/4)）。

## 仓库目录

```text
packages/       DSH 插件、Runtime Service 与 Verifier Adapter
benchmarks/     带逐 Case 来源和许可证的版本化任务
experiments/    可复现实验协议、消融与结果 Schema
docs/           理论、架构、研究记录与报告
```

## 许可证

- 软件和原创代码示例：Apache License 2.0；
- `docs/` 下的原创文档与研究图表：CC BY 4.0；
- Benchmark：逐 Case 授权，并强制记录来源与许可证；
- 社区贡献：Apache-2.0，并使用 DCO 1.1 sign-off。

参见 [LICENSE](LICENSE)、[NOTICE](NOTICE)、[docs/LICENSE.md](docs/LICENSE.md) 与 [CONTRIBUTING.md](CONTRIBUTING.md)。
