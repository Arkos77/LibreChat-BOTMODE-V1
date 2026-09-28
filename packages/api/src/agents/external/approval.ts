/** A request-local proof for one human-approved IntelBase tool call. */
export interface IntelBaseApprovalRequest {
  actionId: string;
  submittedActionId: string;
  actionRequests: readonly {
    name: string;
    arguments: unknown;
    tool_call_id: string;
  }[];
  decisions: readonly { tool_call_id: string; decision: string; adultTargetConfirmed?: boolean }[];
  adultTargetConfirmed: boolean;
  userId: string;
  tenantId?: string;
  conversationId: string;
  agentId: string;
  purpose: string;
}

export interface IntelBaseApprovalInvocation {
  toolCallId: string;
  email: string;
  userId: string;
  tenantId?: string;
  conversationId: string;
  agentId: string;
  purpose: string;
}

export interface IntelBaseApprovalLease {
  consume(input: IntelBaseApprovalInvocation): { actionId: string; toolCallId: string } | null;
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function readEmail(raw: unknown): string | null {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const fields = Object.keys(parsed);
  if (fields.length !== 1 || fields[0] !== 'email') return null;
  const email = (parsed as Record<string, unknown>).email;
  return nonempty(email) && email.length <= 254 ? email : null;
}

/** Construct only from a trusted, validated pending action after its resume CAS succeeds. */
export function createIntelBaseApprovalLease(
  input: IntelBaseApprovalRequest,
): IntelBaseApprovalLease | null {
  if (
    !input ||
    !nonempty(input.actionId) ||
    input.submittedActionId !== input.actionId ||
    input.adultTargetConfirmed !== true ||
    !nonempty(input.userId) ||
    !nonempty(input.conversationId) ||
    !nonempty(input.agentId) ||
    !nonempty(input.purpose) ||
    (input.tenantId !== undefined && !nonempty(input.tenantId)) ||
    !Array.isArray(input.actionRequests) ||
    !Array.isArray(input.decisions)
  )
    return null;

  const lookups = input.actionRequests.filter((request) => request?.name === 'osint_email_enrich');
  if (lookups.length !== 1 || !nonempty(lookups[0].tool_call_id)) return null;
  const request = lookups[0];
  const email = readEmail(request.arguments);
  const matchingDecisions = input.decisions.filter(
    (decision) => decision?.tool_call_id === request.tool_call_id,
  );
  if (
    email === null ||
    matchingDecisions.length !== 1 ||
    matchingDecisions[0].decision !== 'approve' ||
    matchingDecisions[0].adultTargetConfirmed !== true
  ) {
    return null;
  }

  const { actionId, userId, tenantId, conversationId, agentId, purpose } = input;
  const toolCallId = request.tool_call_id;
  let consumed = false;
  return {
    consume(invocation) {
      if (
        consumed ||
        invocation?.toolCallId !== toolCallId ||
        invocation.email !== email ||
        invocation.userId !== userId ||
        invocation.tenantId !== tenantId ||
        invocation.conversationId !== conversationId ||
        invocation.agentId !== agentId ||
        invocation.purpose !== purpose
      )
        return null;
      consumed = true;
      return { actionId, toolCallId };
    },
  };
}
