-- FloatSpecBridge.lean — BitVec 32 ↔ Binary754 24 128 (IEEE 754 binary32)
-- Step D 桥接层: 把 fdiv baseline 的 BitVec 32 表示连到 FloatSpec 的语义类型 Binary754,
-- 让后续可以拿 FloatSpec 现成的 IEEE 754 lemma (Bdiv_correct / B2R / FF2R 等) 攻
-- "RTL output = round (IEEE 754 真除法)" 这种语义级 critical theorem.
--
-- 命名约定: FS 后缀 = FloatSpec view; 不带后缀 = baseline BitVec 视角.
-- prec=24 (含 hidden bit), emax=128 (Coq Flocq convention, bias=127=emax-1).

import FdivSpec
import FloatSpec.src.IEEE754.Bits
import FloatSpec.src.IEEE754.Binary

namespace FloatSpecBridge

-- IEEE 754 binary32 参数 (跟 Coq Flocq Bsingle = binary_float 24 128 一致)
abbrev binary32_prec : Int := 24
abbrev binary32_emax : Int := 128

-- 类型别名: FloatSpec view 下的 binary32
abbrev Binary32_FS := Binary754 binary32_prec binary32_emax

-- binary32 的 IEEE 754 约束实例 (Prec_gt_0 / Prec_lt_emax)
-- prec=24>0, prec=24<emax=128, emax=128≥2 — 三个条件 by decide 关
instance : Prec_gt_0 binary32_prec := ⟨by decide⟩
instance : Prec_lt_emax binary32_prec binary32_emax := ⟨by decide, by decide⟩

-- 桥接 1: BitVec 32 → Binary754 24 128
-- BitVec.toNat (Nat) → Int (强转), 喂给 FloatSpec.bits_to_binary
def bv32_to_b32 (x : BitVec 32) : Binary32_FS :=
  bits_to_binary binary32_prec binary32_emax (x.toNat : Int)

-- 桥接 2: Binary754 24 128 → BitVec 32
-- FloatSpec.binary_to_bits 出 Int, Int.toNat 后 BitVec.ofNat 包装
def b32_to_bv32 (x : Binary32_FS) : BitVec 32 :=
  BitVec.ofNat 32 (binary_to_bits binary32_prec binary32_emax x).toNat

-- ============================================================
-- §1 Smoke test: 4 个特殊值常量桥接到 FullFloat 构造子
-- baseline 4 个特殊常量 (FdivSpec.posZero / negZero / posInf / negInf) 经 bridge
-- 后, 内部 FullFloat 应 match IEEE 754 标准 (sign bit + F754_zero/infinity).
-- 这 4 个 by rfl 关 = bridge 对常量 fully computable + 编码方向跟 IEEE 754 标准一致.
-- ============================================================

-- +0 (0x00000000) → F754_zero false
theorem bridge_posZero :
    (bv32_to_b32 FdivSpec.posZero).val = FullFloat.F754_zero false := by
  rfl

-- -0 (0x80000000) → F754_zero true (sign bit 31 = 1)
theorem bridge_negZero :
    (bv32_to_b32 FdivSpec.negZero).val = FullFloat.F754_zero true := by
  rfl

-- +Inf (0x7F800000) → F754_infinity false
theorem bridge_posInf :
    (bv32_to_b32 FdivSpec.posInf).val = FullFloat.F754_infinity false := by
  rfl

-- -Inf (0xFF800000) → F754_infinity true
theorem bridge_negInf :
    (bv32_to_b32 FdivSpec.negInf).val = FullFloat.F754_infinity true := by
  rfl

-- ============================================================
-- §2 Sanity: 桥接函数完全 computable (#eval 而非 noncomputable)
-- 关键证据: bv32_to_b32 / b32_to_bv32 都 reduce 到 ground term, 不需要 ℝ 域 axiom.
-- 后续要写"语义级 critical theorem (rtl_comb a b = round (a/b in ℝ))"时,
-- 桥接侧不会卡 noncomputable, 桥后再用 B2R / FF2R 进 ℝ 域才 noncomputable.
-- ============================================================

#eval (bv32_to_b32 FdivSpec.posInf).val  -- 期: FullFloat.F754_infinity false

end FloatSpecBridge
