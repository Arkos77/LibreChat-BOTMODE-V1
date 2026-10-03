export const browserActions = ['CLICK', 'TYPE', 'SELECT', 'SCROLL', 'OPEN', 'BACK', 'WAIT', 'STOP'] as const;
export type BrowserAction = (typeof browserActions)[number];

export type BrowserNetworkMode = 'NONE' | 'LOCAL_LAB' | 'ALLOWLIST' | 'WEB' | 'TOR_ALLOWLIST';
export type BrowserGrantStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface BrowserExecutionGrant {
  grantId: string;
  taskId: string;
  action: BrowserAction;
  networkMode: BrowserNetworkMode;
  status: BrowserGrantStatus;
  expiresAt: string;
  allowlistedDestinations?: readonly string[];
}

export interface SecurityLabScope {
  scopeId: string;
  taskId: string;
  target: string;
  allowedTools: readonly string[];
  networkMode: 'LOCAL_LAB' | 'ALLOWLIST' | 'TOR_ALLOWLIST';
  expiresAt: string;
  maxConcurrency: number;
  status: BrowserGrantStatus;
}

function text(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be non-empty`);
  return value.trim();
}

function futureDate(name: string, value: string): string {
  text(name, value);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${name} must be a valid date`);
  return value;
}

function destinations(mode: BrowserNetworkMode, values?: readonly string[]): string[] | undefined {
  if (mode === 'ALLOWLIST' || mode === 'TOR_ALLOWLIST') {
    if (!values || values.length === 0) throw new Error(`${mode} requires allowlisted destinations`);
    return [...new Set(values.map((value) => text('destination', value)))];
  }
  return values?.length ? [...new Set(values.map((value) => text('destination', value)))] : undefined;
}

export function createBrowserExecutionGrant(input: BrowserExecutionGrant): BrowserExecutionGrant {
  const expiresAt = futureDate('expiresAt', input.expiresAt);
  const allowlistedDestinations = destinations(input.networkMode, input.allowlistedDestinations);
  return {
    grantId: text('grantId', input.grantId),
    taskId: text('taskId', input.taskId),
    action: input.action,
    networkMode: input.networkMode,
    status: input.status,
    expiresAt,
    ...(allowlistedDestinations ? { allowlistedDestinations } : {}),
  };
}

export function canExecuteBrowserGrant(grant: BrowserExecutionGrant, now: Date = new Date()): boolean {
  return grant.status === 'ACTIVE' && Date.parse(grant.expiresAt) > now.getTime();
}

export function createSecurityLabScope(input: SecurityLabScope): SecurityLabScope {
  text('scopeId', input.scopeId);
  text('taskId', input.taskId);
  text('target', input.target);
  if (!Array.isArray(input.allowedTools) || input.allowedTools.length === 0) {
    throw new Error('Security lab requires allowed tools');
  }
  if (!Number.isInteger(input.maxConcurrency) || input.maxConcurrency < 1) {
    throw new Error('Security lab maxConcurrency must be a positive integer');
  }
  return {
    scopeId: input.scopeId,
    taskId: input.taskId,
    target: input.target,
    allowedTools: [...new Set(input.allowedTools.map((value) => text('allowedTool', value)))],
    networkMode: input.networkMode,
    expiresAt: futureDate('expiresAt', input.expiresAt),
    maxConcurrency: input.maxConcurrency,
    status: input.status,
  };
}

export function canExecuteSecurityLab(scope: SecurityLabScope, now: Date = new Date()): boolean {
  return scope.status === 'ACTIVE' && Date.parse(scope.expiresAt) > now.getTime();
}
