import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AdminInvitation,
  AdminPermissionRecord,
  AdminPermissionsMap,
  AppFile,
  AppListing,
  AuditLog,
  DownloadLog,
  EMPTY_PERMISSIONS,
  Entitlement,
  FULL_PERMISSIONS,
  Order,
  PaymentMethod,
  PaymentSetting,
  PERMANENT_SUPER_ADMIN_EMAIL,
  UserProfile,
  UserRole,
  UserStatus,
  WebsiteSettingsBundle,
} from '../types/index.ts';
import {
  buildPackageManifestPayload,
  DEFAULT_WEBSITE_SETTINGS,
  STARTER_APPS_SEED,
  STARTER_PAYMENT_SETTINGS,
} from './defaults.ts';
import { auth, db, handleFirestoreError, isValidGmailAddress, OperationType } from './firebase.ts';
import {
  fetchServerAdminDashboard,
  fetchServerPublicBundle,
  fetchServerUserData,
  serverApproveOrder,
  serverCreateApp,
  serverDeleteApp,
  serverFetchAppFile,
  serverFetchOrderScreenshot,
  serverInviteAdmin,
  serverPromoteOrUpdateAdmin,
  serverRejectOrder,
  serverRevokeInvitation,
  serverSavePaymentSetting,
  serverSaveWebsiteSetting,
  serverSeedDatabase,
  serverSubmitOrder,
  serverToggleAppFlag,
  serverUpdateAdminPermissions,
  serverUpdateApp,
  shouldUseServerPublicFeed,
  subscribeServerPolling,
} from './serverDbBridge.ts';
import {
  getServerSessionToken,
  isServerAuthActive,
  subscribeServerDataRefresh,
} from './serverSession.ts';

function toDate(val: unknown): Date {
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return new Date();
}

export function generateSafeId(prefix = 'doc'): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'doc';
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${cleanPrefix}_${rand}`;
}

export function slugifyAppId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'app'}-${Date.now().toString(36)}`;
}

export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return generateSafeId('tok');
}

// Client-side image compression for icons, QR codes, and payment screenshots
export function compressImageToDataUrl(
  file: File,
  maxWidth = 960,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file (PNG, JPG, WebP).'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/webp', quality);
        if (dataUrl.length > 480000) {
          const fallbackUrl = canvas.toDataURL('image/jpeg', 0.6);
          if (fallbackUrl.length > 480000) {
            reject(new Error('Image is too large even after compression. Please choose a smaller image.'));
            return;
          }
          resolve(fallbackUrl);
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// Read uploaded package file (<= 350KB for direct Firestore delivery, or use external URL)
export function readSmallFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 380 * 1024) {
      reject(
        new Error(
          'Direct browser file uploads are limited to 380 KB. For larger installers, enter your authorized HTTPS download link.'
        )
      );
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read software file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

// ============================================================
// USER PROFILE SYNC & INVITATION CLAIMING
// ============================================================
export async function syncUserProfileOnLogin(firebaseUser: User): Promise<UserProfile> {
  const uid = firebaseUser.uid;
  const email = (firebaseUser.email || '').trim().toLowerCase();
  if (!isValidGmailAddress(email)) {
    throw new Error('Only @gmail.com email addresses are permitted.');
  }
  if (!firebaseUser.emailVerified) {
    throw new Error('Please verify your Gmail address before accessing your account.');
  }
  const displayName = firebaseUser.displayName || email.split('@')[0] || 'User';
  const isPermanentOwner = email === PERMANENT_SUPER_ADMIN_EMAIL && firebaseUser.emailVerified;

  const profileRef = doc(db, 'profiles', uid);
  let existingSnap;
  try {
    existingSnap = await getDoc(profileRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `profiles/${uid}`);
  }

  // Check if a pending valid admin invitation exists for this verified email
  let pendingInvitation: AdminInvitation | null = null;
  if (!isPermanentOwner && firebaseUser.emailVerified && email) {
    try {
      const invQuery = query(collection(db, 'admin_invitations'), where('email', '==', email));
      const invSnap = await getDocs(invQuery);
      const now = new Date();
      for (const d of invSnap.docs) {
        const data = d.data();
        const expiresAt = toDate(data.expiresAt);
        if (data.status === 'PENDING' && expiresAt > now) {
          pendingInvitation = {
            id: d.id,
            email: data.email,
            invitationTokenHash: data.invitationTokenHash,
            permissions: { ...EMPTY_PERMISSIONS, ...(data.permissions || {}) },
            invitedBy: data.invitedBy,
            expiresAt,
            createdAt: toDate(data.createdAt),
            status: data.status,
          };
          break;
        }
      }
    } catch {
      // Non-fatal if no invitations match
    }
  }

  if (!existingSnap.exists()) {
    if (pendingInvitation) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'admin_invitations', pendingInvitation.id), {
        status: 'ACCEPTED',
        acceptedUid: uid,
        acceptedAt: serverTimestamp(),
      });
      batch.set(profileRef, {
        uid,
        email,
        displayName: displayName.slice(0, 120),
        role: 'ADMIN',
        status: 'ACTIVE',
        acceptedInvitationId: pendingInvitation.id,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      });
      batch.set(doc(db, 'admin_permissions', uid), {
        adminUserId: uid,
        adminEmail: email,
        permissions: pendingInvitation.permissions,
        grantedBy: pendingInvitation.invitedBy,
        updatedAt: serverTimestamp(),
      });
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `profiles/${uid}`);
      }
    } else {
      try {
        await setDoc(profileRef, {
          uid,
          email,
          displayName: displayName.slice(0, 120),
          role: isPermanentOwner ? 'SUPER_ADMIN' : 'USER',
          status: 'ACTIVE',
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `profiles/${uid}`);
      }
    }
  } else {
    const existingData = existingSnap.data();
    if (pendingInvitation && existingData.role === 'USER' && existingData.status === 'ACTIVE') {
      const batch = writeBatch(db);
      batch.update(doc(db, 'admin_invitations', pendingInvitation.id), {
        status: 'ACCEPTED',
        acceptedUid: uid,
        acceptedAt: serverTimestamp(),
      });
      batch.update(profileRef, {
        role: 'ADMIN',
        acceptedInvitationId: pendingInvitation.id,
        lastLogin: serverTimestamp(),
      });
      batch.set(doc(db, 'admin_permissions', uid), {
        adminUserId: uid,
        adminEmail: email,
        permissions: pendingInvitation.permissions,
        grantedBy: pendingInvitation.invitedBy,
        updatedAt: serverTimestamp(),
      });
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `profiles/${uid}`);
      }
    } else {
      const updatePayload: Record<string, unknown> = {
        displayName: displayName.slice(0, 120),
        lastLogin: serverTimestamp(),
      };
      if (isPermanentOwner && (existingData.role !== 'SUPER_ADMIN' || existingData.status !== 'ACTIVE')) {
        updatePayload.role = 'SUPER_ADMIN';
        updatePayload.status = 'ACTIVE';
      }
      try {
        await updateDoc(profileRef, updatePayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `profiles/${uid}`);
      }
    }
  }

  const freshSnap = await getDoc(profileRef);
  const d = freshSnap.data()!;
  return {
    uid: d.uid,
    email: d.email,
    displayName: d.displayName,
    role: d.role,
    status: d.status,
    acceptedInvitationId: d.acceptedInvitationId,
    createdAt: toDate(d.createdAt),
    lastLogin: toDate(d.lastLogin),
  };
}

