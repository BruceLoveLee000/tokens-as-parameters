-- TruthTable.lean — spec.md §10 truth table validation (§9.2 #1 anti-co-bug)
--
-- 12 个 IEEE 754 corner case 用 native_decide 跟 ground truth 锚定.
-- ground truth 来自 Python `a/b` (IEEE 754 reference), 跟 spec/RTL/Lean 任一边都独立.
--
-- 注: 测的是 RTL 侧 `combinationalLogic` (Bool conditions, native_decide-friendly).
-- spec 侧 `fdiv` 用 `if _ : Prop then` 不能 decide, 暂未直接测.
-- 测 RTL 侧仍能 catch co-bug — 因为 RTL→Lean 翻译错会被 truth table 暴露.
import FdivModel
import FdivSpec

open FdivSpec

namespace FdivModel.TruthTable

private abbrev b32 (n : Nat) : Binary32 := BitVec.ofNat 32 n

-- 用 mkState 把 (a, b) 包成 RtlState, 然后调 combinationalLogic
private def runRtl (a b : BitVec 32) : BitVec 32 × Bool × Bool × Bool × Bool × Bool :=
  combinationalLogic
    (RtlState.mk a b false 0#32 false false false false false false)

-- expected: (result, overflow, underflow, division_by_zero, invalid, inexact)

-- §10 Case 1: 1.0 / 1.0 = 1.0 (exact)
example : runRtl (b32 0x3F800000) (b32 0x3F800000) =
    (b32 0x3F800000, false, false, false, false, false) := by native_decide

-- §10 Case 2: 2.0 / 2.0 = 1.0 (exact)
example : runRtl (b32 0x40000000) (b32 0x40000000) =
    (b32 0x3F800000, false, false, false, false, false) := by native_decide

-- §10 Case 3: 3.0 / 1.0 = 3.0 (exact)
example : runRtl (b32 0x40400000) (b32 0x3F800000) =
    (b32 0x40400000, false, false, false, false, false) := by native_decide

-- §10 Case 4: min_subnormal / max_normal → +0, underflow=1, inexact=1
example : runRtl (b32 0x00000001) (b32 0x7F7FFFFF) =
    (b32 0x00000000, false, true, false, false, true) := by native_decide

-- §10 Case 5: max_normal / min_subnormal → +Inf, overflow=1, inexact=1
example : runRtl (b32 0x7F7FFFFF) (b32 0x00000001) =
    (b32 0x7F800000, true, false, false, false, true) := by native_decide

-- §10 Case 6: 1e-30 / 1e30 ≈ 1e-60 → +0, underflow=1, inexact=1
example : runRtl (b32 0x0DA24260) (b32 0x7149F2CA) =
    (b32 0x00000000, false, true, false, false, true) := by native_decide

-- §10 Case 7: 1e30 / 1e-30 ≈ 1e60 → +Inf, overflow=1, inexact=1
example : runRtl (b32 0x7149F2CA) (b32 0x0DA24260) =
    (b32 0x7F800000, true, false, false, false, true) := by native_decide

-- §10 Case 8: 1.0 / +0 → +Inf, div_by_zero=1
example : runRtl (b32 0x3F800000) (b32 0x00000000) =
    (b32 0x7F800000, false, false, true, false, false) := by native_decide

-- §10 Case 9: +0 / +0 → QNaN, invalid=1
example : runRtl (b32 0x00000000) (b32 0x00000000) =
    (b32 0x7FC00000, false, false, false, true, false) := by native_decide

-- §10 Case 10: +Inf / +Inf → QNaN, invalid=1
example : runRtl (b32 0x7F800000) (b32 0x7F800000) =
    (b32 0x7FC00000, false, false, false, true, false) := by native_decide

-- §10 Case 11: QNaN / 1.0 → QNaN, invalid=0 (QNaN propagation, IEEE 754 §6.2)
example : runRtl (b32 0x7FC00000) (b32 0x3F800000) =
    (b32 0x7FC00000, false, false, false, false, false) := by native_decide

-- §10 Case 12: 3.0 / 2.0 = 1.5 (exact, fits in 23-bit mantissa)
example : runRtl (b32 0x40400000) (b32 0x40000000) =
    (b32 0x3FC00000, false, false, false, false, false) := by native_decide

end FdivModel.TruthTable


-- ============================================================
-- Spec 侧 (FdivSpec.fdiv) 同 12 个 corner case
-- 2026-05-05: 改 fdiv 第 1 个 if 为 Bool conditions 后, native_decide 工作.
-- 双侧锚定 IEEE 754 ground truth = §9.2 #1 完整 anti-co-bug.
-- ============================================================
namespace FdivSpec.TruthTable

private abbrev b32 (n : Nat) : Binary32 := BitVec.ofNat 32 n

example : fdiv (b32 0x3F800000) (b32 0x3F800000) =
    (b32 0x3F800000, false, false, false, false, false) := by native_decide
example : fdiv (b32 0x40000000) (b32 0x40000000) =
    (b32 0x3F800000, false, false, false, false, false) := by native_decide
example : fdiv (b32 0x40400000) (b32 0x3F800000) =
    (b32 0x40400000, false, false, false, false, false) := by native_decide
example : fdiv (b32 0x00000001) (b32 0x7F7FFFFF) =
    (b32 0x00000000, false, true, false, false, true) := by native_decide
example : fdiv (b32 0x7F7FFFFF) (b32 0x00000001) =
    (b32 0x7F800000, true, false, false, false, true) := by native_decide
example : fdiv (b32 0x0DA24260) (b32 0x7149F2CA) =
    (b32 0x00000000, false, true, false, false, true) := by native_decide
example : fdiv (b32 0x7149F2CA) (b32 0x0DA24260) =
    (b32 0x7F800000, true, false, false, false, true) := by native_decide
example : fdiv (b32 0x3F800000) (b32 0x00000000) =
    (b32 0x7F800000, false, false, true, false, false) := by native_decide
example : fdiv (b32 0x00000000) (b32 0x00000000) =
    (b32 0x7FC00000, false, false, false, true, false) := by native_decide
example : fdiv (b32 0x7F800000) (b32 0x7F800000) =
    (b32 0x7FC00000, false, false, false, true, false) := by native_decide
example : fdiv (b32 0x7FC00000) (b32 0x3F800000) =
    (b32 0x7FC00000, false, false, false, false, false) := by native_decide
example : fdiv (b32 0x40400000) (b32 0x40000000) =
    (b32 0x3FC00000, false, false, false, false, false) := by native_decide

end FdivSpec.TruthTable
