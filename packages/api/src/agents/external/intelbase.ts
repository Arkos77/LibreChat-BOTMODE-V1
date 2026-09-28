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
  fetch: (url: string, init: RequestInit) => Promise<Response>;
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
  if (typeof host.fetch !== 'function') {
    throw new IntelBaseLookupError('provider_unavailable');
  }
  let response: Response;
  try {
    response = await host.fetch('https://api.intelbase.is/lookup/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ email: input.email, timeout_ms: 10000, include_data_breaches: false }),
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new IntelBaseLookupError('provider_timeout');
    }
    throw new IntelBaseLookupError('provider_unavailable');
  }
  const errorCode = statusCode(response.status);
  if (errorCode) {
    throw new IntelBaseLookupError(errorCode);
  }
  const raw = await readBoundedResponse(response);
  let parsed: IntelBaseResponse;
  try {
    parsed = JSON.parse(raw) as IntelBaseResponse;
  } catch {
    throw new IntelBaseLookupError('provider_invalid_response');
  }
  const accounts = parsed?.identifier?.accounts;
  if (!Array.isArray(accounts)) {
    throw new IntelBaseLookupError('provider_invalid_response');
  }
  const modules = Array.from(
    new Set(
      accounts.slice(0, 32).flatMap((account) => {
        const name = account?.module?.name;
        return typeof name === 'string' && /^[a-z0-9_-]{1,40}$/.test(name) ? [name] : [];
      }),
    ),
  );
  return {
    provider: 'intelbase',
    category: 'email_account_signal',
    status: 'unverified',
    accountCount: Math.min(accounts.length, 32),
    modules,
    retrievedAt: new Date().toISOString(),
  };
}

interface IntelBaseResponse {
  identifier?: { accounts?: Array<{ module?: { name?: string } }> };
}

function statusCode(status: number): IntelBaseLookupErrorCode | undefined {
  if (status === 200) return undefined;
  if (status === 400) return 'provider_bad_request';
  if (status === 401) return 'provider_unauthorized';
  if (status === 403) return 'provider_forbidden';
  if (status === 429) return 'provider_rate_limited';
  return 'provider_unavailable';
}

async function readBoundedResponse(response: Response): Promise<string> {
  if (!response.body) {
    throw new IntelBaseLookupError('provider_invalid_response');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        throw new IntelBaseLookupError('provider_invalid_response');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof IntelBaseLookupError) throw error;
    if (isTimeoutError(error)) {
      throw new IntelBaseLookupError('provider_timeout');
    }
    throw new IntelBaseLookupError('provider_invalid_response');
  } finally {
    reader.releaseLock();
  }
  return text;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}