// ============================================================
// SUPER ADMIN INITIAL DATABASE SEEDING
// ============================================================
export async function seedInitialDatabaseIfNeeded(
  actorUid: string,
  actorEmail: string,
  forceRestoreMissing = false
): Promise<{ seeded: boolean; count: number }> {
  if (isServerAuthActive()) {
    return serverSeedDatabase(forceRestoreMissing);
  }
  const existingAppsSnap = await getDocs(collection(db, 'apps'));
  const existingAppIds = new Set(existingAppsSnap.docs.map((d) => d.id));

  const existingSettingsSnap = await getDocs(collection(db, 'website_settings'));
  const existingSettingKeys = new Set(existingSettingsSnap.docs.map((d) => d.id));

  const existingPaymentsSnap = await getDocs(collection(db, 'payment_settings'));
  const existingPaymentKeys = new Set(existingPaymentsSnap.docs.map((d) => d.id));

  const shouldSeedApps = existingAppIds.size === 0 || forceRestoreMissing;
  const batch = writeBatch(db);
  let operations = 0;

  if (shouldSeedApps) {
    for (const app of STARTER_APPS_SEED) {
      if (!existingAppIds.has(app.id)) {
        batch.set(doc(db, 'apps', app.id), {
          name: app.name,
          iconKey: app.iconKey,
          iconUrl: '',
          category: app.category,
          version: app.version,
          fileSize: app.fileSize,
          description: app.description,
          features: app.features,
          pricePkr: app.pricePkr,
          isFeatured: app.isFeatured,
          isPublished: app.isPublished,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'app_files', app.id), {
          appId: app.id,
          downloadStoragePath: buildPackageManifestPayload(app),
          fileName: app.fileName,
          releaseNotes: app.releaseNotes,
          updatedBy: actorUid,
          updatedAt: serverTimestamp(),
        });
        operations += 2;
      }
    }
  }

  const settingEntries = Object.entries(DEFAULT_WEBSITE_SETTINGS) as [
    keyof WebsiteSettingsBundle,
    WebsiteSettingsBundle[keyof WebsiteSettingsBundle],
  ][];
  for (const [key, value] of settingEntries) {
    if (!existingSettingKeys.has(key)) {
      batch.set(doc(db, 'website_settings', key), {
        settingKey: key,
        settingValue: value,
        updatedBy: actorUid,
        updatedAt: serverTimestamp(),
      });
      operations++;
    }
  }

  for (const payment of STARTER_PAYMENT_SETTINGS) {
    if (!existingPaymentKeys.has(payment.id)) {
      batch.set(doc(db, 'payment_settings', payment.id), {
        method: payment.method,
        accountTitle: payment.accountTitle,
        accountNumber: payment.accountNumber,
        instructions: payment.instructions,
        qrImagePath: payment.qrImagePath,
        isEnabled: payment.isEnabled,
        updatedBy: actorUid,
        updatedAt: serverTimestamp(),
      });
      operations++;
    }
  }

  if (operations === 0) {
    return { seeded: false, count: 0 };
  }

  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: actorUid,
    actorEmail,
    action: 'SEED_DATABASE',
    entityType: 'system',
    entityId: 'initial_seed',
    summary: `Initialized Creator Studio database with ${operations} records`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return { seeded: true, count: operations };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'initial_seed');
  }
}

