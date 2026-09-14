# FDIV raw-top1 Optimizer Showcase

[English](README.md)

本实验族研究：多路证明 Rollout、由 Verifier 支撑的 Loss、持久化文本参数与比较式反思，
能否从一条 FDIV 顶层 Obligation 自主发现证明架构。

可执行起始 Case 是
[`fdiv-r14-raw-top1-audited-rebaseline-v1`](../../benchmarks/fdiv-r14-raw-top1-audited-rebaseline-v1/)。
与之前的 9/14 对齐先导实验不同，它不包含十四条 Obligation 拆解、历史证明前沿、Proof
API、路线建议或已完成的目标证明。

首个成功结果记录在
[`results/2026-09-13-deepseek-v4-flash`](results/2026-09-13-deepseek-v4-flash/README.zh-CN.md)。
参考证明与实验结果一起发布，而不放入 Case，因此 Runtime 不会把它物化到 Prover 工作区。

这是一个公开案例研究和回归目标。由于参考证明已经公开，不能把它表述为无污染的模型盲测
Benchmark。
