import mongoose from 'mongoose';
import { createAutonomyMandateMethods } from '@librechat/data-schemas';
import type { AutonomyMandate, AutonomyMandateMethods } from '@librechat/data-schemas';
import type { ToolApprovalHook, ToolApprovalHookContext } from './hooks';

export interface MandateAuthorizationEvidence {
  mandateId: string;
  version?: number;
  decision: 'allow' | 'deny';
  reasonCode: string;
  capability: string;
  userId?: string;
  tenantId?: string;
  conversationId?: string;
  runId: string;
  executingAgentId?: string;
  toolUseId: string;
}

/** Uncached primary read on every effect; the closure retains only the selector and identity. */
export function createMandateApprovalHook(
  context: ToolApprovalHookContext & { autonomyMandateId: string },
  dependencies: {
    read?: AutonomyMandateMethods['getAutonomyMandate'];
    now?: () => number;
    observe?: (evidence: Readonly<MandateAuthorizationEvidence>) => void;
  } = {},
): ToolApprovalHook {
  const { userId, tenantId, conversationId, autonomyMandateId: mandateId } = context;
  const read = dependencies.read ?? createAutonomyMandateMethods(mongoose).getAutonomyMandate;
  return async (input) => {
    let mandate: AutonomyMandate | null = null;
    if (userId && conversationId && mandateId)
      mandate = await read({ userId, tenantId }, mandateId);
    const revision = mandate?.revisions[mandate.revisions.length - 1];
    const now = (dependencies.now ?? Date.now)();
    let reasonCode = 'missing';
    if (mandate && revision) {
      reasonCode = 'allowed';
      if (
        !Number.isSafeInteger(mandate.version) ||
        mandate.version < 1 ||
        revision.version !== mandate.version ||
        mandate.revisions.length !== mandate.version
      )
        reasonCode = 'invalid_revision';
      else if (
        mandate._id !== mandateId ||
        mandate.userId !== userId ||
        mandate.tenantId !== tenantId ||
        mandate.conversationId !== conversationId ||
        input.threadId !== conversationId ||
        mandate.actorId !== input.executingAgentId
      )
        reasonCode = 'scope_mismatch';
      else if (revision.status !== 'active') reasonCode = 'revoked';
      else if (
        !Number.isFinite(revision.validFrom?.getTime()) ||
        !Number.isFinite(revision.expiresAt?.getTime()) ||
        revision.expiresAt <= revision.validFrom
      )
        reasonCode = 'invalid_validity';
      else if (now < revision.validFrom.getTime()) reasonCode = 'not_started';
      else if (now >= revision.expiresAt.getTime()) reasonCode = 'expired';
      else if (revision.deniedCapabilities.includes(input.toolName)) reasonCode = 'explicit_deny';
      else if (!revision.allowedCapabilities.includes(input.toolName))
        reasonCode = 'capability_not_allowed';
    }
    const evidence: MandateAuthorizationEvidence = {
      mandateId,
      ...(revision && { version: revision.version }),
      decision: reasonCode === 'allowed' ? 'allow' : 'deny',
      reasonCode,
      capability: input.toolName,
      userId,
      tenantId,
      conversationId,
      runId: input.runId,
      executingAgentId: input.executingAgentId,
      toolUseId: input.toolUseId,
    };
    dependencies.observe?.(Object.freeze(evidence));
    return { decision: evidence.decision, reason: JSON.stringify(evidence) };
  };
}