// ============================================================
// AUDIT LOG HELPER
// ============================================================
export async function recordAuditLog(params: {
  actorUserId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  oldValue?: unknown;
  newValue?: unknown;
}): Promise<void> {
  const id = generateSafeId('log');
  const payload: Record<string, unknown> = {
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    action: params.action.slice(0, 80),
    entityType: params.entityType.slice(0, 64),
    entityId: params.entityId.slice(0, 128),
    summary: params.summary.slice(0, 500),
    createdAt: serverTimestamp(),
  };
  if (params.oldValue !== undefined) {
    payload.oldValue = JSON.stringify(params.oldValue).slice(0, 4000);
  }
  if (params.newValue !== undefined) {
    payload.newValue = JSON.stringify(params.newValue).slice(0, 4000);
  }
  try {
    await setDoc(doc(db, 'audit_logs', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `audit_logs/${id}`);
  }
}

// ============================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================
export function subscribeWebsiteSettings(
  onUpdate: (settings: WebsiteSettingsBundle, initialized: boolean) => void
): () => void {
  let active = true;
  const pullServer = () => {
    void fetchServerPublicBundle()
      .then((bundle) => {
        if (active && (bundle.initialized || isServerAuthActive())) {
          onUpdate(bundle.settings, bundle.initialized);
        }
      })
      .catch(() => undefined);
  };

  void shouldUseServerPublicFeed().then((useServer) => {
    if (active && (useServer || isServerAuthActive())) {
      pullServer();
    }
  });
  const unsubServer = subscribeServerDataRefresh(() => {
    if (isServerAuthActive()) {
      pullServer();
    } else {
      void shouldUseServerPublicFeed().then((useServer) => {
        if (active && useServer) pullServer();
      });
    }
  });

  const unsubFs = onSnapshot(
    collection(db, 'website_settings'),
    (snapshot) => {
      if (isServerAuthActive()) return;
      if (snapshot.empty) {
        onUpdate(DEFAULT_WEBSITE_SETTINGS, false);
        return;
      }
      const merged: WebsiteSettingsBundle = {
        hero: { ...DEFAULT_WEBSITE_SETTINGS.hero },
        branding: { ...DEFAULT_WEBSITE_SETTINGS.branding },
        appearance: { ...DEFAULT_WEBSITE_SETTINGS.appearance },
        content: { ...DEFAULT_WEBSITE_SETTINGS.content },
        navigation: { ...DEFAULT_WEBSITE_SETTINGS.navigation },
        footer: { ...DEFAULT_WEBSITE_SETTINGS.footer },
        support: { ...DEFAULT_WEBSITE_SETTINGS.support },
        marketplace: { ...DEFAULT_WEBSITE_SETTINGS.marketplace },
      };
      for (const docSnap of snapshot.docs) {
        const key = docSnap.id as keyof WebsiteSettingsBundle;
        const data = docSnap.data();
        if (key in merged && data?.settingValue && typeof data.settingValue === 'object') {
          (merged as unknown as Record<string, unknown>)[key] = {
            ...(merged as unknown as Record<string, Record<string, unknown>>)[key],
            ...(data.settingValue as Record<string, unknown>),
          };
        }
      }
      onUpdate(merged, true);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'website_settings');
    }
  );

  return () => {
    active = false;
    unsubServer();
    unsubFs();
  };
}

export function subscribePublishedApps(onUpdate: (apps: AppListing[]) => void): () => void {
  let active = true;
  const pullServer = () => {
    void fetchServerPublicBundle()
      .then((bundle) => {
        if (active && (bundle.initialized || bundle.apps.length > 0 || isServerAuthActive())) {
          onUpdate(bundle.apps);
        }
      })
      .catch(() => undefined);
  };

  void shouldUseServerPublicFeed().then((useServer) => {
    if (active && (useServer || isServerAuthActive())) {
      pullServer();
    }
  });
  const unsubServer = subscribeServerDataRefresh(() => {
    if (isServerAuthActive()) {
      pullServer();
    } else {
      void shouldUseServerPublicFeed().then((useServer) => {
        if (active && useServer) pullServer();
      });
    }
  });

  const q = query(collection(db, 'apps'), where('isPublished', '==', true));
  const unsubFs = onSnapshot(
    q,
    (snapshot) => {
      if (isServerAuthActive()) return;
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          iconUrl: data.iconUrl || '',
          iconKey: data.iconKey || '',
          category: data.category,
          version: data.version,
          fileSize: data.fileSize,
          description: data.description,
          features: Array.isArray(data.features) ? data.features : [],
          pricePkr: Number(data.pricePkr) || 0,
          isFeatured: Boolean(data.isFeatured),
          isPublished: Boolean(data.isPublished),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as AppListing;
      });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'apps');
    }
  );

  return () => {
    active = false;
    unsubServer();
    unsubFs();
  };
}

export function subscribeAllAppsAdmin(onUpdate: (apps: AppListing[]) => void): () => void {
  if (isServerAuthActive()) {
    return subscribeServerPolling(
      () => fetchServerAdminDashboard().then((r) => r.apps),
      onUpdate
    );
  }
  return onSnapshot(
    collection(db, 'apps'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          iconUrl: data.iconUrl || '',
          iconKey: data.iconKey || '',
          category: data.category,
          version: data.version,
          fileSize: data.fileSize,
          description: data.description,
          features: Array.isArray(data.features) ? data.features : [],
          pricePkr: Number(data.pricePkr) || 0,
          isFeatured: Boolean(data.isFeatured),
          isPublished: Boolean(data.isPublished),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as AppListing;
      });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'apps');
    }
  );
}

export function subscribeEnabledPaymentSettings(
  onUpdate: (settings: PaymentSetting[]) => void
): () => void {
  let active = true;
  const pullServer = () => {
    void fetchServerPublicBundle()
      .then((bundle) => {
        if (active && (bundle.payments.length > 0 || isServerAuthActive())) {
          onUpdate(bundle.payments);
        }
      })
      .catch(() => undefined);
  };

  void shouldUseServerPublicFeed().then((useServer) => {
    if (active && (useServer || isServerAuthActive())) {
      pullServer();
    }
  });
  const unsubServer = subscribeServerDataRefresh(() => {
    if (isServerAuthActive()) {
      pullServer();
    } else {
      void shouldUseServerPublicFeed().then((useServer) => {
        if (active && useServer) pullServer();
      });
    }
  });

  const q = query(collection(db, 'payment_settings'), where('isEnabled', '==', true));
  const unsubFs = onSnapshot(
    q,
    (snapshot) => {
      if (isServerAuthActive()) return;
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id as 'easypaisa' | 'jazzcash',
          method: data.method,
          accountTitle: data.accountTitle,
          accountNumber: data.accountNumber,
          instructions: data.instructions,
          qrImagePath: data.qrImagePath || '',
          isEnabled: Boolean(data.isEnabled),
          updatedBy: data.updatedBy,
          updatedAt: toDate(data.updatedAt),
        } as PaymentSetting;
      });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payment_settings');
    }
  );

  return () => {
    active = false;
    unsubServer();
    unsubFs();
  };
}

