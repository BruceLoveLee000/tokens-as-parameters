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
| 单次 Max-token 后继续运行 | 保留 | 模型 Step 深度未耗尽时在同一 Session 续跑 |
| 长搜索深度、总 Token 与总时长预算 | 改进 | 模型 Step 是主要深度；Cache Read 不再提前结束 Lane |
| 领域无关 Training Loop | 改进 | Core 负责带类型的 Rollout/Evaluation/Optimization/Epoch 控制，不导入 Formal 或 Lean |
| Loss 自有 Lean Build 与锁定输入/Signature/Hygiene 检查 | 保留 | 模型声称不能推进进度；Receipt 与 Loss 绑定精确 Candidate Commit |
| 逐 Obligation Axiom Audit 与全量最终门 | 保留 | 依赖禁止 Axiom 的声明不能虚增受信进度 |
| 只读白盒 Reward-hacking 审查 | 改进 | 成为每个 Rollout 后的可替换 Loss，Finding 会进入下一优化 Step |
| 跨 Lane Solution-State 整合 | 重设计 | 不做正则移植；Optimizer 选父状态，语义整合由普通 Prover 任务完成并经过 Loss |
| 自主多工具 Reflector | 改进 | 新增完整 Loss、Commit 文件读取和跨状态文件比较 |
| 反思 Submit-only 边界与确定性 Fallback | 保留 | 模型 Step 边界、一次 Schema 重试，随后中性决策 |
| Prover 主动 `record_insight` Git 节点 | 改进 | 安全的已变更证明源码、简洁摘要与 Insight 文件一起 Commit |
| 多 Parent Reflection 来源 DAG | 保留 | Lane Tip 作为 Parent；未验证分支 Tree 不做语义合并 |
| 受信 Proof Commit 与搜索/来源状态分离 | 保留 | 反思本身不能制造证明进度 |
| 持久 Run ID、Snapshot、Event 与原生 Session 历史 | 保留 | 页面刷新或重连不会抹掉 Controller 证据 |
| 文本参数 Revision 到 Rollout 结果的精确归因 | 改进 | 新增 Context Snapshot 和 Parameter Usage 查询，消除旧歧义 |
| 通用反思输出 | 改进 | Reflector 原子更新参数子集，并逐 Lane 选择合法父状态/任务 |
| FDIV 专属 Skill 或泄漏答案 | 主动移除 | 通用 Bundle 不包含 Benchmark 答案，更适合干净消融 |
| SpecRefine 双路并排专用 UI | 范围变化 | 官方 DSH Session 取代自定义 UI；研究证据保留，但不宣称 UX 等价 |
| Checker-clean 但只新增 Helper 的状态保留 | 保留且不伪造 Reward | Helper 状态保持 `VERIFIED` 且可选，但不会自动推进命名 Obligation Reward |
| 跨多路的丰富 Proof Capsule 整合 | 重设计 | 完整 Candidate Commit 保留为分支；Optimizer 可检查并调度语义整合，不依赖独立 Capsule Schema |
| 认证 Counterexample 与 `DISPROVED` 链路 | **缺失** | 模型提出的反例不能生成终止性反驳结论 |
| 面向 Lean Kernel Deep Recursion/可归约性病态的证明接口 Rebaseline | **缺失** | 历史成功实验使用了独立版本化的新证明接口；Bundle 尚未自动化该治理流程 |
| 历史 Case Schema 迁移与 FDIV 14/14 端到端复跑 | **尚未证明** | 单测与契约检查已通过，但经验等价仍需复现实验 |

## 延后处理的语义覆盖

第一轮复现会逐字保持历史 8/14 Lean Model ↔ Lean Spec Claim，不在本轮偷偷改变问题。下面两个更大的 Claim 明确放入 TODO：

1. 把冻结算术语义从 binary32 RNE + Flush-to-zero 升级为完整 IEEE-754，包括渐进下溢和经过独立审查的 Oracle 边界；
2. 单独认证 RTL Fidelity：要么采用受检查的 RTL→Lean 转换，要么建立从 Verilog 实现到锁定 Lean Model 的显式等价链。

本 Case 仍把 FloatSpec 作为外部证明依赖。适配后的 Manifest 会锁定其精确仓库 Commit；Runtime 会拒绝脏工作区或 Commit 不匹配。这提高的是可复现性，并不会自动扩大顶层定理的 Claim Scope。

## 回退判断

基础并行搜索、反思、确定性信任、预算和持久化闭环没有回退。重构把研究变量显式化：Prover、Loss 与 Optimizer 可独立替换；参数有版本和精确归因；下一 Rollout 的父状态/任务也是 Optimizer Decision 的一部分。

Helper-only 缺口不再依靠合并器处理：Verifier 发现并执行 Axiom Audit，Candidate Commit 保持可选；在真实 Obligation 关闭前，命名进度保持不变。

仍缺失的 `DISPROVED`、任意 Definition Capsule 与证明接口 Rebaseline 也很重要，但它们影响任务覆盖、整合宽度和恢复能力，不影响当前正向证明被接受时的 Soundness。

## 本次重构已完成的验证

- TypeScript Project Reference Build 与 Typecheck；
- 参数定义、实例级反馈选择、冻结/过期拒绝、精确暴露、原子替换和 Formal 自有参数 ID 契约测试；
- Reflection 来源 DAG 与参数状态持久化 Git 测试；
- Lean Parsing、全部变更源码 Hygiene、Obligation、Axiom、Helper State、Plugin 接缝、Package 边界以及 Step/Token Telemetry 测试；
- Core Training Runtime 顺序、状态转移与失败清理测试；
- Candidate Commit 绑定与过期 Receipt 拒绝测试；
- Core 不依赖 Formal、Lean、Chips 或 Bundle 的依赖规则。

## 复现门槛

在同一个新 Run ID 下归档以下证据前，不应把本实现标记为“FDIV 已复现”：

1. 符合当前 Manifest Schema、许可证明确的版本化 Case；
2. 不可变 Baseline Commit 和锁定输入 Hash；
3. 完整 Prover/Loss-Judge/Optimizer Session 与 Run Ledger；
4. 14/14 最终 Lean Receipt，含逐 Obligation 与顶层定理 Axiom Audit；
5. 逐 Rollout Loss Report、白盒 Finding 与 Optimizer Decision；
6. 精确 Input、Output、Cache、Reasoning、时长与配置统计。
