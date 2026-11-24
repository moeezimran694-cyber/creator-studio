import type {
  AdminInvitation,
  AdminPermissionRecord,
  AdminPermissionsMap,
  AppFile,
  AppListing,
  AuditLog,
  DownloadLog,
  Entitlement,
  Order,
  PaymentMethod,
  PaymentSetting,
  UserProfile,
  UserStatus,
  WebsiteSettingsBundle,
} from '../types/index.ts';
import {
  apiJson,
  fetchDbStatus,
  notifyServerDataChanged,
  subscribeServerDataRefresh,
} from './serverSession.ts';

function hydrateDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return new Date();
}

function hydrateApp(raw: AppListing): AppListing {
  return {
    ...raw,
    pricePkr: Number(raw.pricePkr) || 0,
    features: Array.isArray(raw.features) ? raw.features : [],
    createdAt: hydrateDate(raw.createdAt),
    updatedAt: hydrateDate(raw.updatedAt),
  };
}

function hydrateOrder(raw: Order): Order {
  return {
    ...raw,
    amountPkr: Number(raw.amountPkr) || 0,
    reviewedAt: raw.reviewedAt ? hydrateDate(raw.reviewedAt) : null,
    createdAt: hydrateDate(raw.createdAt),
  };
}

function hydratePayment(raw: PaymentSetting): PaymentSetting {
  return {
    ...raw,
    updatedAt: hydrateDate(raw.updatedAt),
  };
}

function hydrateEntitlement(raw: Entitlement): Entitlement {
  return {
    ...raw,
    grantedAt: hydrateDate(raw.grantedAt),
  };
}

function hydrateProfile(raw: UserProfile): UserProfile {
  return {
    ...raw,
    createdAt: hydrateDate(raw.createdAt),
    lastLogin: hydrateDate(raw.lastLogin),
  };
}

function hydrateInvitation(raw: AdminInvitation): AdminInvitation {
  return {
    ...raw,
    expiresAt: hydrateDate(raw.expiresAt),
    createdAt: hydrateDate(raw.createdAt),
    acceptedAt: raw.acceptedAt ? hydrateDate(raw.acceptedAt) : undefined,
  };
}

export interface PublicBundleResponse {
  settings: WebsiteSettingsBundle;
  initialized: boolean;
  apps: AppListing[];
  payments: PaymentSetting[];
}

export interface UserDataResponse {
  orders: Order[];
  entitlements: Entitlement[];
}

export interface AdminDashboardResponse {
  apps: AppListing[];
  orders: Order[];
  paymentSettings: PaymentSetting[];
  profiles: UserProfile[];
  permissionRecords: AdminPermissionRecord[];
  invitations: AdminInvitation[];
  auditLogs: AuditLog[];
  downloadLogs: DownloadLog[];
}

export async function shouldUseServerPublicFeed(): Promise<boolean> {
  try {
    const status = await fetchDbStatus();
    return status.mongoConnected;
  } catch {
    return false;
  }
}

export async function fetchServerPublicBundle(): Promise<PublicBundleResponse> {
  const res = await apiJson<PublicBundleResponse>('/api/data/public', { method: 'GET' });
  return {
    settings: res.settings,
    initialized: res.initialized,
    apps: (res.apps || []).map(hydrateApp),
    payments: (res.payments || []).map(hydratePayment),
  };
}

export async function fetchServerUserData(): Promise<UserDataResponse> {
  const res = await apiJson<UserDataResponse>('/api/data/user', { method: 'GET' }, true);
  return {
    orders: (res.orders || []).map(hydrateOrder),
    entitlements: (res.entitlements || []).map(hydrateEntitlement),
  };
}

export async function fetchServerAdminDashboard(): Promise<AdminDashboardResponse> {
  const res = await apiJson<AdminDashboardResponse>(
    '/api/data/admin/dashboard',
    { method: 'GET' },
    true
  );
  return {
    apps: (res.apps || []).map(hydrateApp),
    orders: (res.orders || []).map(hydrateOrder),
    paymentSettings: (res.paymentSettings || []).map(hydratePayment),
    profiles: (res.profiles || []).map(hydrateProfile),
    permissionRecords: (res.permissionRecords || []).map((r) => ({
      ...r,
      updatedAt: hydrateDate(r.updatedAt),
    })),
    invitations: (res.invitations || []).map(hydrateInvitation),
    auditLogs: (res.auditLogs || []).map((l) => ({ ...l, createdAt: hydrateDate(l.createdAt) })),
    downloadLogs: (res.downloadLogs || []).map((l) => ({
      ...l,
      createdAt: hydrateDate(l.createdAt),
    })),
  };
}

export function subscribeServerPolling<T>(
  fetcher: () => Promise<T>,
  onUpdate: (data: T) => void
): () => void {
  let cancelled = false;
  const run = () => {
    void fetcher()
      .then((data) => {
        if (!cancelled) onUpdate(data);
      })
      .catch(() => undefined);
  };
  run();
  const unsubRefresh = subscribeServerDataRefresh(run);
  return () => {
    cancelled = true;
    unsubRefresh();
  };
}