export function subscribeAllPaymentSettingsAdmin(
  onUpdate: (settings: PaymentSetting[]) => void
): () => void {
  if (isServerAuthActive()) {
    return subscribeServerPolling(
      () => fetchServerAdminDashboard().then((r) => r.paymentSettings),
      onUpdate
    );
  }
  return onSnapshot(
    collection(db, 'payment_settings'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id as 'easypaisa' | 'jazzcash',
          method: data.method,
          accountTitle: data.accountTitle,
          accountNumber: data.accountNumber,
          instructions: data.instructions,
          qrImagePath: data.qrImagePath || '',
          isEnabled: Boolean(data.isEnabled),
          updatedBy: data.updatedBy,
          updatedAt: toDate(data.updatedAt),
        } as PaymentSetting;
      });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payment_settings');
    }
  );
}

export function subscribeUserOrders(
  userId: string,
  onUpdate: (orders: Order[]) => void
): () => void {
  if (isServerAuthActive()) {
    return subscribeServerPolling(
      () => fetchServerUserData().then((r) => r.orders),
      onUpdate
    );
  }
  const q = query(collection(db, 'orders'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: data.userId,
            userEmail: data.userEmail,
            userName: data.userName,
            appId: data.appId,
            appName: data.appName,
            transactionId: data.transactionId,
            paymentMethod: data.paymentMethod,
            hasScreenshot: Boolean(data.hasScreenshot),
            amountPkr: Number(data.amountPkr) || 0,
            status: data.status,
            rejectionReason: data.rejectionReason || '',
            reviewedBy: data.reviewedBy || null,
            reviewedByEmail: data.reviewedByEmail || null,
            reviewedAt: data.reviewedAt ? toDate(data.reviewedAt) : null,
            createdAt: toDate(data.createdAt),
          } as Order;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `orders(userId=${userId})`);
    }
  );
}

export function subscribeAllOrdersAdmin(onUpdate: (orders: Order[]) => void): () => void {
  if (isServerAuthActive()) {
    return subscribeServerPolling(
      () => fetchServerAdminDashboard().then((r) => r.orders),
      onUpdate
    );
  }
  return onSnapshot(
    collection(db, 'orders'),
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: data.userId,
            userEmail: data.userEmail,
            userName: data.userName,
            appId: data.appId,
            appName: data.appName,
            transactionId: data.transactionId,
            paymentMethod: data.paymentMethod,
            hasScreenshot: Boolean(data.hasScreenshot),
            amountPkr: Number(data.amountPkr) || 0,
            status: data.status,
            rejectionReason: data.rejectionReason || '',
            reviewedBy: data.reviewedBy || null,
            reviewedByEmail: data.reviewedByEmail || null,
            reviewedAt: data.reviewedAt ? toDate(data.reviewedAt) : null,
            createdAt: toDate(data.createdAt),
          } as Order;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    }
  );
}

export function subscribeUserEntitlements(
  userId: string,
  onUpdate: (entitlements: Entitlement[]) => void
): () => void {
  if (isServerAuthActive()) {
    return subscribeServerPolling(
      () => fetchServerUserData().then((r) => r.entitlements),
      onUpdate
    );
  }
  const q = query(collection(db, 'entitlements'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          appId: data.appId,
          orderId: data.orderId,
          grantedBy: data.grantedBy,
          grantedAt: toDate(data.grantedAt),
        } as Entitlement;
      });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `entitlements(userId=${userId})`);
    }
  );
}

export function subscribeOwnAdminPermissions(
  uid: string,
  role: UserRole,
  onUpdate: (perms: AdminPermissionsMap) => void
): () => void {
  if (role === 'SUPER_ADMIN') {
    onUpdate({ ...FULL_PERMISSIONS });
    return () => {};
  }
  if (role !== 'ADMIN') {
    onUpdate({ ...EMPTY_PERMISSIONS });
    return () => {};
  }
  if (isServerAuthActive()) {
    return () => {};
  }
  return onSnapshot(
    doc(db, 'admin_permissions', uid),
    (snap) => {
      if (!snap.exists()) {
        onUpdate({ ...EMPTY_PERMISSIONS });
        return;
      }
      const data = snap.data();
      onUpdate({ ...EMPTY_PERMISSIONS, ...(data.permissions || {}) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `admin_permissions/${uid}`);
    }
  );
}

export function subscribeProfilesAdmin(onUpdate: (profiles: UserProfile[]) => void): () => void {
  if (isServerAuthActive()) {
    return subscribeServerPolling(
      () => fetchServerAdminDashboard().then((r) => r.profiles),
      onUpdate
    );
  }
  return onSnapshot(
    collection(db, 'profiles'),
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            uid: data.uid,
            email: data.email,
            displayName: data.displayName,
            role: data.role,
            status: data.status,
            acceptedInvitationId: data.acceptedInvitationId,
            createdAt: toDate(data.createdAt),
            lastLogin: toDate(data.lastLogin),
          } as UserProfile;
        })
        .sort((a, b) => b.lastLogin.getTime() - a.lastLogin.getTime());
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'profiles');
    }
  );
}

export function subscribeAllAdminPermissions(
  onUpdate: (records: AdminPermissionRecord[]) => void
): () => void {
  if (isServerAuthActive()) {
    return subscribeServerPolling(
      () => fetchServerAdminDashboard().then((r) => r.permissionRecords),
      onUpdate
    );
  }
  return onSnapshot(
    collection(db, 'admin_permissions'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          adminUserId: data.adminUserId,
          adminEmail: data.adminEmail,
          permissions: { ...EMPTY_PERMISSIONS, ...(data.permissions || {}) },
          grantedBy: data.grantedBy,
          updatedAt: toDate(data.updatedAt),
        } as AdminPermissionRecord;
      });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'admin_permissions');
    }
  );
}

