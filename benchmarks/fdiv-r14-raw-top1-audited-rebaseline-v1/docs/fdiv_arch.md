# FDIV array28 architecture

## 1. Interface and formal boundary

The Verilog top module exposes:

```text
inputs:  clk, rst_n, a[31:0], b[31:0], start
outputs: result[31:0], valid,
         overflow, underflow, division_by_zero, invalid, inexact
```

`start` captures both operands. The combinational divider evaluates the
captured values, and the outputs plus `valid` are registered. The Lean model
contains the same state shape, but the benchmark theorem compares only its
combinational transition result with the Lean specification. Clock, reset,
latency, and protocol properties are outside the current theorem.

## 2. Datapath overview

```text
registered a,b
     |
     +--> classify / special-case priority -------------------+
     |                                                        |
     +--> subnormal leading-one normalization                 |
          + signed exponent adjustment                        |
          + 28-stage restoring significand divider            |
          + one-bit quotient normalization                    |
          + G/R/S extraction and RNE rounding                 |
          + signed overflow / FTZ-underflow result packing ---+--> output mux
                                                                    |
                                                               output registers
```

Special-value selection dominates the arithmetic result in the output mux.

## 3. Special-value block

The classifier distinguishes zero, subnormal, normal, infinity, SNaN, and
QNaN. Priority is:

```text
NaN
Inf/Inf
0/0
a is Inf
b is Inf
finite nonzero / 0
0 / finite nonzero
normal arithmetic
```

This order matters for overlapping predicates. For example, `Inf / 0` selects
the infinity path and does not assert `division_by_zero`. NaN propagation
quiets the payload; only SNaN input asserts `invalid`.

## 4. Subnormal normalization

A leading-one detector computes a shift in `[1, 23]` for each nonzero
subnormal fraction. The 23-bit fraction is left shifted until its leading one
occupies bit 23 of the 26-bit divider operand. Its signed biased exponent is
adjusted from `1` to `1 - shift`.

Normal operands already have the hidden bit in that position and use shift
zero. This pre-normalization is necessary: a Boolean “shift needed” after the
division cannot represent the many-bit alignment required by arbitrary
subnormal/subnormal ratios.

The raw result exponent is computed in a signed 12-bit datapath:

```text
result_exp_raw = exp_a_adj - exp_b_adj + 127
```

## 5. Restoring array divider

Both normalized significands lie in `[1, 2)`, so their ratio lies in
`[0.5, 2)`. Twenty-eight restoring stages emit one quotient bit per stage and
retain the final remainder for sticky-bit generation. There is no iterative
state machine; stages are combinationally unrolled.

The final quotient extraction is:

| Ratio branch | Fraction | Guard | Round | Sticky |
|---|---|---|---|---|
| `mant_a >= mant_b` | `q_bits[26:4]` | `q_bits[3]` | `q_bits[2]` | `OR(q_bits[1:0]) OR rem` |
| `mant_a < mant_b` | `q_bits[25:3]` | `q_bits[2]` | `q_bits[1]` | `q_bits[0] OR rem` |

The second branch represents quotient multiplication by two and therefore
subtracts one from the result exponent.

## 6. RNE and result assembly

The rounding increment is:

```text
increment = G AND (R OR S OR mantissa_lsb)
```

If the 23-bit fraction addition carries, the stored fraction is renormalized
and the signed exponent is incremented. The completed exponent determines
packing:

- greater than 254: infinity and `overflow`;
- less than 1: signed zero and `underflow` (the locked FTZ profile);
- otherwise: normal binary32 exponent and fraction.

`inexact` is `G OR R OR S OR overflow`. Other arithmetic-path exception flags
are false.

## 7. Lean correspondence

`formal/FdivModel.lean` mirrors the RTL block structure and fixed-width
quotient extraction. `formal/FdivSpec.lean` expresses the same arithmetic with
natural-number division and signed integer exponents. The implementations are
deliberately structurally different enough for their equality theorem to be
nontrivial, while directed tests compare both and the Verilog implementation.

The trusted boundary for a successful run is Lean's kernel plus the independent
checker. RTL-to-Lean fidelity is supported here by directed differential
testing; it is not itself a universal formal theorem in this case.

## 8. Validation commands

From the case root:

```sh
sh tests/check_all.sh 2000
```

The command performs Lean Model/Spec executable checks and an Icarus Verilog
differential run against an independent float32 oracle. A full build is:

```sh
cd formal
lake build
```

These checks guard the frozen baseline. The fourteen proof obligations remain
the acceptance path for universal Model/Spec equivalence.
