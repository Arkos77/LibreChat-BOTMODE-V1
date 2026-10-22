const { describeContent } = require('./ci-http-json-observer.cjs');

function compareHttpOracle({ plan, state, records }) {
  const stages = [];
  const labels = ['worker', 'specialist_1', 'specialist_2', 'specialist_3', 'specialist_4'];
  for (const label of labels) {
    const task = plan?.tasks?.find((item) => item.key === label);
    if (!task) continue;
    const verdicts = state?.results?.[task.taskId]?.verdicts;
    if (!Array.isArray(verdicts)) continue;
    for (const verdict of verdicts.slice(0, 8)) {
      const candidate = verdict?.input?.candidate;
      if (typeof candidate !== 'string') {
        stages.push({ stage: label, boundary: 'CANDIDATE_UNOBSERVED' });
        continue;
      }
      const shape = describeContent(candidate);
      const matches = records.filter(
        (record) =>
          record.status === 200 &&
          record.response?.content?.sha256 === shape.sha256 &&
          !record.truncated &&
          !record.observationError,
      );
      let boundary = 'HTTP_TO_ORACLE_CHANGED_OR_UNOBSERVED';
      if (matches.length > 0) {
        boundary =
          shape.json === 'invalid'
            ? 'HTTP_RESPONSE_NOT_JSON'
            : shape.json !== 'object'
              ? 'HTTP_RESPONSE_NOT_OBJECT'
              : verdict.status === 'VERIFIED'
                ? 'VERIFIED_JSON_OBJECT'
                : 'ORACLE_REJECTED_JSON_OBJECT';
      }
      stages.push({
        stage: label,
        status: ['VERIFIED', 'REJECTED', 'UNKNOWN', 'HUMAN_REVIEW'].includes(verdict.status)
          ? verdict.status
          : 'OTHER',
        candidateLength: shape.length,
        candidateJson: shape.json,
        wireMatchCount: matches.length,
        uniqueWireMatch: matches.length === 1,
        jsonRequested:
          matches.length > 0 &&
          matches.every((record) => record.request?.jsonObjectRequested === true),
        supportRequired:
          matches.length > 0 &&
          matches.every((record) => record.request?.requireParameters === true),
        boundary,
      });
    }
  }
  return { kind: 'CI_HTTP_ORACLE_COMPARISON', observedRequests: records.length, stages };
}

module.exports = { compareHttpOracle };
if (require.main === module) {
  try {
    const raw = require('node:fs').readFileSync(0, 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > 2 * 1024 * 1024) throw new Error('BOUND');
    const input = JSON.parse(raw);
    if (!Array.isArray(input.records) || input.records.length > 128) throw new Error('RECORDS');
    console.log(JSON.stringify(compareHttpOracle(input)));
  } catch {
    console.log('CI_HTTP_ORACLE_COMPARISON=UNAVAILABLE');
    process.exitCode = 2;
  }
}