export function subscribeAdminInvitations(
  onUpdate: (invitations: AdminInvitation[]) => void
): () => void {
  if (isServerAuthActive()) {
    return subscribeServerPolling(
      () => fetchServerAdminDashboard().then((r) => r.invitations),
      onUpdate
    );
  }
  return onSnapshot(
    collection(db, 'admin_invitations'),
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            email: data.email,
            invitationTokenHash: data.invitationTokenHash,
            permissions: { ...EMPTY_PERMISSIONS, ...(data.permissions || {}) },
            invitedBy: data.invitedBy,
            expiresAt: toDate(data.expiresAt),
            createdAt: toDate(data.createdAt),
            status: data.status,
            acceptedUid: data.acceptedUid,
            acceptedAt: data.acceptedAt ? toDate(data.acceptedAt) : undefined,
          } as AdminInvitation;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'admin_invitations');
    }
  );
}

export function subscribeAuditLogs(onUpdate: (logs: AuditLog[]) => void): () => void {
  if (isServerAuthActive()) {
    return subscribeServerPolling(
      () => fetchServerAdminDashboard().then((r) => r.auditLogs),
      onUpdate
    );
  }
  const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(200));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          actorUserId: data.actorUserId,
          actorEmail: data.actorEmail,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          summary: data.summary,
          oldValue: data.oldValue,
          newValue: data.newValue,
          createdAt: toDate(data.createdAt),
        } as AuditLog;
      });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'audit_logs');
    }
  );
}

export function subscribeDownloadLogsAdmin(onUpdate: (logs: DownloadLog[]) => void): () => void {
  if (isServerAuthActive()) {
    return subscribeServerPolling(
      () => fetchServerAdminDashboard().then((r) => r.downloadLogs),
      onUpdate
    );
  }
  const q = query(collection(db, 'download_logs'), orderBy('createdAt', 'desc'), limit(300));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          appId: data.appId,
          appName: data.appName,
          createdAt: toDate(data.createdAt),
        } as DownloadLog;
      });
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'download_logs');
    }
  );
}

// ============================================================
// MUTATION OPERATIONS
// ============================================================

// 1. Orders & Protected Downloads
export async function submitOrder(params: {
  user: UserProfile;
  app: AppListing;
  paymentMethod: PaymentMethod;
  transactionId: string;
  screenshotDataUrl?: string;
}): Promise<string> {
  const trimmedTid = params.transactionId.trim();
  if (!/^\d{11}$/.test(trimmedTid)) {
    throw new Error('Please enter a valid 11-digit numeric Transaction ID.');
  }

  if (isServerAuthActive()) {
    return serverSubmitOrder({
      appId: params.app.id,
      paymentMethod: params.paymentMethod,
      transactionId: trimmedTid,
      screenshotDataUrl: params.screenshotDataUrl,
    });
  }

  const orderId = generateSafeId('ord');

  // Always read authoritative price from Firestore /apps/{appId}
  const appSnap = await getDoc(doc(db, 'apps', params.app.id));
  if (!appSnap.exists() || !appSnap.data().isPublished) {
    throw new Error('This application is currently unavailable for purchase.');
  }
  const dbPricePkr = Number(appSnap.data().pricePkr);

  const batch = writeBatch(db);
  batch.set(doc(db, 'orders', orderId), {
    userId: params.user.uid,
    userEmail: params.user.email,
    userName: params.user.displayName.slice(0, 120),
    appId: params.app.id,
    appName: String(appSnap.data().name).slice(0, 120),
    transactionId: trimmedTid,
    paymentMethod: params.paymentMethod,
    hasScreenshot: Boolean(params.screenshotDataUrl),
    amountPkr: dbPricePkr,
    status: 'PENDING',
    reviewedBy: null,
    reviewedByEmail: null,
    reviewedAt: null,
    createdAt: serverTimestamp(),
  });

  if (params.screenshotDataUrl) {
    batch.set(doc(db, 'order_screenshots', orderId), {
      orderId,
      userId: params.user.uid,
      imageData: params.screenshotDataUrl,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return orderId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
  }
}

export async function fetchOrderScreenshot(orderId: string): Promise<string | null> {
  if (isServerAuthActive()) {
    return serverFetchOrderScreenshot(orderId);
  }
  try {
    const snap = await getDoc(doc(db, 'order_screenshots', orderId));
    if (!snap.exists()) return null;
    return snap.data().imageData || null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `order_screenshots/${orderId}`);
  }
}

export async function approveOrder(
  order: Order,
  reviewer: UserProfile
): Promise<void> {
  if (isServerAuthActive()) {
    await serverApproveOrder(order.id);
    return;
  }
  const entitlementId = `${order.userId}_${order.appId}`;
  const batch = writeBatch(db);

  batch.set(doc(db, 'entitlements', entitlementId), {
    userId: order.userId,
    appId: order.appId,
    orderId: order.id,
    grantedBy: reviewer.uid,
    grantedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'orders', order.id), {
    status: 'APPROVED',
    rejectionReason: '',
    reviewedBy: reviewer.uid,
    reviewedByEmail: reviewer.email,
    reviewedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: reviewer.uid,
    actorEmail: reviewer.email,
    action: 'APPROVE_ORDER',
    entityType: 'order',
    entityId: order.id,
    summary: `Approved payment ${order.transactionId} for ${order.appName} (${order.userEmail})`,
    oldValue: order.status,
    newValue: 'APPROVED',
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
  }
}

export async function rejectOrder(
  order: Order,
  reviewer: UserProfile,
  reason: string
): Promise<void> {
  if (isServerAuthActive()) {
    await serverRejectOrder(order.id, reason);
    return;
  }
  const entitlementId = `${order.userId}_${order.appId}`;
  const batch = writeBatch(db);

  batch.update(doc(db, 'orders', order.id), {
    status: 'REJECTED',
    rejectionReason: (reason.trim() || 'Payment verification failed. Contact support with your receipt.').slice(0, 500),
    reviewedBy: reviewer.uid,
    reviewedByEmail: reviewer.email,
    reviewedAt: serverTimestamp(),
  });

  // Revoke entitlement if one existed for this order
  const entSnap = await getDoc(doc(db, 'entitlements', entitlementId));
  if (entSnap.exists() && entSnap.data().orderId === order.id) {
    batch.delete(doc(db, 'entitlements', entitlementId));
  }

  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: reviewer.uid,
    actorEmail: reviewer.email,
    action: 'REJECT_ORDER',
    entityType: 'order',
    entityId: order.id,
    summary: `Rejected payment ${order.transactionId} for ${order.appName} (${order.userEmail})`,
    oldValue: order.status,
    newValue: `REJECTED: ${reason.trim() || 'Verification failed'}`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
  }
}

export async function fetchProtectedAppFile(appId: string): Promise<AppFile | null> {
  if (isServerAuthActive()) {
    return serverFetchAppFile(appId);
  }
  try {
    const snap = await getDoc(doc(db, 'app_files', appId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      appId: data.appId,
      downloadStoragePath: data.downloadStoragePath,
      fileName: data.fileName,
      releaseNotes: data.releaseNotes || '',
      updatedBy: data.updatedBy,
      updatedAt: toDate(data.updatedAt),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `app_files/${appId}`);
  }
}

export interface SignedDownloadResult {
  signedUrl: string;
  fileName: string;
  expiresAt: number;
  expiresInSeconds: number;
}

export async function requestSignedDownloadLink(
  appId: string,
  orderId?: string
): Promise<SignedDownloadResult> {
  const serverToken = getServerSessionToken();
  let bearerToken: string | null = serverToken;

  if (!bearerToken) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Authentication required. Please log in first.');
    }
    bearerToken = await currentUser.getIdToken(true);
  }

  const res = await fetch('/api/downloads/authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({ appId, orderId: orderId || 'admin_free_access' }),
  });

  const payload = (await res.json()) as Partial<SignedDownloadResult> & { error?: string };
  if (!res.ok || !payload.signedUrl) {
    throw new Error(payload.error || 'Unable to authorize download.');
  }

  // Trigger file download via temporary single-use signed server endpoint
  const anchor = document.createElement('a');
  anchor.href = payload.signedUrl;
  anchor.download = payload.fileName || `${appId}-package`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  return {
    signedUrl: payload.signedUrl,
    fileName: payload.fileName || `${appId}-package`,
    expiresAt: payload.expiresAt || Date.now() + 60_000,
    expiresInSeconds: payload.expiresInSeconds || 60,
  };
}

