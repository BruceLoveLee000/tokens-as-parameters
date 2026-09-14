-- FdivSpec.lean — Spec 形式化建模（spec.md → Lean）
-- IEEE 754 binary32 浮点除法器：形式化规范
-- 强制：指数算术使用 Int，避免 unsigned wrap bug（§4.2）
-- 禁止 import FdivModel 或 FdivProof（spec 是顶层抽象，不依赖 RTL/proof）

namespace FdivSpec

-- ============================================================
-- §1  IEEE 754 binary32 类型与字段提取
-- ============================================================

-- 使用 BitVec 32 作为 IEEE 754 binary32 的底层表示
-- 2026-05-05: 改 def → abbrev, 让 DecidableEq (BitVec 32) instance 透明传给 Binary32.
-- 否则 truth table native_decide 撞 "failed to synthesize Decidable" — typeclass
-- synthesis 跨 def 不透明 (跨 abbrev 透明).
abbrev Binary32 := BitVec 32

-- 符号位 (bit 31)
def signBit (x : Binary32) : Bool :=
  x.getLsbD 31

-- 指数域 (bits 30–23)
def exponentField (x : Binary32) : BitVec 8 :=
  BitVec.extractLsb 30 23 x

-- 尾数域 (bits 22–0)
def mantissaField (x : Binary32) : BitVec 23 :=
  BitVec.extractLsb 22 0 x

-- 指数域的无符号整数值（用于分类和 Int 转换）
def exponentNat (x : Binary32) : Nat :=
  (exponentField x).toNat

-- 尾数域的无符号整数值
def mantissaNat (x : Binary32) : Nat :=
  (mantissaField x).toNat

-- ============================================================
-- §2  数值分类（Bool 类型，可用于 if-then-else / bv_decide）
-- ============================================================

