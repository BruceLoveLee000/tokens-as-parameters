# FDIV R14 9/14 对齐消融实验（本地先导）

[English](README.md) | 简体中文

## 结论

2026 年 9 月 2 日（Asia/Shanghai），DSH Bundle 在与 SpecRefine 共享的冻结 9/14 FDIV Case 上完成了本地 14/14 复现。SpecRefine 控制组和四个新框架条件均获得 `PROVED`，最终 Controller Receipt 均满足：Lean 构建成功、锁定输入匹配、顶层定理签名匹配、14/14 Obligation 关闭、无禁止公理；启用双重 Loss 的候选也通过白盒审查。

这是一个条件对齐和机制验收先导实验，不是 Optimizer 有效性的统计证明。所有 Run 都在 Epoch 1 结束，`relative-reflection` 从未执行，因此本实验没有测量跨轨迹反思或“GRPO 外放”的收益。

## 证明边界

- Case：`fdiv-r14-warm-9of14-audited-rebaseline-parity-v1`；
- 初始状态：9/14，剩余 `rtlEquivSpec`、`rtlEquivSpec_normal_struct`、`rtlEquivSpec_normal_value`、`flag_iff_overflow`、`flag_iff_underflow`；
- Claim Scope：`lean-model-vs-spec`；
- 顶层结论是对所有两个 32-bit 输入的 Lean Model 与 Lean Spec 六元输出全等；
- 本实验不认证原始 RTL ↔ Lean Model fidelity，不能表述成 RTL 已被端到端证明；
- 这是包含历史 9/14 证明状态和证明脚手架的 Warm Start，不是从 0 开始。

## 对齐条件

| 条目 | 固定值 |
|---|---|
| Case source commit | `092ddf5765067775ce0a5d6838075d57b340945e` |
| Case manifest SHA-256 | `5b5ccc36da1f27f73c3cd2b526874b6bcb8e5c9cda3267a19a97addc8bd836d1` |
| 顶层签名 SHA-256 | `b68d1d991a5e0fb586ab1be0315190d8f28486e34143f25e7a8ffb7852376287` |
| DSH | `0.1.1-rc.2` |
| Provider / Model | `deepseek-official` / `deepseek-v4-flash` |
| Reasoning effort | `max`（从实际 Request Header 校验） |
| Prover 单次最大输出 | 64,000 Token |
| Rollouts / 并发 | 除 Single 外均为 2 / 2 |
| 全任务上限 | 300,000,000 Token / 43,200 秒 |
| 禁止项 | `sorry`、`admit`、自定义/禁止公理、`unsafe`、锁定输入变更、签名变更 |

SpecRefine 使用每路 20,000,000 累计 Token 和 7,200 秒边界；新 Runtime 使用每路 120 Model Step 作为主动深度边界，20,000,000 Token 字段仅作兼容记录。这是框架停止策略的真实差异，不能伪装成完全相同的超参数。最接近的 Independent Run 中两路实际均未超过 20,000,000 Token。

SpecRefine Judge 的单请求输出上限为 16,000，新 Runtime 为 32,000；本次单步实际最大输出分别为 5,077 和 13,248，均低于 16,000，因此该差异没有触发截断。SpecRefine 与部分新框架 Run 曾并发执行，墙钟时间受本机资源竞争影响，Token 与 Step 是主要比较口径。

## 结果

“首候选”指第一份通过确定性 Lean/锁定/签名/公理审计的候选；其 Token 是该时刻所有活动 Prover 的累计用量。时间从 Prover 阶段开始计算。最终耗时从 Run 创建到终态计算。

| 条件 | 有效机制 | Prover Step | Judge Step | 首候选耗时 | 首候选 Token | 最终耗时 | 最终 Token | 结果 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| SpecRefine control | 2 路；最终只审选中的一路 | 50 / 75 | 7 | 49:04 | 14.087M | 1:44:35 | 23.070M | `PROVED 14/14` |
| DSH Rule-only | 2 路；规则 Loss；无 Judge | 57 / 79 | — | 24:05 | 24.573M | 33:04 | 27.939M | `PROVED 14/14` |
| DSH Dual Loss | 2 路；逐路双重 Loss；反思未触发 | 80 / 113 | 21 / 18 | 24:36 | 23.818M | 49:04 | 46.260M | `PROVED 14/14` |
| DSH Single | 1 路；双重 Loss；反思关闭 | 51 | 25 | 19:11 | 8.525M | 26:45 | 14.347M | `PROVED 14/14` |
| DSH Independent | 2 路；双重 Loss；反思关闭 | 79 / 56 | 19 / 17 | 25:37 | 17.717M | 42:19 | 37.662M | `PROVED 14/14` |

| 条件 | Input | Output | Cache read | Reasoning（Output 子集） | Prover Token | Judge Token |
|---|---:|---:|---:|---:|---:|---:|
| SpecRefine control | 0.390M | 0.292M | 22.388M | 0.241M | 22.598M | 0.472M |
| DSH Rule-only | 0.351M | 0.267M | 27.320M | 0.219M | 27.939M | 0 |
| DSH Dual Loss | 0.836M | 0.341M | 45.083M | 0.252M | 38.187M | 8.073M |
| DSH Single | 0.410M | 0.126M | 13.811M | 0.101M | 8.525M | 5.822M |
| DSH Independent | 0.871M | 0.336M | 36.455M | 0.277M | 30.036M | 7.627M |

