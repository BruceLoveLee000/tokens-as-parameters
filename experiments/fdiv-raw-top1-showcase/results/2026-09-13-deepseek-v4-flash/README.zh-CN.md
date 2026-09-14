# FDIV raw-top1 端到端 Optimizer 收敛案例

[English](README.md)

## 结果

2026-09-13（Asia/Shanghai），Formal Proof Bundle 在 7 个 Epoch 内关闭了唯一冻结的
顶层定理。两路 Prover、Lean 加白盒双重 Loss、持久化文本参数和 6 次比较式反思，最终
产生了两个分别通过验收的候选；Controller 把 r1 晋升为可信结果。

这是仓库中第一个 `relative-reflection` 真正跨多个 Epoch 运行，并同时改变后续任务和 Git
父状态选择的案例。它为机制有效性提供了强证据；但单次 Run 加上可变的 Provider 模型
别名，不能构成 Optimizer 因果有效或新框架优于 SpecRefine 的统计证明。

## 冻结问题与结论边界

```lean
theorem rtlEquivSpec (a b : BitVec 32) :
    rtl_comb a b = fdiv a b
```

- 起始进度为 `0/1`，目标证明体是 `sorry`。
- Claim Scope：对任意两个 32-bit 输入，Lean Model 与 Lean Spec 六个结果字段全部相等。
- Run 没有获得之前的十四条 Obligation 拆解、完成证明、Proof API 或历史 Helper 前沿。
- 该定理没有普遍认证 Verilog 到 Lean 的转录正确性。
- 算术语义包含文档规定的微小结果 FTZ 行为，不是完整的 IEEE-754 渐进下溢。
- 经审计的 Spec 重基线是本实验接受的输入；本 Run 没有证明旧版与新版 Spec 形式的全称
  等价关系。

## 配置

| 条目 | 值 |
|---|---|
| Framework 源码 | `2ac0663245d6c8368a69c688a52c459de9c32168` |
| 实际运行的本地 Case Manifest | `194d8f2f628ea04444dcdb147c721e0b0e6125b042ce19cba2a3995b97d32247` |
| 可移植公开 Case Manifest | `29b40bc26ab71ca174b04f6e99e8d337a8fdeeaa39f3662fd314dd7418f806b7` |
| DSH 目标版本 | `0.1.1-rc.2` |
| Provider / 模型别名 | `deepseek-official` / `deepseek-v4-flash` |
| Reasoning effort | `max` |
| Prover / Loss / Optimizer | `formal-code-agent` / `lean-dual-check` / `relative-reflection` |
| Rollouts / 并发 | 2 / 2 |
| 单路深度 | 每个 Epoch 64 Model Step |
| 单路累计兼容预算 | 20,000,000 Token |
| Reflection | 开启；32 Step；500,000 Token 软提交阈值 |
| Loss Judge | 每个候选 24 Step |
| 总上限 | 300,000,000 Token / 12 小时 |

`deepseek-v4-flash` 是 Provider 别名，而不是内容寻址的模型快照。Provider 可能在不改变
别名的情况下更新权重或推理栈，因此这是后续对比实验的重要混杂变量。

两个 Case Manifest Hash 不同，是因为公开打包版本把本地 FloatSpec 路径替换为相同的固定
Git Commit，增加再分发元数据，并锁定面向模型的文档和测试。数学 Model、Spec、RTL、
证明外壳和定理签名都没有变化；公开参考证明已经在可移植公开 Case 上重新构建成功。

## 汇总指标

| 指标 | 观测值 |
|---|---:|
| Verdict | `PROVED 1/1` |
| Epoch | 7 |
| 比较式反思 | 6 次 |
| 墙钟时间 | 2:52:24.636 |
| LLM 总 Step | 1,166 |
| Prover / Loss Judge / Reflector Step | 838 / 285 / 43 |
| Input Token | 4,045,961 |
| Output Token | 2,294,655 |
| Cache-read Token | 123,862,272 |
| 含 Cache 的 Total Token | 130,202,888 |
| 可信候选 | `e290975eceb1c45a9e278a2f1e3414bb4957800e` |
| 第二个通过候选 | `d5b6360712b5a3f4a0b44c85920a33df05eca040` |
| 参考证明 | 2,632 行；189 个 theorem/lemma 声明 |

Reasoning Token 遥测属于 Output 统计的子集，因此不重复加入总数。Cache 流量占所报总量的
95.1%；对比时应分别报告 Output、Fresh Input、Step 和墙钟时间，而不是把每个 Cache-read
Token 都当成新生成工作。

## 收敛轨迹

公开 Obligation 进度直到最终 Dispatch 关闭前始终是 `0/1`。下表中的 Helper 前沿是经
Verifier 确认的内部结构，不是新增公开 Obligation。

