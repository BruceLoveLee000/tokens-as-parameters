"""Reference model for IEEE 754 binary32 浮点除法器 (fdiv).

由 run_case.py 在创建 workspace 时自动复制到 workspace/docs/reference_model.py，
被 composite_tools/reference_check.py 加载使用。

约定：
- INTERFACE 描述 RTL 端口
- golden_vectors() 返回 list[{inputs: dict, expected: dict}]
- 所有 int 都是 bitwise（IEEE 754 单精度的 32-bit 表示）

注意端口名要与 RTL 实际端口名匹配。本文件假设 RTL 用：
  clk, rst_n, a, b, start, result, valid (+ 可选 overflow/underflow/...)
"""
from __future__ import annotations
import struct
import math


INTERFACE = {
    "module_name": "fdiv",
    "clk": "clk",
    "rst_n": "rst_n",
    "start_signal": "start",
    "valid_signal": "valid",
    "inputs": [
        {"name": "a", "width": 32},
        {"name": "b", "width": 32},
    ],
    "outputs": [
        {"name": "result", "width": 32},
    ],
}


def _f2b(x: float) -> int:
    """float → 32-bit IEEE 754 binary representation."""
    return struct.unpack("I", struct.pack("f", x))[0]


def _b2f(b: int) -> float:
    """32-bit binary → float."""
    return struct.unpack("f", struct.pack("I", b))[0]


def golden_vectors() -> list[dict]:
    """返回 fdiv 的 golden test vectors. 至少包含:
    - 简单整数除法（验证基本算路）
    - 边界 case
    - 特殊值（NaN, Inf, Zero, 符号组合）
    """
    cases = []

    # ── Group 1: 基本浮点除法 ──
    basic = [
        (1.0, 2.0),       # 0.5
        (8.0, 2.0),       # 4.0
        (1.0, 4.0),       # 0.25
        (3.0, 1.0),       # 3.0
        (-1.0, 2.0),      # -0.5
        (1.0, -2.0),      # -0.5
        (-1.0, -2.0),     # 0.5
        (10.0, 4.0),      # 2.5
        (7.0, 2.0),       # 3.5
    ]
    for a, b in basic:
        cases.append({
            "inputs": {"a": _f2b(a), "b": _f2b(b)},
            "expected": {"result": _f2b(a / b)},
        })

    # ── Group 2: 0 除非零 ──
    cases.append({
        "inputs": {"a": _f2b(0.0), "b": _f2b(2.0)},
        "expected": {"result": _f2b(0.0)},
    })
    cases.append({
        "inputs": {"a": _f2b(-0.0), "b": _f2b(2.0)},
        "expected": {"result": _f2b(-0.0)},
    })

    # ── Group 3: 非零除 0 → +Inf / -Inf ──
    cases.append({
        "inputs": {"a": _f2b(1.0), "b": _f2b(0.0)},
        "expected": {"result": _f2b(float("inf"))},
    })
    cases.append({
        "inputs": {"a": _f2b(-1.0), "b": _f2b(0.0)},
        "expected": {"result": _f2b(float("-inf"))},
    })

    # ── Group 4: Inf / 有限数 → ±Inf ──
    cases.append({
        "inputs": {"a": _f2b(float("inf")), "b": _f2b(2.0)},
        "expected": {"result": _f2b(float("inf"))},
    })
    cases.append({
        "inputs": {"a": _f2b(float("-inf")), "b": _f2b(2.0)},
        "expected": {"result": _f2b(float("-inf"))},
    })

    # ── Group 5: 有限数 / Inf → ±0 ──
    cases.append({
        "inputs": {"a": _f2b(1.0), "b": _f2b(float("inf"))},
        "expected": {"result": _f2b(0.0)},
    })

    return cases


# ──── 自检：模块 import 时确保 vectors 至少非空 ────
_test_vectors = golden_vectors()
assert len(_test_vectors) > 0, "golden_vectors() must return non-empty"
