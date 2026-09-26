import { sanitizeJobMetadata } from './metadata';

describe('sanitizeJobMetadata', () => {
  it('preserves a host-owned MTO trace id without deriving it from run identities', () => {
    expect(sanitizeJobMetadata({ mtoTraceId: 'mto-trace-123' })).toEqual({
      mtoTraceId: 'mto-trace-123',
    });
  });
});
