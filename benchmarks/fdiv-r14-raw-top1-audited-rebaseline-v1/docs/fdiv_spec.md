# FDIV array28 RNE/FTZ specification

## 1. Scope

This case implements binary32 division with round-to-nearest-even (RNE), full
normal and subnormal **input** normalization, and flush-to-zero (FTZ) for tiny
nonzero **outputs**. It is intentionally not a full IEEE-754 gradual-underflow
implementation.

The Verilog module has registered inputs and outputs. The formal target
`rtlEquivSpec` compares the combinational datapath represented by
`FdivModel.combinationalLogic` with `FdivSpec.fdiv`; it does not prove temporal
properties of `start`, `valid`, reset, or the clocked wrapper.

The result tuple is:

```text
(result, overflow, underflow, division_by_zero, invalid, inexact)
```

## 2. Binary32 classification

An input is split into sign bit 31, exponent bits 30:23, and fraction bits
22:0.

| Class | Exponent | Fraction |
|---|---:|---:|
| zero | 0 | 0 |
| subnormal | 0 | nonzero |
| normal | 1..254 | any |
| infinity | 255 | 0 |
| signaling NaN | 255 | nonzero, fraction bit 22 = 0 |
| quiet NaN | 255 | fraction bit 22 = 1 |

The finite-result sign is `sign(a) XOR sign(b)`.

## 3. Special-case priority

Special cases are selected before the arithmetic datapath, in this order:

1. NaN input: propagate and quiet the first NaN operand. `invalid` is set only
   if either input is an SNaN.
2. infinity divided by infinity: default QNaN, `invalid = 1`.
3. zero divided by zero: default QNaN, `invalid = 1`.
4. infinity divided by any finite operand, including zero: signed infinity,
   with `division_by_zero = 0`.
5. finite operand divided by infinity: signed zero.
6. finite nonzero operand divided by zero: signed infinity,
   `division_by_zero = 1`.
7. zero divided by finite nonzero operand: signed zero.
8. otherwise use the finite arithmetic path.

All flags not explicitly named above are false on a special path. In
particular, quiet-NaN propagation does not raise `invalid`, and infinity divided
by zero does not raise `division_by_zero`.

## 4. Finite operand normalization

Normal inputs use significand `{1, fraction}` and their encoded exponent.
For a nonzero subnormal fraction `f`, define:

```text
shift = 23 - floor(log2(f))
normalized_significand = f << shift
normalized_exponent = 1 - shift
```

The normalized significand has its leading one at bit 23. Consequently, the
ratio of the two divider operands is always in `[0.5, 2)`, including every
subnormal/subnormal and normal/subnormal combination.

All exponent arithmetic is signed:

```text
base_result_exp = normalized_exp(a) - normalized_exp(b) + 127
```

Unsigned subtraction is not an equivalent implementation because negative
exponents would wrap and can turn underflow into overflow.

## 5. Array division and quotient normalization

The RTL uses an explicitly unrolled 28-stage restoring integer divider. For
normalized 26-bit operands it produces `q_bits[27:0]` plus a nonzero-remainder
sticky bit.

When `mant_a >= mant_b`, no quotient normalization is needed:

```text
fraction = q_bits[26:4]
G = q_bits[3]
R = q_bits[2]
S = OR(q_bits[1:0]) OR remainder_nonzero
exponent_adjustment = 0
```

When `mant_a < mant_b`, the quotient is multiplied by two and the exponent is
decremented once:

```text
fraction = q_bits[25:3]
G = q_bits[2]
R = q_bits[1]
S = q_bits[0] OR remainder_nonzero
exponent_adjustment = 1
```

The RNE increment is `G AND (R OR S OR fraction_lsb)`. A fraction carry adds one
to the signed final exponent.

## 6. Result packing and flags

Let `final_exp` be the signed exponent after quotient normalization and any RNE
carry.

| Condition | Result | Flags |
|---|---|---|
| `final_exp > 254` | signed infinity | `overflow = 1`, `inexact = 1` |
| `final_exp < 1` | signed zero (FTZ) | `underflow = 1`; `inexact` remains the G/R/S value |
| otherwise | sign, 8-bit exponent, rounded 23-bit fraction | `inexact = G OR R OR S` |

This case deliberately uses the historical FTZ flag profile: `underflow`
records every tiny finite result, while `inexact` records discarded precision
(or overflow). This differs from a full gradual-underflow IEEE implementation
and is part of the locked equivalence target.

## 7. Directed semantic anchors

The following vectors are executable regression anchors, not a replacement for
the universal Lean proof:

| a | b | result | ov | uf | dz | invalid | inexact |
|---:|---:|---:|---:|---:|---:|---:|---:|
| `0x3F800000` | `0x40400000` | `0x3EAAAAAB` | 0 | 0 | 0 | 0 | 1 |
| `0x3F800000` | `0x40A00000` | `0x3E4CCCCD` | 0 | 0 | 0 | 0 | 1 |
| `0x00000001` | `0x00400000` | `0x34800000` | 0 | 0 | 0 | 0 | 0 |
| `0x00400000` | `0x00000001` | `0x4A800000` | 0 | 0 | 0 | 0 | 0 |
| `0x7F800000` | `0x00000000` | `0x7F800000` | 0 | 0 | 0 | 0 | 0 |
| `0x7FC12345` | `0x3F800000` | `0x7FC12345` | 0 | 0 | 0 | 0 | 0 |
| `0x7F812345` | `0x3F800000` | `0x7FC12345` | 0 | 0 | 0 | 1 | 0 |

`tests/check_all.sh` checks these and broader deterministic samples in Lean and
against an independent float32 result oracle with explicit FTZ post-processing.

## 8. Formal acceptance contract

`formal/FdivProof.lean` is the authoritative list of fourteen theorem
statements. Only proof bodies and proof-specific helper declarations in that
file may change during a rollout. In particular:

- the top theorem must remain
  `rtl_comb a b = fdiv a b` over all two 32-bit inputs;
- all six output fields are part of equality;
- theorem statements may not be weakened or given new assumptions;
- `sorry`, `admit`, custom axioms, unsafe code, executable metaprogramming, and
  locked-input edits are rejected;
- a successful result requires compilation plus declaration-level axiom audit
  by the independent checker.

Finite tests establish useful implementation evidence. Only a Lean proof of
the universal theorem establishes this case as `PROVED`.
