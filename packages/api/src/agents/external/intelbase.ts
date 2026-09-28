export type IntelBaseLookupErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'credential_missing'
  | 'provider_bad_request'
  | 'provider_unauthorized'
  | 'provider_forbidden'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'provider_invalid_response';

export class IntelBaseLookupError extends Error {
  readonly code: IntelBaseLookupErrorCode;

  constructor(code: IntelBaseLookupErrorCode) {
    super(code);
    this.name = 'IntelBaseLookupError';
    this.code = code;
  }
}

export interface IntelBaseLookupRequest {
  email: string;
}

export interface IntelBaseGrantRequest extends IntelBaseLookupRequest {
  userId: string;
  tenantId?: string;
  agentId: string;
  taskId?: string;
  purpose: string;
}

export interface IntelBaseGrant {
  authorizationId: string;
  budgetReservationId: string;
  adultTargetConfirmed: true;
}

export interface IntelBaseHost extends Omit<IntelBaseGrantRequest, 'email'> {
  authorize: (request: IntelBaseGrantRequest) => Promise<IntelBaseGrant>;
  getApiKey: () => Promise<string>;
  fetch: typeof fetch;
}

export interface IntelBaseObservation {
  provider: 'intelbase';
  category: 'email_account_signal';
  status: 'unverified';
  accountCount: number;
  modules: string[];
  retrievedAt: string;
}

function validText(value: string): boolean {
  return typeof value === 'string' && value.trim() !== '' && value === value.trim();
}

function validEmail(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(value)
  );
}

export async function lookupIntelBaseEmail(
  input: IntelBaseLookupRequest,
  host: IntelBaseHost,
): Promise<IntelBaseObservation> {
  if (
    input == null ||
    typeof input !== 'object' ||
    Object.keys(input).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(input, 'email') ||
    !validEmail(input.email)
  ) {
    throw new IntelBaseLookupError('invalid_request');
  }
  if (
    host == null ||
    !validText(host.userId) ||
    !validText(host.agentId) ||
    !validText(host.purpose) ||
    (host.tenantId !== undefined && !validText(host.tenantId)) ||
    (host.taskId !== undefined && !validText(host.taskId)) ||
    typeof host.authorize !== 'function'
  ) {
    throw new IntelBaseLookupError('unauthorized');
  }
  let grant: IntelBaseGrant;
  try {
    grant = await host.authorize({
      userId: host.userId,
      ...(host.tenantId === undefined ? {} : { tenantId: host.tenantId }),
      agentId: host.agentId,
      ...(host.taskId === undefined ? {} : { taskId: host.taskId }),
      purpose: host.purpose,
      email: input.email,
    });
  } catch {
    throw new IntelBaseLookupError('unauthorized');
  }
  if (
    !grant ||
    !validText(grant.authorizationId) ||
    !validText(grant.budgetReservationId) ||
    grant.adultTargetConfirmed !== true
  ) {
    throw new IntelBaseLookupError('unauthorized');
  }
  let apiKey: string;
  try {
    apiKey = await host.getApiKey();
  } catch {
    throw new IntelBaseLookupError('credential_missing');
  }
  if (!validText(apiKey)) {
    throw new IntelBaseLookupError('credential_missing');
  }
  throw new IntelBaseLookupError('provider_unavailable');
}
