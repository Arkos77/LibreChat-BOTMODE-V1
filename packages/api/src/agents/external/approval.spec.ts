import { createIntelBaseApprovalLease } from './approval';

const email = 'third.party@example.test';
const base = {
  actionId: 'action-1',
  submittedActionId: 'action-1',
  actionRequests: [{ name: 'osint_email_enrich', arguments: { email }, tool_call_id: 'call-1' }],
  decisions: [{ tool_call_id: 'call-1', decision: 'approve', adultTargetConfirmed: true }],
  adultTargetConfirmed: true,
  userId: 'owner-1',
  tenantId: 'tenant-1',
  conversationId: 'thread-1',
  agentId: 'agent-1',
  purpose: 'authorized-investigation',
};
const invocation = {
  toolCallId: 'call-1',
  email,
  userId: 'owner-1',
  tenantId: 'tenant-1',
  conversationId: 'thread-1',
  agentId: 'agent-1',
  purpose: 'authorized-investigation',
};

describe('IntelBase exact approval lease', () => {
  it('consumes once for the exact native tool call and authenticated scope', () => {
    const lease = createIntelBaseApprovalLease(base);
    expect(lease?.consume(invocation)).toEqual({ actionId: 'action-1', toolCallId: 'call-1' });
    expect(lease?.consume(invocation)).toBeNull();
  });

  it.each([
    { submittedActionId: 'stale' },
    { adultTargetConfirmed: false },
    { decisions: [{ tool_call_id: 'call-1', decision: 'approve' }] },
    { decisions: [{ tool_call_id: 'call-1', decision: 'edit', editedArguments: { email } }] },
    { decisions: [{ tool_call_id: 'call-1', decision: 'reject' }] },
    { decisions: [{ tool_call_id: 'other', decision: 'approve' }] },
    { actionRequests: [{ name: 'other_tool', arguments: { email }, tool_call_id: 'call-1' }] },
    {
      actionRequests: [
        { name: 'osint_email_enrich', arguments: { email, extra: true }, tool_call_id: 'call-1' },
      ],
    },
    {
      actionRequests: [
        { name: 'osint_email_enrich', arguments: { email }, tool_call_id: 'call-1' },
        { name: 'osint_email_enrich', arguments: { email }, tool_call_id: 'call-2' },
      ],
    },
  ])('does not mint a lease for invalid approval %#', (change) => {
    expect(createIntelBaseApprovalLease({ ...base, ...change })).toBeNull();
  });

  it('binds all scope fields and the exact email without consuming on a mismatch', () => {
    const lease = createIntelBaseApprovalLease(base);
    expect(lease).not.toBeNull();
    for (const change of [
      { email: 'other@example.test' },
      { userId: 'other-owner' },
      { tenantId: 'other-tenant' },
      { agentId: 'other-agent' },
      { conversationId: 'other-thread' },
      { purpose: 'other-purpose' },
      { toolCallId: 'call-2' },
    ]) {
      expect(lease?.consume({ ...invocation, ...change })).toBeNull();
    }
    expect(lease?.consume(invocation)).toEqual({ actionId: 'action-1', toolCallId: 'call-1' });
  });

  it('accepts only a JSON string with the same one-field email input', () => {
    const lease = createIntelBaseApprovalLease({
      ...base,
      actionRequests: [
        {
          name: 'osint_email_enrich',
          arguments: JSON.stringify({ email }),
          tool_call_id: 'call-1',
        },
      ],
    });
    expect(lease?.consume(invocation)).toEqual({ actionId: 'action-1', toolCallId: 'call-1' });
    expect(
      createIntelBaseApprovalLease({
        ...base,
        actionRequests: [{ name: 'osint_email_enrich', arguments: '{bad', tool_call_id: 'call-1' }],
      }),
    ).toBeNull();
  });
});