最接近的框架对照是 SpecRefine control 与 DSH Independent。单次观测中，新框架到首候选多消耗 25.8% Token，最终多消耗 63.3% Token；墙钟分别缩短 47.8% 和 59.5%，但墙钟受并发负载污染，不能解释为可靠加速。最终 Token 差异的一个明确来源是：新框架审查两路候选（7.627M Judge Token），SpecRefine 只审最终选中的一路（0.472M）。

Single 本次只用 8.525M Prover Token 就得到解，说明该 Case 上随机轨迹方差足以压过宽度差异。不能用一个 Single 样本得出“多路无效”，也不能用全部两路成功得出“多路必然更优”。

## 信任与产物证据

| 条件 | Run ID | 最终候选 Commit | `FdivProof.lean` SHA-256 | 行数 | 相对 9/14 基线 |
|---|---|---|---|---:|---|
| SpecRefine control | `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1-20260901144434-847879a4` | `53674247796bfd8e96536055a70b383f16fd618c` | `441e1d9759b063edde328bcbc2e17bae441cfbb9a980997be0975bd1d7a33299` | 4,251 | +345 / -27 |
| DSH Rule-only | `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1-20260901151440-eec9302c` | `9366161f9f6dac5974e0974cdd64738f32118ae5` | `4a379682b6aeb2878cfd78b84168ada4b43dfac7856f88e25b1e76eb5de6f566` | 4,261 | +360 / -32 |
| DSH Dual Loss | `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1-20260901155742-e42416c6` | `42d89838962e2c1afd31fc3630555c3954742f01` | `d887736fb3d9b250affe7896b1857d1f29609ca282cf017f029709abd4696dce` | 4,216 | +315 / -32 |
| DSH Single | `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1-20260901165519-e1648493` | `58998f3e3f7d9e90b596a3f3bf4b03fc8059faa7` | `ff5e641134f720428073a9857a40fbee1cdb2b4c983ffa1654b82caa78ed906d` | 4,350 | +444 / -27 |
| DSH Independent | `fdiv-r14-warm-9of14-audited-rebaseline-parity-v1-20260901172416-83160439` | `4766dbc7c0d3c984d0ffa43654bba09ad100bfa8` | `088f3a6778be76a5d46a920899fae8a26f93ff3c2aeef34d373d708237a7a82d` | 4,285 | +383 / -31 |

全部最终 Receipt 的公理闭包仅包含 `propext`、`Classical.choice`、`Quot.sound`。白盒 Judge 没有发现 Reward Hacking；Finding 均为信息、注释漂移、重复引理或 lint/卫生问题。Dual Loss Run 中 R1 曾提交含 `native_decide` 生成公理的中间候选，确定性 Checker 将其拒绝；Prover 随后改用 kernel `decide` 并再次通过，证明过程门禁真实生效。

14 个 Obligation 不等价于 14 份独立难题。白盒审查指出 `rtlEquivSpec_normal_struct` 与 `rtlEquivSpec_normal_value` 可由更强的正常路径/顶层位级等价直接推出。核心工作仍是 28 级除法器、GRS、RNE、指数、尾数和 Flags 的正常路径桥接，以及特殊值分支的穷尽装配。

## 消融解释

1. **Prover/Runtime 复现成功。** 新框架四次 Run 共 7 条 Prover Lane 全部在 120 Step 内独立得到 14/14，证明重基线后的接口对官方 DSH Code Agent 可解。
2. **白盒 Loss 在本批最终候选上没有改变 Verdict。** 规则 Checker 已拒绝 `native_decide` 中间候选；对白盒通过的最终候选进行同候选解释时，Judge 增加审计证据，但未发现规则门漏掉的作弊。
3. **在线 Rule-only 与 Dual Run 不是干净的因果消融。** 两者重新采样了随机 Prover 轨迹；Loss 在 Epoch 1 的候选产生后才执行，不能把两次 Run 的搜索 Token 差异归因于 Loss。干净比较应重放同一 Candidate Commit 到两种 Loss。
4. **Optimizer 尚未被测试。** Dual、Independent 与 Rule-only 都在 Epoch 1 完成，没有 `OptimizationDecision`、文本参数更新或父状态重新选择。Reflection 开关在这些轨迹上是未激活变量。
5. **逐路 Judge 代价显著。** 新框架的可审计性更强，但当前会等待全部 Lane 并逐路白盒审查。对“任一可信完整解即可终止”的目标，可进一步实验流式 Loss：候选一提交就并行审查，首个批准后取消其余 Lane；不要把该策略直接硬编码成唯一行为。

## 下一步

- 使用更难且不会在 Epoch 1 闭合的同源 8/14 或 0/14 Case，比较 Single、Independent、Group Relative，确保 Reflector 至少执行一次；
- 每个条件至少重复 3 次，报告成功率、首可信解 Token 的中位数/分位数，而不是只比较单 Run；
- 对同一组不可变 Candidate Commit 离线重放 `lean-rule-only` 与 `lean-dual-check`，隔离 Loss 的成本与误判收益；
- 将“等待全组”与“首个双重 Loss 批准即停止”作为独立调度消融；
- 在许可允许前，完整 Case、Proof 和 Session Trace 继续保存在本地受限证据库。公开仓只提交本报告中的哈希和统计，因此当前是本地可信复现，不是第三方可下载复现。

## 版本身份

- Tokens as Parameters：`6c60a5ec8cf6132b74587d2d4f4a61f61f26ec42`；
- SpecRefine：`a3bb467bbd7ce5bb0891cf6c4f4546b2639d0fa5`；
- Case 仓：`092ddf5765067775ce0a5d6838075d57b340945e`；
- 外部 FloatSpec/fspec：`eef09dc52b20c00c378e3ee25fabdac23bf65ac9`。
