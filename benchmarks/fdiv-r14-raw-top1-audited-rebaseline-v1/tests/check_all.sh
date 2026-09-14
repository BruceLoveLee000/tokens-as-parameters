#!/bin/sh
set -eu

case_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
(cd "$case_root/formal" && lake env lean ../tests/FixedRegression.lean)
python3 "$case_root/tests/check_rtl_oracle.py" --random "${1:-2000}"
