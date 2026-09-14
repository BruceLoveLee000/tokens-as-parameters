# FDIV 审计版从零顶层证明 Benchmark

[English](README.md) | 简体中文

本 Case 用于测试自主发现证明架构。起点只有一个公开 Obligation，可信证明进度为零：

```lean
theorem rtlEquivSpec (a b : BitVec 32) : rtl_comb a b = fdiv a b
```

证明 Agent 不会得到十四条 Obligation 拆解、Proof API、Proof View、Model-to-Spec
Bridge、历史 Helper Frontier、路线建议或难度标签。它可以修改
`formal/FdivProof.lean`，也可以新增经过 Verifier 审计的证明侧 Lean 模块。因此，中间
结构必须从 Rollout 与 Optimizer 中涌现，而不是由 Benchmark 作者预先提供。

## 为什么是 `0/1`

原来的十四条陈述是一种可能的证明分解，并不是十四项相互独立的用户需求。在本 Case
中公开它们会提前注入证明架构。因此，在顶层定理关闭前，命名进度始终显示为 `0/1`。
即使公开 Obligation 计数保持为零，Kernel 校验过的 Helper Commit、Loss 证据、Insight
与 Git State 仍会保留并提供给 Optimizer。

## 审计后的表达边界

算术语义使用第二版、经过源码审查的 `FdivSpec.lean` Rebaseline。它把有问题的正常
路径 Projection 内联为更浅的归约表面。相同的锁定 Model、审计 Spec 与顶层定理已经
由一个 14/14、通过 Kernel 校验的候选关闭，但该 Proof 和 `FdivProofAPI.lean` 都不会
包含在本 Case 中。

“审计”的含义有意保持狭窄：Rebaseline 保留预期算术表达，并具有历史 Build、公理
审计、白盒审查和 2,014 个 RTL/Oracle 向量证据。但它没有一个 Lean 全称定理证明有毒
旧表达与新表达外延相等，因为重新陈述旧符号形式本身会触发 Kernel 递归病态。

## 信任边界

本 Case 锁定 `FdivSpec.lean`、`FdivModel.lean`、`FloatSpecBridge.lean`、RTL、工具链、
依赖身份和顶层定理签名。接受条件包括：Lean Build 成功、没有 `sorry`/`admit`、没有
禁止或编译器生成公理、锁定输入保持不变，并通过白盒 Reward-hacking 审查。

Claim Scope 仅为给定 Lean Model 与给定 Lean Spec 的等价性，不认证 RTL-to-Lean 转写。
语义配置是 binary32 Round-to-nearest-even，并对极小非零输出采用已记录的
Flush-to-zero 行为；它不是完整渐进下溢 IEEE-754。

## 可复现检查

从 Case 根目录执行：

```sh
cd formal && lake build
cd .. && sh tests/check_all.sh 2000
```

初始 Build 应成功，并且恰好存在一个属于 `rtlEquivSpec` 的 `sorry`。

公开打包版本把 FloatSpec 固定到 Git Commit `eef09dc…`；第一次构建需要网络访问，可先执行
`lake exe cache get`，再执行 `lake build`。来源与授权见
[PROVENANCE.zh-CN.md](PROVENANCE.zh-CN.md)、[NOTICE](NOTICE) 和 [LICENSE](LICENSE)。
成功的参考证明及有明确边界的结果分析发布在输入目录之外的
[`experiments/fdiv-raw-top1-showcase`](../../experiments/fdiv-raw-top1-showcase/README.zh-CN.md)。
