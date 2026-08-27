# Tokens as Parameters

[English](README.md) | 简体中文

> Tokens Are All You Need — If You Can Optimize Them.

固定权重的语言模型，能否在推理阶段继续学习？

Tokens as Parameters 是一个实验性研究系统，用于验证：经过证据驱动的优化、能够跨后续决策保留，并可测量地改变模型行为的文本状态，能否承担“推理时自适应参数”的功能。

系统通过多路推理轨迹、可靠 Verifier、跨轨迹比较、文本方向更新和上下文整合，在不修改模型权重的前提下优化 Agent 的后续行为。第一个研究试验场是基于 Lean 与 DeepSeek Harness 的长时芯片形式化验证。

并非所有 Token 都是参数。只有当 Token 被证据和目标驱动地更新、被保留，并对未来动作分布产生可重复的方向性影响时，它才具备参数式功能。

## 状态

研究预览版。第一套 DSH 原生形式化证明 Bundle 已基于 `0.1.1-rc.2` 的公开扩展接口实现，包含隔离的并行 Prover、Verifier 门控的 Git Checkpoint、Agentic 组间相对反思、声明级语义合并、持久 Run 证据以及最终白盒审查。API 和实验协议仍会变化。

## 核心研究问题

在模型权重固定时，Verifier 引导的优化器能否更新持久文本状态，使后续轨迹在相同推理预算下获得更高的期望奖励？

## 已实现的第一阶段

- 基于 DSH 官方 Code Agent 和 Agent Loop 的原生编排；
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
npm pack
dsh plugin --profile web add ./tokens-as-parameters-dsh-formal-proof-0.1.0.tgz
dsh web
```

在 DSH Code Agent 对话中，让 Agent 使用 `proof_run_start`，并传入包含 `case.json` 的 Git 版本化 Case 路径。官方 DSH Session UI 继续承担轨迹展示；Bundle 还会为每个 Run 持久化 `run.json` 与 `events.jsonl`。

进一步阅读：[Bundle 指南](packages/dsh-formal-proof/README.zh-CN.md)、[架构说明](docs/zh-CN/architecture/dsh-formal-proof-bundle.md)和 [FDIV 复现实验协议](experiments/fdiv-reproduction/README.zh-CN.md)。

## 下一步研究工作

- 使用打包后的 Bundle 完整复跑已完成许可证确认的 FDIV R14 Checkpoint；
- 增加面向未来 Reward 的上下文整合，而不是普通摘要；
- 对单路、独立并行、自反思、组间反思、持久 Insight、上下文整合执行等预算消融实验。

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