export async function serverSeedDatabase(forceRestoreMissing: boolean) {
  const res = await apiJson<{ seeded: boolean; count: number }>(
    '/api/data/admin/seed',
    {
      method: 'POST',
      body: JSON.stringify({ forceRestoreMissing }),
    },
    true
  );
  notifyServerDataChanged();
  return res;
}

export async function serverSubmitOrder(params: {
  appId: string;
  paymentMethod: PaymentMethod;
  transactionId: string;
  screenshotDataUrl?: string;
}): Promise<string> {
  const res = await apiJson<{ orderId: string }>(
    '/api/data/orders',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    true
  );
  notifyServerDataChanged();
  return res.orderId;
}

export async function serverFetchOrderScreenshot(orderId: string): Promise<string | null> {
  const res = await apiJson<{ imageData: string | null }>(
    `/api/data/admin/orders/${encodeURIComponent(orderId)}/screenshot`,
    { method: 'GET' },
    true
  );
  return res.imageData || null;
}

export async function serverApproveOrder(orderId: string): Promise<void> {
  await apiJson(
    `/api/data/admin/orders/${encodeURIComponent(orderId)}/approve`,
    { method: 'POST', body: JSON.stringify({}) },
    true
  );
  notifyServerDataChanged();
}

export async function serverRejectOrder(orderId: string, reason: string): Promise<void> {
  await apiJson(
    `/api/data/admin/orders/${encodeURIComponent(orderId)}/reject`,
    { method: 'POST', body: JSON.stringify({ reason }) },
    true
  );
  notifyServerDataChanged();
}

export async function serverFetchAppFile(appId: string): Promise<AppFile | null> {
  const res = await apiJson<{ appFile: AppFile | null }>(
    `/api/data/app-file/${encodeURIComponent(appId)}`,
    { method: 'GET' },
    true
  );
  if (!res.appFile) return null;
  return { ...res.appFile, updatedAt: hydrateDate(res.appFile.updatedAt) };
}

export async function serverCreateApp(payload: Record<string, unknown>): Promise<string> {
  const res = await apiJson<{ appId: string }>(
    '/api/data/admin/apps',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true
  );
  notifyServerDataChanged();
  return res.appId;
}

export async function serverUpdateApp(
  appId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await apiJson(
    `/api/data/admin/apps/${encodeURIComponent(appId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    true
  );
  notifyServerDataChanged();
}

export async function serverToggleAppFlag(
  appId: string,
  field: 'isPublished' | 'isFeatured',
  value: boolean
): Promise<void> {
  await apiJson(
    `/api/data/admin/apps/${encodeURIComponent(appId)}/flag`,
    {
      method: 'PATCH',
      body: JSON.stringify({ field, value }),
    },
    true
  );
  notifyServerDataChanged();
}

export async function serverDeleteApp(appId: string): Promise<void> {
  await apiJson(
    `/api/data/admin/apps/${encodeURIComponent(appId)}`,
    { method: 'DELETE' },
    true
  );
  notifyServerDataChanged();
}

export async function serverSavePaymentSetting(
  methodId: 'easypaisa' | 'jazzcash',
  payload: Record<string, unknown>
): Promise<void> {
  await apiJson(
    `/api/data/admin/payments/${methodId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    true
  );
  notifyServerDataChanged();
}

export async function serverSaveWebsiteSetting(
  settingKey: keyof WebsiteSettingsBundle,
  settingValue: unknown
): Promise<void> {
  await apiJson(
    `/api/data/admin/settings/${encodeURIComponent(settingKey)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ settingValue }),
    },
    true
  );
  notifyServerDataChanged();
}

export async function serverInviteAdmin(
  email: string,
  permissions: AdminPermissionsMap
): Promise<{ invitationId: string; rawToken: string }> {
  const res = await apiJson<{ id: string; invitation: AdminInvitation }>(
    '/api/data/admin/invitations',
    {
      method: 'POST',
      body: JSON.stringify({ email, permissions }),
    },
    true
  );
  notifyServerDataChanged();
  return { invitationId: res.id, rawToken: res.invitation.invitationTokenHash };
}

export async function serverRevokeInvitation(id: string): Promise<void> {
  await apiJson(
    `/api/data/admin/invitations/${encodeURIComponent(id)}/revoke`,
    { method: 'POST', body: JSON.stringify({}) },
    true
  );
  notifyServerDataChanged();
}

export async function serverPromoteOrUpdateAdmin(
  uid: string,
  payload: { role: 'USER' | 'ADMIN'; status: UserStatus; permissions?: AdminPermissionsMap }
): Promise<void> {
  await apiJson(
    `/api/data/admin/profiles/${encodeURIComponent(uid)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    true
  );
  notifyServerDataChanged();
}

export async function serverUpdateAdminPermissions(
  uid: string,
  permissions: AdminPermissionsMap
): Promise<void> {
  await apiJson(
    `/api/data/admin/permissions/${encodeURIComponent(uid)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    },
    true
  );
  notifyServerDataChanged();
}
