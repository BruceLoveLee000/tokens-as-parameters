# Tokens as Parameters

[English](README.md) | 简体中文

> Tokens Are All You Need — If You Can Optimize Them.

固定权重的语言模型，能否在推理阶段继续学习？

Tokens as Parameters 是一个实验性研究系统，用于验证：经过证据驱动的优化、能够跨后续决策保留，并可测量地改变模型行为的文本状态，能否承担“推理时自适应参数”的功能。

系统通过多路推理轨迹、可靠 Verifier、跨轨迹比较、文本方向更新和上下文整合，在不修改模型权重的前提下优化 Agent 的后续行为。第一个研究试验场是基于 Lean 与 DeepSeek Harness 的长时芯片形式化验证。

并非所有 Token 都是参数。只有当 Token 被证据和目标驱动地更新、被保留，并对未来动作分布产生可重复的方向性影响时，它才具备参数式功能。

## 状态

研究预览版。当前正在建立可复现的 DSH 插件组、Verifier 适配器与实验框架，API 和实验协议仍会变化。

## 核心研究问题

在模型权重固定时，Verifier 引导的优化器能否更新持久文本状态，使后续轨迹在相同推理预算下获得更高的期望奖励？

## 计划中的系统

- 基于 DSH 官方 Code Agent 和 Agent Loop 的原生编排；
- 多路隔离推理轨迹与持久 Run 身份；
- Verifier 门控的受信进度和 reward hacking 防御；
- 作为方向性文本更新的跨轨迹反思；
- Git 支撑的证据状态、认知状态和状态转移历史；
- 面向未来奖励的上下文整合，而不是普通摘要；
- 单路、独立并行、自反思、组间反思、持久 insight、上下文整合的等预算消融；
- 以 Lean 和芯片形式化验证作为第一个 Verifier 与 Benchmark 家族。

## 许可证

- 软件和原创代码示例：Apache License 2.0；
- `docs/` 下的原创文档与研究图表：CC BY 4.0；
- Benchmark：逐 Case 授权，并强制记录来源与许可证；
- 社区贡献：Apache-2.0，并使用 DCO 1.1 sign-off。
