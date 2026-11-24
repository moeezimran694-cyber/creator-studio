import type { AdminPermissionsMap, UserProfile } from '../types/index.ts';

export interface DbStatusSnapshot {
  mongoConfigured: boolean;
  mongoConnected: boolean;
  mongoDbName: string;
  mongoError: string | null;
  storageMode: 'mongodb' | 'preview-memory';
  ownerClaimed: boolean;
  firebaseProjectId: string;
  firestoreDatabaseId: string;
}

// Strictly in-memory session token (never persisted in localStorage/sessionStorage)
let inMemoryServerToken: string | null = null;
let cachedDbStatus: DbStatusSnapshot | null = null;
const refreshListeners = new Set<() => void>();

export function setServerSessionToken(token: string | null): void {
  inMemoryServerToken = token;
}

export function getServerSessionToken(): string | null {
  return inMemoryServerToken;
}

export function isServerAuthActive(): boolean {
  return Boolean(inMemoryServerToken);
}

export function subscribeServerDataRefresh(listener: () => void): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

export function notifyServerDataChanged(): void {
  refreshListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

export async function apiJson<T>(
  url: string,
  options: RequestInit = {},
  includeAuth = false
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (includeAuth && inMemoryServerToken) {
    headers.set('Authorization', `Bearer ${inMemoryServerToken}`);
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { error: text };
    }
  }
  if (!res.ok) {
    const errMsg = typeof parsed.error === 'string' ? parsed.error : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return parsed as unknown as T;
}

export async function fetchDbStatus(forceRefresh = false): Promise<DbStatusSnapshot> {
  if (cachedDbStatus && !forceRefresh) {
    return cachedDbStatus;
  }
  const status = await apiJson<DbStatusSnapshot>('/api/system/db-status', { method: 'GET' });
  cachedDbStatus = status;
  return status;
}

export interface ServerAuthVerifyChallenge {
  email: string;
  requiresVerification: true;
  verificationPreviewCode: string;
}

export interface ServerAuthSessionResponse {
  token: string;
  profile: UserProfile;
  permissions: AdminPermissionsMap;
  expiresAt: number;
}

export async function serverRegister(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<ServerAuthVerifyChallenge> {
  return apiJson<ServerAuthVerifyChallenge>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function serverOwnerSetup(params: {
  email: string;
  password: string;
}): Promise<ServerAuthVerifyChallenge> {
  return apiJson<ServerAuthVerifyChallenge>('/api/auth/owner-setup', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function serverLogin(params: {
  email: string;
  password: string;
}): Promise<
  | ({ authenticated: true } & { session: ServerAuthSessionResponse })
  | ({ authenticated: false } & ServerAuthVerifyChallenge)
> {
  return apiJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function serverVerifyEmail(params: {
  email: string;
  code: string;
}): Promise<ServerAuthSessionResponse> {
  return apiJson<ServerAuthSessionResponse>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function serverResendVerification(email: string): Promise<{
  email: string;
  verificationPreviewCode: string;
}> {
  return apiJson('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function serverForgotPassword(email: string): Promise<{
  email: string;
  resetPreviewCode?: string;
}> {
  return apiJson('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function serverResetPassword(params: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{ reset: boolean }> {
  return apiJson('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function serverLogout(): Promise<void> {
  if (inMemoryServerToken) {
    await apiJson('/api/auth/logout', { method: 'POST' }, true).catch(() => undefined);
    inMemoryServerToken = null;
  }
}
