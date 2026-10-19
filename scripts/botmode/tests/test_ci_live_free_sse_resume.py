#!/usr/bin/env python3
"""Static safety regression checks for the manual free-provider SSE probe."""
import ast
from pathlib import Path

source = Path(__file__).resolve().parents[1] / 'ci-live-free-child-oracle-gate.py'
raw = source.read_text()
module = ast.parse(raw)
functions = [n for n in module.body if isinstance(n, ast.FunctionDef) and n.name == 'read_terminal_stream']
assert len(functions) == 1
reader = ast.get_source_segment(raw, functions[0])
assert 'deadline = started + 210' in reader
assert 'retries >= 2' in reader
assert 'while time.monotonic() < deadline:' in reader
assert 'timeout = max(1, min(75, deadline - time.monotonic()))' in reader
assert 'SSE_IDLE_TOTAL_DEADLINE' in reader
assert 'SSE_TOTAL_DEADLINE' in reader
assert 'TERMINAL_FRAME' in reader
assert 'method="GET"' in reader
assert 'POST' not in reader.replace('Never repeat POST', '')
assert reader.count('urlopen(req, timeout=timeout)') == 1
assert 'raise SystemExit("CI_LIVE_FREE_FAIL=" + failure)' in raw
assert 'CI_LIVE_FREE_ORACLE_VERIFIED_AND_PUBLISHED=PASS' in raw
compile(raw, str(source), 'exec')
print('CI_FREE_SSE_RESUME_STATIC_GUARD=PASS')
