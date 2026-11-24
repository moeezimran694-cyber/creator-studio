import { type Collection, type Db, MongoClient } from 'mongodb';
import {
  DEFAULT_WEBSITE_SETTINGS,
  STARTER_APPS_SEED,
  STARTER_PAYMENT_SETTINGS,
  buildPackageManifestPayload,
} from '../src/lib/defaults.ts';
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
  PaymentSetting,
  UserProfile,
  WebsiteSettingsBundle,
} from '../src/types/index.ts';

export interface AuthAccountRecord {
  uid: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  emailVerified: boolean;
  verificationCodeHash?: string | null;
  verificationExpiresAt?: Date | null;
  resetCodeHash?: string | null;
  resetExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderScreenshotRecord {
  orderId: string;
  userId: string;
  imageData: string;
  createdAt: Date;
}

export interface DownloadTokenRecord {
  tokenId: string;
  userId: string;
  appId: string;
  orderId: string;
  used: boolean;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
}

export interface WebsiteSettingDoc {
  settingKey: keyof WebsiteSettingsBundle;
  settingValue: WebsiteSettingsBundle[keyof WebsiteSettingsBundle];
  updatedBy: string;
  updatedAt: Date;
}

export interface MongoStatusInfo {
  mongoConfigured: boolean;
  mongoConnected: boolean;
  mongoDbName: string;
  mongoError: string | null;
  storageMode: 'mongodb' | 'preview-memory';
}

const DEFAULT_DB_NAME = (process.env.MONGODB_DB_NAME || 'creator_studio').trim() || 'creator_studio';

let client: MongoClient | null = null;
let database: Db | null = null;
let mongoConnected = false;
let mongoError: string | null = null;
let connectPromise: Promise<void> | null = null;

function readMongoUri(): string {
  return (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
}

function sanitizeMongoErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Strip any credentials if a driver error echoes part of a connection URI
  return raw.replace(/mongodb(\+srv)?:\/\/[^\s@]+@/gi, 'mongodb$1://***:***@').slice(0, 260);
}

export function isValidMongoUri(uri: string): boolean {
  return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
}

export function hasUnsafeMongoKeys(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasUnsafeMongoKeys(item, depth + 1));
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.startsWith('$') || k === '__proto__' || k === 'constructor' || k === 'prototype') {
      return true;
    }
    if (hasUnsafeMongoKeys(v, depth + 1)) return true;
  }
  return false;
}

async function ensureMongoIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection('auth_accounts').createIndex({ email: 1 }, { unique: true }),
    db.collection('auth_accounts').createIndex({ uid: 1 }, { unique: true }),
    db.collection('profiles').createIndex({ uid: 1 }, { unique: true }),
    db.collection('profiles').createIndex({ email: 1 }, { unique: true }),
    db.collection('admin_permissions').createIndex({ adminUserId: 1 }, { unique: true }),
    db.collection('admin_invitations').createIndex({ id: 1 }, { unique: true }),
    db.collection('admin_invitations').createIndex({ email: 1, status: 1 }),
    db.collection('apps').createIndex({ id: 1 }, { unique: true }),
    db.collection('apps').createIndex({ isPublished: 1 }),
    db.collection('app_files').createIndex({ appId: 1 }, { unique: true }),
    db.collection('orders').createIndex({ id: 1 }, { unique: true }),
    db.collection('orders').createIndex({ userId: 1, createdAt: -1 }),
    db.collection('order_screenshots').createIndex({ orderId: 1 }, { unique: true }),
    db.collection('entitlements').createIndex({ id: 1 }, { unique: true }),
    db.collection('entitlements').createIndex({ userId: 1 }),
    db.collection('payment_settings').createIndex({ id: 1 }, { unique: true }),
    db.collection('website_settings').createIndex({ settingKey: 1 }, { unique: true }),
    db.collection('audit_logs').createIndex({ createdAt: -1 }),
    db.collection('download_logs').createIndex({ createdAt: -1 }),
    db.collection('download_tokens').createIndex({ tokenId: 1 }, { unique: true }),
  ]);
}