// 2. App CRUD
export async function createAppListing(params: {
  actor: UserProfile;
  name: string;
  iconUrl: string;
  iconKey: string;
  category: string;
  version: string;
  fileSize: string;
  description: string;
  features: string[];
  pricePkr: number;
  isFeatured: boolean;
  isPublished: boolean;
  downloadStoragePath: string;
  fileName: string;
  releaseNotes: string;
}): Promise<string> {
  if (isServerAuthActive()) {
    return serverCreateApp({
      name: params.name,
      iconUrl: params.iconUrl,
      iconKey: params.iconKey,
      category: params.category,
      version: params.version,
      fileSize: params.fileSize,
      description: params.description,
      features: params.features,
      pricePkr: params.pricePkr,
      isFeatured: params.isFeatured,
      isPublished: params.isPublished,
      downloadStoragePath: params.downloadStoragePath,
      fileName: params.fileName,
      releaseNotes: params.releaseNotes,
    });
  }
  const appId = slugifyAppId(params.name);
  const batch = writeBatch(db);

  batch.set(doc(db, 'apps', appId), {
    name: params.name.trim().slice(0, 120),
    iconUrl: params.iconUrl.trim(),
    iconKey: params.iconKey.trim().slice(0, 64),
    category: params.category.trim().slice(0, 64),
    version: params.version.trim().slice(0, 40),
    fileSize: params.fileSize.trim().slice(0, 40),
    description: params.description.trim().slice(0, 1500),
    features: params.features.map((f) => f.trim()).filter(Boolean).slice(0, 12),
    pricePkr: Math.max(0, Math.round(Number(params.pricePkr) || 0)),
    isFeatured: Boolean(params.isFeatured),
    isPublished: Boolean(params.isPublished),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'app_files', appId), {
    appId,
    downloadStoragePath: params.downloadStoragePath.trim(),
    fileName: (params.fileName.trim() || `${appId}-package.txt`).slice(0, 160),
    releaseNotes: params.releaseNotes.trim().slice(0, 1000),
    updatedBy: params.actor.uid,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: params.actor.uid,
    actorEmail: params.actor.email,
    action: 'CREATE_APP',
    entityType: 'app',
    entityId: appId,
    summary: `Added app "${params.name}" (Rs. ${params.pricePkr})`,
    newValue: `${params.name} ${params.version} · Rs. ${params.pricePkr}`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return appId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `apps/${appId}`);
  }
}

