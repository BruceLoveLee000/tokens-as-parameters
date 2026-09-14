#!/usr/bin/env python3
"""Differential result-bit check for the fixed May array28 RNE/FTZ profile."""

from __future__ import annotations

import argparse
import math
import random
import struct
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RTL = ROOT / "rtl" / "fdiv.v"
TB = ROOT / "tests" / "fdiv_oracle_tb.v"

SPECIAL_EXPECTED: dict[tuple[int, int], tuple[int, tuple[int, int, int, int, int]]] = {
    (0x7F800000, 0x00000000): (0x7F800000, (0, 0, 0, 0, 0)),
    (0x7FC12345, 0x3F800000): (0x7FC12345, (0, 0, 0, 0, 0)),
    (0x7F812345, 0x3F800000): (0x7FC12345, (0, 0, 0, 1, 0)),
}


def bits_to_float(value: int) -> float:
    return struct.unpack(">f", value.to_bytes(4, "big"))[0]


def float_to_bits(value: float) -> int:
    try:
        return int.from_bytes(struct.pack(">f", value), "big")
    except OverflowError:
        return 0xFF800000 if math.copysign(1.0, value) < 0 else 0x7F800000


def ftz(value: int) -> int:
    exponent = (value >> 23) & 0xFF
    fraction = value & 0x7FFFFF
    return value & 0x80000000 if exponent == 0 and fraction != 0 else value


def oracle(a: int, b: int) -> int:
    return ftz(float_to_bits(bits_to_float(a) / bits_to_float(b)))


def finite_nonzero(value: int) -> bool:
    return ((value >> 23) & 0xFF) != 0xFF and (value & 0x7FFFFFFF) != 0


def build_vectors(random_count: int) -> list[tuple[int, int]]:
    directed = [
        (0x3F800000, 0x40400000),  # 1/3
        (0x3F800000, 0x40A00000),  # 1/5
        (0x00000001, 0x00400000),  # subnormal/subnormal -> normal
        (0x00400000, 0x00000001),
        (0x007FFFFF, 0x00000001),
        (0x00800000, 0x007FFFFF),  # normal/subnormal boundary
        (0x007FFFFF, 0x00800000),
        (0x0008F4D8, 0xB7897257),  # discovered subnormal/normal rounding boundary
        (0x3F800000, 0x00000001),  # overflow
        (0x00000001, 0x3F800000),  # FTZ underflow
        (0x80800000, 0x007FFFFF),  # signed boundary
        *SPECIAL_EXPECTED.keys(),
    ]
    rng = random.Random(0xA228FD1)
    vectors = list(directed)
    while len(vectors) < len(directed) + random_count:
        mode = rng.randrange(4)
        if mode == 0:
            a = rng.randrange(1, 0x00800000)
            b = rng.randrange(1, 0x00800000)
        elif mode == 1:
            a = rng.randrange(1, 0x00800000)
            b = rng.getrandbits(32)
        elif mode == 2:
            a = rng.getrandbits(32)
            b = rng.randrange(1, 0x00800000)
        else:
            a = rng.getrandbits(32)
            b = rng.getrandbits(32)
        if finite_nonzero(a) and finite_nonzero(b):
            vectors.append((a, b))
    return vectors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--random", type=int, default=2000)
    args = parser.parse_args()
    vectors = build_vectors(args.random)
    with tempfile.TemporaryDirectory(prefix="spec-refine-fdiv-") as directory:
        temp = Path(directory)
        vector_file = temp / "vectors.txt"
        executable = temp / "fdiv-oracle.vvp"
        vector_file.write_text("".join(f"{a:08x} {b:08x}\n" for a, b in vectors))
        subprocess.run([
            "iverilog", "-g2012", "-s", "fdiv_oracle_tb", "-o", str(executable),
            str(RTL), str(TB),
        ], check=True)
        completed = subprocess.run(
            ["vvp", str(executable), f"+VECTORS={vector_file}"],
            check=True, text=True, capture_output=True,
        )
    actual: dict[tuple[int, int], tuple[int, tuple[int, int, int, int, int]]] = {}
    for line in completed.stdout.splitlines():
        fields = line.split()
        if fields[:1] == ["RESULT"]:
            actual[(int(fields[1], 16), int(fields[2], 16))] = (
                int(fields[3], 16), tuple(int(value) for value in fields[4:9])
            )
    failures = []
    for a, b in vectors:
        got = actual.get((a, b))
        if (a, b) in SPECIAL_EXPECTED:
            expected = SPECIAL_EXPECTED[(a, b)]
            if got != expected:
                failures.append((a, b, got, expected))
        else:
            expected_result = oracle(a, b)
            if got is None or got[0] != expected_result:
                failures.append((a, b, got, (expected_result, None)))
    if failures:
        for a, b, got, expected in failures[:20]:
            print(f"FAIL a=0x{a:08X} b=0x{b:08X} rtl={got!s} expected={expected!s}")
        print(f"{len(failures)}/{len(vectors)} mismatches")
        return 1
    print(f"PASS {len(vectors)} RTL results match the independent float32 oracle under FTZ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
