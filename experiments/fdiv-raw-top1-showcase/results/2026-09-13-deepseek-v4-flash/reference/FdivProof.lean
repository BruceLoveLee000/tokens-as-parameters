import FdivSpec
import FdivModel
import Mathlib.Tactic

set_option maxHeartbeats 400000

open FdivSpec
open FdivModel

def mkState (a b : BitVec 32) : RtlState :=
  RtlState.mk a b false 0#32 false false false false false false

def rtl_comb (a b : BitVec 32) : BitVec 32 × Bool × Bool × Bool × Bool × Bool :=
  combinationalLogic (mkState a b)


-- ============================================================
-- §0  Bool helpers
-- ============================================================

theorem bool_eq_false_of_not_eq_true {b : Bool} (h : ¬(b = true)) : b = false := by
  cases b <;> simp_all

theorem bool_eq_true_of_not_eq_false {b : Bool} (h : ¬(b = false)) : b = true := by
  cases b <;> simp_all

-- ============================================================
-- §1  Field bridges: `mkState` projections, RTL/Spec field names
-- ============================================================

@[simp] theorem mkState_a_reg (a b : BitVec 32) : (mkState a b).a_reg = a := rfl
@[simp] theorem mkState_b_reg (a b : BitVec 32) : (mkState a b).b_reg = b := rfl

@[simp] theorem rtlSign_eq_signBit (x : BitVec 32) : rtlSign x = signBit x := rfl
@[simp] theorem rtlExp_eq_exponentField (x : BitVec 32) : rtlExp x = exponentField x := rfl
@[simp] theorem rtlFrac_eq_mantissaField (x : BitVec 32) : rtlFrac x = mantissaField x := rfl

@[simp] theorem a_is_zero_mkState (a b : BitVec 32) : a_is_zero (mkState a b) = isZero a := rfl
@[simp] theorem b_is_zero_mkState (a b : BitVec 32) : b_is_zero (mkState a b) = isZero b := rfl
@[simp] theorem a_is_subnormal_mkState (a b : BitVec 32) :
    a_is_subnormal (mkState a b) = isSubnormal a := rfl
@[simp] theorem b_is_subnormal_mkState (a b : BitVec 32) :
    b_is_subnormal (mkState a b) = isSubnormal b := rfl
@[simp] theorem a_is_inf_mkState (a b : BitVec 32) : a_is_inf (mkState a b) = isInf a := rfl
@[simp] theorem b_is_inf_mkState (a b : BitVec 32) : b_is_inf (mkState a b) = isInf b := rfl
@[simp] theorem a_is_nan_mkState (a b : BitVec 32) :
    a_is_nan (mkState a b) = (isSNaN a || isQNaN a) := rfl
@[simp] theorem b_is_nan_mkState (a b : BitVec 32) :
    b_is_nan (mkState a b) = (isSNaN b || isQNaN b) := rfl
@[simp] theorem a_is_snan_mkState (a b : BitVec 32) : a_is_snan (mkState a b) = isSNaN a := rfl
@[simp] theorem b_is_snan_mkState (a b : BitVec 32) : b_is_snan (mkState a b) = isSNaN b := rfl
@[simp] theorem sign_result_mkState (a b : BitVec 32) : sign_result (mkState a b) = resultSign a b := rfl

-- ============================================================
-- §2  Bit-level bridges between the RTL packing and the spec packing
-- ============================================================