export async function initMongoConnection(): Promise<MongoStatusInfo> {
  const uri = readMongoUri();
  if (!uri) {
    mongoConnected = false;
    mongoError = null;
    database = null;
    return getMongoStatusSnapshot();
  }

  if (!isValidMongoUri(uri)) {
    mongoConnected = false;
    mongoError = 'MONGODB_URI must start with mongodb:// or mongodb+srv://.';
    database = null;
    return getMongoStatusSnapshot();
  }

  if (connectPromise) {
    await connectPromise;
    return getMongoStatusSnapshot();
  }

  connectPromise = (async () => {
    try {
      const nextClient = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        maxPoolSize: 15,
      });
      await nextClient.connect();
      const nextDb = nextClient.db(DEFAULT_DB_NAME);
      await nextDb.command({ ping: 1 });
      await ensureMongoIndexes(nextDb);

      client = nextClient;
      database = nextDb;
      mongoConnected = true;
      mongoError = null;
      console.log(`MongoDB connected cleanly to database "${DEFAULT_DB_NAME}".`);
    } catch (err) {
      mongoConnected = false;
      database = null;
      mongoError = sanitizeMongoErrorMessage(err);
      console.error('MongoDB connection failed:', mongoError);
    } finally {
      connectPromise = null;
    }
  })();

  await connectPromise;
  return getMongoStatusSnapshot();
}

export function getMongoStatusSnapshot(): MongoStatusInfo {
  const configured = Boolean(readMongoUri());
  return {
    mongoConfigured: configured,
    mongoConnected: configured && mongoConnected && database !== null,
    mongoDbName: DEFAULT_DB_NAME,
    mongoError,
    storageMode: configured && mongoConnected && database !== null ? 'mongodb' : 'preview-memory',
  };
}

export async function pingMongoStatus(): Promise<MongoStatusInfo> {
  const uri = readMongoUri();
  if (!uri) {
    mongoConnected = false;
    mongoError = null;
    database = null;
    return getMongoStatusSnapshot();
  }

  if (!database || !mongoConnected) {
    return initMongoConnection();
  }

  try {
    await database.command({ ping: 1 });
    mongoConnected = true;
    mongoError = null;
  } catch (err) {
    mongoConnected = false;
    database = null;
    mongoError = sanitizeMongoErrorMessage(err);
  }
  return getMongoStatusSnapshot();
}

export function getMongoDb(): Db | null {
  return mongoConnected ? database : null;
}

export function getMongoCollection<T extends object>(name: string): Collection<T> | null {
  const db = getMongoDb();
  return db ? db.collection<T>(name) : null;
}

// ============================================================
// IN-MEMORY PREVIEW STORE (ONLY WHEN MONGODB_URI IS UNSET)
// ============================================================
export const memoryStore = {
  authAccounts: new Map<string, AuthAccountRecord>(), // keyed by email
  profiles: new Map<string, UserProfile>(), // keyed by uid
  adminPermissions: new Map<string, AdminPermissionRecord>(), // keyed by adminUserId
  adminInvitations: new Map<string, AdminInvitation>(), // keyed by id
  apps: new Map<string, AppListing>(), // keyed by id
  appFiles: new Map<string, AppFile>(), // keyed by appId
  orders: new Map<string, Order>(), // keyed by id
  orderScreenshots: new Map<string, OrderScreenshotRecord>(), // keyed by orderId
  entitlements: new Map<string, Entitlement>(), // keyed by id
  paymentSettings: new Map<string, PaymentSetting>(), // keyed by id
  websiteSettings: new Map<string, WebsiteSettingDoc>(), // keyed by settingKey
  auditLogs: [] as AuditLog[],
  downloadLogs: [] as DownloadLog[],
  downloadTokens: new Map<string, DownloadTokenRecord>(), // keyed by tokenId
  revokedTokens: new Set<string>(),
};

