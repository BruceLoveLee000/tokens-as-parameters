# 来源说明

[English](PROVENANCE.md)

## 原创材料

本 Case 中的 FDIV 规格、Lean Model、证明外壳、Verilog RTL、测试程序和工程说明，
均为 Bruce Lee 委托生成、选择、审查并贡献的原创 AI 辅助研究材料。贡献者确认这些材料
并非从专有芯片 RTL 或受限 Benchmark 复制而来。对于生成材料中可能存在的著作权或其他
可许可权利，贡献者以 Apache-2.0 发布；本次贡献同时适用仓库 DCO。

公开 Case 来源于本地研究快照 Commit
`22fdb9ad12c83d2196dfa581e277f46e3dfb12fa`。私有仓库位置不会公开。公开打包版本把
机器本地的 FloatSpec 路径替换为下述精确 Git 依赖；除此之外，算术 Model、Spec、RTL、
定理签名、证明外壳、测试和面向模型的工程说明均保持不变。

## 外部依赖

`FloatSpecBridge.lean` 引用了 FloatSpec，但本 Case 不内置 FloatSpec 源码。Lake 从公开的
[Beneficial-AI-Foundation/FloatSpec](https://github.com/Beneficial-AI-Foundation/FloatSpec)
仓库获取 Commit `eef09dc52b20c00c378e3ee25fabdac23bf65ac9`。该 Checkout
包含 Apache-2.0 `LICENSE`，没有 `NOTICE` 文件。最终顶层定理不依赖 FloatSpec 声明，
但因为该桥接层存在于实际运行的 Case 中，所以仍保留为冻结构建面的一部分。

## 审计与结论边界

- 预期结论：`PROVED`。
- Claim Scope：对任意两个 32-bit 输入，给定 Lean `FdivModel` 与 Lean `FdivSpec`
  的六个结果字段全部相等。
- 本结果没有普遍证明 Verilog 到 Lean 的转录正确性。
- 算术语义采用 RNE，以及文档规定的微小非零输出 FTZ 行为；它不是完整的 IEEE-754
  渐进下溢语义。
- 经审计的 Spec 重基线具有源码审查、可执行回归和历史证明证据，但不声称存在旧 Spec
  与新 Spec 的全称等价定理。

## 公开参考解

起始 Case 对唯一公开 Obligation 只包含 `sorry`。2026-09-13 得到的参考证明单独发布在
`experiments/fdiv-raw-top1-showcase/` 下，不会被 Case Catalog 物化到 Run 工作区。
由于参考解已经公开，本 Case 适合作为可复现 Showcase 和回归任务；对于能够读取本仓库
或互联网的模型，它不再是无污染的盲测 Benchmark。