export async function updateAppListing(params: {
  actor: UserProfile;
  existingApp: AppListing;
  updates: {
    name: string;
    iconUrl: string;
    iconKey: string;
    category: string;
    version: string;
    fileSize: string;
    description: string;
    features: string[];
    pricePkr: number;
    isFeatured: boolean;
    isPublished: boolean;
  };
  fileUpdates?: {
    downloadStoragePath: string;
    fileName: string;
    releaseNotes: string;
  };
  canEditDetails: boolean;
  canEditPrice: boolean;
  canEditFiles: boolean;
}): Promise<void> {
  if (isServerAuthActive()) {
    await serverUpdateApp(params.existingApp.id, {
      updates: params.updates,
      fileUpdates: params.fileUpdates,
    });
    return;
  }
  const batch = writeBatch(db);
  const { actor, existingApp, updates, fileUpdates, canEditDetails, canEditPrice, canEditFiles } = params;

  if (canEditDetails) {
    batch.update(doc(db, 'apps', existingApp.id), {
      name: updates.name.trim().slice(0, 120),
      iconUrl: updates.iconUrl.trim(),
      iconKey: updates.iconKey.trim().slice(0, 64),
      category: updates.category.trim().slice(0, 64),
      version: updates.version.trim().slice(0, 40),
      fileSize: updates.fileSize.trim().slice(0, 40),
      description: updates.description.trim().slice(0, 1500),
      features: updates.features.map((f) => f.trim()).filter(Boolean).slice(0, 12),
      pricePkr: canEditPrice
        ? Math.max(0, Math.round(Number(updates.pricePkr) || 0))
        : existingApp.pricePkr,
      isFeatured: Boolean(updates.isFeatured),
      isPublished: Boolean(updates.isPublished),
      updatedAt: serverTimestamp(),
    });
  } else if (canEditPrice && updates.pricePkr !== existingApp.pricePkr) {
    batch.update(doc(db, 'apps', existingApp.id), {
      pricePkr: Math.max(0, Math.round(Number(updates.pricePkr) || 0)),
      updatedAt: serverTimestamp(),
    });
  }

  if (canEditFiles && fileUpdates && fileUpdates.downloadStoragePath.trim()) {
    batch.set(doc(db, 'app_files', existingApp.id), {
      appId: existingApp.id,
      downloadStoragePath: fileUpdates.downloadStoragePath.trim(),
      fileName: (fileUpdates.fileName.trim() || `${existingApp.id}-package.txt`).slice(0, 160),
      releaseNotes: fileUpdates.releaseNotes.trim().slice(0, 1000),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: actor.uid,
    actorEmail: actor.email,
    action: 'UPDATE_APP',
    entityType: 'app',
    entityId: existingApp.id,
    summary: `Updated app "${updates.name || existingApp.name}"`,
    oldValue: `${existingApp.name} ${existingApp.version} · Rs. ${existingApp.pricePkr}`,
    newValue: `${updates.name} ${updates.version} · Rs. ${canEditPrice ? updates.pricePkr : existingApp.pricePkr}`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `apps/${existingApp.id}`);
  }
}

export async function toggleAppFlag(
  actor: UserProfile,
  app: AppListing,
  field: 'isPublished' | 'isFeatured',
  value: boolean
): Promise<void> {
  if (isServerAuthActive()) {
    await serverToggleAppFlag(app.id, field, value);
    return;
  }
  const batch = writeBatch(db);
  batch.update(doc(db, 'apps', app.id), {
    [field]: value,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: actor.uid,
    actorEmail: actor.email,
    action: field === 'isPublished' ? (value ? 'PUBLISH_APP' : 'UNPUBLISH_APP') : 'TOGGLE_FEATURED_APP',
    entityType: 'app',
    entityId: app.id,
    summary: `${field === 'isPublished' ? (value ? 'Published' : 'Unpublished') : value ? 'Featured' : 'Unfeatured'} "${app.name}"`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `apps/${app.id}`);
  }
}

export async function deleteAppListing(actor: UserProfile, app: AppListing): Promise<void> {
  if (isServerAuthActive()) {
    await serverDeleteApp(app.id);
    return;
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, 'apps', app.id));
  batch.delete(doc(db, 'app_files', app.id));
  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: actor.uid,
    actorEmail: actor.email,
    action: 'DELETE_APP',
    entityType: 'app',
    entityId: app.id,
    summary: `Deleted app "${app.name}"`,
    oldValue: `${app.name} (${app.version})`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `apps/${app.id}`);
  }
}