export async function seedStarterDataIfEmpty(
  actorUid: string,
  actorEmail: string,
  forceRestoreMissing = false
): Promise<{ seeded: boolean; count: number }> {
  const db = getMongoDb();
  const now = new Date();
  let operations = 0;

  if (db) {
    const appsCol = db.collection<AppListing>('apps');
    const filesCol = db.collection<AppFile>('app_files');
    const settingsCol = db.collection<WebsiteSettingDoc>('website_settings');
    const paymentsCol = db.collection<PaymentSetting>('payment_settings');
    const logsCol = db.collection<AuditLog>('audit_logs');

    const existingAppsCount = await appsCol.countDocuments();
    if (existingAppsCount === 0 || forceRestoreMissing) {
      for (const app of STARTER_APPS_SEED) {
        const exists = await appsCol.findOne({ id: app.id }, { projection: { id: 1 } });
        if (!exists) {
          await appsCol.insertOne({
            id: app.id,
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
            createdAt: now,
            updatedAt: now,
          });
          await filesCol.updateOne(
            { appId: app.id },
            {
              $setOnInsert: {
                appId: app.id,
                downloadStoragePath: buildPackageManifestPayload(app),
                fileName: app.fileName,
                releaseNotes: app.releaseNotes,
                updatedBy: actorUid,
                updatedAt: now,
              },
            },
            { upsert: true }
          );
          operations += 2;
        }
      }
    }

    for (const [key, value] of Object.entries(DEFAULT_WEBSITE_SETTINGS) as [
      keyof WebsiteSettingsBundle,
      WebsiteSettingsBundle[keyof WebsiteSettingsBundle],
    ][]) {
      const exists = await settingsCol.findOne({ settingKey: key }, { projection: { settingKey: 1 } });
      if (!exists) {
        await settingsCol.insertOne({
          settingKey: key,
          settingValue: value,
          updatedBy: actorUid,
          updatedAt: now,
        });
        operations++;
      }
    }

    for (const payment of STARTER_PAYMENT_SETTINGS) {
      const exists = await paymentsCol.findOne({ id: payment.id }, { projection: { id: 1 } });
      if (!exists) {
        await paymentsCol.insertOne({
          id: payment.id,
          method: payment.method,
          accountTitle: payment.accountTitle,
          accountNumber: payment.accountNumber,
          instructions: payment.instructions,
          qrImagePath: payment.qrImagePath,
          isEnabled: payment.isEnabled,
          updatedBy: actorUid,
          updatedAt: now,
        });
        operations++;
      }
    }

    if (operations > 0) {
      await logsCol.insertOne({
        id: `log_${Date.now().toString(36)}`,
        actorUserId: actorUid,
        actorEmail,
        action: 'SEED_DATABASE',
        entityType: 'system',
        entityId: 'initial_seed',
        summary: `Initialized MongoDB database with ${operations} starter records`,
        createdAt: now,
      });
    }

    return { seeded: operations > 0, count: operations };
  }

  // Preview in-memory fallback when MONGODB_URI is not configured
  const shouldSeedApps = memoryStore.apps.size === 0 || forceRestoreMissing;
  if (shouldSeedApps) {
    for (const app of STARTER_APPS_SEED) {
      if (!memoryStore.apps.has(app.id)) {
        memoryStore.apps.set(app.id, {
          id: app.id,
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
          createdAt: now,
          updatedAt: now,
        });
        memoryStore.appFiles.set(app.id, {
          appId: app.id,
          downloadStoragePath: buildPackageManifestPayload(app),
          fileName: app.fileName,
          releaseNotes: app.releaseNotes,
          updatedBy: actorUid,
          updatedAt: now,
        });
        operations += 2;
      }
    }
  }

  for (const [key, value] of Object.entries(DEFAULT_WEBSITE_SETTINGS) as [
    keyof WebsiteSettingsBundle,
    WebsiteSettingsBundle[keyof WebsiteSettingsBundle],
  ][]) {
    if (!memoryStore.websiteSettings.has(key)) {
      memoryStore.websiteSettings.set(key, {
        settingKey: key,
        settingValue: value,
        updatedBy: actorUid,
        updatedAt: now,
      });
      operations++;
    }
  }

  for (const payment of STARTER_PAYMENT_SETTINGS) {
    if (!memoryStore.paymentSettings.has(payment.id)) {
      memoryStore.paymentSettings.set(payment.id, {
        id: payment.id,
        method: payment.method,
        accountTitle: payment.accountTitle,
        accountNumber: payment.accountNumber,
        instructions: payment.instructions,
        qrImagePath: payment.qrImagePath,
        isEnabled: payment.isEnabled,
        updatedBy: actorUid,
        updatedAt: now,
      });
      operations++;
    }
  }

  if (operations > 0) {
    memoryStore.auditLogs.unshift({
      id: `log_${Date.now().toString(36)}`,
      actorUserId: actorUid,
      actorEmail,
      action: 'SEED_DATABASE',
      entityType: 'system',
      entityId: 'initial_seed',
      summary: `Initialized preview store with ${operations} starter records`,
      createdAt: now,
    });
  }

  return { seeded: operations > 0, count: operations };
}

export async function closeMongoConnection(): Promise<void> {
  if (client) {
    await client.close().catch(() => undefined);
    client = null;
    database = null;
    mongoConnected = false;
  }
}

export function stripMongoInternalId<T extends object>(doc: T & { _id?: unknown }): T {
  const { _id: _ignored, ...rest } = doc;
  return rest as T;
}

export type { AdminPermissionsMap };
