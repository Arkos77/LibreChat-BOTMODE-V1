import type { Mission } from './types';

/** Host admission owns this policy; callers cannot replace it with a completion flag. */
export function prepareBotModeMission(mission: Mission): Mission {
  const admitted = structuredClone(mission);
  const criteria = admitted.validation?.criteria ?? [];
  const completion = { id: 'botmode:completed', field: 'ok', expected: true };
  const hasCompletion = criteria.some(
    (criterion) =>
      criterion.field === completion.field && criterion.expected === completion.expected,
  );
  admitted.validation = {
    ...admitted.validation,
    criteria: hasCompletion ? criteria : [...criteria, completion],
    outputContract: 'result-v1',
  };
  return admitted;
}
