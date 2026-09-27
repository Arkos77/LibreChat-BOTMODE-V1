import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { dataService } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type Review = Awaited<ReturnType<typeof dataService.getSkillImprovementReview>>;

/** The server alone supplies the exact diff and decides whether it is publishable. */
export default function SkillImprovementReview() {
  const localize = useLocalize();
  const { candidateId } = useParams();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [error, setError] = useState('');
  const query = useQuery<Review>(
    ['skill-improvement-review', candidateId],
    () => dataService.getSkillImprovementReview(candidateId ?? ''),
    { enabled: !!candidateId },
  );
  const review = query.data;

  async function decide(decision: 'approve' | 'reject') {
    if (!review || !candidateId) return;
    setBusy(true);
    setError('');
    try {
      const result = await dataService.decideSkillImprovementReview(candidateId, {
        decision,
        payloadDigest: review.payloadDigest,
        snapshotDigest: review.snapshotDigest,
      });
      setOutcome(result.status);
      await query.refetch();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : localize('com_ui_skill_improvement_decision_error'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-full overflow-y-auto bg-presentation p-6 text-text-primary">
      <div className="mx-auto max-w-4xl space-y-5">
        <h1 className="text-xl font-semibold">{localize('com_ui_skill_improvement_review')}</h1>
        {query.isLoading && <p>{localize('com_ui_skill_improvement_loading')}</p>}
        {query.isError && <p role="alert">{localize('com_ui_skill_improvement_unavailable')}</p>}
        {review && (
          <>
            <p>
              {localize('com_ui_skill_improvement_skill')}{' '}
              <Link className="underline" to={`/skills/${encodeURIComponent(review.skillId)}`}>
                {review.skillId}
              </Link>{' '}
              · {localize('com_ui_skill_improvement_version')} {review.expectedVersion}
            </p>
            <p>
              {localize('com_ui_skill_improvement_quality')} <strong>{review.quality}</strong>
            </p>
            <p className="break-all text-xs">
              {localize('com_ui_skill_improvement_digest')} {review.payloadDigest}
            </p>
            <p className="break-all text-xs">
              {localize('com_ui_skill_improvement_snapshot')} {review.snapshotDigest}
            </p>
            <div>
              <h2 className="mb-2 font-semibold">{localize('com_ui_skill_improvement_diff')}</h2>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-border-medium bg-surface-secondary p-4 text-sm">
                {review.diff}
              </pre>
            </div>
            <ul className="list-disc pl-5">
              {review.checks.map((check) => (
                <li key={check.id}>
                  {check.id} :{' '}
                  {check.passed
                    ? localize('com_ui_skill_improvement_passed')
                    : localize('com_ui_skill_improvement_failed')}
                </li>
              ))}
            </ul>
            {review.reviewed && <p>{localize('com_ui_skill_improvement_reviewed')}</p>}
            {outcome && (
              <p role="status">
                {localize('com_ui_skill_improvement_result')} {outcome}
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            {!review.reviewed && (
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={busy || review.quality !== 'VERIFIED'}
                  onClick={() => void decide('approve')}
                  className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
                >
                  {localize('com_ui_skill_improvement_approve')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide('reject')}
                  className="rounded border border-border-medium px-4 py-2"
                >
                  {localize('com_ui_skill_improvement_reject')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
