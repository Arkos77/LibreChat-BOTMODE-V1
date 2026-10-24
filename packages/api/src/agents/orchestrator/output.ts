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
  const researchValidation = { ...admitted.validation, outputContract: 'research-v1' as const };
  if (admitted.objectives == null && admitted.requiredCapabilities.includes('web_search')) {
    admitted.validation = researchValidation;
  }
  admitted.objectives = admitted.objectives?.map((objective) =>
    objective.requiredCapabilities.includes('web_search')
      ? {
          ...objective,
          validation: {
            ...objective.validation,
            criteria: objective.validation?.criteria?.length
              ? objective.validation.criteria
              : admitted.validation!.criteria,
            outputContract: 'research-v1',
          },
        }
      : objective,
  );
  if (
    admitted.validation.outputContract === 'research-v1' ||
    admitted.objectives?.some((task) => task.validation?.outputContract === 'research-v1')
  ) {
    admitted.researchExecutionVersion = 1;
  }
  return admitted;
}
