# Chips 领域

[English](README.md) | 简体中文

本目录预留给硬件专属插件，例如 RTL-to-Formal Fidelity Certificate、时序等价性任务、Simulator Replay 与硬件协议语义。

当前有意不放置可执行插件。现有实现证明的是冻结 Lean Model 与冻结 Lean Spec 的一致性，并未提供端到端 RTL Fidelity Adapter。FDIV 输入与结果属于 `benchmarks/` 和 `experiments/`，不能进入 Core Optimizer 或通用 Formal Prompt。

未来的 `rtl-lean-equivalence` Package 必须先定义信任契约与来源规则，Bundle 才能声称覆盖 `rtl-vs-spec`。
