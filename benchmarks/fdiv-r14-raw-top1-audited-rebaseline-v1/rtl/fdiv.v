//==============================================================================
// fdiv: IEEE 754 Binary32 Floating-Point Divider
// - Single-cycle combinational datapath with input/output registers
// - Restoring 28-stage array divider
// - RNE (Round-to-Nearest-Even) rounding
// - Full IEEE 754 exception flag support
//==============================================================================

module fdiv (
    input  wire        clk,
    input  wire        rst_n,
    input  wire [31:0] a,
    input  wire [31:0] b,
    input  wire        start,
    output reg  [31:0] result,
    output reg         valid,
    output reg         overflow,
    output reg         underflow,
    output reg         division_by_zero,
    output reg         invalid,
    output reg         inexact
);

    //==========================================================================
    // Local Parameters
    //==========================================================================
    localparam EXP_BIAS  = 8'd127;
    localparam EXP_MAX   = 8'd254;
    localparam EXP_MIN   = 8'd0;
    localparam QNAN_CODE = 32'h7FC00000;
    localparam DIV_STAGES = 28;
    localparam REM_WIDTH  = 29;

    //==========================================================================
    // Input Registers
    //==========================================================================
    reg [31:0] a_reg;
    reg [31:0] b_reg;
    reg        start_reg;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            a_reg <= 32'b0;
            b_reg <= 32'b0;
            start_reg <= 1'b0;
        end else begin
            if (start) begin
                a_reg <= a;
                b_reg <= b;
            end
            start_reg <= start;
        end
    end

    //==========================================================================
    // Input Field Extraction
    //==========================================================================
    wire        sign_a   = a_reg[31];
    wire        sign_b   = b_reg[31];
    wire [7:0]  exp_a    = a_reg[30:23];
    wire [7:0]  exp_b    = b_reg[30:23];
    wire [22:0] frac_a   = a_reg[22:0];
    wire [22:0] frac_b   = b_reg[22:0];

    //==========================================================================
    // Special Value Detection
    //==========================================================================
    wire a_is_zero   = (exp_a == 8'd0) && (frac_a == 23'd0);
    wire b_is_zero   = (exp_b == 8'd0) && (frac_b == 23'd0);

    wire a_is_subnormal = (exp_a == 8'd0) && (frac_a != 23'd0);
    wire b_is_subnormal = (exp_b == 8'd0) && (frac_b != 23'd0);

    wire a_is_inf    = (exp_a == 8'd255) && (frac_a == 23'd0);
    wire b_is_inf    = (exp_b == 8'd255) && (frac_b == 23'd0);

    wire a_is_nan    = (exp_a == 8'd255) && (frac_a != 23'd0);
    wire b_is_nan    = (exp_b == 8'd255) && (frac_b != 23'd0);

    wire a_is_snan   = a_is_nan && ~frac_a[22];  // SNaN: MSB of frac = 0
    wire b_is_snan   = b_is_nan && ~frac_b[22];  // SNaN: MSB of frac = 0

    wire any_nan     = a_is_nan | b_is_nan;

    wire sign_result = sign_a ^ sign_b;

    //==========================================================================
    // Special Case Handling (priority encoded)
    //==========================================================================
    wire is_special;
    wire [31:0] special_result;
    wire special_invalid;
    wire special_div_by_zero;

    // Special cases are mutually exclusive by priority:
    // 1. NaN input → QNaN + invalid
    // 2. Inf/Inf → QNaN + invalid
    // 3. 0/0 → QNaN + invalid
    // 4. nonzero/0 → Inf + div_by_zero
    // 5. 0/nonzero → 0
    // 6. Inf/finite → Inf
    // 7. finite/Inf → 0
    // 8. normal/subnormal → compute normally

    wire case_nan        = any_nan;
    wire case_inf_inf    = a_is_inf & b_is_inf;
    wire case_zero_zero  = a_is_zero & b_is_zero;
    wire case_nonzero_div_zero = ~a_is_zero & b_is_zero;
    wire case_zero_div_nonzero = a_is_zero & ~b_is_zero;

    reg [4:0] special_sel;
    always @(*) begin
        special_sel = 5'd0;
        if (case_nan)                special_sel = 5'd1;
        else if (case_inf_inf)       special_sel = 5'd2;
        else if (case_zero_zero)     special_sel = 5'd3;
        else if (a_is_inf)           special_sel = 5'd6;
        else if (b_is_inf)           special_sel = 5'd7;
        else if (case_nonzero_div_zero) special_sel = 5'd4;
        else if (case_zero_div_nonzero) special_sel = 5'd5;
        else                         special_sel = 5'd0;  // normal case
    end

    assign is_special = (special_sel != 5'd0);

    // special result encoding
    wire [31:0] qnan_with_sign = {sign_result, QNAN_CODE[30:0]};
    wire [31:0] inf_with_sign  = {sign_result, 8'd255, 23'd0};
    wire [31:0] zero_with_sign = {sign_result, 31'd0};

    reg [31:0] special_result_reg;
    reg        special_invalid_reg;
    reg        special_div_by_zero_reg;
    always @(*) begin
        special_result_reg     = 32'd0;
        special_invalid_reg    = 1'b0;
        special_div_by_zero_reg = 1'b0;
        case (special_sel)
            5'd1: begin  // NaN input
                // Propagate QNaN from first NaN operand, else convert SNaN to QNaN
                if (a_is_nan) begin
                    special_result_reg = {sign_a, 8'd255, 1'b1, frac_a[21:0]};
                end else begin
                    special_result_reg = {sign_b, 8'd255, 1'b1, frac_b[21:0]};
                end
                special_invalid_reg = a_is_snan | b_is_snan;
            end
            5'd2: begin  // Inf/Inf → QNaN (no sign per IEEE 754)
                special_result_reg = QNAN_CODE;
                special_invalid_reg = 1'b1;
            end
            5'd3: begin  // 0/0 → QNaN (no sign per IEEE 754)
                special_result_reg = QNAN_CODE;
                special_invalid_reg = 1'b1;
            end
            5'd4: begin  // nonzero/0
                special_result_reg = inf_with_sign;
                special_div_by_zero_reg = 1'b1;
            end
            5'd5: begin  // 0/nonzero
                special_result_reg = zero_with_sign;
            end
            5'd6: begin  // Inf/finite
                special_result_reg = inf_with_sign;
            end
            5'd7: begin  // finite/Inf
                special_result_reg = zero_with_sign;
            end
            default: begin
                special_result_reg = 32'd0;
            end
        endcase
    end

    // Also set invalid when NaN input is signaling
    wire snan_input = a_is_snan | b_is_snan;
    wire nan_invalid   = snan_input;

    assign special_result     = special_result_reg;
    assign special_invalid    = special_invalid_reg | nan_invalid;
    assign special_div_by_zero = special_div_by_zero_reg;

    //==========================================================================
    // Normal Computation Datapath (only when not special)
    //==========================================================================

    //------------------------------------------------------------------
    // Sign Logic
    //------------------------------------------------------------------
    wire calc_sign = sign_a ^ sign_b;

    //------------------------------------------------------------------
    // Subnormal normalization and signed exponent datapath
    //------------------------------------------------------------------
    function automatic [4:0] normalize_shift23(input [22:0] frac);
        integer i;
        reg found;
        begin
            normalize_shift23 = 5'd0;
            found = 1'b0;
            for (i = 22; i >= 0; i = i - 1) begin
                if (!found && frac[i]) begin
                    normalize_shift23 = 5'd23 - i;
                    found = 1'b1;
                end
            end
        end
    endfunction

    wire [4:0] norm_shift_a = a_is_subnormal ? normalize_shift23(frac_a) : 5'd0;
    wire [4:0] norm_shift_b = b_is_subnormal ? normalize_shift23(frac_b) : 5'd0;

    // After shifting a subnormal significand's leading one to bit 23, its
    // effective biased exponent is 1 - shift. Signed arithmetic avoids wrap.
    wire signed [11:0] exp_a_adj = a_is_subnormal
        ? (12'sd1 - $signed({7'b0, norm_shift_a}))
        : $signed({4'b0, exp_a});
    wire signed [11:0] exp_b_adj = b_is_subnormal
        ? (12'sd1 - $signed({7'b0, norm_shift_b}))
        : $signed({4'b0, exp_b});
    wire signed [11:0] result_exp_raw = exp_a_adj - exp_b_adj + 12'sd127;

    //------------------------------------------------------------------
    // Mantissa Preparation (26-bit)
    //------------------------------------------------------------------
    // Both inputs enter the divider with the leading one at bit 23, keeping
    // the significand ratio in [0.5, 2) for normal and subnormal operands.
    wire [25:0] mant_a_subnormal = {3'b000, frac_a} << norm_shift_a;
    wire [25:0] mant_b_subnormal = {3'b000, frac_b} << norm_shift_b;
    wire [25:0] mant_a_val = a_is_subnormal ? mant_a_subnormal : {2'b01, frac_a};
    wire [25:0] mant_b_val = b_is_subnormal ? mant_b_subnormal : {2'b01, frac_b};

    //------------------------------------------------------------------
    // 28-Stage Restoring Array Divider
    //------------------------------------------------------------------
    // q_int = (mant_a >= mant_b) — integer bit detection
    // Stage 0: no left shift, rem_1 = q_int ? (rem_0 - mant_b) : rem_0
    // Stages 1-27: q_k = (2*rem >= mant_b), rem = q_k ? (2*rem - mant_b) : 2*rem

    wire [28:0] mant_b_padded = {3'b0, mant_b_val};
    wire        q_int         = (mant_a_val >= mant_b_val);

    // Stage 0: integer bit extraction (no left shift)
    wire [28:0] rem_0 = {3'b0, mant_a_val};
    wire [28:0] rem_1 = q_int ? (rem_0 - mant_b_padded) : rem_0;
    wire        q_0   = q_int;

    // Stage 1
    wire        q_1   = ({rem_1[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_2 = q_1 ? ({rem_1[27:0], 1'b0} - mant_b_padded)
                            : ({rem_1[27:0], 1'b0});

    // Stage 2
    wire        q_2   = ({rem_2[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_3 = q_2 ? ({rem_2[27:0], 1'b0} - mant_b_padded)
                            : ({rem_2[27:0], 1'b0});

    // Stage 3
    wire        q_3   = ({rem_3[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_4 = q_3 ? ({rem_3[27:0], 1'b0} - mant_b_padded)
                            : ({rem_3[27:0], 1'b0});

    // Stage 4
    wire        q_4   = ({rem_4[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_5 = q_4 ? ({rem_4[27:0], 1'b0} - mant_b_padded)
                            : ({rem_4[27:0], 1'b0});

    // Stage 5
    wire        q_5   = ({rem_5[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_6 = q_5 ? ({rem_5[27:0], 1'b0} - mant_b_padded)
                            : ({rem_5[27:0], 1'b0});

    // Stage 6
    wire        q_6   = ({rem_6[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_7 = q_6 ? ({rem_6[27:0], 1'b0} - mant_b_padded)
                            : ({rem_6[27:0], 1'b0});

    // Stage 7
    wire        q_7   = ({rem_7[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_8 = q_7 ? ({rem_7[27:0], 1'b0} - mant_b_padded)
                            : ({rem_7[27:0], 1'b0});

    // Stage 8
    wire        q_8   = ({rem_8[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_9 = q_8 ? ({rem_8[27:0], 1'b0} - mant_b_padded)
                            : ({rem_8[27:0], 1'b0});

    // Stage 9
    wire        q_9   = ({rem_9[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_10 = q_9 ? ({rem_9[27:0], 1'b0} - mant_b_padded)
                             : ({rem_9[27:0], 1'b0});

    // Stage 10
    wire        q_10   = ({rem_10[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_11 = q_10 ? ({rem_10[27:0], 1'b0} - mant_b_padded)
                              : ({rem_10[27:0], 1'b0});

    // Stage 11
    wire        q_11   = ({rem_11[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_12 = q_11 ? ({rem_11[27:0], 1'b0} - mant_b_padded)
                              : ({rem_11[27:0], 1'b0});

    // Stage 12
    wire        q_12   = ({rem_12[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_13 = q_12 ? ({rem_12[27:0], 1'b0} - mant_b_padded)
                              : ({rem_12[27:0], 1'b0});

    // Stage 13
    wire        q_13   = ({rem_13[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_14 = q_13 ? ({rem_13[27:0], 1'b0} - mant_b_padded)
                              : ({rem_13[27:0], 1'b0});

    // Stage 14
    wire        q_14   = ({rem_14[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_15 = q_14 ? ({rem_14[27:0], 1'b0} - mant_b_padded)
                              : ({rem_14[27:0], 1'b0});

    // Stage 15
    wire        q_15   = ({rem_15[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_16 = q_15 ? ({rem_15[27:0], 1'b0} - mant_b_padded)
                              : ({rem_15[27:0], 1'b0});

    // Stage 16
    wire        q_16   = ({rem_16[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_17 = q_16 ? ({rem_16[27:0], 1'b0} - mant_b_padded)
                              : ({rem_16[27:0], 1'b0});

    // Stage 17
    wire        q_17   = ({rem_17[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_18 = q_17 ? ({rem_17[27:0], 1'b0} - mant_b_padded)
                              : ({rem_17[27:0], 1'b0});

    // Stage 18
    wire        q_18   = ({rem_18[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_19 = q_18 ? ({rem_18[27:0], 1'b0} - mant_b_padded)
                              : ({rem_18[27:0], 1'b0});

    // Stage 19
    wire        q_19   = ({rem_19[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_20 = q_19 ? ({rem_19[27:0], 1'b0} - mant_b_padded)
                              : ({rem_19[27:0], 1'b0});

    // Stage 20
    wire        q_20   = ({rem_20[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_21 = q_20 ? ({rem_20[27:0], 1'b0} - mant_b_padded)
                              : ({rem_20[27:0], 1'b0});

    // Stage 21
    wire        q_21   = ({rem_21[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_22 = q_21 ? ({rem_21[27:0], 1'b0} - mant_b_padded)
                              : ({rem_21[27:0], 1'b0});

    // Stage 22
    wire        q_22   = ({rem_22[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_23 = q_22 ? ({rem_22[27:0], 1'b0} - mant_b_padded)
                              : ({rem_22[27:0], 1'b0});

    // Stage 23
    wire        q_23   = ({rem_23[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_24 = q_23 ? ({rem_23[27:0], 1'b0} - mant_b_padded)
                              : ({rem_23[27:0], 1'b0});

    // Stage 24
    wire        q_24   = ({rem_24[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_25 = q_24 ? ({rem_24[27:0], 1'b0} - mant_b_padded)
                              : ({rem_24[27:0], 1'b0});

    // Stage 25
    wire        q_25   = ({rem_25[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_26 = q_25 ? ({rem_25[27:0], 1'b0} - mant_b_padded)
                              : ({rem_25[27:0], 1'b0});

    // Stage 26 (Guard bit)
    wire        q_26   = ({rem_26[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_27 = q_26 ? ({rem_26[27:0], 1'b0} - mant_b_padded)
                              : ({rem_26[27:0], 1'b0});

    // Stage 27 (Round bit)
    wire        q_27   = ({rem_27[27:0], 1'b0} >= mant_b_padded);
    wire [28:0] rem_28 = q_27 ? ({rem_27[27:0], 1'b0} - mant_b_padded)
                              : ({rem_27[27:0], 1'b0});

    // Final remainder with restoration if negative
    wire [28:0] rem_final = rem_28[28] ? (rem_28 + mant_b_padded) : rem_28;
    wire        sticky_rem = |rem_final[27:0];  // OR of all remainder bits

    // Collect 28 quotient bits: q_bits[27] = stage 0 (MSB), ..., q_bits[0] = stage 27 (LSB)
    wire [27:0] q_bits;
    assign q_bits[27] = q_0;
    assign q_bits[26] = q_1;
    assign q_bits[25] = q_2;
    assign q_bits[24] = q_3;
    assign q_bits[23] = q_4;
    assign q_bits[22] = q_5;
    assign q_bits[21] = q_6;
    assign q_bits[20] = q_7;
    assign q_bits[19] = q_8;
    assign q_bits[18] = q_9;
    assign q_bits[17] = q_10;
    assign q_bits[16] = q_11;
    assign q_bits[15] = q_12;
    assign q_bits[14] = q_13;
    assign q_bits[13] = q_14;
    assign q_bits[12] = q_15;
    assign q_bits[11] = q_16;
    assign q_bits[10] = q_17;
    assign q_bits[9]  = q_18;
    assign q_bits[8]  = q_19;
    assign q_bits[7]  = q_20;
    assign q_bits[6]  = q_21;
    assign q_bits[5]  = q_22;
    assign q_bits[4]  = q_23;
    assign q_bits[3]  = q_24;
    assign q_bits[2]  = q_25;
    assign q_bits[1]  = q_26;
    assign q_bits[0]  = q_27;

    //------------------------------------------------------------------
    // Normalization
    //------------------------------------------------------------------
    // The non-restoring array computes (mant_a << 28) / mant_b producing 28
    // quotient bits q_bits[27:0] that represent the fractional part of the
    // result (bits [27:0] of the 29-bit full quotient).
    //
    // If mant_a ≥ mant_b: quotient ∈ [1, 2). The full quotient has bit 28=1,
    // and q_bits[27:0] is the fractional part. No normalization shift needed.
    //
    // If mant_a < mant_b: quotient ∈ [0.5, 1). We need a left shift by 1 to
    // normalize into [1, 2). The exponent is decremented by 1 to compensate.
    //
    //   No shift (mant_a ≥ mant_b, q_0=1):
    //     mantissa[22:0] = q_bits[26:4]  (23 bits, skip q_0)
    //     G = q_bits[3], R = q_bits[2], S = |q_bits[1:0]| | sticky_rem
    //
    //   Shift left by 1 (mant_a < mant_b, q_0=0):
    //     normalized fraction starts at original quotient bit q_2
    //     mantissa[22:0] = q_bits[25:3]
    //     G = q_bits[2], R = q_bits[1], S = q_bits[0] | sticky_rem

    wire mant_a_ge_mant_b = (mant_a_val >= mant_b_val);
    wire shift_needed = ~mant_a_ge_mant_b;

    // Extracted mantissa candidates
    wire [22:0] mant_noshift = q_bits[26:4];   // 23 bits: q[26..4] (skip integer bit q[27])
    wire [22:0] mant_shifted = q_bits[25:3];   // 23 bits: quotient q_2..q_24
    wire [22:0] mant_norm    = shift_needed ? mant_shifted : mant_noshift;

    // Guard, Round, Sticky bits
    wire G_noshift  = q_bits[3];
    wire G_shifted  = q_bits[2];
    wire G          = shift_needed ? G_shifted : G_noshift;

    wire R_noshift  = q_bits[2];
    wire R_shifted  = q_bits[1];
    wire R          = shift_needed ? R_shifted : R_noshift;

    wire S_q_noshift = |q_bits[1:0];
    wire S_q_shifted = q_bits[0];
    wire S_q         = shift_needed ? S_q_shifted : S_q_noshift;

    wire S = S_q | sticky_rem;

    // Adjust exponent for normalization shift
    wire [8:0] adj_for_shift = shift_needed ? 9'd1 : 9'd0;
    wire signed [11:0] result_exp_pre =
        result_exp_raw - $signed({3'b000, adj_for_shift});

    //------------------------------------------------------------------
    // RNE Rounding
    //------------------------------------------------------------------
    wire L = mant_norm[0];  // LSB of the 23-bit mantissa before rounding
    wire round_increment = G & (R | S | L);

    // Apply rounding: 24-bit mantissa (1 integer + 23 fraction) + increment
    wire [24:0] mant_rounded = {1'b0, 1'b1, mant_norm} +
                               {24'b0, round_increment};

    wire round_carry = mant_rounded[24];

    // Final mantissa (23-bit fraction)
    wire [22:0] final_mant = round_carry ? mant_rounded[23:1] : mant_rounded[22:0];

    // Adjust exponent for rounding carry
    wire signed [11:0] final_exp_signed =
        result_exp_pre + (round_carry ? 12'sd1 : 12'sd0);

    //------------------------------------------------------------------
    // Post-Rounding Renormalization (overflow to infinity detection)
    //------------------------------------------------------------------
    wire exp_overflow = (final_exp_signed > 12'sd254);
    wire exp_underflow = (final_exp_signed < 12'sd1);

    //------------------------------------------------------------------
    // Final Result Assembly (normal case)
    //------------------------------------------------------------------
    wire [7:0] calc_exp_final  = exp_overflow        ? 8'd255 :
                                 exp_underflow        ? 8'd0   : final_exp_signed[7:0];
    wire [22:0] calc_mant_final = (exp_overflow | exp_underflow) ? 23'd0 : final_mant;
    wire [31:0] calc_result = {calc_sign, calc_exp_final, calc_mant_final};

    //------------------------------------------------------------------
    // Exception Flags (normal case)
    //------------------------------------------------------------------
    wire calc_overflow  = exp_overflow;
    wire calc_underflow = exp_underflow;
    wire calc_inexact   = (G | R | S) | exp_overflow;

    //==========================================================================
    // Output MUX: Special vs. Normal
    //==========================================================================
    wire [31:0] result_comb;
    wire        overflow_comb;
    wire        underflow_comb;
    wire        div_by_zero_comb;
    wire        invalid_comb;
    wire        inexact_comb;

    assign result_comb       = is_special ? special_result    : calc_result;
    assign overflow_comb     = is_special ? 1'b0             : calc_overflow;
    assign underflow_comb    = is_special ? 1'b0             : calc_underflow;
    assign div_by_zero_comb  = is_special ? special_div_by_zero : 1'b0;
    assign invalid_comb      = is_special ? special_invalid  : 1'b0;
    assign inexact_comb      = is_special ? 1'b0             : calc_inexact;

    //==========================================================================
    // Output Registers
    //==========================================================================
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            result          <= 32'b0;
            valid           <= 1'b0;
            overflow        <= 1'b0;
            underflow       <= 1'b0;
            division_by_zero <= 1'b0;
            invalid         <= 1'b0;
            inexact         <= 1'b0;
        end else begin
            result          <= result_comb;
            valid           <= start_reg;
            overflow        <= overflow_comb;
            underflow       <= underflow_comb;
            division_by_zero <= div_by_zero_comb;
            invalid         <= invalid_comb;
            inexact         <= inexact_comb;
        end
    end

endmodule
