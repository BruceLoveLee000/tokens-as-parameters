# FDIV 能力回退审查

[English](../../en/architecture/fdiv-capability-review.md)

## 对照基线

本审查把重构后的 Bundle 与一次成功的 FDIV 辅助实验对比：该实验把 Checker 受信进度从 9/14 推进到 14/14，使用 DeepSeek V4 Flash；包含 Cache 流量在内约消耗 1.9885 亿 Total Token、约 321.6 万 Output Token，运行约 6 小时 7 分钟，最终获得 14/14 Lean Kernel 校验和低风险白盒审查结论。

这里对比的是对成功有贡献的机制，不复制 Benchmark 专属 Prompt，也不宣称已经完成新复现。

## 能力矩阵

| 历史能力或经验 | 重构状态 | 证据 / 影响 |
|---|---|---|
| 官方 DSH Code Agent、Agent Loop、Session、工具、压缩与计量 | 保留 | Bundle 组装官方 DSH Package，不自行重写 |
| 独立 Rollout Session 与 Git Worktree | 保留 | 每路获得稳定 Session ID 和 Detached Worktree |
| 单次 Max-token 后继续运行 | 保留 | 每路累计预算未耗尽时在同一 Session 续跑 |
| 单路、总 Token 与总时长长预算 | 保留 | 都是显式 Run 控制；停滞不是隐式停止条件 |
| Controller 自有 Lean Build 与锁定输入/Signature/Hygiene 检查 | 保留 | 模型声称不能推进进度 |
| 逐 Obligation Axiom Audit 与全量最终门 | 保留 | 依赖禁止 Axiom 的声明不能虚增受信进度 |
| 只读白盒 Reward-hacking 审查 | 保留 | 只在确定性成功后拥有否决权 |
| 声明级语义整合而非 `git merge` | 保留 | 新关闭的 Obligation 与通过 Checker/Axiom 的新增或修改 Helper Theorem 会被移植并完整复检 |
| 自主多工具 Reflector | 保留 | 可查参数使用、Lane Receipt、Trace 范围/搜索、状态节点和转移 Diff |
| 反思 Submit-only 边界与确定性 Fallback | 保留 | 当前 Step 软提示、一次 Schema 重试，随后中性更新 |
| Prover 主动 `record_insight` Git 节点 | 保留 | 证明状态、简洁摘要与 Insight 文件一起 Commit |
| 多 Parent Reflection 来源 DAG | 保留 | Lane Tip 作为 Parent；未验证分支 Tree 不做语义合并 |
| 受信 Proof Commit 与搜索/来源状态分离 | 保留 | 反思本身不能制造证明进度 |
| 持久 Run ID、Snapshot、Event 与原生 Session 历史 | 保留 | 页面刷新或重连不会抹掉 Controller 证据 |
| 文本参数 Revision 到 Rollout 结果的精确归因 | 改进 | 新增 Context Snapshot 和 Parameter Usage 查询，消除旧歧义 |
| 通用反思输出 | 改进 | Reflector 原子更新领域 Agent 注册的任意参数子集；Core 不再假设公共 Prompt/Route |
| FDIV 专属 Skill 或泄漏答案 | 主动移除 | 通用 Bundle 不包含 Benchmark 答案，更适合干净消融 |
| SpecRefine 双路并排专用 UI | 范围变化 | 官方 DSH Session 取代自定义 UI；研究证据保留，但不宣称 UX 等价 |
| Checker-clean 但只新增 Helper 的 Checkpoint 晋升 | 已恢复 | 新增/修改 Helper Theorem 会与 Epoch Base 对比，经过 Axiom Audit、语义移植和完整复检后晋升，但不虚增命名 Obligation 数量 |
| 跨多路的丰富 Proof Capsule 整合 | 部分保留 | 支持跨 Lane 整合 Theorem/Lemma；任意 Definition 与独立 Capsule Schema 尚未支持 |
| 认证 Counterexample 与 `DISPROVED` 链路 | **缺失** | 模型提出的反例不能生成终止性反驳结论 |
| 面向 Lean Kernel Deep Recursion/可归约性病态的证明接口 Rebaseline | **缺失** | 历史成功实验使用了独立版本化的新证明接口；Bundle 尚未自动化该治理流程 |
| 历史 Case Schema 迁移与 FDIV 14/14 端到端复跑 | **尚未证明** | 单测与契约检查已通过，但经验等价仍需复现实验 |

## 回退判断

基础并行搜索、反思、确定性信任、预算、持久化和最终审查闭环没有回退。Core 重构还改善了最核心的研究变量：目标 Agent 显式定义参数；每个实例独立选择冻结或开放；参数有版本、有精确 Rollout 归因，并进行原子更新。

本次审查发现的 Helper-only 缺口没有被简单豁免，而是完成了修复：Verifier 会相对 Epoch Base 发现发生变化的具体 Helper Theorem，执行 Axiom Audit；Integrator 只移植通过的语义单元，并再次完整检查。Helper-only Checkpoint 不会改变命名进度计数。

仍缺失的 `DISPROVED`、任意 Definition Capsule 与证明接口 Rebaseline 也很重要，但它们影响任务覆盖、整合宽度和恢复能力，不影响当前正向证明被接受时的 Soundness。

## 本次重构已完成的验证

- TypeScript Project Reference Build 与 Typecheck；
- 参数定义、实例级反馈选择、冻结/过期拒绝、精确暴露、原子替换和 Formal 自有参数 ID 契约测试；
- Reflection 来源 DAG 与参数状态持久化 Git 测试；
- 原有 Lean Parsing、Hygiene、Obligation、Axiom、越权修改、Consolidation、Helper Checkpoint、Package 边界和 Telemetry 测试；
- Core 不依赖 Formal、Lean、Chips 或 Bundle 的依赖规则。

## 复现门槛

在同一个新 Run ID 下归档以下证据前，不应把本实现标记为“FDIV 已复现”：

1. 符合当前 Manifest Schema、许可证明确的版本化 Case；
2. 不可变 Baseline Commit 和锁定输入 Hash；
3. 完整 Prover/Reflector/Reviewer Session 与 Run Ledger；
4. 14/14 最终 Lean Receipt，含逐 Obligation 与顶层定理 Axiom Audit；
5. 白盒审查；
6. 精确 Input、Output、Cache、Reasoning、时长与配置统计。
