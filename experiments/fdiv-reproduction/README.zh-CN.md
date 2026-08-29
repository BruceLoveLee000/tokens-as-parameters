# FDIV R14 Bundle 复现实验协议

[English](README.md) | 简体中文

## 状态

`PENDING-RUN`。DSH Bundle 与无密钥机制测试已经实现；历史 FDIV 14/14 轨迹尚未通过打包后的 Bundle 复现。因此本文定义证据门，不声称已经获得实验结果。

## 假设

在模型与推理预算固定时，“两路独立证明轨迹 + Agentic 比较反思 + Verifier 门控语义合并”比单路轨迹或没有信息交换的两路独立轨迹取得更多受信进展。

## 冻结输入

运行前必须在实验 Manifest 中记录：

- Benchmark 仓库与精确 Baseline Commit；
- 所有 Locked Input SHA-256 和顶层定理签名 SHA-256；
- 预期 Claim Scope（当前 Checkpoint 为 `lean-model-vs-spec`）；
- Lean/Lake 工具链、DSH 版本、Bundle Commit、Model/Provider Route；
- 每个外部证明仓库（包括 FloatSpec）、精确 Commit 与干净工作区校验；
- Rollout 数、并行度、单次输出上限、单 Lane 累计预算、总预算、时间上限、反思设置和白盒审查设置。

不得为了让 Plugin 加载而修改 Benchmark。如果历史 Manifest 格式不同，应新增一个版本化 `case.json` 适配 Commit，同时保持原定理和冻结文件不变。

这个 Adapter 属于控制面元数据，不是新的证明输入：它声明可编辑证明文件、冻结 Hash、目标 Obligation、Checker 命令、允许的 Axiom 和锁定的外部仓库。Runtime 无法只看 Model/Spec/RTL 源码就安全推断这些实验控制。

第一版 Runtime 不接受外部 Checkout 路径。完成来源与许可证门禁后，把适配后的 Case 提交到 `benchmarks/`，确认 `chip_proof_cases` 能列出其精确 id，并用 `/chip_proof <case-id>` 启动每个实验条件。每次调用都会物化新的 Run Baseline，因此不同 Run 不会继承旧证明状态。

## 最小运行矩阵

| 条件 | Rollouts | 跨 Lane 反思 | 持久 Insight | 语义合并 |
|---|---:|---:|---:|---:|
| Single | 1 | 否 | 是 | no-op |
| Independent | 2 | 否 | 是 | 仅 Checker 门控 |
| Group relative | 2 | 是 | 是 | Checker 门控 |

比较实验必须使用相同的总 Token 与运行时间上限。DSH 可提供时，应分别记录实际 Input、Output、Cache-read 和 Cache-write Token；不能只比较配置的最大值。

## 验收门

只有归档证据包含以下内容时，才算完成复现：

1. 不可变 Run 配置与全部版本/Hash 身份；
2. `run.json`、`events.jsonl` 以及各角色的 DSH Session ID；
3. 最终 Git Commit 与证明源码；
4. Controller 自己执行并成功的 `lake build` Receipt；
5. 顶层定理 `#print axioms` Receipt，且无禁止依赖；
6. 白盒审查结果与全部 Finding；
7. 逐定理关闭表、运行时间与 Token 计量；
8. 明确说明当前只证明 Lean Model ↔ Lean Spec，除非另有 RTL Fidelity 认证。

缺少任意一项都必须标记为 `INCOMPLETE`，不能称为已复现。