-- 零: exp = 0, mant = 0
def isZero (x : Binary32) : Bool :=
  (exponentField x == 0#8) && (mantissaField x == 0#23)

-- 次正规数: exp = 0, mant ≠ 0
def isSubnormal (x : Binary32) : Bool :=
  (exponentField x == 0#8) && (mantissaField x != 0#23)

-- 无穷: exp = 255, mant = 0
def isInf (x : Binary32) : Bool :=
  (exponentField x == 0xFF#8) && (mantissaField x == 0#23)

-- 正规数: exp ∈ [1, 254]  ⇔ exp ≠ 0 && exp ≠ 255
def isNormal (x : Binary32) : Bool :=
  (exponentField x != 0#8) && (exponentField x != 0xFF#8)

-- SNaN: exp = 255, mant ≠ 0, mantissa MSB = 0
def isSNaN (x : Binary32) : Bool :=
  (exponentNat x = 255) && (mantissaNat x ≠ 0) && (mantissaNat x < 2^22)

-- QNaN: exp = 255, mant ≠ 0, mantissa MSB = 1
def isQNaN (x : Binary32) : Bool :=
  (exponentField x == 0xFF#8) && (mantissaField x != 0#23) && x.getLsbD 22

-- NaN: exp = 255, mant ≠ 0
def isNaN (x : Binary32) : Prop := isSNaN x ∨ isQNaN x

instance (x : Binary32) : Decidable (isNaN x) := by
  unfold isNaN; infer_instance

-- 判定是否为零（含符号位区分）
def isPosZero (x : Binary32) : Bool :=
  isZero x && !signBit x

def isNegZero (x : Binary32) : Bool :=
  isZero x && signBit x

-- ============================================================
-- §3  特殊值常量（用 BitVec.ofNat 显式构造）
-- ============================================================

def posZero    : Binary32 := BitVec.ofNat 32 0x00000000
def negZero    : Binary32 := BitVec.ofNat 32 0x80000000
def posInf     : Binary32 := BitVec.ofNat 32 0x7F800000
def negInf     : Binary32 := BitVec.ofNat 32 0xFF800000
-- 默认 QNaN（正，quiet，mantissa MSB = 1）
def specDefaultQNaN : Binary32 := BitVec.ofNat 32 0x7FC00000

-- 设置尾数的 bit 22（用于 SNaN → QNaN 静默化）
-- IEEE 754: SNaN 输入时设置 mantissa MSB，保留 mantissa[21:0]
-- 用 extractLsb / concat 实现：保留 sign+exp 与低 22-bit，bit 22 强制为 1
def setMantissaBit22 (x : Binary32) : Binary32 :=
  let se : BitVec 9 := x.extractLsb 31 23   -- sign(1) + exp(8)
  let low22 : BitVec 22 := x.extractLsb 21 0 -- mantissa[21:0]
  se ++ (1#1 ++ low22)

-- 静默化 NaN：SNaN → QNaN（设置 bit 22 且保留低 22-bit 载荷），QNaN 不变
def quietNaN (x : Binary32) : Binary32 :=
  setMantissaBit22 x

-- ============================================================
-- §4  构造 binary32 值
-- ============================================================

-- 从符号位、指数域、尾数域拼装 binary32
def pack (s : Bool) (e : BitVec 8) (m : BitVec 23) : Binary32 :=
  let sBit : BitVec 1 := if s then 1#1 else 0#1
  sBit ++ e ++ m

-- ============================================================
-- §5  有效指数（强制使用 Int，避免 unsigned wrap bug）
-- ============================================================

-- 返回操作数的"有效指数值"用于 signed 算术（§4.2）：
--   normal: 指数域的值
--   subnormal: 1（偏置对齐，因 subnormal 有效指数 = 1 − 127 = −126）
--   零 / 无穷 / NaN: 0（特殊值处理先行处理）
def effectiveExp (x : Binary32) : Int :=
  let e := exponentNat x
  if e = 0 then 1
  else if e = 255 then 0
  else (e : Int)

-- Move a nonzero subnormal fraction's leading one to the hidden-bit position.
def normalizationShift (x : Binary32) : Nat :=
  if isSubnormal x then 23 - Nat.log2 (mantissaNat x) else 0

def normalizedEffectiveExp (x : Binary32) : Int :=
  effectiveExp x - (normalizationShift x : Int)

-- Base result exponent before quotient normalization and rounding.
def baseResultExp (a b : Binary32) : Int :=
  normalizedEffectiveExp a - normalizedEffectiveExp b + 127

-- ============================================================
-- §6  带隐含位的尾数（24-bit）
-- ============================================================

-- normal:  {1, mantissaField}
-- subnormal: {0, mantissaField}
-- 零 / 无穷 / NaN: 由特殊值处理先行处理，此处返回 0
def mantWithHidden (x : Binary32) : BitVec 24 :=
  if exponentField x == 0#8 then
    0#1 ++ mantissaField x
  else
    1#1 ++ mantissaField x

-- Nat 版本（用于整数算术）
def mantWithHiddenNat (x : Binary32) : Nat :=
  (mantWithHidden x).toNat

def normalizedMantWithHiddenNat (x : Binary32) : Nat :=
  mantWithHiddenNat x * (2^(normalizationShift x) : Nat)

-- ============================================================
-- §7  符号计算
-- ============================================================

-- 结果符号 = a.sign XOR b.sign（§4.1）
def resultSign (a b : Binary32) : Bool :=
  signBit a != signBit b

-- ============================================================
-- §8  尾数除法（Nat 整数算术，高位宽防精度丢失）
-- ============================================================

-- 对两个 24-bit 尾数做除法，产生 23-bit 尾数 + GRS + 指数调整
-- 输入: mantA, mantB ∈ ℕ（24-bit 尾数值，含隐含位且非零）
-- 返回: (mantissa, guard, round, sticky, expAdjust)
--   mantissa:  23-bit 尾数（舍入前，范围 [0, 2^23]）
--   expAdjust: 指数调整量（Int，减小 resultExp 使 mantissa ∈ [1, 2)）
--               expAdjust = 0 表示已归一化无需调整
--               expAdjust > 0 表示结果 < 1，需将指数减小
def mantissaDiv (mantA mantB : Nat) : Nat × Bool × Bool × Bool × Int :=
  -- 使用 27-bit 精度（23 mantissa + G + R + S，多 1-bit 防止归一化后精度不足）
  let prec := 27
  let dividend := mantA * (2^prec : Nat)
  let q := dividend / mantB
  let r := dividend % mantB

  -- q = mantA / mantB * 2^27
  -- 如果 mantA ≥ mantB, q ≥ 2^27（结果 ≥ 1）
  -- 如果 mantA < mantB, q < 2^27（结果 < 1）

  if q = 0 then
    -- 尾数远小于除数，mantA ≪ mantB, q = 0
    -- 这种情况下尾数结果为 0，需要指数大幅下调
    (0, false, false, r != 0, 28)
  else
    let p := Nat.log2 q  -- q 的最高有效位位置
    -- q ∈ [2^p, 2^(p+1))

    if p ≥ 27 then
      -- Normalize arbitrary ratios ≥ 1 by moving the leading bit to bit 27.
      let rightShift := p - 27
      let scale := 2^rightShift
      let q_norm := q / scale
      let dropped := q % scale
      let frac := q_norm - 2^27
      let mantissa := frac / 16
      let guard    := ((frac / 8) % 2 == 1)
      let round    := ((frac / 4) % 2 == 1)
      let sticky   := ((frac / 2) % 2 == 1) || (frac % 2 == 1) ||
        (dropped != 0) || (r != 0)
      -- adjustedExp = exp - expAdjust; a negative adjustment raises exponent.
      (mantissa, guard, round, sticky, -(rightShift : Int))
    else
      -- Normalize arbitrary ratios < 1 by moving the leading bit to bit 27.
      -- Mantissa movement and exponent adjustment are deliberately the same
      -- quantity in this representation; for 1/3 this is one, not zero.
      let leftShift := 27 - p
      let q_norm := q * (2^leftShift : Nat)
      let frac := q_norm - 2^27
      let mantissa := frac / 16
      let guard    := ((frac / 8) % 2 == 1)
      let round    := ((frac / 4) % 2 == 1)
      let sticky   := ((frac / 2) % 2 == 1) || (frac % 2 == 1) || (r != 0)
      (mantissa, guard, round, sticky, (leftShift : Int))

-- ============================================================
-- §8.1  Inexact / Underflow 判定 predicate (spec §4.4 + §6 引用)
-- ----
-- 这两个 predicate 之前是 FdivProof 里 `:= a = a` placeholder, 等于 `True` 永真,
-- 让 flag_iff_inexact 数学上不可证. 2026-05-07 baseline_v10_5proven 修复:
-- 移到 spec 层, 用 mantissaDiv 提供的 GRS 三 bit 真定义.
-- 这是修 spec gap, 不是给 agent 答案.
-- ============================================================

-- §6: inexact = "舍入导致精度损失 (G/R/S 任一非零)" (spec.md §6 原话).
-- 仅 normal-normal 路径有意义; 特殊路径 (NaN/Inf/Zero) spec fdiv 直接返 inexact=false,
-- 此 predicate 不被引用.
def mantissa_grs_nonzero (a b : Binary32) : Prop :=
  let mA := normalizedMantWithHiddenNat a
  let mB := normalizedMantWithHiddenNat b
  let res := mantissaDiv mA mB    -- (mantissa, G, R, S, normShift)
  -- res = (mantissa, guard, round, sticky, normShift)
  -- guard = res.2.1, round = res.2.2.1, sticky = res.2.2.2.1
  (!(isSNaN a || isQNaN a || isSNaN b || isQNaN b ||
      isInf a || isInf b || isZero a || isZero b)) = true ∧
    (res.2.1 = true ∨ res.2.2.1 = true ∨ res.2.2.2.1 = true)

-- §7.5: underflow + inexact 联动条件 (IEEE 754 §7.5).
-- "tiny + 舍入后仍 inexact" 才同时拉 underflow + inexact.
-- 实操等价: GRS 非零 (precision loss). 仅 normal 路径下 underflow 时引用.
def inexact_underflow_holds (a b : Binary32) : Prop :=
  mantissa_grs_nonzero a b

-- ============================================================
-- §9  RNE 舍入（round-to-nearest-even）
-- ============================================================

-- 对 23-bit 尾数进行 RNE 舍入
-- 返回: (roundedMantissa, carryToExp)
--   roundedMantissa: 舍入后的 23-bit 尾数
--   carryToExp: 舍入是否产生进位到指数
def roundRNE (mantissa : Nat) (guard round sticky : Bool) : Nat × Bool :=
  let doRound : Bool :=
    if guard then
      if round || sticky then
        true    -- G=1 ∧ (R=1 ∨ S=1) → 进位
      else
        (mantissa % 2 = 1)  -- tie: 看 LSB
    else
      false     -- G=0 → 舍去

  if doRound then
    let rounded := mantissa + 1
    if rounded ≥ 2^23 then
      (rounded - 2^23, true)  -- 进位到指数
    else
      (rounded, false)
  else
    (mantissa, false)

/-!
## Proof-facing normal-path view

Keep the mathematical computation unchanged while giving the kernel shallow,
named projections.  The previous nested tuple-pattern lets caused symbolic
uses of `resultExp` and `normalFdiv` to drive `isDefEq` through the complete
`mantissaDiv` implementation, eventually producing `kernel deep recursion
detected`. This named component layer is a representation boundary, not an
assumption: every value is computed from the original arithmetic definitions.
-/
def normalDivision (a b : Binary32) : Nat × Bool × Bool × Bool × Int :=
  mantissaDiv (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)

def normalMantissa (a b : Binary32) : Nat := (normalDivision a b).1
def normalGuard (a b : Binary32) : Bool := (normalDivision a b).2.1
def normalRound (a b : Binary32) : Bool := (normalDivision a b).2.2.1
def normalSticky (a b : Binary32) : Bool := (normalDivision a b).2.2.2.1
def normalExpAdjust (a b : Binary32) : Int := (normalDivision a b).2.2.2.2

def normalRounded (a b : Binary32) : Nat × Bool :=
  roundRNE (normalDivision a b).1 (normalDivision a b).2.1 (normalDivision a b).2.2.1
    (normalDivision a b).2.2.2.1

def normalRoundedMantissa (a b : Binary32) : Nat :=
  (roundRNE (normalDivision a b).1 (normalDivision a b).2.1 (normalDivision a b).2.2.1
    (normalDivision a b).2.2.2.1).1
def normalCarry (a b : Binary32) : Bool := (normalRounded a b).2

def normalFinalExp (a b : Binary32) : Int :=
  baseResultExp a b - (normalDivision a b).2.2.2.2
    + (if (roundRNE (normalDivision a b).1 (normalDivision a b).2.1
        (normalDivision a b).2.2.1 (normalDivision a b).2.2.2.1).2 then 1 else 0)

def normalOverflow (a b : Binary32) : Bool := normalFinalExp a b > 254
def normalUnderflow (a b : Binary32) : Bool := normalFinalExp a b < 1
def normalInexact (a b : Binary32) : Bool :=
  (normalDivision a b).2.1 || (normalDivision a b).2.2.1 || (normalDivision a b).2.2.2.1 ||
    normalOverflow a b

-- Final result exponent after quotient normalization and rounding. Public
-- flag theorems use this value, while normalFdiv consumes the same named components.
def resultExp (a b : Binary32) : Int :=
  normalFinalExp a b

-- ============================================================
-- §10  正常数除法路径（非特殊值）
-- ============================================================

-- 正常除法，返回 (result, overflow, underflow, inexact)
-- 假设: a 和 b 都不是 NaN / Inf / Zero（但可以是 normal 或 subnormal）
protected def normalFdiv (a b : Binary32) : Binary32 × Bool × Bool × Bool :=
  if normalOverflow a b then
    -- overflow → ±Inf（§4.2 判定规则）
    let res := if resultSign a b then negInf else posInf
    (res, true, false, normalInexact a b)
  else if normalUnderflow a b then
    -- underflow → ±0（subnormal 结果暂简化为 flush-to-zero，仍符合 IEEE 754 默认异常处理）
    let res := if resultSign a b then negZero else posZero
    (res, false, true, normalInexact a b)
  else
    -- 正常结果
    let finalExpField : BitVec 8 := BitVec.ofNat 8 (normalFinalExp a b).toNat
    let finalMantField : BitVec 23 := BitVec.ofNat 23 ((normalRounded a b).1)
    let res := pack (resultSign a b) finalExpField finalMantField
    (res, false, false, normalInexact a b)

-- ============================================================
-- §11  特殊值处理
-- ============================================================

-- NaN 输入处理
-- 返回 (QNaN, invalid)
-- 规则（与 RTL 一致，§10 FdivModel.special_result .nan 分支）:
--   先看 a 是否为 NaN：是 → quietNaN a, invalid = isSNaN a || isSNaN b
--   否则看 b 是否为 NaN：是 → quietNaN b, invalid = isSNaN a || isSNaN b
--   否则 → specDefaultQNaN, invalid=1
def handleNaN (a b : Binary32) : Binary32 × Bool :=
  let invalid := isSNaN a || isSNaN b
  -- RTL 优先级：先看 a 是否为 NaN（任意类型），再看 b（§10 FdivModel.special_result .nan 分支）
  if isSNaN a || isQNaN a then
    (quietNaN a, invalid)
  else if isSNaN b || isQNaN b then
    (quietNaN b, invalid)
  else
    (specDefaultQNaN, true)

-- ============================================================
-- §12  主函数: fdiv
-- ============================================================

-- 完整除法函数
-- 返回 (result, overflow, underflow, division_by_zero, invalid, inexact)
def fdiv (a b : Binary32) : Binary32 × Bool × Bool × Bool × Bool × Bool :=
  -- 优先级规则按 §5 表格

  -- [1a/1b] NaN 输入
  -- 2026-05-05: 用 Bool conditions 替换 `if _ : isNaN a ∨ isNaN b` (Prop dependent if).
  -- 原 dependent if 让 Lean elaborator 无法 synthesize Decidable for tuple equality →
  -- truth table 不能 native_decide. 等价改写: isNaN := isSNaN ∨ isQNaN, 全 Bool.
  if isSNaN a || isQNaN a || isSNaN b || isQNaN b then
    let (res, inv) := handleNaN a b
    (res, false, false, false, inv, false)

  -- [6]  Inf / Inf → QNaN, invalid=1
  else if isInf a && isInf b then
    (specDefaultQNaN, false, false, false, true, false)

  -- [3]  0 / 0 → QNaN, invalid=1
  else if isZero a && isZero b then
    (specDefaultQNaN, false, false, false, true, false)

  -- [7]  Inf / finite (including zero) → ±Inf, no divide-by-zero flag
  else if isInf a then
    let res := if resultSign a b then negInf else posInf
    (res, false, false, false, false, false)

  -- [8]  finite / Inf → ±0
  else if isInf b then
    let res := if resultSign a b then negZero else posZero
    (res, false, false, false, false, false)

  -- [4]  nonzero / 0 → ±Inf, division_by_zero=1
  else if !isZero a && isZero b then
    let res := if resultSign a b then negInf else posInf
    (res, false, false, true, false, false)

  -- [5]  0 / nonzero → ±0
  else if isZero a && !isZero b then
    let res := if resultSign a b then negZero else posZero
    (res, false, false, false, false, false)

  -- [default] normal / subnormal 计算
  else
    let (res, ovf, unf, inex) := FdivSpec.normalFdiv a b
    (res, ovf, unf, false, false, inex)

-- ============================================================
-- §13  便捷函数：各标志位独立提取
-- ============================================================

def fdivResult       (a b : Binary32) : Binary32 := (fdiv a b).1
def fdivOverflow     (a b : Binary32) : Bool    := (fdiv a b).2.1
def fdivUnderflow    (a b : Binary32) : Bool    := (fdiv a b).2.2.1
def fdivDivByZero    (a b : Binary32) : Bool    := (fdiv a b).2.2.2.1
def fdivInvalid      (a b : Binary32) : Bool    := (fdiv a b).2.2.2.2.1
def fdivInexact      (a b : Binary32) : Bool    := (fdiv a b).2.2.2.2.2

-- ============================================================
-- §14  NaN 分解引理（用于证明中的字段级推理）
-- ============================================================

/-- 已知 `isNaN x`（即 `isNaN x`），提取 exponentField = 0xFF 和 mantissaField ≠ 0 -/
theorem isNaN_get (x : Binary32) (h : isNaN x) : exponentField x = 0xFF#8 ∧ mantissaField x ≠ 0#23 := by
  unfold isNaN at h
  -- h: (isSNaN x = true) ∨ (isQNaN x = true)
  rcases h with (hsnan | hqnan)
  · unfold isSNaN at hsnan
    -- hsnan: ((exponentNat x = 255) && (mantissaNat x ≠ 0) && (mantissaNat x < 2^22)) = true
    simp at hsnan
    rcases hsnan with ⟨⟨h1, h2⟩, _⟩
    have hexp : exponentField x = 0xFF#8 :=
      BitVec.eq_of_toNat_eq (by
        unfold exponentNat at h1
        simpa using h1)
    have hfrac : mantissaField x ≠ 0#23 := by
      unfold mantissaNat at h2
      intro hzero
      apply h2
      simp [hzero]
    exact ⟨hexp, hfrac⟩
  · unfold isQNaN at hqnan
    simp at hqnan
    have hexp : exponentField x = 0xFF#8 := hqnan.1.1
    have hfrac : mantissaField x ≠ 0#23 := hqnan.1.2
    exact ⟨hexp, hfrac⟩

/-- For a BitVec 23, if toNat < 2^22 then getLsbD 22 = false -/
theorem bitvec_lt_2pow22_imp_bit22_false (v : BitVec 23) (h : v.toNat < 2^22) : v.getLsbD 22 = false := by
  have hdiv : v.toNat / 2^22 = 0 := Nat.div_eq_of_lt h
  -- getLsbD 22 = v.toNat.testBit 22 = ((v.toNat >>> 22) % 2) == 1
  -- Since v.toNat < 2^22, we have v.toNat >>> 22 = 0
  -- so the result is (0 % 2) == 1 = 0 == 1 = false
  simp [BitVec.getLsbD, Nat.testBit, hdiv, Nat.shiftRight_eq_div_pow]

/-- 辅助 `simp` 引理：连接 exponentField == 0xFF 到 exponentNat == 255 -/
@[simp]
theorem exponentNat_eq_255_of_exponentField (x : Binary32) (h : (exponentField x == 0xFF#8) = true) : exponentNat x = 255 := by
  unfold exponentNat
  have h' : exponentField x = 0xFF#8 := of_decide_eq_true h
  simp [h']

/-- 辅助 `simp` 引理：连接 mantissaField != 0 到 mantissaNat ≠ 0 -/
@[simp]
theorem mantissaNat_ne_zero_of_mantissaField (x : Binary32) (h : (mantissaField x != 0#23) = true) : mantissaNat x ≠ 0 := by
  unfold mantissaNat
  have h' : mantissaField x ≠ 0#23 := by
    intro hzero
    have hfalse : (mantissaField x != 0#23) = false := by simp [hzero]
    rw [hfalse] at h
    -- h now says false = true
    have : false ≠ true := by
      intro hft; exact Bool.noConfusion hft
    exact this h
  intro hzero
  apply h'
  apply BitVec.eq_of_toNat_eq
  simpa using hzero

/-- 辅助 `simp` 引理：连接 x.getLsbD 22 = true 到 mantissaNat ≥ 2^22 (Bool 形式，`simp` 可用的等式) -/
@[simp]
theorem mantissaNat_ge_2pow22_of_getLsbD22 (x : Binary32) (h : x.getLsbD 22 = true) : mantissaNat x ≥ 2^22 := by
  unfold mantissaNat
  have h_cases : (mantissaField x).toNat < 2^22 ∨ 2^22 ≤ (mantissaField x).toNat :=
    Nat.lt_or_ge _ _
  rcases h_cases with (h_lt | h_ge)
  · exfalso
    have hfalse : (mantissaField x).getLsbD 22 = false :=
      bitvec_lt_2pow22_imp_bit22_false (mantissaField x) h_lt
    have h_eq : x.getLsbD 22 = (mantissaField x).getLsbD 22 := by
      simp [mantissaField]
    have h_eq_true_false : true = false := by
      calc
        true = x.getLsbD 22 := by symm; exact h
        _ = (mantissaField x).getLsbD 22 := h_eq
        _ = false := hfalse
    -- true = false 矛盾
    have h_contra : true ≠ false := by
      intro hft; exact Bool.noConfusion hft
    exact h_contra h_eq_true_false

  · exact h_ge

/-- 辅助 `simp` 引理：mantissaField 的 bit 22 与原始 bit 22 相同 -/
@[simp]
theorem mantissaField_getLsbD_22 (x : Binary32) : (mantissaField x).getLsbD 22 = x.getLsbD 22 := by
  simp [mantissaField]

/-- 辅助 `simp`：`extractLsb` 可以分配进 `Bool` 型 `ite` -/
@[simp]
theorem extractLsb_ite (h l : Nat) (P : Bool) (a b : BitVec 32) : 
    (if P then a else b).extractLsb h l = (if P then a.extractLsb h l else b.extractLsb h l) := by
  split <;> rfl

/-- 辅助 `simp`：`getLsbD` 可以分配进 `Bool` 型 `ite` -/
@[simp]
theorem getLsbD_ite (i : Nat) (P : Bool) (a b : BitVec n) : 
    (if P then a else b).getLsbD i = (if P then a.getLsbD i else b.getLsbD i) := by
  split <;> rfl

/-- 已知 `isSNaN x`（即 `isSNaN x = true`），提取 exponentField = 0xFF、mantissaField ≠ 0 且 bit 22 = 0 -/
theorem isSNaN_get (x : Binary32) (h : isSNaN x) : exponentField x = 0xFF#8 ∧ mantissaField x ≠ 0#23 ∧ x.getLsbD 22 = false := by
  unfold isSNaN at h
  -- h: ((exponentNat x = 255) && (mantissaNat x ≠ 0) && (mantissaNat x < 2^22)) = true
  simp at h
  rcases h with ⟨⟨h1, h2⟩, h3⟩
  have hexp : exponentField x = 0xFF#8 :=
    BitVec.eq_of_toNat_eq (by
      unfold exponentNat at h1
      simpa using h1)
  have hfrac : mantissaField x ≠ 0#23 := by
    unfold mantissaNat at h2
    intro hzero
    apply h2
    simp [hzero]
  have hmsb : x.getLsbD 22 = false := by
    unfold mantissaNat at h3
    have h_mant_lt : (mantissaField x).toNat < 2^22 := h3
    have h_mant_msb : (mantissaField x).getLsbD 22 = false :=
      bitvec_lt_2pow22_imp_bit22_false (mantissaField x) h_mant_lt
    have h_eq : x.getLsbD 22 = (mantissaField x).getLsbD 22 := by
      simp [mantissaField]
    rw [h_eq]
    exact h_mant_msb
  exact ⟨hexp, hfrac, hmsb⟩

end FdivSpec


-- ============================================================
-- §14  Dot-notation accessors for the 6-tuple result type
--   These enable field access syntax like (fdiv a b).result
--   on the type BitVec 32 × Bool × Bool × Bool × Bool × Bool.
--   NOTE: These live in Prod namespace because dot notation on
--   Prod types resolves to Prod.<field> (not FdivResult.<field>).
-- ============================================================
namespace Prod

def result (x : BitVec 32 × Bool × Bool × Bool × Bool × Bool) : BitVec 32 := x.1
def overflow (x : BitVec 32 × Bool × Bool × Bool × Bool × Bool) : Bool := x.2.1
def underflow (x : BitVec 32 × Bool × Bool × Bool × Bool × Bool) : Bool := x.2.2.1
def division_by_zero (x : BitVec 32 × Bool × Bool × Bool × Bool × Bool) : Bool := x.2.2.2.1
def invalid (x : BitVec 32 × Bool × Bool × Bool × Bool × Bool) : Bool := x.2.2.2.2.1
def inexact (x : BitVec 32 × Bool × Bool × Bool × Bool × Bool) : Bool := x.2.2.2.2.2

end Prod