/-- Splitting `x[31:23]` into the sign bit and the exponent field. -/
theorem sign_exp_split (x : BitVec 32) :
    (if x.getLsbD 31 then 1#1 else 0#1) ++ BitVec.extractLsb 30 23 x = BitVec.extractLsb 31 23 x := by
  rw [BitVec.eq_of_getLsbD_eq_iff]
  intro i hi
  simp only [BitVec.getLsbD_append, BitVec.getLsbD_extractLsb]
  by_cases h8 : i < 8
  · simp [h8, show i < 9 by omega]
  · have hi8 : i = 8 := by omega
    subst hi8
    cases hs : x.getLsbD 31 <;> simp

/-- `mantissaField` re-extracted below bit 22 is unchanged. -/
theorem extractLsb21_extractLsb22 (x : BitVec 32) :
    (BitVec.extractLsb 22 0 x).extractLsb 21 0 = BitVec.extractLsb 21 0 x := by
  rw [BitVec.eq_of_getLsbD_eq_iff]
  intro i hi
  simp only [BitVec.getLsbD_extractLsb, Nat.zero_add]
  have h1 : i < 22 := by omega
  have h2 : i < 23 := by omega
  simp [h1, h2]

/-- The payload quieting performed by `handleNaN`, written the way `FdivModel.special_result`
packs it (sign ++ exp ++ quieted mantissa). -/
def rtlQuietNaN (x : BitVec 32) : BitVec 32 :=
  (if rtlSign x then 1#1 else 0#1) ++ 0xFF#8 ++ (1#1 ++ BitVec.extractLsb 21 0 (rtlFrac x))

/-- `quietNaN` (spec) and the RTL quiet-NaN packing agree whenever the input is an
exp = 0xFF datum (which every NaN input is). -/
theorem quietNaN_eq_rtlQuietNaN (x : BitVec 32) (h : exponentField x = 0xFF#8) :
    quietNaN x = rtlQuietNaN x := by
  have hlow : (BitVec.extractLsb 22 0 x).extractLsb 21 0 = BitVec.extractLsb 21 0 x :=
    extractLsb21_extractLsb22 x
  have h' : BitVec.extractLsb 30 23 x = 0xFF#8 := by simpa only [exponentField] using h
  have hA : (if x.getLsbD 31 then 1#1 else 0#1) ++ 0xFF#8 = BitVec.extractLsb 31 23 x := by
    rw [← h', sign_exp_split x]
  rw [quietNaN, setMantissaBit22, rtlQuietNaN]
  simp only [rtlSign_eq_signBit, rtlFrac_eq_mantissaField, signBit, mantissaField]
  rw [← hA, hlow]
  rfl

/-- Sign-prefixed infinity, as packed by `FdivModel.inf_with_sign`. -/
def rtlInfResult (a b : BitVec 32) : BitVec 32 :=
  (if resultSign a b then 1#1 else 0#1) ++ 0xFF#8 ++ 0#23

/-- Sign-prefixed zero, as packed by `FdivModel.zero_with_sign`. -/
def rtlZeroResult (a b : BitVec 32) : BitVec 32 :=
  (if resultSign a b then 1#1 else 0#1) ++ 0#8 ++ 0#23

@[simp] theorem inf_with_sign_mkState (a b : BitVec 32) :
    inf_with_sign (mkState a b) = rtlInfResult a b := rfl
@[simp] theorem zero_with_sign_mkState (a b : BitVec 32) :
    zero_with_sign (mkState a b) = rtlZeroResult a b := rfl

theorem signed_inf_pack (a b : BitVec 32) :
    (if resultSign a b then negInf else posInf) = rtlInfResult a b := by
  unfold rtlInfResult
  cases h : resultSign a b <;> decide

theorem signed_zero_pack (a b : BitVec 32) :
    (if resultSign a b then negZero else posZero) = rtlZeroResult a b := by
  unfold rtlZeroResult
  cases h : resultSign a b <;> decide

-- ============================================================
-- §3  Exponent bridges: NaN/Inf/Zero inputs force a specific exponent field
-- ============================================================

theorem exponentField_eq_of_isQNaN (x : BitVec 32) (h : isQNaN x = true) :
    exponentField x = 0xFF#8 := by
  unfold isQNaN at h
  simp only [Bool.and_eq_true] at h
  exact beq_iff_eq.mp h.1.1

theorem exponentField_eq_of_nan (x : BitVec 32) (h : (isSNaN x || isQNaN x) = true) :
    exponentField x = 0xFF#8 := by
  rw [Bool.or_eq_true] at h
  rcases h with h | h
  · exact (isSNaN_get x h).1
  · exact exponentField_eq_of_isQNaN x h

-- ============================================================
-- §4  Selector lemmas: `special_sel` reductions in priority order
-- ============================================================

theorem special_sel_nan_of_case (s : RtlState) (h : case_nan s = true) :
    special_sel s = .nan := by
  simp [special_sel, h]

theorem special_sel_inf_inf_of_case (s : RtlState) (h1 : case_nan s = false)
    (h : case_inf_inf s = true) : special_sel s = .inf_inf := by
  simp [special_sel, h1, h]

theorem special_sel_zero_zero_of_case (s : RtlState) (h1 : case_nan s = false)
    (h2 : case_inf_inf s = false) (h : case_zero_zero s = true) : special_sel s = .zero_zero := by
  simp [special_sel, h1, h2, h]

theorem special_sel_a_inf_of_case (s : RtlState) (h1 : case_nan s = false)
    (h2 : case_inf_inf s = false) (h3 : case_zero_zero s = false) (h : a_is_inf s = true) :
    special_sel s = .a_inf := by
  simp [special_sel, h1, h2, h3, h]

theorem special_sel_b_inf_of_case (s : RtlState) (h1 : case_nan s = false)
    (h2 : case_inf_inf s = false) (h3 : case_zero_zero s = false) (h4 : a_is_inf s = false)
    (h : b_is_inf s = true) : special_sel s = .b_inf := by
  simp [special_sel, h1, h2, h3, h4, h]

theorem special_sel_nonzero_div_zero_of_case (s : RtlState) (h1 : case_nan s = false)
    (h2 : case_inf_inf s = false) (h3 : case_zero_zero s = false) (h4 : a_is_inf s = false)
    (h5 : b_is_inf s = false) (h : case_nonzero_div_zero s = true) :
    special_sel s = .nonzero_div_zero := by
  simp [special_sel, h1, h2, h3, h4, h5, h]

theorem special_sel_zero_div_nonzero_of_case (s : RtlState) (h1 : case_nan s = false)
    (h2 : case_inf_inf s = false) (h3 : case_zero_zero s = false) (h4 : a_is_inf s = false)
    (h5 : b_is_inf s = false) (h6 : case_nonzero_div_zero s = false)
    (h : case_zero_div_nonzero s = true) : special_sel s = .zero_div_nonzero := by
  simp [special_sel, h1, h2, h3, h4, h5, h6, h]

theorem special_sel_none_of_cases (s : RtlState) (h1 : case_nan s = false)
    (h2 : case_inf_inf s = false) (h3 : case_zero_zero s = false) (h4 : a_is_inf s = false)
    (h5 : b_is_inf s = false) (h6 : case_nonzero_div_zero s = false)
    (h7 : case_zero_div_nonzero s = false) : special_sel s = .none := by
  simp [special_sel, h1, h2, h3, h4, h5, h6, h7]

/-- `is_special s = false` means the selector picked the no-special-case branch. -/
theorem special_sel_none_of_is_special_false (s : RtlState) (h : is_special s = false) :
    special_sel s = .none := by
  cases hs : special_sel s <;> simp_all [is_special]

theorem is_special_eq_false_of_sel_none (s : RtlState) (h : special_sel s = .none) :
    is_special s = false := by
  simp [is_special, h]

theorem is_special_eq_true_of_sel_ne_none (s : RtlState) (h : special_sel s ≠ .none) :
    is_special s = true := by
  cases hs : special_sel s <;> simp_all [is_special]

/-- If the selector is `.none`, no special-case predicate can hold. This is the
contrapositive of the priority chain, used to turn `is_special = false` into atoms. -/
theorem case_nan_eq_false_of_sel_none (s : RtlState) (hs : special_sel s = .none) :
    case_nan s = false := by
  cases h : case_nan s with
  | false => rfl
  | true =>
    rw [special_sel_nan_of_case s h] at hs
    exact absurd hs (by decide)

theorem case_inf_inf_eq_false_of_sel_none (s : RtlState) (hs : special_sel s = .none) :
    case_inf_inf s = false := by
  cases h1 : case_nan s with
  | true =>
    rw [special_sel_nan_of_case s h1] at hs
    exact absurd hs (by decide)
  | false =>
    cases h : case_inf_inf s with
    | false => rfl
    | true =>
      rw [special_sel_inf_inf_of_case s h1 h] at hs
      exact absurd hs (by decide)

theorem case_zero_zero_eq_false_of_sel_none (s : RtlState) (hs : special_sel s = .none) :
    case_zero_zero s = false := by
  cases h1 : case_nan s with
  | true =>
    rw [special_sel_nan_of_case s h1] at hs
    exact absurd hs (by decide)
  | false =>
    cases h2 : case_inf_inf s with
    | true =>
      rw [special_sel_inf_inf_of_case s h1 h2] at hs
      exact absurd hs (by decide)
    | false =>
      cases h : case_zero_zero s with
      | false => rfl
      | true =>
        rw [special_sel_zero_zero_of_case s h1 h2 h] at hs
        exact absurd hs (by decide)

theorem a_is_inf_eq_false_of_sel_none (s : RtlState) (hs : special_sel s = .none) :
    a_is_inf s = false := by
  have h1 := case_nan_eq_false_of_sel_none s hs
  have h2 := case_inf_inf_eq_false_of_sel_none s hs
  have h3 := case_zero_zero_eq_false_of_sel_none s hs
  cases h : a_is_inf s with
  | false => rfl
  | true =>
    rw [special_sel_a_inf_of_case s h1 h2 h3 h] at hs
    exact absurd hs (by decide)

theorem b_is_inf_eq_false_of_sel_none (s : RtlState) (hs : special_sel s = .none) :
    b_is_inf s = false := by
  have h1 := case_nan_eq_false_of_sel_none s hs
  have h2 := case_inf_inf_eq_false_of_sel_none s hs
  have h3 := case_zero_zero_eq_false_of_sel_none s hs
  have h4 := a_is_inf_eq_false_of_sel_none s hs
  cases h : b_is_inf s with
  | false => rfl
  | true =>
    rw [special_sel_b_inf_of_case s h1 h2 h3 h4 h] at hs
    exact absurd hs (by decide)

theorem case_nonzero_div_zero_eq_false_of_sel_none (s : RtlState) (hs : special_sel s = .none) :
    case_nonzero_div_zero s = false := by
  have h1 := case_nan_eq_false_of_sel_none s hs
  have h2 := case_inf_inf_eq_false_of_sel_none s hs
  have h3 := case_zero_zero_eq_false_of_sel_none s hs
  have h4 := a_is_inf_eq_false_of_sel_none s hs
  have h5 := b_is_inf_eq_false_of_sel_none s hs
  cases h : case_nonzero_div_zero s with
  | false => rfl
  | true =>
    rw [special_sel_nonzero_div_zero_of_case s h1 h2 h3 h4 h5 h] at hs
    exact absurd hs (by decide)

theorem case_zero_div_nonzero_eq_false_of_sel_none (s : RtlState) (hs : special_sel s = .none) :
    case_zero_div_nonzero s = false := by
  have h1 := case_nan_eq_false_of_sel_none s hs
  have h2 := case_inf_inf_eq_false_of_sel_none s hs
  have h3 := case_zero_zero_eq_false_of_sel_none s hs
  have h4 := a_is_inf_eq_false_of_sel_none s hs
  have h5 := b_is_inf_eq_false_of_sel_none s hs
  have h6 := case_nonzero_div_zero_eq_false_of_sel_none s hs
  cases h : case_zero_div_nonzero s with
  | false => rfl
  | true =>
    rw [special_sel_zero_div_nonzero_of_case s h1 h2 h3 h4 h5 h6 h] at hs
    exact absurd hs (by decide)

-- ============================================================
-- §5  `is_special` invariant on `mkState`: the seven conditions in priority order
-- ============================================================

theorem or4_assoc (a b c d : Bool) :
    ((a || b) || (c || d)) = ((a || b || c) || d) := by
  simp only [Bool.or_assoc]

/-- A four-fold disjunction is `false` exactly when all four disjuncts are. -/
theorem or4_eq_false_iff (a b c d : Bool) :
    ((a || b || c) || d) = false ↔ (a = false ∧ b = false ∧ c = false ∧ d = false) := by
  rw [Bool.or_eq_false_iff, Bool.or_eq_false_iff, Bool.or_eq_false_iff]
  exact ⟨fun h => ⟨h.1.1.1, h.1.1.2, h.1.2, h.2⟩,
    fun h => ⟨⟨⟨h.1, h.2.1⟩, h.2.2.1⟩, h.2.2.2⟩⟩

theorem case_nan_mkState (a b : BitVec 32) :
    case_nan (mkState a b) = ((isSNaN a || isQNaN a || isSNaN b) || isQNaN b) := by
  simp only [case_nan, any_nan, a_is_nan_mkState, b_is_nan_mkState, or4_assoc]

theorem is_special_mkState_eq_false_iff (a b : BitVec 32) :
    is_special (mkState a b) = false ↔
      (isSNaN a || isQNaN a || isSNaN b || isQNaN b) = false ∧
      (isInf a && isInf b) = false ∧ (isZero a && isZero b) = false ∧
      isInf a = false ∧ isInf b = false ∧ (!isZero a && isZero b) = false ∧
      (isZero a && !isZero b) = false := by
  constructor
  · intro h
    have hs := special_sel_none_of_is_special_false _ h
    have h1 := case_nan_eq_false_of_sel_none _ hs
    have h2 := case_inf_inf_eq_false_of_sel_none _ hs
    have h3 := case_zero_zero_eq_false_of_sel_none _ hs
    have h4 := a_is_inf_eq_false_of_sel_none _ hs
    have h5 := b_is_inf_eq_false_of_sel_none _ hs
    have h6 := case_nonzero_div_zero_eq_false_of_sel_none _ hs
    have h7 := case_zero_div_nonzero_eq_false_of_sel_none _ hs
    simp only [case_nan_mkState, a_is_inf_mkState, b_is_inf_mkState, case_inf_inf, case_zero_zero,
      case_nonzero_div_zero, case_zero_div_nonzero, a_is_zero_mkState, b_is_zero_mkState] at h1 h2 h3 h4 h5 h6 h7
    exact ⟨h1, h2, h3, h4, h5, h6, h7⟩
  · intro ⟨h1, h2, h3, h4, h5, h6, h7⟩
    have hs : special_sel (mkState a b) = .none := by
      apply special_sel_none_of_cases
      · simp only [case_nan_mkState]; exact h1
      · simpa only [case_inf_inf, a_is_inf_mkState, b_is_inf_mkState] using h2
      · simpa only [case_zero_zero, a_is_zero_mkState, b_is_zero_mkState] using h3
      · simpa only [a_is_inf_mkState] using h4
      · simpa only [b_is_inf_mkState] using h5
      · simpa only [case_nonzero_div_zero, a_is_zero_mkState, b_is_zero_mkState] using h6
      · simpa only [case_zero_div_nonzero, a_is_zero_mkState, b_is_zero_mkState] using h7
    exact is_special_eq_false_of_sel_none _ hs

/-- Atom facts freed by the non-special hypothesis: neither operand is zero, infinity or NaN. -/
theorem atoms_of_is_special_false (a b : BitVec 32) (h : is_special (mkState a b) = false) :
    isZero a = false ∧ isZero b = false ∧ isInf a = false ∧ isInf b = false ∧
      (isSNaN a || isQNaN a) = false ∧ (isSNaN b || isQNaN b) = false := by
  have hs := special_sel_none_of_is_special_false _ h
  have hnan := case_nan_eq_false_of_sel_none _ hs
  have hzero := case_zero_zero_eq_false_of_sel_none _ hs
  have hainf := a_is_inf_eq_false_of_sel_none _ hs
  have hbinf := b_is_inf_eq_false_of_sel_none _ hs
  have hndz := case_nonzero_div_zero_eq_false_of_sel_none _ hs
  have hzdn := case_zero_div_nonzero_eq_false_of_sel_none _ hs
  have h1 : (isZero a && isZero b) = false := by
    simpa only [case_zero_zero, a_is_zero_mkState, b_is_zero_mkState] using hzero
  have h6 : (!isZero a && isZero b) = false := by
    simpa only [case_nonzero_div_zero, a_is_zero_mkState, b_is_zero_mkState] using hndz
  have h7 : (isZero a && !isZero b) = false := by
    simpa only [case_zero_div_nonzero, a_is_zero_mkState, b_is_zero_mkState] using hzdn
  rw [case_nan_mkState, or4_eq_false_iff] at hnan
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_⟩
  · cases hz : isZero a with
    | false => rfl
    | true => simp_all
  · cases hz : isZero b with
    | false => rfl
    | true => simp_all
  · simpa only [a_is_inf_mkState] using hainf
  · simpa only [b_is_inf_mkState] using hbinf
  · rw [Bool.or_eq_false_iff]; exact ⟨hnan.1, hnan.2.1⟩
  · rw [Bool.or_eq_false_iff]; exact ⟨hnan.2.2.1, hnan.2.2.2⟩

-- ============================================================
-- §6  Dispatch split of `combinationalLogic`
-- ============================================================

theorem combinationalLogic_of_special (s : RtlState) (h : is_special s = true) :
    combinationalLogic s = (special_result s, false, false, special_div_by_zero s,
      special_invalid s, false) := by
  unfold combinationalLogic
  rw [if_pos h]

theorem combinationalLogic_of_not_special (s : RtlState) (h : is_special s = false) :
    combinationalLogic s =
      (let (res, ovf, unf, inex) := normalFdiv s; (res, ovf, unf, false, false, inex)) := by
  unfold combinationalLogic
  rw [if_neg (by simp [h])]

-- ============================================================
-- §7  Per-case reductions of the RTL special 6-tuple
-- ============================================================

theorem special_result_nan (a b : BitVec 32) (h : special_sel (mkState a b) = .nan) :
    special_result (mkState a b) =
      (if (isSNaN a || isQNaN a) = true then rtlQuietNaN a else rtlQuietNaN b) := by
  simp only [special_result, h, a_is_nan, rtlQuietNaN, mkState_a_reg, mkState_b_reg]
  split <;> rfl

theorem special_invalid_nan (a b : BitVec 32) (h : special_sel (mkState a b) = .nan) :
    special_invalid (mkState a b) = (isSNaN a || isSNaN b) := by
  simp only [special_invalid, h, a_is_snan_mkState, b_is_snan_mkState]

theorem special_div_by_zero_nan (a b : BitVec 32) (h : special_sel (mkState a b) = .nan) :
    special_div_by_zero (mkState a b) = false := by
  simp only [special_div_by_zero, h]

-- ============================================================
-- §8  `fdiv` case 1 (highest priority): NaN input
-- ============================================================

theorem fdiv_nan (a b : BitVec 32)
    (h : (isSNaN a || isQNaN a || isSNaN b || isQNaN b) = true) :
    fdiv a b = (special_result (mkState a b), false, false,
      special_div_by_zero (mkState a b), special_invalid (mkState a b), false) := by
  have hcase : case_nan (mkState a b) = true := by
    rw [case_nan_mkState]; exact h
  have hsel : special_sel (mkState a b) = .nan := special_sel_nan_of_case _ hcase
  rw [special_result_nan a b hsel, special_invalid_nan a b hsel,
    special_div_by_zero_nan a b hsel]
  rw [fdiv, if_pos h, handleNaN]
  by_cases ha : (isSNaN a || isQNaN a) = true
  · have hexp : exponentField a = 0xFF#8 := exponentField_eq_of_nan a ha
    rw [if_pos ha, if_pos ha, quietNaN_eq_rtlQuietNaN a hexp]
  · by_cases hb : (isSNaN b || isQNaN b) = true
    · have hexp : exponentField b = 0xFF#8 := exponentField_eq_of_nan b hb
      rw [if_neg ha, if_pos hb, if_neg ha, quietNaN_eq_rtlQuietNaN b hexp]
    · exfalso
      have ha' : (isSNaN a || isQNaN a) = false := bool_eq_false_of_not_eq_true ha
      have hb' : (isSNaN b || isQNaN b) = false := bool_eq_false_of_not_eq_true hb
      rw [← or4_assoc, ha', hb'] at h
      simp at h

-- ============================================================
-- §9  `mkState` case unfolding and the 4-fold NaN-disjunction bridge
-- ============================================================

theorem case_inf_inf_mkState (a b : BitVec 32) :
    case_inf_inf (mkState a b) = (isInf a && isInf b) := rfl

theorem case_zero_zero_mkState (a b : BitVec 32) :
    case_zero_zero (mkState a b) = (isZero a && isZero b) := rfl

theorem case_nonzero_div_zero_mkState (a b : BitVec 32) :
    case_nonzero_div_zero (mkState a b) = (!isZero a && isZero b) := rfl

theorem case_zero_div_nonzero_mkState (a b : BitVec 32) :
    case_zero_div_nonzero (mkState a b) = (isZero a && !isZero b) := rfl

/-- The guard `fdiv` uses for its highest-priority case is `case_nan` on `mkState`. -/
theorem nan4_eq_false_of_case_nan_false (a b : BitVec 32)
    (h : case_nan (mkState a b) = false) :
    (isSNaN a || isQNaN a || isSNaN b || isQNaN b) = false := by
  rw [case_nan_mkState, ← or4_assoc, Bool.or_eq_false_iff] at h
  rw [← or4_assoc, Bool.or_eq_false_iff]
  exact h

theorem nan4_eq_true_of_case_nan_true (a b : BitVec 32)
    (h : case_nan (mkState a b) = true) :
    (isSNaN a || isQNaN a || isSNaN b || isQNaN b) = true := by
  rw [case_nan_mkState, ← or4_assoc, Bool.or_eq_true_iff] at h
  rw [← or4_assoc, Bool.or_eq_true_iff]
  exact h

theorem fdiv_nan_guard_false (a b : BitVec 32) (h : case_nan (mkState a b) = false) :
    ¬((isSNaN a || isQNaN a || isSNaN b || isQNaN b) = true) := by
  rw [nan4_eq_false_of_case_nan_false a b h]
  simp

-- ============================================================
-- §10  `fdiv` per-case reductions, one per dispatch branch
--      (the hypothesis lists mirror `special_sel`'s priority chain)
-- ============================================================

theorem fdiv_inf_inf (a b : BitVec 32) (h1 : case_nan (mkState a b) = false)
    (h2 : case_inf_inf (mkState a b) = true) :
    fdiv a b = (special_result (mkState a b), false, false,
      special_div_by_zero (mkState a b), special_invalid (mkState a b), false) := by
  have hsel : special_sel (mkState a b) = .inf_inf := special_sel_inf_inf_of_case _ h1 h2
  have hii : (isInf a && isInf b) = true := by simpa only [case_inf_inf_mkState] using h2
  rw [fdiv, if_neg (fdiv_nan_guard_false a b h1),
    if_pos (show (isInf a && isInf b) = true from hii)]
  simp only [special_result, special_invalid, special_div_by_zero, hsel]

theorem fdiv_zero_zero (a b : BitVec 32) (h1 : case_nan (mkState a b) = false)
    (h2 : case_inf_inf (mkState a b) = false) (h3 : case_zero_zero (mkState a b) = true) :
    fdiv a b = (special_result (mkState a b), false, false,
      special_div_by_zero (mkState a b), special_invalid (mkState a b), false) := by
  have hsel : special_sel (mkState a b) = .zero_zero := special_sel_zero_zero_of_case _ h1 h2 h3
  have hii : (isInf a && isInf b) = false := by simpa only [case_inf_inf_mkState] using h2
  have hzz : (isZero a && isZero b) = true := by simpa only [case_zero_zero_mkState] using h3
  rw [fdiv, if_neg (fdiv_nan_guard_false a b h1),
    if_neg (show ¬((isInf a && isInf b) = true) by simp [hii]),
    if_pos (show (isZero a && isZero b) = true from hzz)]
  simp only [special_result, special_invalid, special_div_by_zero, hsel]

theorem fdiv_a_inf (a b : BitVec 32) (h1 : case_nan (mkState a b) = false)
    (h2 : case_inf_inf (mkState a b) = false) (h3 : case_zero_zero (mkState a b) = false)
    (h4 : a_is_inf (mkState a b) = true) :
    fdiv a b = (special_result (mkState a b), false, false,
      special_div_by_zero (mkState a b), special_invalid (mkState a b), false) := by
  have hsel : special_sel (mkState a b) = .a_inf := special_sel_a_inf_of_case _ h1 h2 h3 h4
  have hii : (isInf a && isInf b) = false := by simpa only [case_inf_inf_mkState] using h2
  have hzz : (isZero a && isZero b) = false := by simpa only [case_zero_zero_mkState] using h3
  have hai : isInf a = true := by simpa only [a_is_inf_mkState] using h4
  rw [fdiv, if_neg (fdiv_nan_guard_false a b h1),
    if_neg (show ¬((isInf a && isInf b) = true) by simp [hii]),
    if_neg (show ¬((isZero a && isZero b) = true) by simp [hzz]),
    if_pos (show isInf a = true from hai)]
  simp only [special_result, special_invalid, special_div_by_zero, hsel,
    inf_with_sign_mkState, signed_inf_pack, rtlInfResult]

theorem fdiv_b_inf (a b : BitVec 32) (h1 : case_nan (mkState a b) = false)
    (h2 : case_inf_inf (mkState a b) = false) (h3 : case_zero_zero (mkState a b) = false)
    (h4 : a_is_inf (mkState a b) = false) (h5 : b_is_inf (mkState a b) = true) :
    fdiv a b = (special_result (mkState a b), false, false,
      special_div_by_zero (mkState a b), special_invalid (mkState a b), false) := by
  have hsel : special_sel (mkState a b) = .b_inf := special_sel_b_inf_of_case _ h1 h2 h3 h4 h5
  have hii : (isInf a && isInf b) = false := by simpa only [case_inf_inf_mkState] using h2
  have hzz : (isZero a && isZero b) = false := by simpa only [case_zero_zero_mkState] using h3
  have hai : isInf a = false := by simpa only [a_is_inf_mkState] using h4
  have hbi : isInf b = true := by simpa only [b_is_inf_mkState] using h5
  rw [fdiv, if_neg (fdiv_nan_guard_false a b h1),
    if_neg (show ¬((isInf a && isInf b) = true) by simp [hii]),
    if_neg (show ¬((isZero a && isZero b) = true) by simp [hzz]),
    if_neg (show ¬(isInf a = true) by simp [hai]),
    if_pos (show isInf b = true from hbi)]
  simp only [special_result, special_invalid, special_div_by_zero, hsel,
    zero_with_sign_mkState, signed_zero_pack, rtlZeroResult]

theorem fdiv_nonzero_div_zero (a b : BitVec 32) (h1 : case_nan (mkState a b) = false)
    (h2 : case_inf_inf (mkState a b) = false) (h3 : case_zero_zero (mkState a b) = false)
    (h4 : a_is_inf (mkState a b) = false) (h5 : b_is_inf (mkState a b) = false)
    (h6 : case_nonzero_div_zero (mkState a b) = true) :
    fdiv a b = (special_result (mkState a b), false, false,
      special_div_by_zero (mkState a b), special_invalid (mkState a b), false) := by
  have hsel : special_sel (mkState a b) = .nonzero_div_zero :=
    special_sel_nonzero_div_zero_of_case _ h1 h2 h3 h4 h5 h6
  have hii : (isInf a && isInf b) = false := by simpa only [case_inf_inf_mkState] using h2
  have hzz : (isZero a && isZero b) = false := by simpa only [case_zero_zero_mkState] using h3
  have hai : isInf a = false := by simpa only [a_is_inf_mkState] using h4
  have hbi : isInf b = false := by simpa only [b_is_inf_mkState] using h5
  have hnz : (!isZero a && isZero b) = true := by
    simpa only [case_nonzero_div_zero_mkState] using h6
  rw [fdiv, if_neg (fdiv_nan_guard_false a b h1),
    if_neg (show ¬((isInf a && isInf b) = true) by simp [hii]),
    if_neg (show ¬((isZero a && isZero b) = true) by simp [hzz]),
    if_neg (show ¬(isInf a = true) by simp [hai]),
    if_neg (show ¬(isInf b = true) by simp [hbi]),
    if_pos (show (!isZero a && isZero b) = true from hnz)]
  simp only [special_result, special_invalid, special_div_by_zero, hsel,
    inf_with_sign_mkState, signed_inf_pack, rtlInfResult]

theorem fdiv_zero_div_nonzero (a b : BitVec 32) (h1 : case_nan (mkState a b) = false)
    (h2 : case_inf_inf (mkState a b) = false) (h3 : case_zero_zero (mkState a b) = false)
    (h4 : a_is_inf (mkState a b) = false) (h5 : b_is_inf (mkState a b) = false)
    (h6 : case_nonzero_div_zero (mkState a b) = false)
    (h7 : case_zero_div_nonzero (mkState a b) = true) :
    fdiv a b = (special_result (mkState a b), false, false,
      special_div_by_zero (mkState a b), special_invalid (mkState a b), false) := by
  have hsel : special_sel (mkState a b) = .zero_div_nonzero :=
    special_sel_zero_div_nonzero_of_case _ h1 h2 h3 h4 h5 h6 h7
  have hii : (isInf a && isInf b) = false := by simpa only [case_inf_inf_mkState] using h2
  have hzz : (isZero a && isZero b) = false := by simpa only [case_zero_zero_mkState] using h3
  have hai : isInf a = false := by simpa only [a_is_inf_mkState] using h4
  have hbi : isInf b = false := by simpa only [b_is_inf_mkState] using h5
  have hnz : (!isZero a && isZero b) = false := by
    simpa only [case_nonzero_div_zero_mkState] using h6
  have hzn : (isZero a && !isZero b) = true := by
    simpa only [case_zero_div_nonzero_mkState] using h7
  rw [fdiv, if_neg (fdiv_nan_guard_false a b h1),
    if_neg (show ¬((isInf a && isInf b) = true) by simp [hii]),
    if_neg (show ¬((isZero a && isZero b) = true) by simp [hzz]),
    if_neg (show ¬(isInf a = true) by simp [hai]),
    if_neg (show ¬(isInf b = true) by simp [hbi]),
    if_neg (show ¬((!isZero a && isZero b) = true) by simp [hnz]),
    if_pos (show (isZero a && !isZero b) = true from hzn)]
  simp only [special_result, special_invalid, special_div_by_zero, hsel,
    zero_with_sign_mkState, signed_zero_pack, rtlZeroResult]

-- ============================================================
-- §11  Assembly of the special path: both sides agree with the
--      `combinationalLogic` special 6-tuple for every special input
-- ============================================================

/-- `fdiv` reproduces the model's special 6-tuple whenever the model's
selector finds a special case. -/
theorem fdiv_eq_special_of_is_special (a b : BitVec 32)
    (h : is_special (mkState a b) = true) :
    fdiv a b = (special_result (mkState a b), false, false,
      special_div_by_zero (mkState a b), special_invalid (mkState a b), false) := by
  by_cases h1 : case_nan (mkState a b) = true
  · exact fdiv_nan a b (nan4_eq_true_of_case_nan_true a b h1)
  · have h1' : case_nan (mkState a b) = false := bool_eq_false_of_not_eq_true h1
    by_cases h2 : case_inf_inf (mkState a b) = true
    · exact fdiv_inf_inf a b h1' h2
    · have h2' : case_inf_inf (mkState a b) = false := bool_eq_false_of_not_eq_true h2
      by_cases h3 : case_zero_zero (mkState a b) = true
      · exact fdiv_zero_zero a b h1' h2' h3
      · have h3' : case_zero_zero (mkState a b) = false := bool_eq_false_of_not_eq_true h3
        by_cases h4 : a_is_inf (mkState a b) = true
        · exact fdiv_a_inf a b h1' h2' h3' h4
        · have h4' : a_is_inf (mkState a b) = false := bool_eq_false_of_not_eq_true h4
          by_cases h5 : b_is_inf (mkState a b) = true
          · exact fdiv_b_inf a b h1' h2' h3' h4' h5
          · have h5' : b_is_inf (mkState a b) = false := bool_eq_false_of_not_eq_true h5
            by_cases h6 : case_nonzero_div_zero (mkState a b) = true
            · exact fdiv_nonzero_div_zero a b h1' h2' h3' h4' h5' h6
            · have h6' : case_nonzero_div_zero (mkState a b) = false :=
                bool_eq_false_of_not_eq_true h6
              by_cases h7 : case_zero_div_nonzero (mkState a b) = true
              · exact fdiv_zero_div_nonzero a b h1' h2' h3' h4' h5' h6' h7
              · have h7' : case_zero_div_nonzero (mkState a b) = false :=
                  bool_eq_false_of_not_eq_true h7
                exfalso
                have hs : special_sel (mkState a b) = .none :=
                  special_sel_none_of_cases _ h1' h2' h3' h4' h5' h6' h7'
                rw [is_special_eq_false_of_sel_none _ hs] at h
                exact absurd h (by decide)

/-- The RTL side of the special path: `rtl_comb` is the model's special 6-tuple. -/
theorem rtl_comb_eq_special_of_is_special (a b : BitVec 32)
    (h : is_special (mkState a b) = true) :
    rtl_comb a b = (special_result (mkState a b), false, false,
      special_div_by_zero (mkState a b), special_invalid (mkState a b), false) :=
  combinationalLogic_of_special (mkState a b) h

/-- Special-path kernel-checked half of `rtlEquivSpec`. -/
theorem rtlEquivSpec_of_special (a b : BitVec 32)
    (h : is_special (mkState a b) = true) : rtl_comb a b = fdiv a b := by
  rw [rtl_comb_eq_special_of_is_special a b h, fdiv_eq_special_of_is_special a b h]

-- ============================================================
-- §12  The remaining `fdiv` branch (the normal datapath) and the
--      exact obligation that is left for the divider half
-- ============================================================

/-- The eighth branch of `fdiv`: once all seven special predicates fail, `fdiv`
falls through to the spec's normal datapath. -/
theorem fdiv_normal_of_not_special (a b : BitVec 32) (h1 : case_nan (mkState a b) = false)
    (h2 : case_inf_inf (mkState a b) = false) (h3 : case_zero_zero (mkState a b) = false)
    (h4 : a_is_inf (mkState a b) = false) (h5 : b_is_inf (mkState a b) = false)
    (h6 : case_nonzero_div_zero (mkState a b) = false)
    (h7 : case_zero_div_nonzero (mkState a b) = false) :
    fdiv a b = (let (res, ovf, unf, inex) := FdivSpec.normalFdiv a b;
      (res, ovf, unf, false, false, inex)) := by
  have hii : (isInf a && isInf b) = false := by simpa only [case_inf_inf_mkState] using h2
  have hzz : (isZero a && isZero b) = false := by simpa only [case_zero_zero_mkState] using h3
  have hai : isInf a = false := by simpa only [a_is_inf_mkState] using h4
  have hbi : isInf b = false := by simpa only [b_is_inf_mkState] using h5
  have hnz : (!isZero a && isZero b) = false := by
    simpa only [case_nonzero_div_zero_mkState] using h6
  have hzn : (isZero a && !isZero b) = false := by
    simpa only [case_zero_div_nonzero_mkState] using h7
  rw [fdiv, if_neg (fdiv_nan_guard_false a b h1),
    if_neg (show ¬((isInf a && isInf b) = true) by simp [hii]),
    if_neg (show ¬((isZero a && isZero b) = true) by simp [hzz]),
    if_neg (show ¬(isInf a = true) by simp [hai]),
    if_neg (show ¬(isInf b = true) by simp [hbi]),
    if_neg (show ¬((!isZero a && isZero b) = true) by simp [hnz]),
    if_neg (show ¬((isZero a && !isZero b) = true) by simp [hzn])]

/-- Same fallthrough, phrased with the model's own non-special hypothesis. -/
theorem fdiv_normal_of_is_special_false (a b : BitVec 32)
    (h : is_special (mkState a b) = false) :
    fdiv a b = (let (res, ovf, unf, inex) := FdivSpec.normalFdiv a b;
      (res, ovf, unf, false, false, inex)) := by
  have hs := special_sel_none_of_is_special_false _ h
  exact fdiv_normal_of_not_special a b
    (case_nan_eq_false_of_sel_none _ hs) (case_inf_inf_eq_false_of_sel_none _ hs)
    (case_zero_zero_eq_false_of_sel_none _ hs) (a_is_inf_eq_false_of_sel_none _ hs)
    (b_is_inf_eq_false_of_sel_none _ hs) (case_nonzero_div_zero_eq_false_of_sel_none _ hs)
    (case_zero_div_nonzero_eq_false_of_sel_none _ hs)

/-- The RTL side of the normal path: `rtl_comb` is the model's normal 6-tuple. -/
theorem rtl_comb_of_not_special (a b : BitVec 32) (h : is_special (mkState a b) = false) :
    rtl_comb a b = (let (res, ovf, unf, inex) := FdivModel.normalFdiv (mkState a b);
      (res, ovf, unf, false, false, inex)) :=
  combinationalLogic_of_not_special (mkState a b) h

/-- Non-special half of `rtlEquivSpec`, reduced to the single datapath equality
that the two `normalFdiv` implementations still have to be shown to satisfy. -/
theorem rtlEquivSpec_of_not_special (a b : BitVec 32)
    (h : is_special (mkState a b) = false)
    (hn : FdivModel.normalFdiv (mkState a b) = FdivSpec.normalFdiv a b) :
    rtl_comb a b = fdiv a b := by
  rw [rtl_comb_of_not_special a b h, fdiv_normal_of_is_special_false a b h, hn]



/-! ### Divider and operand bridges (epoch-3 lane r2 half, inlined, top-level) -/

theorem shifted_toNat (r : BitVec 29) (h : r.toNat < 2 ^ 28) :
    ((BitVec.extractLsb 27 0 r) ++ 0#1 : BitVec 29).toNat = 2 * r.toNat := by
  simp only [BitVec.toNat_append, BitVec.extractLsb_toNat, BitVec.toNat_ofNat, Nat.zero_mod,
    Nat.or_zero, Nat.shiftRight_zero, Nat.shiftLeft_eq]
  have h' : r.toNat % 2 ^ 28 = r.toNat := Nat.mod_eq_of_lt h
  omega

theorem or_one_eq_add (k : Nat) : 2 * k ||| 1 = 2 * k + 1 := by
  have h := Nat.two_pow_add_eq_or_of_lt (i := 1) (b := 1) (by decide) k
  simpa using h.symm

theorem qbits_shift_eq (q : BitVec 28) (hq : q.toNat < 2 ^ 27) :
    ((q <<< 1) : BitVec 28).toNat = 2 * q.toNat := by
  rw [BitVec.toNat_shiftLeft]
  apply Nat.mod_eq_of_lt
  rw [Nat.shiftLeft_eq]
  omega

theorem qbits_or_one (q : BitVec 28) (hq : q.toNat < 2 ^ 27) :
    ((q <<< 1) ||| 1#28 : BitVec 28).toNat = 2 * q.toNat + 1 := by
  rw [BitVec.toNat_or, BitVec.toNat_shiftLeft, BitVec.toNat_ofNat, Nat.shiftLeft_eq]
  have h1 : q.toNat * 2 % 2 ^ 28 = q.toNat * 2 := Nat.mod_eq_of_lt (by omega)
  have h2 : 1 % 2 ^ 28 = 1 := Nat.mod_eq_of_lt (by omega)
  rw [h1, h2, Nat.mul_comm q.toNat 2]
  exact or_one_eq_add q.toNat

/-- Nat-level simulation of one restoring-divider stage. -/
def stepNat (rm qb d : Nat) : Nat × Nat :=
  if d ≤ 2 * rm then (2 * rm - d, 2 * qb + 1) else (2 * rm, 2 * qb)

theorem dividerStep_nat (rem : BitVec 29) (qbits : BitVec 28) (d : BitVec 29)
    (hrem : rem.toNat < 2 ^ 28) (hq : qbits.toNat < 2 ^ 27) :
    ((dividerStep (rem, qbits) d).1.toNat, (dividerStep (rem, qbits) d).2.toNat)
      = stepNat rem.toNat qbits.toNat d.toNat := by
  have hs : ((BitVec.extractLsb 27 0 rem) ++ 0#1 : BitVec 29).toNat = 2 * rem.toNat :=
    shifted_toNat rem hrem
  unfold stepNat
  simp only [dividerStep]
  by_cases hc : d.toNat ≤ 2 * rem.toNat
  · have hcond : decide ((BitVec.extractLsb 27 0 rem) ++ 0#1 ≥ d) = true := by
      simp only [decide_eq_true_eq, ge_iff_le, BitVec.le_def, hs]
      exact hc
    have hle : d ≤ (BitVec.extractLsb 27 0 rem) ++ 0#1 := by
      rw [BitVec.le_def, hs]; exact hc
    rw [if_pos hc, Prod.mk.injEq]
    constructor
    · rw [if_pos hcond, BitVec.toNat_sub_of_le hle, hs]
    · rw [if_pos hcond, qbits_or_one qbits hq]
  · have hcond : ¬ (decide ((BitVec.extractLsb 27 0 rem) ++ 0#1 ≥ d) = true) := by
      simp only [decide_eq_true_eq, ge_iff_le, BitVec.le_def, hs]
      exact hc
    rw [if_neg hc, Prod.mk.injEq]
    constructor
    · rw [if_neg hcond, hs]
    · rw [if_neg hcond, BitVec.toNat_or, qbits_shift_eq qbits hq, BitVec.toNat_zero, Nat.or_zero]

/-- `t` iterations of the RTL divider stage, as a `List.foldl` (matches `runDivider`). -/
def runSteps (t : Nat) (st : BitVec 29 × BitVec 28) (d : BitVec 29) : BitVec 29 × BitVec 28 :=
  (List.range t).foldl (fun st _ => dividerStep st d) st

/-- `t` iterations of the Nat-level stage. -/
def runStepsNat (t : Nat) (s : Nat × Nat) (d : Nat) : Nat × Nat :=
  (List.range t).foldl (fun s _ => stepNat s.1 s.2 d) s

theorem runSteps_succ (t : Nat) (st : BitVec 29 × BitVec 28) (d : BitVec 29) :
    runSteps (t + 1) st d = dividerStep (runSteps t st d) d := by
  simp [runSteps, List.range_succ, List.foldl_append]

theorem runStepsNat_succ (t : Nat) (s : Nat × Nat) (d : Nat) :
    runStepsNat (t + 1) s d = stepNat (runStepsNat t s d).1 (runStepsNat t s d).2 d := by
  simp [runStepsNat, List.range_succ, List.foldl_append]

theorem step_arith_pos (q r D : Nat) (hc : D ≤ 2 * r) :
    (q * D + r) * 2 = (2 * q + 1) * D + (2 * r - D) := by
  have h : (2 * r - D) + D = 2 * r := Nat.sub_add_cancel hc
  calc (q * D + r) * 2 = 2 * (q * D) + 2 * r := by ring
    _ = 2 * (q * D) + ((2 * r - D) + D) := by rw [h]
    _ = (2 * q + 1) * D + (2 * r - D) := by ring

theorem step_arith_neg (q r D : Nat) :
    (q * D + r) * 2 = (2 * q) * D + 2 * r := by ring

/-- Nat-level loop invariant of the restoring divider: after `t` stages the running pair
`(r, q)` satisfies `2^(n+t) * R = q * D + r`, `r < D` and `q < 2^(n+t+1)`. -/
theorem runStepsNat_spec (t n R D : Nat) (s : Nat × Nat)
    (hR : 2 ^ n * R = s.2 * D + s.1) (hr : s.1 < D) (hq : s.2 < 2 ^ (n + 1)) :
    2 ^ (n + t) * R = (runStepsNat t s D).2 * D + (runStepsNat t s D).1 ∧
      (runStepsNat t s D).1 < D ∧ (runStepsNat t s D).2 < 2 ^ (n + t + 1) := by
  induction t with
  | zero => simpa [runStepsNat] using And.intro hR (And.intro hr hq)
  | succ t ih =>
    obtain ⟨hR', hr', hq'⟩ := ih
    have hidx : n + (t + 1) = (n + t) + 1 := by omega
    have hidx2 : n + (t + 1) + 1 = n + t + 2 := by omega
    rw [runStepsNat_succ]
    unfold stepNat
    by_cases hc : D ≤ 2 * (runStepsNat t s D).1
    · rw [if_pos hc]
      refine ⟨?_, ?_, ?_⟩
      · have hp : 2 ^ (n + (t + 1)) * R = (2 ^ (n + t) * R) * 2 := by
          rw [hidx, Nat.pow_succ]; ring
        rw [hp, hR']
        exact step_arith_pos _ _ _ hc
      · omega
      · rw [hidx2, show n + t + 2 = (n + t + 1) + 1 from by omega, Nat.pow_succ]
        omega
    · rw [if_neg hc]
      refine ⟨?_, ?_, ?_⟩
      · have hp : 2 ^ (n + (t + 1)) * R = (2 ^ (n + t) * R) * 2 := by
          rw [hidx, Nat.pow_succ]; ring
        rw [hp, hR']
        exact step_arith_neg _ _ _
      · omega
      · rw [hidx2, show n + t + 2 = (n + t + 1) + 1 from by omega, Nat.pow_succ]
        omega

theorem runStepsNat_bounds (t n D : Nat) (s : Nat × Nat)
    (hr : s.1 < D) (hq : s.2 < 2 ^ (n + 1)) :
    (runStepsNat t s D).1 < D ∧ (runStepsNat t s D).2 < 2 ^ (n + t + 1) := by
  induction t with
  | zero => simpa [runStepsNat] using And.intro hr hq
  | succ t ih =>
    obtain ⟨hr', hq'⟩ := ih
    have hidx2 : n + (t + 1) + 1 = n + t + 2 := by omega
    rw [runStepsNat_succ]
    unfold stepNat
    by_cases hc : D ≤ 2 * (runStepsNat t s D).1
    · rw [if_pos hc]
      refine ⟨?_, ?_⟩
      · omega
      · rw [hidx2, show n + t + 2 = (n + t + 1) + 1 from by omega, Nat.pow_succ]; omega
    · rw [if_neg hc]
      refine ⟨?_, ?_⟩
      · omega
      · rw [hidx2, show n + t + 2 = (n + t + 1) + 1 from by omega, Nat.pow_succ]; omega

/-- The BitVec `runSteps` computes exactly the Nat-level `runStepsNat`, and the running
state keeps the invariant bounds. -/
theorem runSteps_agree (t n : Nat) (st : BitVec 29 × BitVec 28) (d : BitVec 29)
    (hd : d.toNat ≤ 2 ^ 27) (hr : st.1.toNat < d.toNat) (hq : st.2.toNat < 2 ^ (n + 1))
    (hn : n + t ≤ 27) :
    (runSteps t st d).1.toNat = (runStepsNat t (st.1.toNat, st.2.toNat) d.toNat).1 ∧
      (runSteps t st d).2.toNat = (runStepsNat t (st.1.toNat, st.2.toNat) d.toNat).2 ∧
      (runSteps t st d).1.toNat < d.toNat ∧
      (runSteps t st d).2.toNat < 2 ^ (n + t + 1) := by
  induction t with
  | zero => simp [runSteps, runStepsNat, hr, hq]
  | succ t ih =>
    have ih' := ih (by omega : n + t ≤ 27)
    obtain ⟨ih1, ih2, ih3, ih4⟩ := ih'
    have hrem : (runSteps t st d).1.toNat < 2 ^ 28 := by omega
    have hpow : 2 ^ (n + t + 1) ≤ 2 ^ 27 :=
      Nat.pow_le_pow_right (by norm_num) (by omega)
    have hqq : (runSteps t st d).2.toNat < 2 ^ 27 := lt_of_lt_of_le ih4 hpow
    have hstep := dividerStep_nat (runSteps t st d).1 (runSteps t st d).2 d hrem hqq
    have h1 : (dividerStep (runSteps t st d) d).1.toNat
        = (stepNat (runSteps t st d).1.toNat (runSteps t st d).2.toNat d.toNat).1 :=
      congrArg Prod.fst hstep
    have h2 : (dividerStep (runSteps t st d) d).2.toNat
        = (stepNat (runSteps t st d).1.toNat (runSteps t st d).2.toNat d.toNat).2 :=
      congrArg Prod.snd hstep
    refine ⟨?_, ?_, ?_, ?_⟩
    · rw [runSteps_succ, h1, ih1, ih2, ← runStepsNat_succ t (st.1.toNat, st.2.toNat) d.toNat]
    · rw [runSteps_succ, h2, ih1, ih2, ← runStepsNat_succ t (st.1.toNat, st.2.toNat) d.toNat]
    · rw [runSteps_succ, h1, ih1, ih2, ← runStepsNat_succ t (st.1.toNat, st.2.toNat) d.toNat]
      exact (runStepsNat_bounds (t + 1) n d.toNat (st.1.toNat, st.2.toNat) hr hq).1
    · rw [runSteps_succ, h2, ih1, ih2, ← runStepsNat_succ t (st.1.toNat, st.2.toNat) d.toNat]
      exact (runStepsNat_bounds (t + 1) n d.toNat (st.1.toNat, st.2.toNat) hr hq).2

/-- 27 stages of the RTL divider from an arbitrary base state `(r0, q0)` compute the
prec-27 quotient and remainder of `A / B`. -/
theorem runSteps27_spec (r0 : BitVec 29) (q0 : BitVec 28) (d : BitVec 29) (A B : Nat)
    (hB : 0 < B) (hd : d.toNat = B) (hB27 : B ≤ 2 ^ 27)
    (hr0 : r0.toNat < B) (hq0 : q0.toNat < 2) (hbase : A = q0.toNat * B + r0.toNat) :
    (runSteps 27 (r0, q0) d).1.toNat = A * 2 ^ 27 % B ∧
      (runSteps 27 (r0, q0) d).2.toNat = A * 2 ^ 27 / B := by
  have hag := runSteps_agree 27 0 (r0, q0) d (by omega) (by rw [hd]; exact hr0)
    (by simpa using hq0) (by omega)
  obtain ⟨hag1, hag2, -, -⟩ := hag
  have hspec := runStepsNat_spec 27 0 A B (r0.toNat, q0.toNat)
    (by simpa using hbase) (by simpa using hr0) (by simpa using hq0)
  obtain ⟨hR, hr, hq⟩ := hspec
  have hag1' : (runSteps 27 (r0, q0) d).1.toNat
      = (runStepsNat 27 (r0.toNat, q0.toNat) B).1 := by simpa [hd] using hag1
  have hag2' : (runSteps 27 (r0, q0) d).2.toNat
      = (runStepsNat 27 (r0.toNat, q0.toNat) B).2 := by simpa [hd] using hag2
  rw [← hag1', ← hag2'] at hR
  rw [← hag1'] at hr
  have hR' : A * 2 ^ 27
      = (runSteps 27 (r0, q0) d).2.toNat * B + (runSteps 27 (r0, q0) d).1.toNat := by
    rw [Nat.mul_comm A (2 ^ 27)]
    simpa using hR
  refine ⟨?_, ?_⟩
  · rw [hR', Nat.add_comm ((runSteps 27 (r0, q0) d).2.toNat * B)
        (runSteps 27 (r0, q0) d).1.toNat, Nat.mul_comm ((runSteps 27 (r0, q0) d).2.toNat) B,
      Nat.add_mul_mod_self_left, Nat.mod_eq_of_lt hr]
  · rw [hR']
    have hlt : (runSteps 27 (r0, q0) d).2.toNat * B + (runSteps 27 (r0, q0) d).1.toNat
        < ((runSteps 27 (r0, q0) d).2.toNat + 1) * B := by
      rw [Nat.add_mul, one_mul]
      exact Nat.add_lt_add_left hr _
    exact (Nat.div_eq_of_lt_le (Nat.le_add_right _ _) hlt).symm

theorem runDivider_spec (mv_a mv_b : BitVec 26)
    (hA : 2 ^ 23 ≤ mv_a.toNat) (hA' : mv_a.toNat < 2 ^ 24)
    (hB : 2 ^ 23 ≤ mv_b.toNat) (hB' : mv_b.toNat < 2 ^ 24) :
    (runDivider mv_a mv_b).1.toNat = mv_a.toNat * 2 ^ 27 / mv_b.toNat ∧
      (runDivider mv_a mv_b).2.toNat = mv_a.toNat * 2 ^ 27 % mv_b.toNat := by
  have hdiv : (0#3 ++ mv_b : BitVec 29).toNat = mv_b.toNat := by
    rw [BitVec.toNat_append, BitVec.toNat_zero]; simp
  have hr0n : (0#3 ++ mv_a : BitVec 29).toNat = mv_a.toNat := by
    rw [BitVec.toNat_append, BitVec.toNat_zero]; simp
  have hBpos : 0 < mv_b.toNat := by omega
  simp only [runDivider]
  by_cases hq : mv_b ≤ mv_a
  · have hqT : decide (mv_b ≤ mv_a) = true := decide_eq_true hq
    have hge : mv_b.toNat ≤ mv_a.toNat := hq
    rw [if_pos hqT, if_pos hqT]
    have hsub : (((0#3 ++ mv_a : BitVec 29)) - (0#3 ++ mv_b)).toNat
        = mv_a.toNat - mv_b.toNat := by
      rw [BitVec.toNat_sub_of_le (by rw [BitVec.le_def, hr0n, hdiv]; exact hge), hr0n, hdiv]
    have hq1 : (1#28 : BitVec 28).toNat = 1 := by simp
    have hspec := runSteps27_spec ((0#3 ++ mv_a : BitVec 29) - (0#3 ++ mv_b)) 1#28
      (0#3 ++ mv_b) mv_a.toNat mv_b.toNat hBpos hdiv (by omega)
      (by rw [hsub]; omega) (by rw [hq1]; omega) (by rw [hsub, hq1]; omega)
    have hfold : (List.range 27).foldl
          (fun (st : BitVec 29 × BitVec 28) (_ : Nat) => dividerStep st (0#3 ++ mv_b))
          (((0#3 ++ mv_a : BitVec 29) - (0#3 ++ mv_b)), (1#28 : BitVec 28))
        = runSteps 27 (((0#3 ++ mv_a : BitVec 29) - (0#3 ++ mv_b)), (1#28 : BitVec 28))
            (0#3 ++ mv_b) := rfl
    rw [hfold]
    exact ⟨hspec.2, hspec.1⟩
  · have hqT : ¬ (decide (mv_b ≤ mv_a) = true) := by
      simp only [decide_eq_true_eq]; exact hq
    rw [if_neg hqT, if_neg hqT]
    have hlt : mv_a.toNat < mv_b.toNat := not_le.mp hq
    have hq0 : (0#28 : BitVec 28).toNat = 0 := by simp
    have hspec := runSteps27_spec (0#3 ++ mv_a) 0#28 (0#3 ++ mv_b) mv_a.toNat mv_b.toNat
      hBpos hdiv (by omega) (by rw [hr0n]; omega) (by rw [hq0]; omega) (by rw [hq0]; omega)
    have hfold : (List.range 27).foldl
          (fun (st : BitVec 29 × BitVec 28) (_ : Nat) => dividerStep st (0#3 ++ mv_b))
          (0#3 ++ mv_a, (0#28 : BitVec 28))
        = runSteps 27 (0#3 ++ mv_a, (0#28 : BitVec 28)) (0#3 ++ mv_b) := rfl
    rw [hfold]
    exact ⟨hspec.2, hspec.1⟩


theorem quot_bounds (A B : Nat) (hA : 2 ^ 23 ≤ A) (hA' : A < 2 ^ 24)
    (hB : 2 ^ 23 ≤ B) (hB' : B < 2 ^ 24) :
    2 ^ 26 ≤ A * 2 ^ 27 / B ∧ A * 2 ^ 27 / B < 2 ^ 28 := by
  have hBpos : 0 < B := by omega
  constructor
  · rw [Nat.le_div_iff_mul_le hBpos]
    calc 2 ^ 26 * B ≤ 2 ^ 26 * (2 * A) := by
          apply Nat.mul_le_mul_left; omega
      _ = A * 2 ^ 27 := by ring
  · rw [Nat.div_lt_iff_lt_mul hBpos]
    calc A * 2 ^ 27 < 2 ^ 24 * 2 ^ 27 := by
          exact Nat.mul_lt_mul_of_pos_right hA' (by norm_num)
      _ = 2 ^ 51 := by norm_num
      _ ≤ 2 ^ 28 * 2 ^ 23 := by norm_num
      _ ≤ 2 ^ 28 * B := Nat.mul_le_mul_left _ hB

theorem log2_quot_eq (A B : Nat) (hA : 2 ^ 23 ≤ A) (hA' : A < 2 ^ 24)
    (hB : 2 ^ 23 ≤ B) (hB' : B < 2 ^ 24) :
    Nat.log2 (A * 2 ^ 27 / B) = if B ≤ A then 27 else 26 := by
  have hb := quot_bounds A B hA hA' hB hB'
  have hBpos : 0 < B := by omega
  have hq0 : A * 2 ^ 27 / B ≠ 0 := by omega
  rw [Nat.log2_eq_iff hq0]
  by_cases h : B ≤ A
  · rw [if_pos h]
    refine ⟨?_, ?_⟩
    · rw [Nat.le_div_iff_mul_le hBpos]
      have hm := Nat.mul_le_mul_right (2 ^ 27) h
      simpa [Nat.mul_comm] using hm
    · rw [show (2:Nat) ^ (27 + 1) = 2 ^ 28 from by norm_num]
      exact hb.2
  · rw [if_neg h]
    refine ⟨?_, ?_⟩
    · rw [show (2:Nat) ^ (26 + 1) = 2 ^ 27 from by norm_num]
      exact hb.1
    · rw [Nat.div_lt_iff_lt_mul hBpos]
      have hAB : A < B := by omega
      have hm := Nat.mul_lt_mul_of_pos_right hAB (show 0 < 2 ^ 27 by norm_num)
      simpa [Nat.mul_comm] using hm

theorem log2_quot_ge_iff (A B : Nat) (hA : 2 ^ 23 ≤ A) (hA' : A < 2 ^ 24)
    (hB : 2 ^ 23 ≤ B) (hB' : B < 2 ^ 24) :
    (27 ≤ Nat.log2 (A * 2 ^ 27 / B)) ↔ B ≤ A := by
  rw [log2_quot_eq A B hA hA' hB hB']
  by_cases h : B ≤ A <;> simp [h]

theorem quot_ge_two_pow_iff (A B : Nat) (hA : 2 ^ 23 ≤ A) (hA' : A < 2 ^ 24)
    (hB : 2 ^ 23 ≤ B) (hB' : B < 2 ^ 24) :
    (2 ^ 27 ≤ A * 2 ^ 27 / B) ↔ B ≤ A := by
  have hBpos : 0 < B := by omega
  rw [Nat.le_div_iff_mul_le hBpos]
  constructor
  · intro h
    by_contra hc
    have hAB : A < B := by omega
    have hm := Nat.mul_lt_mul_of_pos_right hAB (show 0 < 2 ^ 27 by norm_num)
    rw [Nat.mul_comm B (2 ^ 27)] at hm
    omega
  · intro h
    have hm := Nat.mul_le_mul_right (2 ^ 27) h
    simpa [Nat.mul_comm] using hm

theorem bv26_ge_eq_decide (x y : BitVec 26) :
    (x ≥ y) = decide (y.toNat ≤ x.toNat) := by
  simp [BitVec.le_def]


theorem finalRemWithSticky_eq (remRaw divisor : BitVec 29) (hr : remRaw.toNat < 2 ^ 28) :
    finalRemWithSticky remRaw divisor = decide (remRaw.toNat ≠ 0) := by
  have hmsb : remRaw.getLsbD 28 = false := by
    rw [← BitVec.testBit_toNat]
    exact Nat.testBit_lt_two_pow hr
  have hred : (BitVec.extractLsb 27 0 remRaw).toNat = remRaw.toNat := by
    rw [BitVec.extractLsb_toNat, show (27 - 0 + 1 : Nat) = 28 from by norm_num,
      Nat.shiftRight_zero]
    exact Nat.mod_eq_of_lt hr
  have hbeq : ((BitVec.extractLsb 27 0 remRaw) == 0#28) = decide (remRaw.toNat = 0) := by
    by_cases h0 : remRaw.toNat = 0
    · have hz : BitVec.extractLsb 27 0 remRaw = 0#28 := by
        apply BitVec.toNat_inj.mp
        rw [hred, h0]
        rfl
      simp [hz, h0]
    · have hnz : ¬ (BitVec.extractLsb 27 0 remRaw = 0#28) := by
        intro hc
        have : (BitVec.extractLsb 27 0 remRaw).toNat = 0 := by rw [hc]; rfl
        omega
      simp [hnz, h0]
  unfold finalRemWithSticky
  simp only [hmsb, Bool.false_eq_true, if_false, hbeq]
  by_cases h0 : remRaw.toNat = 0 <;> simp [h0]

theorem runDivider_sticky (mv_a mv_b : BitVec 26)
    (hA : 2 ^ 23 ≤ mv_a.toNat) (hA' : mv_a.toNat < 2 ^ 24)
    (hB : 2 ^ 23 ≤ mv_b.toNat) (hB' : mv_b.toNat < 2 ^ 24) :
    finalRemWithSticky (runDivider mv_a mv_b).2 (0#3 ++ mv_b) =
      decide (mv_a.toNat * 2 ^ 27 % mv_b.toNat ≠ 0) := by
  have hspec := runDivider_spec mv_a mv_b hA hA' hB hB'
  have hlt : (runDivider mv_a mv_b).2.toNat < 2 ^ 28 := by
    rw [hspec.2]
    have hBpos : 0 < mv_b.toNat := by omega
    have := Nat.mod_lt (mv_a.toNat * 2 ^ 27) hBpos
    omega
  rw [finalRemWithSticky_eq _ _ hlt, hspec.2]



theorem exponentField_ne_zero (x : BitVec 32) (hsub : isSubnormal x = false)
    (hzero : isZero x = false) : exponentField x ≠ 0#8 := by
  intro h
  by_cases hm : mantissaField x = 0#23
  · have h1 : isZero x = true := by unfold isZero; simp [h, hm]
    rw [h1] at hzero; exact Bool.noConfusion hzero
  · have h1 : isSubnormal x = true := by unfold isSubnormal; simp [h, hm]
    rw [h1] at hsub; exact Bool.noConfusion hsub

theorem or_pow23_add (m : Nat) (hm : m < 2 ^ 23) : 2 ^ 23 ||| m = 2 ^ 23 + m := by
  have h := Nat.two_pow_add_eq_or_of_lt (i := 23) (b := m) hm 1
  simpa using h.symm

theorem mantWithHiddenNat_eq (x : BitVec 32) (he : exponentField x ≠ 0#8) :
    mantWithHiddenNat x = 2 ^ 23 + (mantissaField x).toNat := by
  have hbeq : (exponentField x == 0#8) = false := by simp [beq_iff_eq, he]
  have hlt : (mantissaField x).toNat < 2 ^ 23 := (mantissaField x).isLt
  have hor := or_pow23_add (mantissaField x).toNat hlt
  unfold mantWithHiddenNat mantWithHidden
  simp only [hbeq, Bool.false_eq_true, if_false, BitVec.toNat_append, BitVec.toNat_ofNat,
    Nat.shiftLeft_eq]
  norm_num
  exact hor

theorem mantWithHiddenNat_bounds (x : BitVec 32) (he : exponentField x ≠ 0#8) :
    2 ^ 23 ≤ mantWithHiddenNat x ∧ mantWithHiddenNat x < 2 ^ 24 := by
  have h := mantWithHiddenNat_eq x he
  have hlt : (mantissaField x).toNat < 2 ^ 23 := (mantissaField x).isLt
  omega

theorem mant_a_val_eq_normal (s : RtlState) (hsub : isSubnormal s.a_reg = false)
    (hzero : isZero s.a_reg = false) :
    (mant_a_val s).toNat = mantWithHiddenNat s.a_reg := by
  have he : exponentField s.a_reg ≠ 0#8 := exponentField_ne_zero s.a_reg hsub hzero
  have hmh := mantWithHiddenNat_eq s.a_reg he
  have hsub' : a_is_subnormal s = false := hsub
  unfold mant_a_val
  simp only [hsub', Bool.false_eq_true, if_false]
  rw [hmh]
  have hlt : (mantissaField s.a_reg).toNat < 2 ^ 23 := (mantissaField s.a_reg).isLt
  have hor := or_pow23_add (mantissaField s.a_reg).toNat hlt
  simp only [BitVec.toNat_append, BitVec.toNat_ofNat, Nat.shiftLeft_eq, rtlFrac_eq_mantissaField]
  norm_num
  exact hor

theorem mant_b_val_eq_normal (s : RtlState) (hsub : isSubnormal s.b_reg = false)
    (hzero : isZero s.b_reg = false) :
    (mant_b_val s).toNat = mantWithHiddenNat s.b_reg := by
  have he : exponentField s.b_reg ≠ 0#8 := exponentField_ne_zero s.b_reg hsub hzero
  have hmh := mantWithHiddenNat_eq s.b_reg he
  have hsub' : b_is_subnormal s = false := hsub
  unfold mant_b_val
  simp only [hsub', Bool.false_eq_true, if_false]
  rw [hmh]
  have hlt : (mantissaField s.b_reg).toNat < 2 ^ 23 := (mantissaField s.b_reg).isLt
  have hor := or_pow23_add (mantissaField s.b_reg).toNat hlt
  simp only [BitVec.toNat_append, BitVec.toNat_ofNat, Nat.shiftLeft_eq, rtlFrac_eq_mantissaField]
  norm_num
  exact hor


theorem getLsbD22_of_mantissaNat_ge (x : BitVec 32) (h : 2 ^ 22 ≤ mantissaNat x) :
    x.getLsbD 22 = true := by
  have hlt : mantissaNat x < 2 ^ 23 := (mantissaField x).isLt
  have h1 : x.getLsbD 22 = (mantissaField x).getLsbD 22 :=
    (mantissaField_getLsbD_22 x).symm
  rw [h1, ← BitVec.testBit_toNat, Nat.testBit_eq_decide_div_mod_eq]
  have hdiv : (mantissaField x).toNat / 2 ^ 22 = 1 :=
    Nat.div_eq_of_lt_le h (by omega)
  rw [hdiv]
  norm_num

theorem exponentField_ne_ff (x : BitVec 32) (hinf : isInf x = false)
    (hnan : (isSNaN x || isQNaN x) = false) : exponentField x ≠ 0xFF#8 := by
  intro h
  have he : exponentNat x = 255 := by unfold exponentNat; rw [h]; rfl
  have hmne : (mantissaField x != 0#23) = true := by
    by_cases hm : mantissaField x = 0#23
    · have : isInf x = true := by unfold isInf; simp [h, hm]
      rw [this] at hinf; exact absurd hinf (by decide)
    · simp [bne_iff_ne, hm]
  by_cases hm : mantissaField x = 0#23
  · have : isInf x = true := by unfold isInf; simp [h, hm]
    rw [this] at hinf; exact absurd hinf (by decide)
  · have hm0 : mantissaNat x ≠ 0 := by
      intro hc
      have hc' : (mantissaField x).toNat = 0 := by simpa [mantissaNat] using hc
      exact hm (by apply BitVec.toNat_inj.mp; rw [hc']; rfl)
    by_cases hlt22 : mantissaNat x < 2 ^ 22
    · have hs : isSNaN x = true := by
        have heb : decide (exponentNat x = 255) = true := decide_eq_true he
        have h0b : decide (mantissaNat x ≠ 0) = true := decide_eq_true hm0
        have hlb : decide (mantissaNat x < 2 ^ 22) = true := decide_eq_true hlt22
        unfold isSNaN
        simp only [heb, h0b, hlb, Bool.true_and, Bool.and_true]
      have : (isSNaN x || isQNaN x) = true := by rw [hs]; rfl
      rw [this] at hnan; exact absurd hnan (by decide)
    · have hge : 2 ^ 22 ≤ mantissaNat x := by omega
      have hbit := getLsbD22_of_mantissaNat_ge x hge
      have hq : isQNaN x = true := by unfold isQNaN; simp [h, hmne, hbit]
      have : (isSNaN x || isQNaN x) = true := by rw [hq]; simp
      rw [this] at hnan; exact absurd hnan (by decide)

theorem exp_a_adj_eq_normalized (s : RtlState)
    (hsub : isSubnormal s.a_reg = false) (hzero : isZero s.a_reg = false)
    (hinf : isInf s.a_reg = false) (hnan : (isSNaN s.a_reg || isQNaN s.a_reg) = false) :
    exp_a_adj s = normalizedEffectiveExp s.a_reg := by
  have he0 : exponentField s.a_reg ≠ 0#8 := exponentField_ne_zero s.a_reg hsub hzero
  have hef : exponentField s.a_reg ≠ 0xFF#8 := exponentField_ne_ff s.a_reg hinf hnan
  have h0 : exponentNat s.a_reg ≠ 0 := by
    unfold exponentNat; intro hc
    exact he0 (by apply BitVec.toNat_inj.mp; rw [hc]; rfl)
  have h255 : exponentNat s.a_reg ≠ 255 := by
    unfold exponentNat; intro hc
    exact hef (by apply BitVec.toNat_inj.mp; rw [hc]; rfl)
  have hsub' : a_is_subnormal s = false := hsub
  unfold exp_a_adj normalizedEffectiveExp normalizationShift effectiveExp
  simp only [hsub', hsub, Bool.false_eq_true, if_false, rtlExp_eq_exponentField, h0, h255]
  unfold exponentNat
  push_cast
  ring

theorem exp_b_adj_eq_normalized (s : RtlState)
    (hsub : isSubnormal s.b_reg = false) (hzero : isZero s.b_reg = false)
    (hinf : isInf s.b_reg = false) (hnan : (isSNaN s.b_reg || isQNaN s.b_reg) = false) :
    exp_b_adj s = normalizedEffectiveExp s.b_reg := by
  have he0 : exponentField s.b_reg ≠ 0#8 := exponentField_ne_zero s.b_reg hsub hzero
  have hef : exponentField s.b_reg ≠ 0xFF#8 := exponentField_ne_ff s.b_reg hinf hnan
  have h0 : exponentNat s.b_reg ≠ 0 := by
    unfold exponentNat; intro hc
    exact he0 (by apply BitVec.toNat_inj.mp; rw [hc]; rfl)
  have h255 : exponentNat s.b_reg ≠ 255 := by
    unfold exponentNat; intro hc
    exact hef (by apply BitVec.toNat_inj.mp; rw [hc]; rfl)
  have hsub' : b_is_subnormal s = false := hsub
  unfold exp_b_adj normalizedEffectiveExp normalizationShift effectiveExp
  simp only [hsub', hsub, Bool.false_eq_true, if_false, rtlExp_eq_exponentField, h0, h255]
  unfold exponentNat
  push_cast
  ring

theorem result_exp_raw_eq_baseResultExp (s : RtlState)
    (hsa : isSubnormal s.a_reg = false) (hza : isZero s.a_reg = false)
    (hia : isInf s.a_reg = false) (hna : (isSNaN s.a_reg || isQNaN s.a_reg) = false)
    (hsb : isSubnormal s.b_reg = false) (hzb : isZero s.b_reg = false)
    (hib : isInf s.b_reg = false) (hnb : (isSNaN s.b_reg || isQNaN s.b_reg) = false) :
    result_exp_raw s = baseResultExp s.a_reg s.b_reg := by
  unfold result_exp_raw baseResultExp
  rw [exp_a_adj_eq_normalized s hsa hza hia hna, exp_b_adj_eq_normalized s hsb hzb hib hnb]


theorem normalizedMant_eq (x : BitVec 32) (hsub : isSubnormal x = false) :
    normalizedMantWithHiddenNat x = mantWithHiddenNat x := by
  have hsub' : isSubnormal x = false := hsub
  unfold normalizedMantWithHiddenNat normalizationShift
  simp only [hsub', Bool.false_eq_true, if_false, Nat.pow_zero, Nat.mul_one]

theorem runDivider_spec_mantissa (s : RtlState)
    (hsa : isSubnormal s.a_reg = false) (hza : isZero s.a_reg = false)
    (hsb : isSubnormal s.b_reg = false) (hzb : isZero s.b_reg = false) :
    (runDivider (mant_a_val s) (mant_b_val s)).1.toNat
        = normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 / normalizedMantWithHiddenNat s.b_reg ∧
      (runDivider (mant_a_val s) (mant_b_val s)).2.toNat
        = normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 % normalizedMantWithHiddenNat s.b_reg := by
  have hA := mant_a_val_eq_normal s hsa hza
  have hB := mant_b_val_eq_normal s hsb hzb
  have heA := exponentField_ne_zero s.a_reg hsa hza
  have heB := exponentField_ne_zero s.b_reg hsb hzb
  have hbA := mantWithHiddenNat_bounds s.a_reg heA
  have hbB := mantWithHiddenNat_bounds s.b_reg heB
  have hsp := runDivider_spec (mant_a_val s) (mant_b_val s)
    (by rw [hA]; exact hbA.1) (by rw [hA]; exact hbA.2)
    (by rw [hB]; exact hbB.1) (by rw [hB]; exact hbB.2)
  rw [hA, hB] at hsp
  rw [normalizedMant_eq s.a_reg hsa, normalizedMant_eq s.b_reg hsb]
  exact hsp

theorem runDivider_sticky_mantissa (s : RtlState)
    (hsa : isSubnormal s.a_reg = false) (hza : isZero s.a_reg = false)
    (hsb : isSubnormal s.b_reg = false) (hzb : isZero s.b_reg = false) :
    finalRemWithSticky (runDivider (mant_a_val s) (mant_b_val s)).2 (0#3 ++ mant_b_val s)
      = decide (normalizedMantWithHiddenNat s.a_reg * 2 ^ 27
          % normalizedMantWithHiddenNat s.b_reg ≠ 0) := by
  have hA := mant_a_val_eq_normal s hsa hza
  have hB := mant_b_val_eq_normal s hsb hzb
  have heA := exponentField_ne_zero s.a_reg hsa hza
  have heB := exponentField_ne_zero s.b_reg hsb hzb
  have hbA := mantWithHiddenNat_bounds s.a_reg heA
  have hbB := mantWithHiddenNat_bounds s.b_reg heB
  have hst := runDivider_sticky (mant_a_val s) (mant_b_val s)
    (by rw [hA]; exact hbA.1) (by rw [hA]; exact hbA.2)
    (by rw [hB]; exact hbB.1) (by rw [hB]; exact hbB.2)
  rw [hA, hB] at hst
  rw [normalizedMant_eq s.a_reg hsa, normalizedMant_eq s.b_reg hsb]
  exact hst


theorem extractLsb_toNat_div {w : Nat} (q : BitVec w) (hi lo : Nat) :
    (BitVec.extractLsb hi lo q).toNat = q.toNat / 2 ^ lo % 2 ^ (hi - lo + 1) := by
  rw [BitVec.extractLsb_toNat, Nat.shiftRight_eq_div_pow]

theorem getLsbD_iff_div_mod (q : BitVec 28) (k : Nat) :
    q.getLsbD k = true ↔ q.toNat / 2 ^ k % 2 = 1 := by
  rw [← BitVec.testBit_toNat, Nat.testBit_eq_decide_div_mod_eq, decide_eq_true_iff]

theorem sub_pow_div (f k : Nat) (hf : f < 2 ^ 27) (hk : k ≤ 27) :
    (2 ^ 27 + f) / 2 ^ k % 2 ^ (27 - k) = f / 2 ^ k := by
  have hdvd : 2 ^ k ∣ 2 ^ 27 := Nat.pow_dvd_pow 2 hk
  have hpk : 0 < 2 ^ k := Nat.pow_pos (by norm_num)
  have hlt : f / 2 ^ k < 2 ^ (27 - k) := by
    rw [Nat.div_lt_iff_lt_mul hpk, ← Nat.pow_add]
    have hsum : 27 - k + k = 27 := by omega
    rw [hsum]; exact hf
  rw [Nat.add_comm (2 ^ 27) f, Nat.add_div_of_dvd_left hdvd, Nat.pow_div hk (by norm_num),
    Nat.add_comm (f / 2 ^ k) (2 ^ (27 - k)), Nat.add_mod_left, Nat.mod_eq_of_lt hlt]

theorem sub_two_pow_div (q k : Nat) (h1 : 2 ^ 27 ≤ q) (h2 : q < 2 ^ 28) (hk : k ≤ 27) :
    (q - 2 ^ 27) / 2 ^ k = q / 2 ^ k % 2 ^ (27 - k) := by
  have hq : q = 2 ^ 27 + (q - 2 ^ 27) := by omega
  have hf : q - 2 ^ 27 < 2 ^ 27 := by omega
  conv_rhs => rw [hq]
  exact (sub_pow_div (q - 2 ^ 27) k hf hk).symm

theorem sub_two_pow_div_mod2 (q k : Nat) (h1 : 2 ^ 27 ≤ q) (h2 : q < 2 ^ 28) (hk : k < 27) :
    (q - 2 ^ 27) / 2 ^ k % 2 = q / 2 ^ k % 2 := by
  have hd : (2 : Nat) ∣ 2 ^ (27 - k) :=
    ⟨2 ^ (27 - k - 1), by rw [← Nat.pow_succ']; congr 1; omega⟩
  rw [sub_two_pow_div q k h1 h2 (by omega), Nat.mod_mod_of_dvd (q / 2 ^ k) hd]

theorem getLsbD_iff_frac (q : BitVec 28) (k : Nat) (hq1 : 2 ^ 27 ≤ q.toNat)
    (hq2 : q.toNat < 2 ^ 28) (hk : k < 27) :
    q.getLsbD k = true ↔ (q.toNat - 2 ^ 27) / 2 ^ k % 2 = 1 := by
  rw [getLsbD_iff_div_mod, sub_two_pow_div_mod2 q.toNat k hq1 hq2 hk]

theorem extractLsb26_4_eq (q : BitVec 28) (hq1 : 2 ^ 27 ≤ q.toNat) (hq2 : q.toNat < 2 ^ 28) :
    (BitVec.extractLsb 26 4 q).toNat = (q.toNat - 2 ^ 27) / 16 := by
  rw [extractLsb_toNat_div]
  have h4 : (q.toNat - 2 ^ 27) / 2 ^ 4 = q.toNat / 2 ^ 4 % 2 ^ (27 - 4) :=
    sub_two_pow_div q.toNat 4 hq1 hq2 (by omega)
  have e1 : 26 - 4 + 1 = 27 - 4 := by omega
  rw [e1, ← h4]
  norm_num

theorem extractLsb1_0_eq (q : BitVec 28) (hq1 : 2 ^ 27 ≤ q.toNat) (hq2 : q.toNat < 2 ^ 28) :
    (BitVec.extractLsb 1 0 q).toNat = (q.toNat - 2 ^ 27) % 4 := by
  rw [extractLsb_toNat_div]
  have hd : (4 : Nat) ∣ 2 ^ 27 := by norm_num
  have hmod : q.toNat % 4 = (q.toNat - 2 ^ 27) % 4 := by
    rw [← Nat.mod_mod_of_dvd q.toNat hd, Nat.mod_eq_sub_mod hq1, Nat.mod_mod_of_dvd _ hd]
  have e1 : 1 - 0 + 1 = 2 := by omega
  have h22 : (2 : Nat) ^ 2 = 4 := by norm_num
  rw [e1, Nat.pow_zero, Nat.div_one, h22, hmod]

-- Epoch 4, lane r2 — G1: SUBnormal operand normalization bridges
-- Model `normalizeShift23` / `norm_shift_a` / `mant_a_val` / `exp_a_adj` versus
-- spec `normalizationShift` / `normalizedMantWithHiddenNat` /
-- `normalizedEffectiveExp`.  Together these make the subnormal input class
-- reachable for the normal-path residual: every operand with
-- `isZero x = false` now has a 24-bit normalized mantissa in [2^23, 2^24) and
-- a normalized effective exponent.
-- ===========================================================================

theorem isSubnormal_components (x : BitVec 32) (h : isSubnormal x = true) :
    exponentField x = 0#8 ∧ mantissaField x ≠ 0#23 := by
  unfold isSubnormal at h
  simp only [Bool.and_eq_true, beq_iff_eq, bne_iff_ne] at h
  exact h

theorem normalizationShift_eq_of_subnormal (x : BitVec 32) (h : isSubnormal x = true) :
    normalizationShift x = 23 - Nat.log2 (mantissaField x).toNat := by
  obtain ⟨he, hf⟩ := isSubnormal_components x h
  unfold normalizationShift mantissaNat
  rw [if_pos h]

theorem normalizeShift23_eq_normalizationShift (x : BitVec 32) (h : isSubnormal x = true) :
    normalizeShift23 (mantissaField x) = normalizationShift x := by
  obtain ⟨he, hf⟩ := isSubnormal_components x h
  have hbeq : (mantissaField x == 0#23) = false := by simp [hf]
  have hbeq' : ¬ ((mantissaField x == 0#23) = true) := by rw [hbeq]; simp
  unfold normalizeShift23
  rw [if_neg hbeq', normalizationShift_eq_of_subnormal x h]

theorem mantWithHiddenNat_of_subnormal (x : BitVec 32) (h : isSubnormal x = true) :
    mantWithHiddenNat x = (mantissaField x).toNat := by
  obtain ⟨he, _⟩ := isSubnormal_components x h
  have hbeq : (exponentField x == 0#8) = true := by simp [he]
  unfold mantWithHiddenNat mantWithHidden
  rw [if_pos hbeq, BitVec.toNat_append]
  simp

theorem subnormal_shift_bounds (frac : BitVec 23) (h : frac ≠ 0#23) :
    2 ^ 23 ≤ frac.toNat * 2 ^ (23 - Nat.log2 frac.toNat) ∧
      frac.toNat * 2 ^ (23 - Nat.log2 frac.toNat) < 2 ^ 24 := by
  have hf : frac.toNat ≠ 0 := by
    intro hc
    exact h (by apply BitVec.toNat_inj.mp; simpa using hc)
  have hlt : frac.toNat < 2 ^ 23 := frac.isLt
  have hlog : Nat.log2 frac.toNat < 23 := (Nat.log2_lt hf).mpr hlt
  have hle : 2 ^ Nat.log2 frac.toNat ≤ frac.toNat := (Nat.le_log2 hf).mp le_rfl
  constructor
  · calc 2 ^ 23 = 2 ^ Nat.log2 frac.toNat * 2 ^ (23 - Nat.log2 frac.toNat) := by
          rw [← Nat.pow_add]; congr 1; omega
      _ ≤ frac.toNat * 2 ^ (23 - Nat.log2 frac.toNat) := Nat.mul_le_mul_right _ hle
  · have hlt2 : frac.toNat < 2 ^ (Nat.log2 frac.toNat + 1) :=
      (Nat.log2_lt hf).mp (Nat.lt_succ_self _)
    have hp := Nat.mul_lt_mul_of_pos_right hlt2
      (Nat.pow_pos (by norm_num) : (0 : Nat) < 2 ^ (23 - Nat.log2 frac.toNat))
    rw [← Nat.pow_add] at hp
    have hexp : Nat.log2 frac.toNat + 1 + (23 - Nat.log2 frac.toNat) = 24 := by omega
    rwa [hexp] at hp

theorem subnormal_shift_toNat (frac : BitVec 23) (h : frac ≠ 0#23) :
    ((0#3 ++ frac : BitVec 26) <<< (23 - Nat.log2 frac.toNat)).toNat
      = frac.toNat * 2 ^ (23 - Nat.log2 frac.toNat) := by
  have hv : (0#3 ++ frac : BitVec 26).toNat = frac.toNat := by
    rw [BitVec.toNat_append]
    simp
  rw [BitVec.toNat_shiftLeft, Nat.shiftLeft_eq, hv]
  apply Nat.mod_eq_of_lt
  have hb := (subnormal_shift_bounds frac h).2
  have : (2 : Nat) ^ 24 < 2 ^ 26 := by norm_num
  omega

theorem mant_a_val_eq_normalized_sub (s : RtlState) (hsub : isSubnormal s.a_reg = true) :
    (mant_a_val s).toNat = normalizedMantWithHiddenNat s.a_reg := by
  obtain ⟨he, hf⟩ := isSubnormal_components s.a_reg hsub
  have hsub' : a_is_subnormal s = true := hsub
  unfold mant_a_val norm_shift_a normalizedMantWithHiddenNat
  simp only [hsub', reduceIte]
  rw [rtlFrac_eq_mantissaField,
    mantWithHiddenNat_of_subnormal s.a_reg hsub,
    normalizeShift23_eq_normalizationShift s.a_reg hsub,
    normalizationShift_eq_of_subnormal s.a_reg hsub,
    subnormal_shift_toNat (mantissaField s.a_reg) hf]

theorem mant_b_val_eq_normalized_sub (s : RtlState) (hsub : isSubnormal s.b_reg = true) :
    (mant_b_val s).toNat = normalizedMantWithHiddenNat s.b_reg := by
  obtain ⟨he, hf⟩ := isSubnormal_components s.b_reg hsub
  have hsub' : b_is_subnormal s = true := hsub
  unfold mant_b_val norm_shift_b normalizedMantWithHiddenNat
  simp only [hsub', reduceIte]
  rw [rtlFrac_eq_mantissaField,
    mantWithHiddenNat_of_subnormal s.b_reg hsub,
    normalizeShift23_eq_normalizationShift s.b_reg hsub,
    normalizationShift_eq_of_subnormal s.b_reg hsub,
    subnormal_shift_toNat (mantissaField s.b_reg) hf]

theorem mant_a_val_eq_normalized_all (s : RtlState) (hzero : isZero s.a_reg = false) :
    (mant_a_val s).toNat = normalizedMantWithHiddenNat s.a_reg := by
  by_cases hsub : a_is_subnormal s = true
  · exact mant_a_val_eq_normalized_sub s hsub
  · have hsub' : a_is_subnormal s = false := by cases h : a_is_subnormal s <;> simp_all
    rw [mant_a_val_eq_normal s hsub' hzero]
    exact (normalizedMant_eq s.a_reg hsub').symm

theorem mant_b_val_eq_normalized_all (s : RtlState) (hzero : isZero s.b_reg = false) :
    (mant_b_val s).toNat = normalizedMantWithHiddenNat s.b_reg := by
  by_cases hsub : b_is_subnormal s = true
  · exact mant_b_val_eq_normalized_sub s hsub
  · have hsub' : b_is_subnormal s = false := by cases h : b_is_subnormal s <;> simp_all
    rw [mant_b_val_eq_normal s hsub' hzero]
    exact (normalizedMant_eq s.b_reg hsub').symm

theorem exp_a_adj_eq_normalized_sub (s : RtlState) (hsub : isSubnormal s.a_reg = true) :
    exp_a_adj s = normalizedEffectiveExp s.a_reg := by
  obtain ⟨he, hf⟩ := isSubnormal_components s.a_reg hsub
  have henat : exponentNat s.a_reg = 0 := by unfold exponentNat; rw [he]; rfl
  have hsub' : a_is_subnormal s = true := hsub
  have hs : norm_shift_a s = normalizationShift s.a_reg := by
    unfold norm_shift_a
    simp only [hsub', reduceIte, rtlFrac_eq_mantissaField,
      normalizeShift23_eq_normalizationShift s.a_reg hsub]
  unfold exp_a_adj normalizedEffectiveExp effectiveExp
  simp only [hsub', reduceIte, hs, henat]

theorem exp_b_adj_eq_normalized_sub (s : RtlState) (hsub : isSubnormal s.b_reg = true) :
    exp_b_adj s = normalizedEffectiveExp s.b_reg := by
  obtain ⟨he, hf⟩ := isSubnormal_components s.b_reg hsub
  have henat : exponentNat s.b_reg = 0 := by unfold exponentNat; rw [he]; rfl
  have hsub' : b_is_subnormal s = true := hsub
  have hs : norm_shift_b s = normalizationShift s.b_reg := by
    unfold norm_shift_b
    simp only [hsub', reduceIte, rtlFrac_eq_mantissaField,
      normalizeShift23_eq_normalizationShift s.b_reg hsub]
  unfold exp_b_adj normalizedEffectiveExp effectiveExp
  simp only [hsub', reduceIte, hs, henat]

theorem exp_a_adj_eq_normalized_all (s : RtlState) (hzero : isZero s.a_reg = false)
    (hinf : isInf s.a_reg = false) (hnan : (isSNaN s.a_reg || isQNaN s.a_reg) = false) :
    exp_a_adj s = normalizedEffectiveExp s.a_reg := by
  by_cases hsub : a_is_subnormal s = true
  · exact exp_a_adj_eq_normalized_sub s hsub
  · have hsub' : a_is_subnormal s = false := by cases h : a_is_subnormal s <;> simp_all
    exact exp_a_adj_eq_normalized s hsub' hzero hinf hnan

theorem exp_b_adj_eq_normalized_all (s : RtlState) (hzero : isZero s.b_reg = false)
    (hinf : isInf s.b_reg = false) (hnan : (isSNaN s.b_reg || isQNaN s.b_reg) = false) :
    exp_b_adj s = normalizedEffectiveExp s.b_reg := by
  by_cases hsub : b_is_subnormal s = true
  · exact exp_b_adj_eq_normalized_sub s hsub
  · have hsub' : b_is_subnormal s = false := by cases h : b_is_subnormal s <;> simp_all
    exact exp_b_adj_eq_normalized s hsub' hzero hinf hnan

theorem result_exp_raw_eq_baseResultExp_all (s : RtlState) (hza : isZero s.a_reg = false)
    (hia : isInf s.a_reg = false) (hna : (isSNaN s.a_reg || isQNaN s.a_reg) = false)
    (hzb : isZero s.b_reg = false) (hib : isInf s.b_reg = false)
    (hnb : (isSNaN s.b_reg || isQNaN s.b_reg) = false) :
    result_exp_raw s = baseResultExp s.a_reg s.b_reg := by
  unfold result_exp_raw baseResultExp
  rw [exp_a_adj_eq_normalized_all s hza hia hna, exp_b_adj_eq_normalized_all s hzb hib hnb]

theorem normalizedMantWithHiddenNat_bounds_sub (x : BitVec 32) (h : isSubnormal x = true) :
    2 ^ 23 ≤ normalizedMantWithHiddenNat x ∧ normalizedMantWithHiddenNat x < 2 ^ 24 := by
  obtain ⟨he, hf⟩ := isSubnormal_components x h
  unfold normalizedMantWithHiddenNat
  rw [mantWithHiddenNat_of_subnormal x h, normalizationShift_eq_of_subnormal x h]
  exact subnormal_shift_bounds (mantissaField x) hf

theorem normalizedMantWithHiddenNat_bounds_all (x : BitVec 32) (hzero : isZero x = false) :
    2 ^ 23 ≤ normalizedMantWithHiddenNat x ∧ normalizedMantWithHiddenNat x < 2 ^ 24 := by
  by_cases hsub : isSubnormal x = true
  · exact normalizedMantWithHiddenNat_bounds_sub x hsub
  · have hsub' : isSubnormal x = false := by cases h : isSubnormal x <;> simp_all
    rw [normalizedMant_eq x hsub']
    exact mantWithHiddenNat_bounds x (exponentField_ne_zero x hsub' hzero)


-- ===========================================================================
-- Epoch 4, lane r2 — G2: the p = 26 (left-shift) quotient extraction
-- When mantA < mantB the quotient q = mantA*2^27/mantB lies in [2^26, 2^27), so
-- spec `mantissaDiv` takes its `p < 27` branch: leftShift = 1, q_norm = 2q,
-- frac = 2q - 2^27.  `extractLsb25_3_eq` gives the model's `extractLsb 25 3`
-- (mant_shifted) in that branch, and the three bit lemmas identify the spec's
-- G/R/S bits of `frac` with the model's qbits bits 2/1/0.
-- The truncated subtraction 2*q - 2^27 is rewritten to 2*(q - 2^26) *before*
-- any div/mod step.
-- ===========================================================================

theorem two_dvd_two_pow (m : Nat) (hm : 1 ≤ m) : (2 : Nat) ∣ 2 ^ m :=
  ⟨2 ^ (m - 1), by rw [← Nat.pow_succ']; congr 1; omega⟩

theorem two_mul_div_pow_succ (X k : Nat) : 2 * X / 2 ^ (k + 1) = X / 2 ^ k := by
  have h := Nat.mul_div_mul_left X (2 ^ k) (m := 2) (by norm_num)
  rwa [← Nat.pow_succ'] at h

theorem two_mul_div_two (X : Nat) : 2 * X / 2 = X :=
  Nat.mul_div_right X (by norm_num)

theorem two_pow_mod_two (k : Nat) (hk : 1 ≤ k) : (2 : Nat) ^ k % 2 = 0 := by
  obtain ⟨j, rfl⟩ := Nat.exists_eq_succ_of_ne_zero (by omega : k ≠ 0)
  rw [pow_succ']
  simp [Nat.mul_mod_right]

theorem sub_pow_mod_two (q k : Nat) (hk : 1 ≤ k) (h : 2 ^ k ≤ q) :
    (q - 2 ^ k) % 2 = q % 2 := by
  conv_rhs => rw [show q = 2 ^ k + (q - 2 ^ k) from by omega]
  rw [Nat.add_mod, two_pow_mod_two k hk, Nat.zero_add, Nat.mod_mod_of_dvd _ (dvd_refl 2)]

theorem shift_frac_eq (x : Nat) : 2 * x - 2 ^ 27 = 2 * (x - 2 ^ 26) := by
  rw [show (2 : Nat) ^ 27 = 2 * 2 ^ 26 from by norm_num, ← Nat.mul_sub_left_distrib]

theorem sub_pow_div_gen (f m k : Nat) (hf : f < 2 ^ m) (hk : k ≤ m) :
    (2 ^ m + f) / 2 ^ k % 2 ^ (m - k) = f / 2 ^ k := by
  have hdvd : 2 ^ k ∣ 2 ^ m := Nat.pow_dvd_pow 2 hk
  have hpk : 0 < 2 ^ k := Nat.pow_pos (by norm_num)
  have hlt : f / 2 ^ k < 2 ^ (m - k) := by
    rw [Nat.div_lt_iff_lt_mul hpk, ← Nat.pow_add]
    have hsum : m - k + k = m := by omega
    rw [hsum]; exact hf
  rw [Nat.add_comm (2 ^ m) f, Nat.add_div_of_dvd_left hdvd, Nat.pow_div hk (by norm_num),
    Nat.add_comm (f / 2 ^ k) (2 ^ (m - k)), Nat.add_mod_left, Nat.mod_eq_of_lt hlt]

theorem sub_two_pow_div_gen (q m k : Nat) (h1 : 2 ^ m ≤ q) (h2 : q < 2 ^ (m + 1)) (hk : k ≤ m) :
    (q - 2 ^ m) / 2 ^ k = q / 2 ^ k % 2 ^ (m - k) := by
  have hq : q = 2 ^ m + (q - 2 ^ m) := by omega
  have hf : q - 2 ^ m < 2 ^ m := by omega
  conv_rhs => rw [hq]
  exact (sub_pow_div_gen (q - 2 ^ m) m k hf hk).symm

theorem extractLsb25_3_eq (q : BitVec 28) (h1 : 2 ^ 26 ≤ q.toNat) (h2 : q.toNat < 2 ^ 27) :
    (BitVec.extractLsb 25 3 q).toNat = (2 * q.toNat - 2 ^ 27) / 16 := by
  rw [extractLsb_toNat_div]
  have h4 : (q.toNat - 2 ^ 26) / 2 ^ 3 = q.toNat / 2 ^ 3 % 2 ^ (26 - 3) :=
    sub_two_pow_div_gen q.toNat 26 3 h1 (by omega) (by omega)
  have e1 : 25 - 3 + 1 = 26 - 3 := by omega
  rw [e1, ← h4]
  rw [shift_frac_eq q.toNat, ← two_mul_div_pow_succ (q.toNat - 2 ^ 26) 3]
  norm_num

theorem shift_guard_eq (q : BitVec 28) (h1 : 2 ^ 26 ≤ q.toNat) (h2 : q.toNat < 2 ^ 27) :
    ((2 * q.toNat - 2 ^ 27) / 8 % 2 == 1) = q.getLsbD 2 := by
  have hq : (2 * q.toNat - 2 ^ 27) / 8 % 2 = q.toNat / 2 ^ 2 % 2 := by
    rw [shift_frac_eq q.toNat, show (8 : Nat) = 2 ^ 3 from by norm_num,
      two_mul_div_pow_succ (q.toNat - 2 ^ 26) 2]
    rw [sub_two_pow_div_gen q.toNat 26 2 h1 (by omega) (by omega),
      Nat.mod_mod_of_dvd (q.toNat / 2 ^ 2) (two_dvd_two_pow (26 - 2) (by omega))]
  rw [hq, Bool.eq_iff_iff, beq_iff_eq, getLsbD_iff_div_mod q 2]

theorem shift_round_eq (q : BitVec 28) (h1 : 2 ^ 26 ≤ q.toNat) (h2 : q.toNat < 2 ^ 27) :
    ((2 * q.toNat - 2 ^ 27) / 4 % 2 == 1) = q.getLsbD 1 := by
  have hq : (2 * q.toNat - 2 ^ 27) / 4 % 2 = q.toNat / 2 ^ 1 % 2 := by
    rw [shift_frac_eq q.toNat, show (4 : Nat) = 2 ^ 2 from by norm_num,
      two_mul_div_pow_succ (q.toNat - 2 ^ 26) 1]
    rw [sub_two_pow_div_gen q.toNat 26 1 h1 (by omega) (by omega),
      Nat.mod_mod_of_dvd (q.toNat / 2 ^ 1) (two_dvd_two_pow (26 - 1) (by omega))]
  rw [hq, Bool.eq_iff_iff, beq_iff_eq, getLsbD_iff_div_mod q 1]

theorem shift_sticky_eq (q : BitVec 28) (h1 : 2 ^ 26 ≤ q.toNat) (h2 : q.toNat < 2 ^ 27) :
    (((2 * q.toNat - 2 ^ 27) / 2 % 2 == 1) || ((2 * q.toNat - 2 ^ 27) % 2 == 1))
      = q.getLsbD 0 := by
  have hq : (2 * q.toNat - 2 ^ 27) / 2 % 2 = q.toNat % 2 := by
    rw [shift_frac_eq q.toNat, two_mul_div_two]
    exact sub_pow_mod_two q.toNat 26 (by omega) h1
  have hmod : (2 * q.toNat - 2 ^ 27) % 2 = 0 := by
    rw [shift_frac_eq q.toNat, Nat.mul_mod_right]
  have hgz : ((2 * q.toNat - 2 ^ 27) / 2 % 2 == 1) = q.getLsbD 0 := by
    rw [hq, Bool.eq_iff_iff, beq_iff_eq, getLsbD_iff_div_mod q 0]
    simp
  have hfz : ((2 * q.toNat - 2 ^ 27) % 2 == 1) = false := by
    rw [hmod]; rfl
  rw [hgz, hfz]
  simp

theorem grs_shift_bits (q : BitVec 28) (h1 : 2 ^ 26 ≤ q.toNat) (h2 : q.toNat < 2 ^ 27) :
    ((2 * q.toNat - 2 ^ 27) / 8 % 2 == 1) = q.getLsbD 2 ∧
    ((2 * q.toNat - 2 ^ 27) / 4 % 2 == 1) = q.getLsbD 1 ∧
    ((((2 * q.toNat - 2 ^ 27) / 2 % 2 == 1) || ((2 * q.toNat - 2 ^ 27) % 2 == 1))
      = q.getLsbD 0) :=
  ⟨shift_guard_eq q h1 h2, shift_round_eq q h1 h2, shift_sticky_eq q h1 h2⟩

theorem runDivider_spec_mantissa_all (s : RtlState) (hza : isZero s.a_reg = false)
    (hzb : isZero s.b_reg = false) :
    (runDivider (mant_a_val s) (mant_b_val s)).1.toNat
        = normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 / normalizedMantWithHiddenNat s.b_reg ∧
      (runDivider (mant_a_val s) (mant_b_val s)).2.toNat
        = normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 % normalizedMantWithHiddenNat s.b_reg := by
  have hA := mant_a_val_eq_normalized_all s hza
  have hB := mant_b_val_eq_normalized_all s hzb
  have hbA := normalizedMantWithHiddenNat_bounds_all s.a_reg hza
  have hbB := normalizedMantWithHiddenNat_bounds_all s.b_reg hzb
  have hsp := runDivider_spec (mant_a_val s) (mant_b_val s)
    (by rw [hA]; exact hbA.1) (by rw [hA]; exact hbA.2)
    (by rw [hB]; exact hbB.1) (by rw [hB]; exact hbB.2)
  rw [hA, hB] at hsp
  exact hsp

theorem runDivider_sticky_mantissa_all (s : RtlState) (hza : isZero s.a_reg = false)
    (hzb : isZero s.b_reg = false) :
    finalRemWithSticky (runDivider (mant_a_val s) (mant_b_val s)).2 (0#3 ++ mant_b_val s)
      = decide (normalizedMantWithHiddenNat s.a_reg * 2 ^ 27
          % normalizedMantWithHiddenNat s.b_reg ≠ 0) := by
  have hA := mant_a_val_eq_normalized_all s hza
  have hB := mant_b_val_eq_normalized_all s hzb
  have hbA := normalizedMantWithHiddenNat_bounds_all s.a_reg hza
  have hbB := normalizedMantWithHiddenNat_bounds_all s.b_reg hzb
  have hst := runDivider_sticky (mant_a_val s) (mant_b_val s)
    (by rw [hA]; exact hbA.1) (by rw [hA]; exact hbA.2)
    (by rw [hB]; exact hbB.1) (by rw [hB]; exact hbB.2)
  rw [hA, hB] at hst
  exact hst


theorem extractNorm_align_lt (qbits : BitVec 28) (stickyRem : Bool) (mv_a mv_b : BitVec 26)
    (hlt : mv_a.toNat < mv_b.toNat) :
    (extractNorm qbits stickyRem mv_a mv_b).mant = BitVec.extractLsb 25 3 qbits ∧
    (extractNorm qbits stickyRem mv_a mv_b).G = qbits.getLsbD 2 ∧
    (extractNorm qbits stickyRem mv_a mv_b).R = qbits.getLsbD 1 ∧
    (extractNorm qbits stickyRem mv_a mv_b).S = (qbits.getLsbD 0 || stickyRem) ∧
    (extractNorm qbits stickyRem mv_a mv_b).adj_for_shift = 1#9 ∧
    (extractNorm qbits stickyRem mv_a mv_b).shift_needed = true := by
  have hge : decide (mv_b ≤ mv_a) = false :=
    decide_eq_false_iff_not.mpr (by simp only [BitVec.le_def]; omega)
  unfold extractNorm
  dsimp only
  rw [hge]
  simp

theorem extractNorm_align_lt_mant (qbits : BitVec 28) (stickyRem : Bool) (mv_a mv_b : BitVec 26)
    (hlt : mv_a.toNat < mv_b.toNat) (hq1 : 2 ^ 26 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 27) :
    (extractNorm qbits stickyRem mv_a mv_b).mant.toNat = (2 * qbits.toNat - 2 ^ 27) / 16 := by
  rw [(extractNorm_align_lt qbits stickyRem mv_a mv_b hlt).1]
  exact extractLsb25_3_eq qbits hq1 hq2


theorem mantissaDiv_lt_tuple (A B : Nat) (hA : 2 ^ 23 ≤ A) (hA' : A < 2 ^ 24) (hB : 2 ^ 23 ≤ B)
    (hB' : B < 2 ^ 24) (hAB : A < B) :
    mantissaDiv A B =
      ((2 * (A * 2 ^ 27 / B) - 2 ^ 27) / 16,
       ((2 * (A * 2 ^ 27 / B) - 2 ^ 27) / 8 % 2 == 1),
       ((2 * (A * 2 ^ 27 / B) - 2 ^ 27) / 4 % 2 == 1),
       ((((2 * (A * 2 ^ 27 / B) - 2 ^ 27) / 2 % 2 == 1) ||
         ((2 * (A * 2 ^ 27 / B) - 2 ^ 27) % 2 == 1)) || (A * 2 ^ 27 % B != 0)),
       1) := by
  have hlog : Nat.log2 (A * 2 ^ 27 / B) = 26 := by
    rw [log2_quot_eq A B hA hA' hB hB', if_neg (by omega : ¬ B ≤ A)]
  have hq0 : A * 2 ^ 27 / B ≠ 0 := by
    have hb := (quot_bounds A B hA hA' hB hB').1
    omega
  unfold mantissaDiv
  dsimp only
  rw [if_neg hq0]
  rw [if_neg (by rw [hlog]; omega : ¬ Nat.log2 (A * 2 ^ 27 / B) ≥ 27)]
  rw [hlog, show (27 - 26 : Nat) = 1 from by norm_num, pow_one,
    Nat.mul_comm (A * 2 ^ 27 / B) 2]
  rfl


theorem normalDivision_lt_eq (s : RtlState) (hza : isZero s.a_reg = false)
    (hzb : isZero s.b_reg = false) (hlt : (mant_a_val s).toNat < (mant_b_val s).toNat) :
    normalDivision s.a_reg s.b_reg =
      ((2 * (normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 / normalizedMantWithHiddenNat s.b_reg) - 2 ^ 27) / 16,
       ((2 * (normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 / normalizedMantWithHiddenNat s.b_reg) - 2 ^ 27) / 8 % 2 == 1),
       ((2 * (normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 / normalizedMantWithHiddenNat s.b_reg) - 2 ^ 27) / 4 % 2 == 1),
       ((((2 * (normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 / normalizedMantWithHiddenNat s.b_reg) - 2 ^ 27) / 2 % 2 == 1) || ((2 * (normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 / normalizedMantWithHiddenNat s.b_reg) - 2 ^ 27) % 2 == 1)) || ((normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 % normalizedMantWithHiddenNat s.b_reg) != 0)),
       1) := by
  have hA := mant_a_val_eq_normalized_all s hza
  have hB := mant_b_val_eq_normalized_all s hzb
  have hbA := normalizedMantWithHiddenNat_bounds_all s.a_reg hza
  have hbB := normalizedMantWithHiddenNat_bounds_all s.b_reg hzb
  have hAB : normalizedMantWithHiddenNat s.a_reg < normalizedMantWithHiddenNat s.b_reg := by
    rw [← hA, ← hB]; exact hlt
  unfold normalDivision
  rw [mantissaDiv_lt_tuple (normalizedMantWithHiddenNat s.a_reg)
    (normalizedMantWithHiddenNat s.b_reg) hbA.1 hbA.2 hbB.1 hbB.2 hAB]


theorem quot_align_lt (s : RtlState) (hza : isZero s.a_reg = false)
    (hzb : isZero s.b_reg = false) (hlt : (mant_a_val s).toNat < (mant_b_val s).toNat) :
    (runDivider (mant_a_val s) (mant_b_val s)).1.toNat = normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 / normalizedMantWithHiddenNat s.b_reg ∧
    2 ^ 26 ≤ (runDivider (mant_a_val s) (mant_b_val s)).1.toNat ∧
    (runDivider (mant_a_val s) (mant_b_val s)).1.toNat < 2 ^ 27 ∧
    finalRemWithSticky (runDivider (mant_a_val s) (mant_b_val s)).2 (0#3 ++ mant_b_val s)
      = decide (normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 % normalizedMantWithHiddenNat s.b_reg ≠ 0) := by
  have hA := mant_a_val_eq_normalized_all s hza
  have hB := mant_b_val_eq_normalized_all s hzb
  have hbA := normalizedMantWithHiddenNat_bounds_all s.a_reg hza
  have hbB := normalizedMantWithHiddenNat_bounds_all s.b_reg hzb
  have hAB : normalizedMantWithHiddenNat s.a_reg < normalizedMantWithHiddenNat s.b_reg := by
    rw [← hA, ← hB]; exact hlt
  have hdiv := runDivider_spec_mantissa_all s hza hzb
  have hstk := runDivider_sticky_mantissa_all s hza hzb
  refine ⟨hdiv.1, ?_, ?_, hstk⟩
  · rw [hdiv.1]
    exact (quot_bounds (normalizedMantWithHiddenNat s.a_reg)
      (normalizedMantWithHiddenNat s.b_reg) hbA.1 hbA.2 hbB.1 hbB.2).1
  · rw [hdiv.1]
    by_contra hc
    have hle : 2 ^ 27 ≤ normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 / normalizedMantWithHiddenNat s.b_reg := by omega
    have hBA := (quot_ge_two_pow_iff (normalizedMantWithHiddenNat s.a_reg)
      (normalizedMantWithHiddenNat s.b_reg) hbA.1 hbA.2 hbB.1 hbB.2).mp hle
    omega

theorem vec25_implied_toNat (mant23 : BitVec 23) :
    ((0#1 ++ 1#1 ++ mant23 : BitVec 25)).toNat = 2 ^ 23 + mant23.toNat := by
  have hnum : (0 % 2 ^ 1 * 2 ^ 1 ||| 1 % 2 ^ 1) = 1 := by decide
  rw [BitVec.toNat_append, BitVec.toNat_append, BitVec.toNat_ofNat, BitVec.toNat_ofNat,
    Nat.shiftLeft_eq, Nat.shiftLeft_eq, hnum, one_mul, or_pow23_add mant23.toNat mant23.isLt]

theorem vec25_inc_toNat (d : Bool) :
    ((0#24 ++ (if d then 1#1 else 0#1) : BitVec 25)).toNat = (if d then 1 else 0) := by
  rw [BitVec.toNat_append, BitVec.toNat_ofNat]
  by_cases h : d <;> simp [h]

theorem bool_ite_one_le (c : Bool) : (if c then (1 : Nat) else 0) ≤ 1 := by split_ifs <;> omega

theorem vec25_sum_toNat (mant23 : BitVec 23) (d : Bool) :
    ((0#1 ++ 1#1 ++ mant23 : BitVec 25) + (0#24 ++ (if d then 1#1 else 0#1) : BitVec 25)).toNat
      = 2 ^ 23 + mant23.toNat + (if d then 1 else 0) := by
  rw [BitVec.toNat_add, vec25_implied_toNat, vec25_inc_toNat]
  have hm := mant23.isLt
  have hb := bool_ite_one_le d
  rw [Nat.mod_eq_of_lt (by omega)]

theorem getLsbD_top24_eq_decide (v : BitVec 25) (hv : v.toNat < 2 ^ 25) :
    v.getLsbD 24 = decide (2 ^ 24 ≤ v.toNat) := by
  rw [← BitVec.testBit_toNat, Nat.testBit_eq_decide_div_mod_eq]
  congr 1
  apply propext
  constructor
  · intro h1
    by_contra h2
    have hz : v.toNat / 2 ^ 24 = 0 := Nat.div_eq_of_lt (by omega)
    omega
  · intro h2
    have h1 : v.toNat / 2 ^ 24 = 1 :=
      Nat.div_eq_of_lt_le (k := 1) (n := 2 ^ 24) (m := v.toNat) (by omega) (by omega)
    rw [h1]

theorem rneRound_carry_eq (mant23 : BitVec 23) (G R S : Bool) :
    (rneRound mant23 G R S).carry
      = decide (2 ^ 23 ≤ mant23.toNat
          + (if G && (R || S || mant23.getLsbD 0) then 1 else 0)) := by
  show ((0#1 ++ 1#1 ++ mant23 : BitVec 25)
      + (0#24 ++ (if G && (R || S || mant23.getLsbD 0) then 1#1 else 0#1) : BitVec 25)).getLsbD 24
    = decide (2 ^ 23 ≤ mant23.toNat
        + (if G && (R || S || mant23.getLsbD 0) then 1 else 0))
  rw [getLsbD_top24_eq_decide]
  · rw [vec25_sum_toNat]
    congr 1
    apply propext
    have hm := mant23.isLt
    have hb := bool_ite_one_le (G && (R || S || mant23.getLsbD 0))
    constructor <;> intro h <;> omega
  · rw [vec25_sum_toNat]
    have hm := mant23.isLt
    have hb := bool_ite_one_le (G && (R || S || mant23.getLsbD 0))
    omega

theorem round25_carry_eq {v : BitVec 25} (m k : Nat) (hv : v.toNat = 2 ^ 23 + m + k)
    (hm : m < 2 ^ 23) (hk : k ≤ 1) : v.getLsbD 24 = decide (2 ^ 23 ≤ m + k) := by
  have hv25 : v.toNat < 2 ^ 25 := by omega
  rw [getLsbD_top24_eq_decide v hv25, hv]
  congr 1
  apply propext
  constructor <;> intro h <;> omega

theorem round25_mant_eq {v : BitVec 25} (m k : Nat) (hv : v.toNat = 2 ^ 23 + m + k)
    (hm : m < 2 ^ 23) (hk : k ≤ 1) :
    ((if v.getLsbD 24 then BitVec.extractLsb 23 1 v
      else BitVec.extractLsb 22 0 v) : BitVec 23).toNat = (m + k) % 2 ^ 23 := by
  have hlo : (BitVec.extractLsb 22 0 v).toNat = v.toNat % 2 ^ 23 := by
    rw [extractLsb_toNat_div]; norm_num
  have hhi : (BitVec.extractLsb 23 1 v).toNat = v.toNat / 2 % 2 ^ 23 := by
    rw [extractLsb_toNat_div]; norm_num
  rw [apply_ite BitVec.toNat]
  have hcarry := round25_carry_eq m k hv hm hk
  by_cases hc : v.getLsbD 24 = true
  · rw [if_pos hc, hhi, hv]
    have h : 2 ^ 23 ≤ m + k := by
      rw [hcarry] at hc
      simpa using hc
    have heq : 2 ^ 23 + m + k = 2 ^ 24 := by omega
    have heq2 : m + k = 2 ^ 23 := by omega
    rw [heq, heq2]
    norm_num
  · rw [if_neg hc, hlo, hv]
    have hnot : ¬(2 ^ 23 ≤ m + k) := by
      rw [hcarry] at hc
      simpa using hc
    have hlt : m + k < 2 ^ 23 := by omega
    have hmod : (2 ^ 23 + m + k) % 2 ^ 23 = m + k := by
      rw [Nat.add_assoc, Nat.add_mod_left, Nat.mod_eq_of_lt]; omega
    rw [hmod, Nat.mod_eq_of_lt hlt]

theorem rneRound_value (mant23 : BitVec 23) (G R S : Bool) :
    (rneRound mant23 G R S).mant.toNat
      + (if (rneRound mant23 G R S).carry then 2 ^ 23 else 0)
      = mant23.toNat + (if G && (R || S || mant23.getLsbD 0) then 1 else 0) := by
  rw [rneRound_carry_eq mant23 G R S]
  unfold rneRound
  dsimp only
  set k : Nat := (if G && (R || S || mant23.getLsbD 0) then 1 else 0) with hkdef
  have hm := mant23.isLt
  have hk : k ≤ 1 := by rw [hkdef]; exact bool_ite_one_le _
  have hv : ((0#1 ++ 1#1 ++ mant23 : BitVec 25)
      + (0#24 ++ (if G && (R || S || mant23.getLsbD 0) then 1#1 else 0#1) : BitVec 25)).toNat
      = 2 ^ 23 + mant23.toNat + k := by
    rw [hkdef]
    exact vec25_sum_toNat mant23 (G && (R || S || mant23.getLsbD 0))
  rw [round25_mant_eq mant23.toNat k hv hm hk]
  split_ifs with hc
  · have heq2 : mant23.toNat + k = 2 ^ 23 := by
      have h : 2 ^ 23 ≤ mant23.toNat + k := by simpa using hc
      omega
    simp [heq2] <;> norm_num
  · have hnot : ¬(2 ^ 23 ≤ mant23.toNat + k) := by simpa using hc
    have hlt : mant23.toNat + k < 2 ^ 23 := by omega
    rw [Nat.mod_eq_of_lt hlt, Nat.add_zero]

theorem getLsbD_zero_eq_decide (m : BitVec 23) :
    m.getLsbD 0 = decide (m.toNat % 2 = 1) := by
  rw [← BitVec.testBit_toNat, Nat.testBit_eq_decide_div_mod_eq, Nat.div_one]

theorem add_pow_ite_cancel (x y : Nat) (b : Bool)
    (h : x + (if b then 2 ^ 23 else 0) = y + (if b then 2 ^ 23 else 0)) : x = y := by
  by_cases hb : b <;> simp [hb] at h ⊢ <;> omega

theorem ite_nested_and (G R S : Bool) (p : Prop) [Decidable p] :
    (if G then (if R || S then true else decide p) else false)
      = (G && (R || S || decide p)) := by
  by_cases hG : G <;> by_cases hRS : R || S <;> by_cases hp : p <;> simp_all

theorem roundRNE_carry_eq (m : Nat) (G R S : Bool) (hm : m < 2 ^ 23) :
    (roundRNE m G R S).2
      = decide (2 ^ 23 ≤ m + (if G && (R || S || decide (m % 2 = 1)) then 1 else 0)) := by
  unfold roundRNE
  dsimp only
  rw [ite_nested_and G R S (m % 2 = 1)]
  by_cases hD : (G && (R || S || decide (m % 2 = 1))) = true
  · simp only [if_pos hD]
    by_cases hge : m + 1 ≥ 2 ^ 23
    · simp only [if_pos hge, decide_eq_true_iff.mpr (by omega : 2 ^ 23 ≤ m + 1)] <;> rfl
    · simp only [if_neg hge, decide_eq_false_iff_not.mpr (by omega : ¬(2 ^ 23 ≤ m + 1))] <;> rfl
  · simp only [if_neg hD, decide_eq_false_iff_not.mpr (by omega : ¬(2 ^ 23 ≤ m + 0))] <;> rfl

theorem roundRNE_value (m : Nat) (G R S : Bool) (hm : m < 2 ^ 23) :
    (roundRNE m G R S).1 + (if (roundRNE m G R S).2 then 2 ^ 23 else 0)
      = m + (if G && (R || S || decide (m % 2 = 1)) then 1 else 0) := by
  unfold roundRNE
  dsimp only
  rw [ite_nested_and G R S (m % 2 = 1)]
  by_cases hD : (G && (R || S || decide (m % 2 = 1))) = true
  · simp only [if_pos hD]
    by_cases hge : m + 1 ≥ 2 ^ 23
    · simp only [if_pos hge]
      simp <;> omega
    · simp only [if_neg hge]
      simp <;> omega
  · simp only [if_neg hD]
    simp

theorem rneRound_eq_roundRNE (mant23 : BitVec 23) (G R S : Bool) :
    (rneRound mant23 G R S).mant.toNat = (roundRNE mant23.toNat G R S).1 ∧
    (rneRound mant23 G R S).carry = (roundRNE mant23.toNat G R S).2 := by
  have hm := mant23.isLt
  have hL := getLsbD_zero_eq_decide mant23
  have hA := rneRound_value mant23 G R S
  have hB := roundRNE_value mant23.toNat G R S hm
  have hC := rneRound_carry_eq mant23 G R S
  have hD := roundRNE_carry_eq mant23.toNat G R S hm
  rw [hL] at hA hC
  have hc : (rneRound mant23 G R S).carry = (roundRNE mant23.toNat G R S).2 := by rw [hC, hD]
  refine ⟨?_, hc⟩
  rw [hc] at hA
  exact add_pow_ite_cancel _ _ _ (hA.trans hB.symm)

-- ===========================================================================
-- Epoch 6, lane r2 — the p = 26 (LEFT-shift, mantA < mantB) CONSUMERS plus the
-- branch-independent exponent / flag / pack layer.
-- `normalDivision_lt_components` turns the committed lt alignment machinery into the
-- five spec-component equalities; `normalRound_lt` / `normalFinalExp_eq_lt` /
-- `normalPack_mant_eq` / `normalInexact_eq` consume it, and
-- `normalFdiv_mkState_eq_lt` consumes all four to prove the residual equality on the
-- lt branch.  Every spec-side component is stated at the `normalDivision`/`normalRounded`
-- boundary (`mantissaDiv` inside proofs) so that no `.toNat` fact is ever rewritten
-- inside a Bool `==`/`decide` context.
-- NOTE: `||` binds looser than `=`, so every Bool equality below is fully parenthesised.
-- ===========================================================================


theorem nat_mod_one_beq_zero (n : Nat) : (n % 1 != 0) = false := by
  rw [Nat.mod_one]
  rfl

theorem noshift_getLsbD_frac_bool (q : BitVec 28) (k : Nat) (hq1 : 2 ^ 27 ≤ q.toNat)
    (hq2 : q.toNat < 2 ^ 28) (hk : k < 27) :
    q.getLsbD k = decide ((q.toNat - 2 ^ 27) / 2 ^ k % 2 = 1) := by
  by_cases h : (q.toNat - 2 ^ 27) / 2 ^ k % 2 = 1
  · rw [decide_eq_true h]
    exact (getLsbD_iff_frac q k hq1 hq2 hk).mpr h
  · rw [decide_eq_false_iff_not.mpr h]
    cases hg : q.getLsbD k with
    | false => rfl
    | true => exact absurd ((getLsbD_iff_frac q k hq1 hq2 hk).mp hg) h

theorem noshift_getLsbD_frac_beq (q : BitVec 28) (k : Nat) (hq1 : 2 ^ 27 ≤ q.toNat)
    (hq2 : q.toNat < 2 ^ 28) (hk : k < 27) :
    q.getLsbD k = (((q.toNat - 2 ^ 27) / 2 ^ k) % 2 == 1) := by
  rw [noshift_getLsbD_frac_bool q k hq1 hq2 hk]
  rfl

theorem noshift_getLsbD_frac_beq1 (q : BitVec 28) (hq1 : 2 ^ 27 ≤ q.toNat)
    (hq2 : q.toNat < 2 ^ 28) :
    q.getLsbD 1 = (((q.toNat - 2 ^ 27) / 2) % 2 == 1) := by
  have h := noshift_getLsbD_frac_beq q 1 hq1 hq2 (by norm_num)
  rw [show (2 : Nat) ^ 1 = 2 from by norm_num] at h
  exact h

theorem noshift_getLsbD_frac_beq0 (q : BitVec 28) (hq1 : 2 ^ 27 ≤ q.toNat)
    (hq2 : q.toNat < 2 ^ 28) :
    q.getLsbD 0 = (((q.toNat - 2 ^ 27)) % 2 == 1) := by
  have h := noshift_getLsbD_frac_beq q 0 hq1 hq2 (by norm_num)
  rw [Nat.pow_zero, Nat.div_one] at h
  exact h

theorem noshift_getLsbD_frac_beq3 (q : BitVec 28) (hq1 : 2 ^ 27 ≤ q.toNat)
    (hq2 : q.toNat < 2 ^ 28) :
    q.getLsbD 3 = (((q.toNat - 2 ^ 27) / 8) % 2 == 1) := by
  have h := noshift_getLsbD_frac_beq q 3 hq1 hq2 (by norm_num)
  rw [show (2 : Nat) ^ 3 = 8 from by norm_num] at h
  exact h

theorem noshift_getLsbD_frac_beq2 (q : BitVec 28) (hq1 : 2 ^ 27 ≤ q.toNat)
    (hq2 : q.toNat < 2 ^ 28) :
    q.getLsbD 2 = (((q.toNat - 2 ^ 27) / 4) % 2 == 1) := by
  have h := noshift_getLsbD_frac_beq q 2 hq1 hq2 (by norm_num)
  rw [show (2 : Nat) ^ 2 = 4 from by norm_num] at h
  exact h

theorem noshift_nat_mod4_ne_zero_eq (n : Nat) :
    (n % 4 != 0) = ((n / 2 % 2 == 1) || (n % 2 == 1)) := by
  by_cases h1 : n / 2 % 2 = 1 <;> by_cases h2 : n % 2 = 1 <;> simp_all <;> omega

theorem bv2_ne_zero_toNat (x : BitVec 2) : (x != 0#2) = (x.toNat != 0) := by
  rw [show (x != 0#2) = !decide (x = 0#2) from rfl,
    show (x.toNat != 0) = !decide (x.toNat = 0) from rfl]
  congr 1
  by_cases h : x = 0#2
  · have h0 : x.toNat = 0 := by rw [h]; rfl
    rw [decide_eq_true h, decide_eq_true h0]
  · have h0 : x.toNat ≠ 0 := fun hc => h (BitVec.toNat_inj.mp (by rw [hc]; rfl))
    rw [decide_eq_false_iff_not.mpr h, decide_eq_false_iff_not.mpr h0]

theorem extractLsb1_0_ne_zero_eq (q : BitVec 28) (hq1 : 2 ^ 27 ≤ q.toNat)
    (hq2 : q.toNat < 2 ^ 28) :
    ((BitVec.extractLsb 1 0 q) != 0#2) = (q.getLsbD 1 || q.getLsbD 0) := by
  rw [bv2_ne_zero_toNat (BitVec.extractLsb 1 0 q), extractLsb1_0_eq q hq1 hq2]
  rw [noshift_getLsbD_frac_beq1 q hq1 hq2, noshift_getLsbD_frac_beq0 q hq1 hq2]
  exact noshift_nat_mod4_ne_zero_eq (q.toNat - 2 ^ 27)

theorem extractNorm_ge (qbits : BitVec 28) (stickyRem : Bool) (mv_a mv_b : BitVec 26)
    (hge : mv_b.toNat ≤ mv_a.toNat) :
    (extractNorm qbits stickyRem mv_a mv_b).mant = BitVec.extractLsb 26 4 qbits ∧
    (extractNorm qbits stickyRem mv_a mv_b).G = qbits.getLsbD 3 ∧
    (extractNorm qbits stickyRem mv_a mv_b).R = qbits.getLsbD 2 ∧
    (extractNorm qbits stickyRem mv_a mv_b).S
      = (((BitVec.extractLsb 1 0 qbits) != 0#2) || stickyRem) ∧
    (extractNorm qbits stickyRem mv_a mv_b).adj_for_shift = 0#9 ∧
    (extractNorm qbits stickyRem mv_a mv_b).shift_needed = false := by
  have hge' : decide (mv_b ≤ mv_a) = true := decide_eq_true hge
  unfold extractNorm
  dsimp only
  rw [hge']
  simp

theorem mantissaDiv_ge_tuple (A B : Nat) (hA : 2 ^ 23 ≤ A) (hA' : A < 2 ^ 24) (hB : 2 ^ 23 ≤ B)
    (hB' : B < 2 ^ 24) (hBA : B ≤ A) :
    mantissaDiv A B =
      ((A * 2 ^ 27 / B - 2 ^ 27) / 16,
       ((A * 2 ^ 27 / B - 2 ^ 27) / 8 % 2 == 1),
       ((A * 2 ^ 27 / B - 2 ^ 27) / 4 % 2 == 1),
       ((((A * 2 ^ 27 / B - 2 ^ 27) / 2 % 2 == 1) ||
         ((A * 2 ^ 27 / B - 2 ^ 27) % 2 == 1)) || (A * 2 ^ 27 % B != 0)),
       0) := by
  have hlog : Nat.log2 (A * 2 ^ 27 / B) = 27 := by
    rw [log2_quot_eq A B hA hA' hB hB', if_pos hBA]
  have hq0 : A * 2 ^ 27 / B ≠ 0 := by
    have hb := (quot_bounds A B hA hA' hB hB').1
    omega
  unfold mantissaDiv
  dsimp only
  rw [if_neg hq0]
  rw [if_pos (by rw [hlog] : Nat.log2 (A * 2 ^ 27 / B) ≥ 27)]
  rw [hlog]
  simp only [Nat.sub_self, Nat.pow_zero, Nat.div_one, Nat.mod_one]
  rw [nat_mod_one_beq_zero 0, Bool.or_false]
  norm_num
theorem normalSign_eq_mkState (a b : BitVec 32) : calc_sign (mkState a b) = resultSign a b := by
  simp only [calc_sign, resultSign, mkState_a_reg, mkState_b_reg, rtlSign_eq_signBit]

theorem nat_bne_zero_eq_decide (n : Nat) : (n != 0) = decide (n ≠ 0) := by
  by_cases h : n = 0 <;> simp [h]

theorem normalExpAdjust_lt (A B : Nat)
    (hA : 2 ^ 23 ≤ A) (hA' : A < 2 ^ 24) (hB : 2 ^ 23 ≤ B) (hB' : B < 2 ^ 24) (hAB : A < B) :
    (mantissaDiv A B).2.2.2.2 = 1 := by
  rw [mantissaDiv_lt_tuple A B hA hA' hB hB' hAB]

theorem quot_align_ge (s : RtlState) (hza : isZero s.a_reg = false)
    (hzb : isZero s.b_reg = false) (hge : (mant_b_val s).toNat ≤ (mant_a_val s).toNat) :
    (runDivider (mant_a_val s) (mant_b_val s)).1.toNat = normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 / normalizedMantWithHiddenNat s.b_reg ∧
    2 ^ 27 ≤ (runDivider (mant_a_val s) (mant_b_val s)).1.toNat ∧
    (runDivider (mant_a_val s) (mant_b_val s)).1.toNat < 2 ^ 28 ∧
    finalRemWithSticky (runDivider (mant_a_val s) (mant_b_val s)).2 (0#3 ++ mant_b_val s)
      = decide (normalizedMantWithHiddenNat s.a_reg * 2 ^ 27 % normalizedMantWithHiddenNat s.b_reg ≠ 0) := by
  have hA := mant_a_val_eq_normalized_all s hza
  have hB := mant_b_val_eq_normalized_all s hzb
  have hbA := normalizedMantWithHiddenNat_bounds_all s.a_reg hza
  have hbB := normalizedMantWithHiddenNat_bounds_all s.b_reg hzb
  have hBA : normalizedMantWithHiddenNat s.b_reg ≤ normalizedMantWithHiddenNat s.a_reg := by
    rw [← hA, ← hB]; exact hge
  have hdiv := runDivider_spec_mantissa_all s hza hzb
  have hstk := runDivider_sticky_mantissa_all s hza hzb
  refine ⟨hdiv.1, ?_, ?_, hstk⟩
  · rw [hdiv.1]
    exact (quot_ge_two_pow_iff (normalizedMantWithHiddenNat s.a_reg)
      (normalizedMantWithHiddenNat s.b_reg) hbA.1 hbA.2 hbB.1 hbB.2).mpr hBA
  · rw [hdiv.1]
    exact (quot_bounds (normalizedMantWithHiddenNat s.a_reg)
      (normalizedMantWithHiddenNat s.b_reg) hbA.1 hbA.2 hbB.1 hbB.2).2

theorem normalExpAdjust_ge (A B : Nat)
    (hA : 2 ^ 23 ≤ A) (hA' : A < 2 ^ 24) (hB : 2 ^ 23 ≤ B) (hB' : B < 2 ^ 24) (hBA : B ≤ A) :
    (mantissaDiv A B).2.2.2.2 = 0 := by
  rw [mantissaDiv_ge_tuple A B hA hA' hB hB' hBA]

theorem normalDivision_ge_components (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26) (A B : Nat)
    (hA : 2 ^ 23 ≤ A) (hA' : A < 2 ^ 24) (hB : 2 ^ 23 ≤ B) (hB' : B < 2 ^ 24) (hBA : B ≤ A)
    (hmva : mv_a.toNat = A) (hmvb : mv_b.toNat = B)
    (hq1 : 2 ^ 27 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 28) (hq : qbits.toNat = A * 2 ^ 27 / B)
    (hst : stickyRem = decide (A * 2 ^ 27 % B ≠ 0)) :
    (extractNorm qbits stickyRem mv_a mv_b).mant.toNat = (mantissaDiv A B).1 ∧
    (extractNorm qbits stickyRem mv_a mv_b).G = (mantissaDiv A B).2.1 ∧
    (extractNorm qbits stickyRem mv_a mv_b).R = (mantissaDiv A B).2.2.1 ∧
    (extractNorm qbits stickyRem mv_a mv_b).S = (mantissaDiv A B).2.2.2.1 ∧
    (extractNorm qbits stickyRem mv_a mv_b).adj_for_shift = 0#9 := by
  have hgev : mv_b.toNat ≤ mv_a.toNat := by rw [hmva, hmvb]; exact hBA
  have hE := extractNorm_ge qbits stickyRem mv_a mv_b hgev
  have hT := mantissaDiv_ge_tuple A B hA hA' hB hB' hBA
  have hsm : (qbits.getLsbD 1 || qbits.getLsbD 0)
      = (((A * 2 ^ 27 / B - 2 ^ 27) / 2 % 2 == 1) || ((A * 2 ^ 27 / B - 2 ^ 27) % 2 == 1)) :=
    ((congrArg (fun z => z || qbits.getLsbD 0) (noshift_getLsbD_frac_beq1 qbits hq1 hq2)).trans
      (congrArg (fun z => ((qbits.toNat - 2 ^ 27) / 2 % 2 == 1) || z)
        (noshift_getLsbD_frac_beq0 qbits hq1 hq2))).trans
      (congrArg (fun x => ((x - 2 ^ 27) / 2 % 2 == 1) || ((x - 2 ^ 27) % 2 == 1)) hq)
  have hsto : stickyRem = (A * 2 ^ 27 % B != 0) :=
    hst.trans (nat_bne_zero_eq_decide (A * 2 ^ 27 % B)).symm
  have hS1 : ((BitVec.extractLsb 1 0 qbits != 0#2) || stickyRem)
      = ((((A * 2 ^ 27 / B - 2 ^ 27) / 2 % 2 == 1) || ((A * 2 ^ 27 / B - 2 ^ 27) % 2 == 1)) ||
        (A * 2 ^ 27 % B != 0)) :=
    (congrArg (fun z => z || stickyRem) ((extractLsb1_0_ne_zero_eq qbits hq1 hq2).trans hsm)).trans
      (congrArg (fun z => (((A * 2 ^ 27 / B - 2 ^ 27) / 2 % 2 == 1) ||
        ((A * 2 ^ 27 / B - 2 ^ 27) % 2 == 1)) || z) hsto)
  refine ⟨?_, ?_, ?_, ?_, hE.2.2.2.2.1⟩
  · refine ((congrArg BitVec.toNat hE.1).trans (extractLsb26_4_eq qbits hq1 hq2)).trans ?_
    refine (congrArg (fun x => (x - 2 ^ 27) / 16) hq).trans ?_
    exact (congrArg Prod.fst hT).symm
  · refine hE.2.1.trans ?_
    refine ((noshift_getLsbD_frac_beq3 qbits hq1 hq2).trans
      (congrArg (fun x => (x - 2 ^ 27) / 8 % 2 == 1) hq)).trans ?_
    exact (congrArg (fun t => t.2.1) hT).symm
  · refine hE.2.2.1.trans ?_
    refine ((noshift_getLsbD_frac_beq2 qbits hq1 hq2).trans
      (congrArg (fun x => (x - 2 ^ 27) / 4 % 2 == 1) hq)).trans ?_
    exact (congrArg (fun t => t.2.2.1) hT).symm
  · refine hE.2.2.2.1.trans ?_
    refine hS1.trans ?_
    exact (congrArg (fun t => t.2.2.2.1) hT).symm

theorem normalRound_ge (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hBA : normalizedMantWithHiddenNat b ≤ normalizedMantWithHiddenNat a)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 27 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 28)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0)) :
    (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
        (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).mant.toNat
      = (FdivSpec.normalRounded a b).1 ∧
    (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
        (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).carry
      = (FdivSpec.normalRounded a b).2 := by
  obtain ⟨hm, hG, hR, hS, hAdj⟩ :=
    normalDivision_ge_components qbits stickyRem mv_a mv_b
      (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)
      hAb hAb' hBb hBb' hBA hmva hmvb hq1 hq2 hq hst
  have hb := rneRound_eq_roundRNE (extractNorm qbits stickyRem mv_a mv_b).mant
    (extractNorm qbits stickyRem mv_a mv_b).G (extractNorm qbits stickyRem mv_a mv_b).R
    (extractNorm qbits stickyRem mv_a mv_b).S
  unfold FdivSpec.normalRounded FdivSpec.normalDivision
  constructor
  · rw [hb.1, hm, hG, hR, hS]
  · rw [hb.2, hm, hG, hR, hS]

theorem normalDivision_lt_components (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26) (A B : Nat)
    (hA : 2 ^ 23 ≤ A) (hA' : A < 2 ^ 24) (hB : 2 ^ 23 ≤ B) (hB' : B < 2 ^ 24) (hAB : A < B)
    (hmva : mv_a.toNat = A) (hmvb : mv_b.toNat = B)
    (hq1 : 2 ^ 26 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 27) (hq : qbits.toNat = A * 2 ^ 27 / B)
    (hst : stickyRem = decide (A * 2 ^ 27 % B ≠ 0)) :
    (extractNorm qbits stickyRem mv_a mv_b).mant.toNat = (mantissaDiv A B).1 ∧
    (extractNorm qbits stickyRem mv_a mv_b).G = (mantissaDiv A B).2.1 ∧
    (extractNorm qbits stickyRem mv_a mv_b).R = (mantissaDiv A B).2.2.1 ∧
    (extractNorm qbits stickyRem mv_a mv_b).S = (mantissaDiv A B).2.2.2.1 ∧
    (extractNorm qbits stickyRem mv_a mv_b).adj_for_shift = 1#9 := by
  have hltv : mv_a.toNat < mv_b.toNat := by rw [hmva, hmvb]; exact hAB
  have hE := extractNorm_align_lt qbits stickyRem mv_a mv_b hltv
  have hT := mantissaDiv_lt_tuple A B hA hA' hB hB' hAB
  have e1 : ((2 * qbits.toNat - 2 ^ 27) / 2 % 2 == 1) = ((2 * (A * 2 ^ 27 / B) - 2 ^ 27) / 2 % 2 == 1) :=
    congrArg (fun x => x == 1) (by rw [hq])
  have e2 : ((2 * qbits.toNat - 2 ^ 27) % 2 == 1) = ((2 * (A * 2 ^ 27 / B) - 2 ^ 27) % 2 == 1) :=
    congrArg (fun x => x == 1) (by rw [hq])
  have hsm : qbits.getLsbD 0
      = (((2 * (A * 2 ^ 27 / B) - 2 ^ 27) / 2 % 2 == 1) || ((2 * (A * 2 ^ 27 / B) - 2 ^ 27) % 2 == 1)) :=
    ((shift_sticky_eq qbits hq1 hq2).symm.trans
      (congrArg (fun z => z || ((2 * qbits.toNat - 2 ^ 27) % 2 == 1)) e1)).trans
      (congrArg (fun z => ((2 * (A * 2 ^ 27 / B) - 2 ^ 27) / 2 % 2 == 1) || z) e2)
  have hsto : stickyRem = (A * 2 ^ 27 % B != 0) :=
    hst.trans (nat_bne_zero_eq_decide (A * 2 ^ 27 % B)).symm
  refine ⟨?_, ?_, ?_, ?_, hE.2.2.2.2.1⟩
  · rw [extractNorm_align_lt_mant qbits stickyRem mv_a mv_b hltv hq1 hq2, hq]
    exact (congrArg Prod.fst hT).symm
  · refine hE.2.1.trans ?_
    refine ((shift_guard_eq qbits hq1 hq2).symm.trans (congrArg (fun x => x == 1) (by rw [hq]))).trans ?_
    exact (congrArg (fun t => t.2.1) hT).symm
  · refine hE.2.2.1.trans ?_
    refine ((shift_round_eq qbits hq1 hq2).symm.trans (congrArg (fun x => x == 1) (by rw [hq]))).trans ?_
    exact (congrArg (fun t => t.2.2.1) hT).symm
  · refine hE.2.2.2.1.trans ?_
    refine ((congrArg (fun z => z || stickyRem) hsm).trans
      (congrArg (fun z => ((2 * (A * 2 ^ 27 / B) - 2 ^ 27) / 2 % 2 == 1) ||
        ((2 * (A * 2 ^ 27 / B) - 2 ^ 27) % 2 == 1) || z) hsto)).trans ?_
    exact (congrArg (fun t => t.2.2.2.1) hT).symm

theorem normalRound_lt (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hAB : normalizedMantWithHiddenNat a < normalizedMantWithHiddenNat b)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 26 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 27)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0)) :
    (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
        (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).mant.toNat
      = (FdivSpec.normalRounded a b).1 ∧
    (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
        (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).carry
      = (FdivSpec.normalRounded a b).2 := by
  obtain ⟨hm, hG, hR, hS, hAdj⟩ :=
    normalDivision_lt_components qbits stickyRem mv_a mv_b
      (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)
      hAb hAb' hBb hBb' hAB hmva hmvb hq1 hq2 hq hst
  have hb := rneRound_eq_roundRNE (extractNorm qbits stickyRem mv_a mv_b).mant
    (extractNorm qbits stickyRem mv_a mv_b).G (extractNorm qbits stickyRem mv_a mv_b).R
    (extractNorm qbits stickyRem mv_a mv_b).S
  unfold FdivSpec.normalRounded FdivSpec.normalDivision
  constructor
  · rw [hb.1, hm, hG, hR, hS]
  · rw [hb.2, hm, hG, hR, hS]

theorem normalFinalExp_eq_lt (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hAB : normalizedMantWithHiddenNat a < normalizedMantWithHiddenNat b)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 26 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 27)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0))
    (hza : isZero a = false) (hia : isInf a = false) (hna : (isSNaN a || isQNaN a) = false)
    (hzb : isZero b = false) (hib : isInf b = false) (hnb : (isSNaN b || isQNaN b) = false) :
    result_exp_raw (mkState a b) - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
      + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
            (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).carry = true
          then 1 else 0)
    = FdivSpec.normalFinalExp a b := by
  have hcarry := (normalRound_lt a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hAB hmva hmvb
    hq1 hq2 hq hst).2
  have hadjM : (extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat = 1 := by
    rw [(extractNorm_align_lt qbits stickyRem mv_a mv_b (by rw [hmva, hmvb]; exact hAB)).2.2.2.2.1]
    decide
  have hadjS : (FdivSpec.normalDivision a b).2.2.2.2 = 1 :=
    normalExpAdjust_lt (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b) hAb hAb' hBb hBb' hAB
  have hraw : result_exp_raw (mkState a b) = baseResultExp a b := by
    simpa only [mkState_a_reg, mkState_b_reg] using
      (result_exp_raw_eq_baseResultExp_all (mkState a b) hza hia hna hzb hib hnb)
  show result_exp_raw (mkState a b) - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
      + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
            (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).carry = true
          then 1 else 0)
    = baseResultExp a b - (FdivSpec.normalDivision a b).2.2.2.2
      + (if (FdivSpec.normalRounded a b).2 = true then 1 else 0)
  rw [hraw, hadjM, hadjS, hcarry]
  norm_num

theorem normalPack_mant_eq (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hAB : normalizedMantWithHiddenNat a < normalizedMantWithHiddenNat b)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 26 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 27)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0)) :
    (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
        (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).mant
      = BitVec.ofNat 23 ((FdivSpec.normalRounded a b).1) := by
  have hr := (normalRound_lt a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hAB hmva hmvb
    hq1 hq2 hq hst).1
  have hn : (FdivSpec.normalRounded a b).1 < 2 ^ 23 := by
    rw [← hr]
    exact (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
      (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).mant.isLt
  apply BitVec.toNat_inj.mp
  rw [BitVec.toNat_ofNat, Nat.mod_eq_of_lt hn]
  exact hr

theorem normalOverflow_eq (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hAB : normalizedMantWithHiddenNat a < normalizedMantWithHiddenNat b)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 26 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 27)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0))
    (hza : isZero a = false) (hia : isInf a = false) (hna : (isSNaN a || isQNaN a) = false)
    (hzb : isZero b = false) (hib : isInf b = false) (hnb : (isSNaN b || isQNaN b) = false) :
    decide (result_exp_raw (mkState a b)
            - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
            + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant
                  (extractNorm qbits stickyRem mv_a mv_b).G (extractNorm qbits stickyRem mv_a mv_b).R
                  (extractNorm qbits stickyRem mv_a mv_b).S).carry = true then 1 else 0) > 254) = FdivSpec.normalOverflow a b := by
  rw [normalFinalExp_eq_lt a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hAB hmva hmvb hq1 hq2 hq hst
    hza hia hna hzb hib hnb]
  rfl

theorem normalUnderflow_eq (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hAB : normalizedMantWithHiddenNat a < normalizedMantWithHiddenNat b)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 26 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 27)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0))
    (hza : isZero a = false) (hia : isInf a = false) (hna : (isSNaN a || isQNaN a) = false)
    (hzb : isZero b = false) (hib : isInf b = false) (hnb : (isSNaN b || isQNaN b) = false) :
    decide (result_exp_raw (mkState a b)
            - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
            + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant
                  (extractNorm qbits stickyRem mv_a mv_b).G (extractNorm qbits stickyRem mv_a mv_b).R
                  (extractNorm qbits stickyRem mv_a mv_b).S).carry = true then 1 else 0) < 1) = FdivSpec.normalUnderflow a b := by
  rw [normalFinalExp_eq_lt a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hAB hmva hmvb hq1 hq2 hq hst
    hza hia hna hzb hib hnb]
  rfl

theorem normalInexact_eq (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hAB : normalizedMantWithHiddenNat a < normalizedMantWithHiddenNat b)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 26 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 27)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0))
    (hza : isZero a = false) (hia : isInf a = false) (hna : (isSNaN a || isQNaN a) = false)
    (hzb : isZero b = false) (hib : isInf b = false) (hnb : (isSNaN b || isQNaN b) = false) :
    (((extractNorm qbits stickyRem mv_a mv_b).G || (extractNorm qbits stickyRem mv_a mv_b).R
        || (extractNorm qbits stickyRem mv_a mv_b).S)
      || decide (result_exp_raw (mkState a b)
            - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
            + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant
                  (extractNorm qbits stickyRem mv_a mv_b).G (extractNorm qbits stickyRem mv_a mv_b).R
                  (extractNorm qbits stickyRem mv_a mv_b).S).carry = true then 1 else 0) > 254))
      = FdivSpec.normalInexact a b := by
  have hfin := normalFinalExp_eq_lt a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hAB hmva hmvb
    hq1 hq2 hq hst hza hia hna hzb hib hnb
  have hor : ((extractNorm qbits stickyRem mv_a mv_b).G || (extractNorm qbits stickyRem mv_a mv_b).R
        || (extractNorm qbits stickyRem mv_a mv_b).S)
      = ((FdivSpec.normalDivision a b).2.1 || (FdivSpec.normalDivision a b).2.2.1
        || (FdivSpec.normalDivision a b).2.2.2.1) := by
    obtain ⟨hm, hG, hR, hS, hAdj⟩ :=
      normalDivision_lt_components qbits stickyRem mv_a mv_b
        (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)
        hAb hAb' hBb hBb' hAB hmva hmvb hq1 hq2 hq hst
    exact ((congrArg (fun z => z || (extractNorm qbits stickyRem mv_a mv_b).R
          || (extractNorm qbits stickyRem mv_a mv_b).S) hG).trans
        (congrArg (fun z => (mantissaDiv (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)).2.1
          || z || (extractNorm qbits stickyRem mv_a mv_b).S) hR)).trans
      (congrArg (fun z => (mantissaDiv (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)).2.1
        || (mantissaDiv (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)).2.2.1 || z) hS)
  have hovf := normalOverflow_eq a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hAB hmva hmvb
    hq1 hq2 hq hst hza hia hna hzb hib hnb
  refine (((congrArg (fun z => z || decide (result_exp_raw (mkState a b)
        - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
        + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant
              (extractNorm qbits stickyRem mv_a mv_b).G (extractNorm qbits stickyRem mv_a mv_b).R
              (extractNorm qbits stickyRem mv_a mv_b).S).carry = true then 1 else 0) > 254)) hor).trans
      (congrArg (fun z => ((FdivSpec.normalDivision a b).2.1 || (FdivSpec.normalDivision a b).2.2.1
        || (FdivSpec.normalDivision a b).2.2.2.1) || z) hovf)).trans ?_)
  simp only [FdivSpec.normalInexact, FdivSpec.normalOverflow]

theorem normalFinalExp_eq_ge (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hBA : normalizedMantWithHiddenNat b ≤ normalizedMantWithHiddenNat a)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 27 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 28)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0))
    (hza : isZero a = false) (hia : isInf a = false) (hna : (isSNaN a || isQNaN a) = false)
    (hzb : isZero b = false) (hib : isInf b = false) (hnb : (isSNaN b || isQNaN b) = false) :
    result_exp_raw (mkState a b) - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
      + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
            (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).carry = true
          then 1 else 0)
    = FdivSpec.normalFinalExp a b := by
  have hcarry := (normalRound_ge a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hBA hmva hmvb
    hq1 hq2 hq hst).2
  have hadjM : (extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat = 0 := by
    rw [(extractNorm_ge qbits stickyRem mv_a mv_b (by rw [hmva, hmvb]; exact hBA)).2.2.2.2.1]
    decide
  have hadjS : (FdivSpec.normalDivision a b).2.2.2.2 = 0 :=
    normalExpAdjust_ge (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)
      hAb hAb' hBb hBb' hBA
  have hraw : result_exp_raw (mkState a b) = baseResultExp a b := by
    simpa only [mkState_a_reg, mkState_b_reg] using
      (result_exp_raw_eq_baseResultExp_all (mkState a b) hza hia hna hzb hib hnb)
  show result_exp_raw (mkState a b) - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
      + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
            (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).carry = true
          then 1 else 0)
    = baseResultExp a b - (FdivSpec.normalDivision a b).2.2.2.2
      + (if (FdivSpec.normalRounded a b).2 = true then 1 else 0)
  rw [hraw, hadjM, hadjS, hcarry]
  norm_num

theorem normalPack_mant_eq_ge (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hBA : normalizedMantWithHiddenNat b ≤ normalizedMantWithHiddenNat a)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 27 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 28)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0)) :
    (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
        (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).mant
      = BitVec.ofNat 23 ((FdivSpec.normalRounded a b).1) := by
  have hr := (normalRound_ge a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hBA hmva hmvb
    hq1 hq2 hq hst).1
  have hn : (FdivSpec.normalRounded a b).1 < 2 ^ 23 := by
    rw [← hr]
    exact (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant (extractNorm qbits stickyRem mv_a mv_b).G
      (extractNorm qbits stickyRem mv_a mv_b).R (extractNorm qbits stickyRem mv_a mv_b).S).mant.isLt
  apply BitVec.toNat_inj.mp
  rw [BitVec.toNat_ofNat, Nat.mod_eq_of_lt hn]
  exact hr

theorem normalOverflow_eq_ge (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hBA : normalizedMantWithHiddenNat b ≤ normalizedMantWithHiddenNat a)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 27 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 28)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0))
    (hza : isZero a = false) (hia : isInf a = false) (hna : (isSNaN a || isQNaN a) = false)
    (hzb : isZero b = false) (hib : isInf b = false) (hnb : (isSNaN b || isQNaN b) = false) :
    decide (result_exp_raw (mkState a b)
            - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
            + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant
                  (extractNorm qbits stickyRem mv_a mv_b).G (extractNorm qbits stickyRem mv_a mv_b).R
                  (extractNorm qbits stickyRem mv_a mv_b).S).carry = true then 1 else 0) > 254)
      = FdivSpec.normalOverflow a b := by
  rw [normalFinalExp_eq_ge a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hBA hmva hmvb hq1 hq2 hq hst
    hza hia hna hzb hib hnb]
  rfl

theorem normalUnderflow_eq_ge (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hBA : normalizedMantWithHiddenNat b ≤ normalizedMantWithHiddenNat a)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 27 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 28)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0))
    (hza : isZero a = false) (hia : isInf a = false) (hna : (isSNaN a || isQNaN a) = false)
    (hzb : isZero b = false) (hib : isInf b = false) (hnb : (isSNaN b || isQNaN b) = false) :
    decide (result_exp_raw (mkState a b)
            - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
            + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant
                  (extractNorm qbits stickyRem mv_a mv_b).G (extractNorm qbits stickyRem mv_a mv_b).R
                  (extractNorm qbits stickyRem mv_a mv_b).S).carry = true then 1 else 0) < 1)
      = FdivSpec.normalUnderflow a b := by
  rw [normalFinalExp_eq_ge a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hBA hmva hmvb hq1 hq2 hq hst
    hza hia hna hzb hib hnb]
  rfl

theorem normalInexact_eq_ge (a b : BitVec 32) (qbits : BitVec 28) (stickyRem : Bool)
    (mv_a mv_b : BitVec 26)
    (hAb : 2 ^ 23 ≤ normalizedMantWithHiddenNat a) (hAb' : normalizedMantWithHiddenNat a < 2 ^ 24)
    (hBb : 2 ^ 23 ≤ normalizedMantWithHiddenNat b) (hBb' : normalizedMantWithHiddenNat b < 2 ^ 24)
    (hBA : normalizedMantWithHiddenNat b ≤ normalizedMantWithHiddenNat a)
    (hmva : mv_a.toNat = normalizedMantWithHiddenNat a) (hmvb : mv_b.toNat = normalizedMantWithHiddenNat b)
    (hq1 : 2 ^ 27 ≤ qbits.toNat) (hq2 : qbits.toNat < 2 ^ 28)
    (hq : qbits.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b)
    (hst : stickyRem = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0))
    (hza : isZero a = false) (hia : isInf a = false) (hna : (isSNaN a || isQNaN a) = false)
    (hzb : isZero b = false) (hib : isInf b = false) (hnb : (isSNaN b || isQNaN b) = false) :
    (((extractNorm qbits stickyRem mv_a mv_b).G || (extractNorm qbits stickyRem mv_a mv_b).R
        || (extractNorm qbits stickyRem mv_a mv_b).S)
      || decide (result_exp_raw (mkState a b)
            - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
            + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant
                  (extractNorm qbits stickyRem mv_a mv_b).G (extractNorm qbits stickyRem mv_a mv_b).R
                  (extractNorm qbits stickyRem mv_a mv_b).S).carry = true then 1 else 0) > 254))
      = FdivSpec.normalInexact a b := by
  have hfin := normalFinalExp_eq_ge a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hBA hmva hmvb
    hq1 hq2 hq hst hza hia hna hzb hib hnb
  have hor : ((extractNorm qbits stickyRem mv_a mv_b).G || (extractNorm qbits stickyRem mv_a mv_b).R
        || (extractNorm qbits stickyRem mv_a mv_b).S)
      = ((FdivSpec.normalDivision a b).2.1 || (FdivSpec.normalDivision a b).2.2.1
        || (FdivSpec.normalDivision a b).2.2.2.1) := by
    obtain ⟨hm, hG, hR, hS, hAdj⟩ :=
      normalDivision_ge_components qbits stickyRem mv_a mv_b
        (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)
        hAb hAb' hBb hBb' hBA hmva hmvb hq1 hq2 hq hst
    exact ((congrArg (fun z => z || (extractNorm qbits stickyRem mv_a mv_b).R
          || (extractNorm qbits stickyRem mv_a mv_b).S) hG).trans
        (congrArg (fun z => (mantissaDiv (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)).2.1
          || z || (extractNorm qbits stickyRem mv_a mv_b).S) hR)).trans
      (congrArg (fun z => (mantissaDiv (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)).2.1
        || (mantissaDiv (normalizedMantWithHiddenNat a) (normalizedMantWithHiddenNat b)).2.2.1 || z) hS)
  have hovf := normalOverflow_eq_ge a b qbits stickyRem mv_a mv_b hAb hAb' hBb hBb' hBA hmva hmvb
    hq1 hq2 hq hst hza hia hna hzb hib hnb
  refine (((congrArg (fun z => z || decide (result_exp_raw (mkState a b)
        - (↑(extractNorm qbits stickyRem mv_a mv_b).adj_for_shift.toNat : Int)
        + (if (rneRound (extractNorm qbits stickyRem mv_a mv_b).mant
              (extractNorm qbits stickyRem mv_a mv_b).G (extractNorm qbits stickyRem mv_a mv_b).R
              (extractNorm qbits stickyRem mv_a mv_b).S).carry = true then 1 else 0) > 254)) hor).trans
      (congrArg (fun z => ((FdivSpec.normalDivision a b).2.1 || (FdivSpec.normalDivision a b).2.2.1
        || (FdivSpec.normalDivision a b).2.2.2.1) || z) hovf)).trans ?_)
  simp only [FdivSpec.normalInexact, FdivSpec.normalOverflow]

theorem normalFdiv_mkState_eq_lt (a b : BitVec 32) (hsp : is_special (mkState a b) = false)
    (hlt : (mant_a_val (mkState a b)).toNat < (mant_b_val (mkState a b)).toNat) :
    FdivModel.normalFdiv (mkState a b) = FdivSpec.normalFdiv a b := by
  obtain ⟨ha0, hb0, hai, hbi, hna, hnb⟩ := atoms_of_is_special_false a b hsp
  have hma : (mant_a_val (mkState a b)).toNat = normalizedMantWithHiddenNat a :=
    mant_a_val_eq_normalized_all (mkState a b) ha0
  have hmb : (mant_b_val (mkState a b)).toNat = normalizedMantWithHiddenNat b :=
    mant_b_val_eq_normalized_all (mkState a b) hb0
  have hAb := normalizedMantWithHiddenNat_bounds_all a ha0
  have hBb := normalizedMantWithHiddenNat_bounds_all b hb0
  have hAB : normalizedMantWithHiddenNat a < normalizedMantWithHiddenNat b := by
    rw [← hma, ← hmb]; exact hlt
  have hquo := quot_align_lt (mkState a b) ha0 hb0 hlt
  unfold FdivModel.normalFdiv FdivSpec.normalFdiv
  dsimp only
  set qbitsE : BitVec 28 := (runDivider (mant_a_val (mkState a b)) (mant_b_val (mkState a b))).1 with hqbitsE
  set remE : BitVec 29 := (runDivider (mant_a_val (mkState a b)) (mant_b_val (mkState a b))).2 with hremE
  set stickyE : Bool := finalRemWithSticky remE (0#3 ++ mant_b_val (mkState a b)) with hstickyE
  have hq : qbitsE.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b := by
    rw [hqbitsE]; exact hquo.1
  have hq1 : 2 ^ 26 ≤ qbitsE.toNat := by rw [hqbitsE]; exact hquo.2.1
  have hq2 : qbitsE.toNat < 2 ^ 27 := by rw [hqbitsE]; exact hquo.2.2.1
  have hst : stickyE = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0) := by
    rw [hstickyE, hremE]; exact hquo.2.2.2
  have hsign : calc_sign (mkState a b) = resultSign a b := normalSign_eq_mkState a b
  have hfin := normalFinalExp_eq_lt a b qbitsE stickyE (mant_a_val (mkState a b)) (mant_b_val (mkState a b))
    hAb.1 hAb.2 hBb.1 hBb.2 hAB hma hmb hq1 hq2 hq hst ha0 hai hna hb0 hbi hnb
  have hmant := normalPack_mant_eq a b qbitsE stickyE (mant_a_val (mkState a b)) (mant_b_val (mkState a b))
    hAb.1 hAb.2 hBb.1 hBb.2 hAB hma hmb hq1 hq2 hq hst
  have hinex := normalInexact_eq a b qbitsE stickyE (mant_a_val (mkState a b)) (mant_b_val (mkState a b))
    hAb.1 hAb.2 hBb.1 hBb.2 hAB hma hmb hq1 hq2 hq hst ha0 hai hna hb0 hbi hnb
  have hovf := normalOverflow_eq a b qbitsE stickyE (mant_a_val (mkState a b)) (mant_b_val (mkState a b))
    hAb.1 hAb.2 hBb.1 hBb.2 hAB hma hmb hq1 hq2 hq hst ha0 hai hna hb0 hbi hnb
  have hunf := normalUnderflow_eq a b qbitsE stickyE (mant_a_val (mkState a b)) (mant_b_val (mkState a b))
    hAb.1 hAb.2 hBb.1 hBb.2 hAB hma hmb hq1 hq2 hq hst ha0 hai hna hb0 hbi hnb
  unfold FdivSpec.pack
  rw [hsign, hinex, hovf, hunf, hfin, hmant]
  by_cases h1 : FdivSpec.normalOverflow a b = true
  · have h1b : (FdivSpec.normalOverflow a b || FdivSpec.normalUnderflow a b) = true := by
      simp [h1]
    have h2f : FdivSpec.normalUnderflow a b = false := by
      unfold FdivSpec.normalUnderflow
      rw [decide_eq_false_iff_not]
      have hgt : 254 < FdivSpec.normalFinalExp a b := by
        have h1' := h1
        unfold FdivSpec.normalOverflow at h1'
        exact decide_eq_true_iff.mp h1'
      omega
    simp only [if_pos h1, if_pos h1b]
    simp only [h1, h2f]
    refine Prod.ext ?_ ?_
    · exact (signed_inf_pack a b).symm
    · rfl
  · by_cases h2 : FdivSpec.normalUnderflow a b = true
    · have h2b : (FdivSpec.normalOverflow a b || FdivSpec.normalUnderflow a b) = true := by
        simp [h2]
      have h1f : FdivSpec.normalOverflow a b = false := by
        unfold FdivSpec.normalOverflow
        rw [decide_eq_false_iff_not]
        have hlt : FdivSpec.normalFinalExp a b < 1 := by
          have h2' := h2
          unfold FdivSpec.normalUnderflow at h2'
          exact decide_eq_true_iff.mp h2'
        omega
      simp only [if_neg h1, if_pos h2, if_pos h2b]
      simp only [h1f, h2]
      refine Prod.ext ?_ ?_
      · exact (signed_zero_pack a b).symm
      · rfl
    · have h1f : FdivSpec.normalOverflow a b = false := by
        cases h : FdivSpec.normalOverflow a b <;> simp_all
      have h2f : FdivSpec.normalUnderflow a b = false := by
        cases h : FdivSpec.normalUnderflow a b <;> simp_all
      have h1bn : ¬((FdivSpec.normalOverflow a b || FdivSpec.normalUnderflow a b) = true) := by
        simp [h1f, h2f]
      simp only [if_neg h1, if_neg h2, if_neg h1bn]
      simp only [h1f, h2f]

theorem rtlEquivSpec_of_not_special_lt (a b : BitVec 32) (h : is_special (mkState a b) = false)
    (hlt : (mant_a_val (mkState a b)).toNat < (mant_b_val (mkState a b)).toNat) :
    rtl_comb a b = fdiv a b :=
  rtlEquivSpec_of_not_special a b h (normalFdiv_mkState_eq_lt a b h hlt)

theorem normalFdiv_mkState_eq_ge (a b : BitVec 32) (hsp : is_special (mkState a b) = false)
    (hge : (mant_b_val (mkState a b)).toNat ≤ (mant_a_val (mkState a b)).toNat) :
    FdivModel.normalFdiv (mkState a b) = FdivSpec.normalFdiv a b := by
  obtain ⟨ha0, hb0, hai, hbi, hna, hnb⟩ := atoms_of_is_special_false a b hsp
  have hma : (mant_a_val (mkState a b)).toNat = normalizedMantWithHiddenNat a :=
    mant_a_val_eq_normalized_all (mkState a b) ha0
  have hmb : (mant_b_val (mkState a b)).toNat = normalizedMantWithHiddenNat b :=
    mant_b_val_eq_normalized_all (mkState a b) hb0
  have hAb := normalizedMantWithHiddenNat_bounds_all a ha0
  have hBb := normalizedMantWithHiddenNat_bounds_all b hb0
  have hBA : normalizedMantWithHiddenNat b ≤ normalizedMantWithHiddenNat a := by
    rw [← hma, ← hmb]; exact hge
  have hquo := quot_align_ge (mkState a b) ha0 hb0 hge
  unfold FdivModel.normalFdiv FdivSpec.normalFdiv
  dsimp only
  set qbitsE : BitVec 28 := (runDivider (mant_a_val (mkState a b)) (mant_b_val (mkState a b))).1 with hqbitsE
  set remE : BitVec 29 := (runDivider (mant_a_val (mkState a b)) (mant_b_val (mkState a b))).2 with hremE
  set stickyE : Bool := finalRemWithSticky remE (0#3 ++ mant_b_val (mkState a b)) with hstickyE
  have hq : qbitsE.toNat = normalizedMantWithHiddenNat a * 2 ^ 27 / normalizedMantWithHiddenNat b := by
    rw [hqbitsE]; exact hquo.1
  have hq1 : 2 ^ 27 ≤ qbitsE.toNat := by rw [hqbitsE]; exact hquo.2.1
  have hq2 : qbitsE.toNat < 2 ^ 28 := by rw [hqbitsE]; exact hquo.2.2.1
  have hst : stickyE = decide (normalizedMantWithHiddenNat a * 2 ^ 27 % normalizedMantWithHiddenNat b ≠ 0) := by
    rw [hstickyE, hremE]; exact hquo.2.2.2
  have hsign : calc_sign (mkState a b) = resultSign a b := normalSign_eq_mkState a b
  have hfin := normalFinalExp_eq_ge a b qbitsE stickyE (mant_a_val (mkState a b)) (mant_b_val (mkState a b))
    hAb.1 hAb.2 hBb.1 hBb.2 hBA hma hmb hq1 hq2 hq hst ha0 hai hna hb0 hbi hnb
  have hmant := normalPack_mant_eq_ge a b qbitsE stickyE (mant_a_val (mkState a b)) (mant_b_val (mkState a b))
    hAb.1 hAb.2 hBb.1 hBb.2 hBA hma hmb hq1 hq2 hq hst
  have hinex := normalInexact_eq_ge a b qbitsE stickyE (mant_a_val (mkState a b)) (mant_b_val (mkState a b))
    hAb.1 hAb.2 hBb.1 hBb.2 hBA hma hmb hq1 hq2 hq hst ha0 hai hna hb0 hbi hnb
  have hovf := normalOverflow_eq_ge a b qbitsE stickyE (mant_a_val (mkState a b)) (mant_b_val (mkState a b))
    hAb.1 hAb.2 hBb.1 hBb.2 hBA hma hmb hq1 hq2 hq hst ha0 hai hna hb0 hbi hnb
  have hunf := normalUnderflow_eq_ge a b qbitsE stickyE (mant_a_val (mkState a b)) (mant_b_val (mkState a b))
    hAb.1 hAb.2 hBb.1 hBb.2 hBA hma hmb hq1 hq2 hq hst ha0 hai hna hb0 hbi hnb
  unfold FdivSpec.pack
  rw [hsign, hinex, hovf, hunf, hfin, hmant]
  by_cases h1 : FdivSpec.normalOverflow a b = true
  · have h1b : (FdivSpec.normalOverflow a b || FdivSpec.normalUnderflow a b) = true := by
      simp [h1]
    have h2f : FdivSpec.normalUnderflow a b = false := by
      unfold FdivSpec.normalUnderflow
      rw [decide_eq_false_iff_not]
      have hgt : 254 < FdivSpec.normalFinalExp a b := by
        have h1' := h1
        unfold FdivSpec.normalOverflow at h1'
        exact decide_eq_true_iff.mp h1'
      omega
    simp only [if_pos h1, if_pos h1b]
    simp only [h1, h2f]
    refine Prod.ext ?_ ?_
    · exact (signed_inf_pack a b).symm
    · rfl
  · by_cases h2 : FdivSpec.normalUnderflow a b = true
    · have h2b : (FdivSpec.normalOverflow a b || FdivSpec.normalUnderflow a b) = true := by
        simp [h2]
      have h1f : FdivSpec.normalOverflow a b = false := by
        unfold FdivSpec.normalOverflow
        rw [decide_eq_false_iff_not]
        have hlt : FdivSpec.normalFinalExp a b < 1 := by
          have h2' := h2
          unfold FdivSpec.normalUnderflow at h2'
          exact decide_eq_true_iff.mp h2'
        omega
      simp only [if_neg h1, if_pos h2, if_pos h2b]
      simp only [h1f, h2]
      refine Prod.ext ?_ ?_
      · exact (signed_zero_pack a b).symm
      · rfl
    · have h1f : FdivSpec.normalOverflow a b = false := by
        cases h : FdivSpec.normalOverflow a b <;> simp_all
      have h2f : FdivSpec.normalUnderflow a b = false := by
        cases h : FdivSpec.normalUnderflow a b <;> simp_all
      have h1bn : ¬((FdivSpec.normalOverflow a b || FdivSpec.normalUnderflow a b) = true) := by
        simp [h1f, h2f]
      simp only [if_neg h1, if_neg h2, if_neg h1bn]
      simp only [h1f, h2f]

theorem rtlEquivSpec_of_not_special_ge (a b : BitVec 32) (h : is_special (mkState a b) = false)
    (hge : (mant_b_val (mkState a b)).toNat ≤ (mant_a_val (mkState a b)).toNat) :
    rtl_comb a b = fdiv a b :=
  rtlEquivSpec_of_not_special a b h (normalFdiv_mkState_eq_ge a b h hge)

/--
The only public proof obligation in this benchmark. No decomposition,
proof API, proof view, bridge lemma, prior attempt, or route-specific helper
is supplied. The proving agent owns the proof architecture while the Model,
Spec, and top-level theorem remain locked.
-/
theorem rtlEquivSpec (a b : BitVec 32) : rtl_comb a b = fdiv a b := by
  by_cases hsp : is_special (mkState a b) = true
  · exact rtlEquivSpec_of_special a b hsp
  · have h : is_special (mkState a b) = false := by
      cases hv : is_special (mkState a b) <;> simp_all
    by_cases hge : (mant_b_val (mkState a b)).toNat ≤ (mant_a_val (mkState a b)).toNat
    · exact rtlEquivSpec_of_not_special_ge a b h hge
    · exact rtlEquivSpec_of_not_special_lt a b h (Nat.lt_of_not_le hge)
