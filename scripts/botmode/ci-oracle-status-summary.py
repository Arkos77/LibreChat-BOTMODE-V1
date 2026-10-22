#!/usr/bin/env python3
"""Read-only Oracle shape diagnostics. Never emit candidates, IDs or arbitrary fields."""
import json
import sys

STATUSES = {'VERIFIED', 'REJECTED', 'UNKNOWN', 'HUMAN_REVIEW'}
REASONS = {
    'INVALID_CONTRACT', 'VALIDATOR_NOT_INDEPENDENT', 'CRITERIA_MISSING',
    'CONTRADICTORY_EVIDENCE', 'CANDIDATE_MISSING', 'INVALID_CANDIDATE',
    'CRITERION_MET', 'CRITERION_FAILED', 'INDEPENDENT_EVIDENCE_MISSING',
    'HUMAN_REVIEW_REQUIRED',
}
STAGES = {'worker', 'specialist', 'specialist_1', 'specialist_2', 'specialist_3', 'specialist_4'}


def reject_constant(_):
    raise ValueError('Non-finite JSON constant')


def candidate_shape(value):
    if value is None or (isinstance(value, str) and not value.strip()):
        return {'kind': 'MISSING'}
    if not isinstance(value, str):
        return {'kind': 'NON_STRING'}
    shape = {'length': min(len(value), 1_000_000), 'markdownFence': value.lstrip().startswith('```')}
    if len(value) > 100_000:
        return {**shape, 'kind': 'TOO_LARGE'}
    try:
        parsed = json.loads(value, parse_constant=reject_constant)
    except (ValueError, RecursionError):
        return {**shape, 'kind': 'INVALID_JSON'}
    if not isinstance(parsed, dict):
        return {**shape, 'kind': 'JSON_NON_OBJECT'}
    return {**shape, 'kind': 'JSON_OBJECT', 'fieldCount': len(parsed),
            'okPresent': 'ok' in parsed, 'okExactlyTrue': parsed.get('ok') is True}


def summarize(plan, state):
    tasks = plan.get('tasks', []) if isinstance(plan, dict) else []
    results = state.get('results', {}) if isinstance(state, dict) else {}
    if not isinstance(tasks, list) or not isinstance(results, dict):
        return {'kind': 'INVALID_STATE_SHAPE', 'stages': []}
    stages = []
    for task in tasks[:16]:
        if not isinstance(task, dict):
            continue
        result = results.get(task.get('taskId'))
        verdicts = result.get('verdicts', []) if isinstance(result, dict) else []
        if not isinstance(verdicts, list):
            verdicts = []
        rows = []
        for verdict in verdicts[:8]:
            if not isinstance(verdict, dict):
                continue
            inputs = verdict.get('input', {})
            reasons = verdict.get('reasons', [])
            if not isinstance(reasons, list):
                reasons = []
            rows.append({
                'status': verdict.get('status') if verdict.get('status') in STATUSES else 'OTHER',
                'reasonCodes': [r.get('code') if r.get('code') in REASONS else 'OTHER'
                                for r in reasons[:16] if isinstance(r, dict)],
                'candidate': candidate_shape(inputs.get('candidate') if isinstance(inputs, dict) else None),
            })
        stages.append({'stage': task.get('key') if task.get('key') in STAGES else 'OTHER',
                       'verdictCount': len(verdicts), 'verdicts': rows})
    return {'kind': 'ORACLE_STATUS_SUMMARY', 'stages': stages}


if __name__ == '__main__':
    data = json.load(sys.stdin)
    print(json.dumps(summarize(data.get('plan'), data.get('state')), separators=(',', ':')))
