# Benchmarks

[English](README.md) | 简体中文

Benchmark 是经过版本管理的研究输入，不是临时测试 Fixture。仓库级 Apache-2.0 许可证不会自动重新授权第三方硬件设计、规格、数据集或 Trace。

每个 Case 必须包含：

```text
<case>/
├── LICENSE or LICENSES/
├── PROVENANCE.md
├── PROVENANCE.zh-CN.md
├── case.json
├── README.md
├── README.zh-CN.md
├── inputs/
├── verifier/
└── expected/
```

`PROVENANCE.md` 必须记录原始来源、Commit、许可证、作者、转换过程和再分发权利。`case.json` 是 Runtime Manifest，必须锁定文件 Hash、定理身份、不可变输入与可变证明面。实验 Manifest 另行锁定工具链/模型版本、预算与预期 Verdict。

第一版 Runtime 把本目录树作为实验 Case Catalog。只有包含合法 `case.json` 的目录才能被发现。Run 只能按精确 `caseId` 启动，而且 Case 目录必须在 Git Commit 上保持干净；Runtime 会把它复制到 Run 专属工作区，永远不会原地修改。`.git`、`.lake`、`node_modules`、Build 输出和 `.tokens-as-parameters` 等生成状态不属于物化后的 Case。

正例必须具有可以辩护的 `PROVED` 预期依据；负例必须记录规范反例或其他可独立重放的 `DISPROVED` 依据；不得为了优化成功指标而把 Unknown Case 静默改标。