// 3. Payment Settings
export async function savePaymentSetting(params: {
  actor: UserProfile;
  methodId: 'easypaisa' | 'jazzcash';
  accountTitle: string;
  accountNumber: string;
  instructions: string;
  qrImagePath: string;
  isEnabled: boolean;
}): Promise<void> {
  if (isServerAuthActive()) {
    await serverSavePaymentSetting(params.methodId, {
      accountTitle: params.accountTitle,
      accountNumber: params.accountNumber,
      instructions: params.instructions,
      qrImagePath: params.qrImagePath,
      isEnabled: params.isEnabled,
    });
    return;
  }
  const batch = writeBatch(db);
  batch.set(doc(db, 'payment_settings', params.methodId), {
    method: params.methodId === 'easypaisa' ? 'EasyPaisa' : 'JazzCash',
    accountTitle: params.accountTitle.trim().slice(0, 120),
    accountNumber: params.accountNumber.trim().slice(0, 64),
    instructions: params.instructions.trim().slice(0, 1000),
    qrImagePath: params.qrImagePath.trim(),
    isEnabled: Boolean(params.isEnabled),
    updatedBy: params.actor.uid,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: params.actor.uid,
    actorEmail: params.actor.email,
    action: 'UPDATE_PAYMENT_SETTING',
    entityType: 'payment_settings',
    entityId: params.methodId,
    summary: `Updated ${params.methodId === 'easypaisa' ? 'EasyPaisa' : 'JazzCash'} payment account details`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payment_settings/${params.methodId}`);
  }
}

// 4. Website Settings
export async function saveWebsiteSettingSection<K extends keyof WebsiteSettingsBundle>(params: {
  actor: UserProfile;
  settingKey: K;
  settingValue: WebsiteSettingsBundle[K];
}): Promise<void> {
  if (isServerAuthActive()) {
    await serverSaveWebsiteSetting(params.settingKey, params.settingValue);
    return;
  }
  const batch = writeBatch(db);
  batch.set(doc(db, 'website_settings', params.settingKey), {
    settingKey: params.settingKey,
    settingValue: params.settingValue,
    updatedBy: params.actor.uid,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: params.actor.uid,
    actorEmail: params.actor.email,
    action: 'UPDATE_WEBSITE_SETTING',
    entityType: 'website_settings',
    entityId: params.settingKey,
    summary: `Updated website customization section: ${params.settingKey}`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `website_settings/${params.settingKey}`);
  }
}

// 5. Super Admin: Admin Management, Invitations & Permissions
export async function inviteAdminByEmail(params: {
  actor: UserProfile;
  email: string;
  permissions: AdminPermissionsMap;
  expiresInDays: number;
}): Promise<{ invitationId: string; rawToken: string }> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!isValidGmailAddress(cleanEmail)) {
    throw new Error('Only Gmail addresses ending in @gmail.com are allowed.');
  }
  if (cleanEmail === PERMANENT_SUPER_ADMIN_EMAIL) {
    throw new Error('The permanent Super Admin already has full ownership.');
  }
  if (isServerAuthActive()) {
    return serverInviteAdmin(cleanEmail, params.permissions);
  }

  const invitationId = generateSafeId('inv');
  const rawToken = generateSafeId('cs_inv');
  const tokenHash = await sha256Hex(rawToken);
  const expiresAtDate = new Date(Date.now() + Math.max(1, params.expiresInDays) * 86400000);

  const batch = writeBatch(db);
  batch.set(doc(db, 'admin_invitations', invitationId), {
    email: cleanEmail,
    invitationTokenHash: tokenHash,
    permissions: params.permissions,
    invitedBy: params.actor.uid,
    expiresAt: Timestamp.fromDate(expiresAtDate),
    createdAt: serverTimestamp(),
    status: 'PENDING',
  });

  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: params.actor.uid,
    actorEmail: params.actor.email,
    action: 'INVITE_ADMIN',
    entityType: 'admin_invitation',
    entityId: invitationId,
    summary: `Invited ${cleanEmail} as Admin (expires in ${params.expiresInDays}d)`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return { invitationId, rawToken };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `admin_invitations/${invitationId}`);
  }
}

export async function revokeAdminInvitation(
  actor: UserProfile,
  invitation: AdminInvitation
): Promise<void> {
  if (isServerAuthActive()) {
    await serverRevokeInvitation(invitation.id);
    return;
  }
  const batch = writeBatch(db);
  batch.update(doc(db, 'admin_invitations', invitation.id), {
    status: 'REVOKED',
  });
  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: actor.uid,
    actorEmail: actor.email,
    action: 'REVOKE_INVITATION',
    entityType: 'admin_invitation',
    entityId: invitation.id,
    summary: `Revoked admin invitation for ${invitation.email}`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `admin_invitations/${invitation.id}`);
  }
}

export async function promoteOrUpdateAdmin(params: {
  actor: UserProfile;
  targetProfile: UserProfile;
  role: 'USER' | 'ADMIN';
  status: UserStatus;
  permissions?: AdminPermissionsMap;
}): Promise<void> {
  const { actor, targetProfile, role, status, permissions } = params;
  if (targetProfile.email.toLowerCase() === PERMANENT_SUPER_ADMIN_EMAIL) {
    throw new Error('Permanent Super Admin account cannot be modified or demoted.');
  }
  if (isServerAuthActive()) {
    await serverPromoteOrUpdateAdmin(targetProfile.uid, { role, status, permissions });
    return;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'profiles', targetProfile.uid), {
    role,
    status,
    displayName: targetProfile.displayName,
  });

  if (role === 'ADMIN' && permissions) {
    batch.set(doc(db, 'admin_permissions', targetProfile.uid), {
      adminUserId: targetProfile.uid,
      adminEmail: targetProfile.email,
      permissions,
      grantedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
  } else if (role === 'USER') {
    batch.delete(doc(db, 'admin_permissions', targetProfile.uid));
  }

  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: actor.uid,
    actorEmail: actor.email,
    action: role === 'USER' ? 'REVOKE_ADMIN' : status === 'SUSPENDED' ? 'SUSPEND_ADMIN' : 'UPDATE_ADMIN',
    entityType: 'profile',
    entityId: targetProfile.uid,
    summary: `Set ${targetProfile.email} to role=${role}, status=${status}`,
    oldValue: `${targetProfile.role}/${targetProfile.status}`,
    newValue: `${role}/${status}`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `profiles/${targetProfile.uid}`);
  }
}

export async function updateAdminPermissions(params: {
  actor: UserProfile;
  targetProfile: UserProfile;
  permissions: AdminPermissionsMap;
}): Promise<void> {
  if (params.targetProfile.email.toLowerCase() === PERMANENT_SUPER_ADMIN_EMAIL) {
    throw new Error('Super Admin permissions are permanent.');
  }
  if (isServerAuthActive()) {
    await serverUpdateAdminPermissions(params.targetProfile.uid, params.permissions);
    return;
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'admin_permissions', params.targetProfile.uid), {
    adminUserId: params.targetProfile.uid,
    adminEmail: params.targetProfile.email,
    permissions: params.permissions,
    grantedBy: params.actor.uid,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'audit_logs', generateSafeId('log')), {
    actorUserId: params.actor.uid,
    actorEmail: params.actor.email,
    action: 'UPDATE_PERMISSIONS',
    entityType: 'admin_permissions',
    entityId: params.targetProfile.uid,
    summary: `Updated granular permissions for ${params.targetProfile.email}`,
    newValue: JSON.stringify(
      Object.entries(params.permissions)
        .filter(([, v]) => v)
        .map(([k]) => k)
    ),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `admin_permissions/${params.targetProfile.uid}`);
  }
}