| Epoch | Verifier 支撑的状态转移 | Optimizer 后果 |
|---:|---|---|
| 1 | 两个候选均无效：一路修改/删除目标，另一路只把有用数学写在未编译 Scratch 中。 | Reflection 把它判断为过程纪律失败，而不是数学不可证明，并拆分特殊/控制路径与 Divider 路径。 |
| 2 | 一路在红树中提交了有用的特殊/控制引理；另一路产生了可靠但不在 Build Closure 中的孤立 Divider Module。 | Reflection 要求后续只持久化 Green Commit 和 Build Closure 内证据。 |
| 3 | 首次形成可接受 Helper 前沿：r1 有 76 个特殊/控制声明；r2 在定位 Namespace 审计问题后形成 Divider 不变量与操作数/指数桥。 | 下一轮任务明确保留并组合互补证据。 |
| 4 | r1 组合特殊路径和 Divider；r2 加入 Subnormal 归一化与 p=26 GRS 分支。声明名中的 Apostrophe 暴露了 Axiom Probe 解析缺陷。 | Route Memory 禁止脆弱命名，并同时保留两边数学成果。 |
| 5 | 避开审计命名缺陷；r2 Commit `2f5b0124…` 成为首个宽覆盖可信 Checkpoint，并完成 RNE 层。 | 下一轮两路都基于可信并集，不再重启。 |
| 6 | r1 Commit `05b9ba27…` 持有 `mant_b ≤ mant_a`（`ge`）块；r2 Commit `e8d1d7f…` 持有互补的 `mant_a < mant_b`（`lt`）消费链。两边均通过 Lean 和白盒审查，但目标仍为 `sorry`。 | Reflection 选择不同父 Commit，并让每路补齐缺失的另一半；同时纠正了旧误诊：很多表面递归错误其实是 Bool 优先级问题，真正递归问题来自展开投影密集的 Spec 定义。 |
| 7 | 两路都引入缺失的一半，完成正常路径装配与特殊/正常 Dispatch，并分别达到 `1/1`。 | Controller 重跑可信 Lean 检查后接受 r1；r2 提供了独立佐证。 |

Epoch 6 到 7 的关键转移符合预想的类梯度机制：经验证的差异与失败证据，改变了持久化文本
参数和父状态选择，进而改变了下一轮 Rollout。但这个观测没有隔离模型采样、模型能力、
Prompt 质量或累计证明代码的因果贡献。

## 可信结果

对晋升候选：

- `lake build` 退出码为 0，并构建了 `FdivProof`；
- 所有锁定输入 Hash 和目标签名一致；
- 公开 Obligation 为 `1/1`，且 `finalAccepted` 为 true；
- 接受的证明中没有 `sorry`、`admit`、自定义公理、`unsafe` 或 `native_decide`；
- 顶层定理的传递公理集合恰好是 `propext`、`Classical.choice`、`Quot.sound`；
- 白盒 Judge 返回 approved / low risk，没有发现弱化目标、隐藏前提、空洞分支、定理遮蔽或
  Obligation 计数作弊。

仍有一个结构性限制：`mkState` 和 `rtl_comb` 定义在可编辑的 `FdivProof.lean` 中，没有
作为锁定输入单独 Hash。两个通过候选都保持了该 Prelude 字节不变，白盒审查也检查了这一点，
所以不影响本次观测结果；未来 Case 版本应把这些定义移出可编辑文件或单独固定 Hash，让该
约束由机器强制执行。

FloatSpec 的完整默认目标重放时会输出自身的 `sorry` 警告，但声明级公理审计证明它们没有
进入 `rtlEquivSpec` 的传递证明锥。公开 Case 以 Apache-2.0 固定 FloatSpec Commit
`eef09dc…`，并把原实验的本机绝对路径替换为可移植 Git 依赖。

## 本结果支持什么

已经支持：

1. 打包后的 Prover/Loss/Optimizer Runtime 能解决这个非平凡 Case；
2. Verifier 门控的 Git 状态和文本参数更新，把有效工作跨 7 个 Epoch 持久化下来；
3. 比较式反思识别出互补分支，并在关闭前调度了不同父状态；
4. 最终结果通过确定性 Lean 与独立白盒 Reward-hacking 审查。

尚未支持：

1. 新框架在统计意义上优于 SpecRefine；
2. Reflection、并行宽度或任意单个 Plugin 是成功的单独原因；
3. 当前 Provider 提供的模型与更早的 `deepseek-v4-flash` 部署完全相同；
4. Verilog RTL 与 Lean Model 具有普遍等价性；
5. 第三方能够复现相同的搜索成本或轨迹。

严格对齐实验需要固定同一 Case、模型快照或带日期的 Provider 部署、Prompt、工具、技能、
预算、停止策略，并进行多次重复。主要指标应包括成功率、首个可信证明的 Step/Token 中位数
与分位数、Output/Fresh-input 成本、墙钟时间和白盒拒绝率。

## 发布证据

- [`reference/FdivProof.lean`](reference/FdivProof.lean)：晋升的参考证明，SHA-256
  `da1074579691416e2bb71811f742d589eabd46fd10151aed0755b0c6936f4926`。
- [`receipt.json`](receipt.json)：移除本机路径后的 Controller 与 Verifier Receipt 摘要。
- 原始 Session Trace 含本机路径和大量无必要的缓存上下文，因此不提交。持久化本地 Trace
  仍保留，后续可发布经过脱敏的事件级材料。

公开参考解后，本案例属于透明 Case Study 和回归目标。未来盲测需要使用未公开的 Held-out
Case，或者确保模型环境无法检索公开证明。
