# Lean Smoke 正例

[English](README.md)

这是验证实验模式基础设施的最小可运行正例。证明从一个 `sorry` 开始；目标定理由定义直接推出，只有通过 Controller 自有的 Lean 编译与 Axiom 检查后才能被接受。

Lake Package 将全部源模块注册为显式 Library Root，Case 契约也按名称构建 `Smoke` Target。因此，构建成功不可能再是空的默认目标构建。

它只是基础设施 Smoke Test，不构成长时证明搜索能力的证据。
