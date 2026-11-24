import crypto from 'node:crypto';
import { type Request, type Response, type Router } from 'express';
import { DEFAULT_WEBSITE_SETTINGS } from '../src/lib/defaults.ts';
import {
  EMPTY_PERMISSIONS,
  PERMANENT_SUPER_ADMIN_EMAIL,
  type AdminInvitation,
  type AdminPermissionKey,
  type AdminPermissionRecord,
  type AdminPermissionsMap,
  type AppFile,
  type AppListing,
  type AuditLog,
  type DownloadLog,
  type Entitlement,
  type Order,
  type PaymentSetting,
  type UserProfile,
  type WebsiteSettingsBundle,
} from '../src/types/index.ts';
import {
  isValidGmailServer,
  normalizeGmail,
  resolveServerSession,
} from './auth.ts';
import {
  getMongoCollection,
  getMongoDb,
  hasUnsafeMongoKeys,
  memoryStore,
  type OrderScreenshotRecord,
  seedStarterDataIfEmpty,
  stripMongoInternalId,
  type WebsiteSettingDoc,
} from './mongo.ts';

type ResolvedSession = NonNullable<Awaited<ReturnType<typeof resolveServerSession>>>;

function isSafeId(val: unknown): val is string {
  return (
    typeof val === 'string' &&
    val.length >= 1 &&
    val.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(val)
  );
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
}

function slugifyAppId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'app'}-${Date.now().toString(36)}`;
}

async function authenticateRequest(req: Request, res: Response): Promise<ResolvedSession | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  const session = await resolveServerSession(token);
  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    return null;
  }
  return session;
}

function isSuperAdmin(session: ResolvedSession): boolean {
  return (
    session.profile.status === 'ACTIVE' &&
    session.profile.role === 'SUPER_ADMIN' &&
    session.profile.email === PERMANENT_SUPER_ADMIN_EMAIL
  );
}

function isActiveAdmin(session: ResolvedSession): boolean {
  return (
    session.profile.status === 'ACTIVE' &&
    (session.profile.role === 'SUPER_ADMIN' || session.profile.role === 'ADMIN')
  );
}

function hasPerm(session: ResolvedSession, key: AdminPermissionKey): boolean {
  return isSuperAdmin(session) || (isActiveAdmin(session) && session.permissions[key] === true);
}

async function appendAuditLog(params: {
  actorUserId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  oldValue?: unknown;
  newValue?: unknown;
}): Promise<void> {
  const entry: AuditLog = {
    id: makeId('log'),
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    action: params.action.slice(0, 80),
    entityType: params.entityType.slice(0, 64),
    entityId: params.entityId.slice(0, 128),
    summary: params.summary.slice(0, 500),
    oldValue:
      params.oldValue !== undefined
        ? JSON.stringify(params.oldValue).slice(0, 4000)
        : undefined,
    newValue:
      params.newValue !== undefined
        ? JSON.stringify(params.newValue).slice(0, 4000)
        : undefined,
    createdAt: new Date(),
  };

  const col = getMongoCollection<AuditLog>('audit_logs');
  if (col) {
    await col.insertOne(entry);
  } else {
    memoryStore.auditLogs.unshift(entry);
    if (memoryStore.auditLogs.length > 500) {
      memoryStore.auditLogs.length = 500;
    }
  }
}

export async function getPublicSettingsBundleFromServer(): Promise<{
  settings: WebsiteSettingsBundle;
  initialized: boolean;
}> {
  const col = getMongoCollection<WebsiteSettingDoc>('website_settings');
  const docs = col
    ? (await col.find({}).toArray()).map(stripMongoInternalId)
    : Array.from(memoryStore.websiteSettings.values());

  if (docs.length === 0) {
    return { settings: DEFAULT_WEBSITE_SETTINGS, initialized: false };
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

  for (const d of docs) {
    if (d.settingKey in merged && d.settingValue && typeof d.settingValue === 'object') {
      (merged as unknown as Record<string, unknown>)[d.settingKey] = {
        ...(merged as unknown as Record<string, Record<string, unknown>>)[d.settingKey],
        ...(d.settingValue as unknown as Record<string, unknown>),
      };
    }
  }

  return { settings: merged, initialized: true };
}

export async function findServerAppAndFile(appId: string): Promise<{
  app: AppListing | null;
  appFile: AppFile | null;
}> {
  const appsCol = getMongoCollection<AppListing>('apps');
  const filesCol = getMongoCollection<AppFile>('app_files');
  const app = appsCol
    ? await appsCol.findOne({ id: appId })
    : memoryStore.apps.get(appId) || null;
  const appFile = filesCol
    ? await filesCol.findOne({ appId })
    : memoryStore.appFiles.get(appId) || null;

  return {
    app: app ? stripMongoInternalId(app) : null,
    appFile: appFile ? stripMongoInternalId(appFile) : null,
  };
}

export async function findServerOrderAndEntitlement(
  orderId: string,
  userId: string,
  appId: string
): Promise<{
  order: Order | null;
  entitlement: Entitlement | null;
}> {
  const ordersCol = getMongoCollection<Order>('orders');
  const entCol = getMongoCollection<Entitlement>('entitlements');
  const entId = `${userId}_${appId}`;
  const order = ordersCol
    ? await ordersCol.findOne({ id: orderId })
    : memoryStore.orders.get(orderId) || null;
  const entitlement = entCol
    ? await entCol.findOne({ id: entId })
    : memoryStore.entitlements.get(entId) || null;

  return {
    order: order ? stripMongoInternalId(order) : null,
    entitlement: entitlement ? stripMongoInternalId(entitlement) : null,
  };
}

export function registerDataRoutes(app: Router): void {
  // Reject unsafe MongoDB operator payloads across all /api/data/* endpoints
  app.use('/api/data', (req, res, next) => {
    if (req.body && hasUnsafeMongoKeys(req.body)) {
      res.status(400).json({ error: 'Invalid input keys detected.' });
      return;
    }
    next();
  });

  // Public storefront catalog + settings + enabled payments
  app.get('/api/data/public', async (_req: Request, res: Response) => {
    try {
      const [{ settings, initialized }, apps, payments] = await Promise.all([
        getPublicSettingsBundleFromServer(),
        (async () => {
          const col = getMongoCollection<AppListing>('apps');
          if (col) {
            return (await col.find({ isPublished: true }).toArray()).map(stripMongoInternalId);
          }
          return Array.from(memoryStore.apps.values()).filter((a) => a.isPublished);
        })(),
        (async () => {
          const col = getMongoCollection<PaymentSetting>('payment_settings');
          if (col) {
            return (await col.find({ isEnabled: true }).toArray()).map(stripMongoInternalId);
          }
          return Array.from(memoryStore.paymentSettings.values()).filter((p) => p.isEnabled);
        })(),
      ]);

      res.json({ settings, initialized, apps, payments });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to load storefront data.',
      });
    }
  });

  // Authenticated customer orders & entitlements
  app.get('/api/data/user', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;

    try {
      const ordersCol = getMongoCollection<Order>('orders');
      const entCol = getMongoCollection<Entitlement>('entitlements');

      const orders = ordersCol
        ? (
            await ordersCol
              .find({ userId: session.profile.uid })
              .sort({ createdAt: -1 })
              .toArray()
          ).map(stripMongoInternalId)
        : Array.from(memoryStore.orders.values())
            .filter((o) => o.userId === session.profile.uid)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const entitlements = entCol
        ? (await entCol.find({ userId: session.profile.uid }).toArray()).map(
            stripMongoInternalId
          )
        : Array.from(memoryStore.entitlements.values()).filter(
            (e) => e.userId === session.profile.uid
          );

      res.json({ orders, entitlements });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to load user orders.',
      });
    }
  });

  // Submit customer order (authoritative PKR price read from DB)
  app.post('/api/data/orders', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (session.profile.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Account is suspended.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const appId = body.appId;
    const paymentMethod = body.paymentMethod;
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
    const screenshotDataUrl =
      typeof body.screenshotDataUrl === 'string' ? body.screenshotDataUrl : '';

    if (!isSafeId(appId)) {
      res.status(400).json({ error: 'Valid appId is required.' });
      return;
    }
    if (paymentMethod !== 'EasyPaisa' && paymentMethod !== 'JazzCash') {
      res.status(400).json({ error: 'Payment method must be EasyPaisa or JazzCash.' });
      return;
    }
    if (!/^\d{11}$/.test(transactionId)) {
      res.status(400).json({ error: 'Please enter a valid 11-digit numeric Transaction ID.' });
      return;
    }
    if (
      screenshotDataUrl &&
      (!screenshotDataUrl.startsWith('data:image/') || screenshotDataUrl.length > 600_000)
    ) {
      res.status(400).json({ error: 'Invalid or oversized payment screenshot.' });
      return;
    }

    try {
      const { app: targetApp } = await findServerAppAndFile(appId);
      if (!targetApp || !targetApp.isPublished) {
        res.status(404).json({ error: 'This application is currently unavailable for purchase.' });
        return;
      }

      const orderId = makeId('ord');
      const now = new Date();
      const newOrder: Order = {
        id: orderId,
        userId: session.profile.uid,
        userEmail: session.profile.email,
        userName: session.profile.displayName.slice(0, 120),
        appId: targetApp.id,
        appName: targetApp.name.slice(0, 120),
        transactionId,
        paymentMethod,
        hasScreenshot: Boolean(screenshotDataUrl),
        amountPkr: Number(targetApp.pricePkr) || 0,
        status: 'PENDING',
        reviewedBy: null,
        reviewedByEmail: null,
        reviewedAt: null,
        createdAt: now,
      };

      const ordersCol = getMongoCollection<Order>('orders');
      if (ordersCol) {
        await ordersCol.insertOne(newOrder);
        if (screenshotDataUrl) {
          await getMongoCollection<OrderScreenshotRecord>('order_screenshots')?.insertOne({
            orderId,
            userId: session.profile.uid,
            imageData: screenshotDataUrl,
            createdAt: now,
          });
        }
      } else {
        memoryStore.orders.set(orderId, newOrder);
        if (screenshotDataUrl) {
          memoryStore.orderScreenshots.set(orderId, {
            orderId,
            userId: session.profile.uid,
            imageData: screenshotDataUrl,
            createdAt: now,
          });
        }
      }

      res.status(201).json({ orderId, order: newOrder });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to submit order.',
      });
    }
  });

  // Protected app file metadata (for Admin editing or entitled user inspection)
  app.get('/api/data/app-file/:appId', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    const appId = req.params.appId;
    if (!isSafeId(appId)) {
      res.status(400).json({ error: 'Valid appId is required.' });
      return;
    }

    const canView =
      isActiveAdmin(session) ||
      hasPerm(session, 'apps_view') ||
      hasPerm(session, 'apps_change_files') ||
      Boolean(
        getMongoDb()
          ? await getMongoCollection<Entitlement>('entitlements')?.findOne({
              id: `${session.profile.uid}_${appId}`,
            })
          : memoryStore.entitlements.get(`${session.profile.uid}_${appId}`)
      );

    if (!canView) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const { appFile } = await findServerAppAndFile(appId);
    res.json({ appFile });
  });

  // Admin dashboard bundle (strictly scoped by caller permissions)
  app.get('/api/data/admin/dashboard', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!isActiveAdmin(session)) {
      res.status(403).json({ error: 'Active Administrator access required.' });
      return;
    }

    try {
      const superAdmin = isSuperAdmin(session);
      const db = getMongoDb();

      const apps =
        superAdmin || hasPerm(session, 'apps_view')
          ? db
            ? (await db.collection<AppListing>('apps').find({}).toArray()).map(stripMongoInternalId)
            : Array.from(memoryStore.apps.values())
          : [];

      const orders =
        superAdmin || hasPerm(session, 'orders_view')
          ? db
            ? (
                await db.collection<Order>('orders').find({}).sort({ createdAt: -1 }).toArray()
              ).map(stripMongoInternalId)
            : Array.from(memoryStore.orders.values()).sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )
          : [];

      const paymentSettings =
        superAdmin || hasPerm(session, 'payments_view')
          ? db
            ? (
                await db.collection<PaymentSetting>('payment_settings').find({}).toArray()
              ).map(stripMongoInternalId)
            : Array.from(memoryStore.paymentSettings.values())
          : [];

      const profiles = superAdmin
        ? db
          ? (
              await db.collection<UserProfile>('profiles').find({}).sort({ lastLogin: -1 }).toArray()
            ).map(stripMongoInternalId)
          : Array.from(memoryStore.profiles.values()).sort(
              (a, b) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime()
            )
        : [];

      const permissionRecords = superAdmin
        ? db
          ? (
              await db.collection<AdminPermissionRecord>('admin_permissions').find({}).toArray()
            ).map(stripMongoInternalId)
          : Array.from(memoryStore.adminPermissions.values())
        : [];

      const invitations = superAdmin
        ? db
          ? (
              await db
                .collection<AdminInvitation>('admin_invitations')
                .find({})
                .sort({ createdAt: -1 })
                .toArray()
            ).map(stripMongoInternalId)
          : Array.from(memoryStore.adminInvitations.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
        : [];

      const auditLogs = db
        ? (
            await db
              .collection<AuditLog>('audit_logs')
              .find({})
              .sort({ createdAt: -1 })
              .limit(200)
              .toArray()
          ).map(stripMongoInternalId)
        : memoryStore.auditLogs.slice(0, 200);

      const downloadLogs = db
        ? (
            await db
              .collection<DownloadLog>('download_logs')
              .find({})
              .sort({ createdAt: -1 })
              .limit(300)
              .toArray()
          ).map(stripMongoInternalId)
        : memoryStore.downloadLogs.slice(0, 300);

      res.json({
        apps,
        orders,
        paymentSettings,
        profiles,
        permissionRecords,
        invitations,
        auditLogs,
        downloadLogs,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to load admin dashboard.',
      });
    }
  });

  // Super Admin starter database seed
  app.post('/api/data/admin/seed', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!isSuperAdmin(session)) {
      res.status(403).json({ error: 'Only the Super Admin can seed the database.' });
      return;
    }
    const force = Boolean((req.body || {}).forceRestoreMissing);
    const result = await seedStarterDataIfEmpty(session.profile.uid, session.profile.email, force);
    res.json(result);
  });

  // Create App
  app.post('/api/data/admin/apps', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!hasPerm(session, 'apps_add')) {
      res.status(403).json({ error: 'Missing permission: apps_add.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    if (!name) {
      res.status(400).json({ error: 'App name is required.' });
      return;
    }

    const appId = slugifyAppId(name);
    const now = new Date();
    const pricePkr = Math.max(0, Math.round(Number(body.pricePkr) || 0));
    const features = Array.isArray(body.features)
      ? body.features.map((f) => String(f).trim().slice(0, 160)).filter(Boolean).slice(0, 12)
      : [];

    const listing: AppListing = {
      id: appId,
      name,
      iconUrl: typeof body.iconUrl === 'string' ? body.iconUrl.trim().slice(0, 500000) : '',
      iconKey: typeof body.iconKey === 'string' ? body.iconKey.trim().slice(0, 64) : '',
      category: typeof body.category === 'string' ? body.category.trim().slice(0, 64) : 'Tools',
      version: typeof body.version === 'string' ? body.version.trim().slice(0, 40) : 'v1.0',
      fileSize: typeof body.fileSize === 'string' ? body.fileSize.trim().slice(0, 40) : '1 MB',
      description:
        typeof body.description === 'string' ? body.description.trim().slice(0, 1500) : name,
      features,
      pricePkr,
      isFeatured: Boolean(body.isFeatured),
      isPublished: Boolean(body.isPublished),
      createdAt: now,
      updatedAt: now,
    };

    const appFile: AppFile = {
      appId,
      downloadStoragePath:
        typeof body.downloadStoragePath === 'string'
          ? body.downloadStoragePath.trim().slice(0, 600000)
          : '',
      fileName:
        typeof body.fileName === 'string' && body.fileName.trim()
          ? body.fileName.trim().slice(0, 160)
          : `${appId}-package.txt`,
      releaseNotes:
        typeof body.releaseNotes === 'string' ? body.releaseNotes.trim().slice(0, 1000) : '',
      updatedBy: session.profile.uid,
      updatedAt: now,
    };

    if (!appFile.downloadStoragePath) {
      res.status(400).json({ error: 'Software file or HTTPS download link is required.' });
      return;
    }

    const db = getMongoDb();
    if (db) {
      await db.collection<AppListing>('apps').insertOne(listing);
      await db.collection<AppFile>('app_files').insertOne(appFile);
    } else {
      memoryStore.apps.set(appId, listing);
      memoryStore.appFiles.set(appId, appFile);
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: 'CREATE_APP',
      entityType: 'app',
      entityId: appId,
      summary: `Added app "${name}" (Rs. ${pricePkr})`,
      newValue: `${name} ${listing.version} · Rs. ${pricePkr}`,
    });

    res.status(201).json({ appId, app: listing });
  });

  // Update App
  app.put('/api/data/admin/apps/:appId', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    const appId = req.params.appId;
    if (!isSafeId(appId)) {
      res.status(400).json({ error: 'Invalid appId.' });
      return;
    }

    const canEditDetails = hasPerm(session, 'apps_edit');
    const canEditPrice = hasPerm(session, 'apps_change_price');
    const canEditFiles = hasPerm(session, 'apps_change_files');
    if (!canEditDetails && !canEditPrice && !canEditFiles) {
      res.status(403).json({ error: 'Missing permissions to update app.' });
      return;
    }

    const { app: existing } = await findServerAppAndFile(appId);
    if (!existing) {
      res.status(404).json({ error: 'App not found.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const updates = (body.updates || {}) as Record<string, unknown>;
    const fileUpdates = (body.fileUpdates || null) as Record<string, unknown> | null;
    const now = new Date();

    const nextApp: AppListing = { ...existing, updatedAt: now };
    if (canEditDetails) {
      if (typeof updates.name === 'string' && updates.name.trim()) {
        nextApp.name = updates.name.trim().slice(0, 120);
      }
      if (typeof updates.iconUrl === 'string') {
        nextApp.iconUrl = updates.iconUrl.trim().slice(0, 500000);
      }
      if (typeof updates.iconKey === 'string') {
        nextApp.iconKey = updates.iconKey.trim().slice(0, 64);
      }
      if (typeof updates.category === 'string' && updates.category.trim()) {
        nextApp.category = updates.category.trim().slice(0, 64);
      }
      if (typeof updates.version === 'string' && updates.version.trim()) {
        nextApp.version = updates.version.trim().slice(0, 40);
      }
      if (typeof updates.fileSize === 'string' && updates.fileSize.trim()) {
        nextApp.fileSize = updates.fileSize.trim().slice(0, 40);
      }
      if (typeof updates.description === 'string' && updates.description.trim()) {
        nextApp.description = updates.description.trim().slice(0, 1500);
      }
      if (Array.isArray(updates.features)) {
        nextApp.features = updates.features
          .map((f) => String(f).trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, 12);
      }
      if (updates.isFeatured !== undefined) nextApp.isFeatured = Boolean(updates.isFeatured);
      if (updates.isPublished !== undefined) nextApp.isPublished = Boolean(updates.isPublished);
    }
    if (canEditPrice && updates.pricePkr !== undefined) {
      nextApp.pricePkr = Math.max(0, Math.round(Number(updates.pricePkr) || 0));
    }

    const db = getMongoDb();
    if (db) {
      await db.collection<AppListing>('apps').updateOne({ id: appId }, { $set: nextApp });
      if (canEditFiles && fileUpdates && typeof fileUpdates.downloadStoragePath === 'string' && fileUpdates.downloadStoragePath.trim()) {
        await db.collection<AppFile>('app_files').updateOne(
          { appId },
          {
            $set: {
              appId,
              downloadStoragePath: fileUpdates.downloadStoragePath.trim().slice(0, 600000),
              fileName:
                typeof fileUpdates.fileName === 'string' && fileUpdates.fileName.trim()
                  ? fileUpdates.fileName.trim().slice(0, 160)
                  : `${appId}-package.txt`,
              releaseNotes:
                typeof fileUpdates.releaseNotes === 'string'
                  ? fileUpdates.releaseNotes.trim().slice(0, 1000)
                  : '',
              updatedBy: session.profile.uid,
              updatedAt: now,
            },
          },
          { upsert: true }
        );
      }
    } else {
      memoryStore.apps.set(appId, nextApp);
      if (canEditFiles && fileUpdates && typeof fileUpdates.downloadStoragePath === 'string' && fileUpdates.downloadStoragePath.trim()) {
        memoryStore.appFiles.set(appId, {
          appId,
          downloadStoragePath: fileUpdates.downloadStoragePath.trim().slice(0, 600000),
          fileName:
            typeof fileUpdates.fileName === 'string' && fileUpdates.fileName.trim()
              ? fileUpdates.fileName.trim().slice(0, 160)
              : `${appId}-package.txt`,
          releaseNotes:
            typeof fileUpdates.releaseNotes === 'string'
              ? fileUpdates.releaseNotes.trim().slice(0, 1000)
              : '',
          updatedBy: session.profile.uid,
          updatedAt: now,
        });
      }
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: 'UPDATE_APP',
      entityType: 'app',
      entityId: appId,
      summary: `Updated app "${nextApp.name}"`,
      oldValue: `${existing.name} ${existing.version} · Rs. ${existing.pricePkr}`,
      newValue: `${nextApp.name} ${nextApp.version} · Rs. ${nextApp.pricePkr}`,
    });

    res.json({ app: nextApp });
  });

  // Toggle published / featured flag
  app.patch('/api/data/admin/apps/:appId/flag', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!hasPerm(session, 'apps_edit')) {
      res.status(403).json({ error: 'Missing permission: apps_edit.' });
      return;
    }
    const appId = req.params.appId;
    if (!isSafeId(appId)) {
      res.status(400).json({ error: 'Invalid appId.' });
      return;
    }

    const { field, value } = (req.body || {}) as { field?: unknown; value?: unknown };
    if (field !== 'isPublished' && field !== 'isFeatured') {
      res.status(400).json({ error: 'Invalid flag field.' });
      return;
    }

    const { app: existing } = await findServerAppAndFile(appId);
    if (!existing) {
      res.status(404).json({ error: 'App not found.' });
      return;
    }

    const boolVal = Boolean(value);
    const updated: AppListing = { ...existing, [field]: boolVal, updatedAt: new Date() };
    const col = getMongoCollection<AppListing>('apps');
    if (col) {
      await col.updateOne({ id: appId }, { $set: { [field]: boolVal, updatedAt: updated.updatedAt } });
    } else {
      memoryStore.apps.set(appId, updated);
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: field === 'isPublished' ? (boolVal ? 'PUBLISH_APP' : 'UNPUBLISH_APP') : 'TOGGLE_FEATURED_APP',
      entityType: 'app',
      entityId: appId,
      summary: `${field === 'isPublished' ? (boolVal ? 'Published' : 'Unpublished') : boolVal ? 'Featured' : 'Unfeatured'} "${existing.name}"`,
    });

    res.json({ app: updated });
  });

  // Delete App
  app.delete('/api/data/admin/apps/:appId', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!hasPerm(session, 'apps_delete')) {
      res.status(403).json({ error: 'Missing permission: apps_delete.' });
      return;
    }
    const appId = req.params.appId;
    if (!isSafeId(appId)) {
      res.status(400).json({ error: 'Invalid appId.' });
      return;
    }
    const { app: existing } = await findServerAppAndFile(appId);
    if (!existing) {
      res.status(404).json({ error: 'App not found.' });
      return;
    }

    const db = getMongoDb();
    if (db) {
      await db.collection<AppListing>('apps').deleteOne({ id: appId });
      await db.collection<AppFile>('app_files').deleteOne({ appId });
    } else {
      memoryStore.apps.delete(appId);
      memoryStore.appFiles.delete(appId);
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: 'DELETE_APP',
      entityType: 'app',
      entityId: appId,
      summary: `Deleted app "${existing.name}"`,
      oldValue: `${existing.name} (${existing.version})`,
    });

    res.json({ deleted: true });
  });

  // Order screenshot
  app.get('/api/data/admin/orders/:orderId/screenshot', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    const orderId = req.params.orderId;
    if (!isSafeId(orderId)) {
      res.status(400).json({ error: 'Invalid orderId.' });
      return;
    }

    const col = getMongoCollection<OrderScreenshotRecord>('order_screenshots');
    const doc = col
      ? await col.findOne({ orderId })
      : memoryStore.orderScreenshots.get(orderId) || null;
    if (!doc) {
      res.json({ imageData: null });
      return;
    }
    if (doc.userId !== session.profile.uid && !hasPerm(session, 'orders_view')) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    res.json({ imageData: doc.imageData });
  });

  // Approve Order
  app.post('/api/data/admin/orders/:orderId/approve', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!hasPerm(session, 'orders_approve')) {
      res.status(403).json({ error: 'Missing permission: orders_approve.' });
      return;
    }
    const orderId = req.params.orderId;
    if (!isSafeId(orderId)) {
      res.status(400).json({ error: 'Invalid orderId.' });
      return;
    }

    const ordersCol = getMongoCollection<Order>('orders');
    const existingOrder = ordersCol
      ? await ordersCol.findOne({ id: orderId })
      : memoryStore.orders.get(orderId) || null;
    if (!existingOrder) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    if (!isSuperAdmin(session) && existingOrder.userId === session.profile.uid) {
      res.status(403).json({ error: 'Admins cannot approve their own payment orders.' });
      return;
    }

    const now = new Date();
    const entId = `${existingOrder.userId}_${existingOrder.appId}`;
    const entitlement: Entitlement = {
      id: entId,
      userId: existingOrder.userId,
      appId: existingOrder.appId,
      orderId: existingOrder.id,
      grantedBy: session.profile.uid,
      grantedAt: now,
    };

    const db = getMongoDb();
    if (db) {
      await db.collection<Entitlement>('entitlements').updateOne(
        { id: entId },
        { $set: entitlement },
        { upsert: true }
      );
      await db.collection<Order>('orders').updateOne(
        { id: orderId },
        {
          $set: {
            status: 'APPROVED',
            rejectionReason: '',
            reviewedBy: session.profile.uid,
            reviewedByEmail: session.profile.email,
            reviewedAt: now,
          },
        }
      );
    } else {
      memoryStore.entitlements.set(entId, entitlement);
      memoryStore.orders.set(orderId, {
        ...existingOrder,
        status: 'APPROVED',
        rejectionReason: '',
        reviewedBy: session.profile.uid,
        reviewedByEmail: session.profile.email,
        reviewedAt: now,
      });
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: 'APPROVE_ORDER',
      entityType: 'order',
      entityId: orderId,
      summary: `Approved payment ${existingOrder.transactionId} for ${existingOrder.appName} (${existingOrder.userEmail})`,
      oldValue: existingOrder.status,
      newValue: 'APPROVED',
    });

    res.json({ approved: true });
  });

  // Reject Order
  app.post('/api/data/admin/orders/:orderId/reject', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!hasPerm(session, 'orders_reject')) {
      res.status(403).json({ error: 'Missing permission: orders_reject.' });
      return;
    }
    const orderId = req.params.orderId;
    if (!isSafeId(orderId)) {
      res.status(400).json({ error: 'Invalid orderId.' });
      return;
    }

    const reasonRaw = typeof (req.body || {}).reason === 'string' ? (req.body || {}).reason : '';
    const reason = (
      reasonRaw.trim() || 'Payment verification failed. Contact support with your receipt.'
    ).slice(0, 500);

    const ordersCol = getMongoCollection<Order>('orders');
    const existingOrder = ordersCol
      ? await ordersCol.findOne({ id: orderId })
      : memoryStore.orders.get(orderId) || null;
    if (!existingOrder) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    if (!isSuperAdmin(session) && existingOrder.userId === session.profile.uid) {
      res.status(403).json({ error: 'Admins cannot reject their own payment orders.' });
      return;
    }

    const now = new Date();
    const entId = `${existingOrder.userId}_${existingOrder.appId}`;
    const db = getMongoDb();
    if (db) {
      await db.collection<Order>('orders').updateOne(
        { id: orderId },
        {
          $set: {
            status: 'REJECTED',
            rejectionReason: reason,
            reviewedBy: session.profile.uid,
            reviewedByEmail: session.profile.email,
            reviewedAt: now,
          },
        }
      );
      await db.collection<Entitlement>('entitlements').deleteOne({ id: entId, orderId });
    } else {
      memoryStore.orders.set(orderId, {
        ...existingOrder,
        status: 'REJECTED',
        rejectionReason: reason,
        reviewedBy: session.profile.uid,
        reviewedByEmail: session.profile.email,
        reviewedAt: now,
      });
      const ent = memoryStore.entitlements.get(entId);
      if (ent && ent.orderId === orderId) {
        memoryStore.entitlements.delete(entId);
      }
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: 'REJECT_ORDER',
      entityType: 'order',
      entityId: orderId,
      summary: `Rejected payment ${existingOrder.transactionId} for ${existingOrder.appName} (${existingOrder.userEmail})`,
      oldValue: existingOrder.status,
      newValue: `REJECTED: ${reason}`,
    });

    res.json({ rejected: true });
  });

  // Payment Settings
  app.put('/api/data/admin/payments/:methodId', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    const methodId = req.params.methodId;
    if (methodId !== 'easypaisa' && methodId !== 'jazzcash') {
      res.status(400).json({ error: 'Method must be easypaisa or jazzcash.' });
      return;
    }
    const permKey: AdminPermissionKey =
      methodId === 'easypaisa' ? 'payments_edit_easypaisa' : 'payments_edit_jazzcash';
    if (!hasPerm(session, permKey)) {
      res.status(403).json({ error: `Missing permission: ${permKey}.` });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const setting: PaymentSetting = {
      id: methodId,
      method: methodId === 'easypaisa' ? 'EasyPaisa' : 'JazzCash',
      accountTitle: String(body.accountTitle || '').trim().slice(0, 120),
      accountNumber: String(body.accountNumber || '').trim().slice(0, 64),
      instructions: String(body.instructions || '').trim().slice(0, 1000),
      qrImagePath: typeof body.qrImagePath === 'string' ? body.qrImagePath.trim().slice(0, 500000) : '',
      isEnabled: Boolean(body.isEnabled),
      updatedBy: session.profile.uid,
      updatedAt: new Date(),
    };

    const col = getMongoCollection<PaymentSetting>('payment_settings');
    if (col) {
      await col.updateOne({ id: methodId }, { $set: setting }, { upsert: true });
    } else {
      memoryStore.paymentSettings.set(methodId, setting);
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: 'UPDATE_PAYMENT_SETTING',
      entityType: 'payment_settings',
      entityId: methodId,
      summary: `Updated ${setting.method} payment account details`,
    });

    res.json({ setting });
  });

  // Website Settings
  app.put('/api/data/admin/settings/:settingKey', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    const settingKey = req.params.settingKey as keyof WebsiteSettingsBundle;
    if (!(settingKey in DEFAULT_WEBSITE_SETTINGS)) {
      res.status(400).json({ error: 'Invalid website setting key.' });
      return;
    }

    const permKey: AdminPermissionKey =
      settingKey === 'appearance' ? 'appearance_edit' : 'content_edit';
    if (!hasPerm(session, permKey)) {
      res.status(403).json({ error: `Missing permission: ${permKey}.` });
      return;
    }

    const settingValue = (req.body || {}).settingValue;
    if (!settingValue || typeof settingValue !== 'object' || Array.isArray(settingValue)) {
      res.status(400).json({ error: 'settingValue object is required.' });
      return;
    }

    const doc: WebsiteSettingDoc = {
      settingKey,
      settingValue: settingValue as WebsiteSettingsBundle[keyof WebsiteSettingsBundle],
      updatedBy: session.profile.uid,
      updatedAt: new Date(),
    };

    const col = getMongoCollection<WebsiteSettingDoc>('website_settings');
    if (col) {
      await col.updateOne({ settingKey }, { $set: doc }, { upsert: true });
    } else {
      memoryStore.websiteSettings.set(settingKey, doc);
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: 'UPDATE_WEBSITE_SETTING',
      entityType: 'website_settings',
      entityId: settingKey,
      summary: `Saved website "${settingKey}" settings`,
    });

    res.json({ saved: true });
  });

  // Super Admin: Invitations & Team Management
  app.post('/api/data/admin/invitations', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!isSuperAdmin(session)) {
      res.status(403).json({ error: 'Only the permanent Super Admin can invite administrators.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const cleanEmail = normalizeGmail(body.email);
    if (!isValidGmailServer(cleanEmail)) {
      res.status(400).json({ error: 'Only valid @gmail.com addresses can be invited.' });
      return;
    }
    if (cleanEmail === PERMANENT_SUPER_ADMIN_EMAIL) {
      res.status(400).json({ error: 'Permanent owner already holds SUPER_ADMIN access.' });
      return;
    }

    const permissions: AdminPermissionsMap = {
      ...EMPTY_PERMISSIONS,
      ...(typeof body.permissions === 'object' && body.permissions !== null
        ? (body.permissions as Partial<AdminPermissionsMap>)
        : {}),
    };

    const id = makeId('inv');
    const tokenHash = crypto.createHash('sha256').update(`${id}:${cleanEmail}:${Date.now()}`).digest('hex');
    const now = new Date();
    const invitation: AdminInvitation = {
      id,
      email: cleanEmail,
      invitationTokenHash: tokenHash,
      permissions,
      invitedBy: session.profile.uid,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
      status: 'PENDING',
    };

    const col = getMongoCollection<AdminInvitation>('admin_invitations');
    if (col) {
      await col.insertOne(invitation);
    } else {
      memoryStore.adminInvitations.set(id, invitation);
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: 'INVITE_ADMIN',
      entityType: 'admin_invitation',
      entityId: id,
      summary: `Invited ${cleanEmail} as Admin`,
    });

    res.status(201).json({ id, invitation });
  });

  app.post('/api/data/admin/invitations/:id/revoke', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!isSuperAdmin(session)) {
      res.status(403).json({ error: 'Only Super Admin can revoke invitations.' });
      return;
    }
    const id = req.params.id;
    if (!isSafeId(id)) {
      res.status(400).json({ error: 'Invalid invitation ID.' });
      return;
    }

    const col = getMongoCollection<AdminInvitation>('admin_invitations');
    const inv = col ? await col.findOne({ id }) : memoryStore.adminInvitations.get(id) || null;
    if (!inv) {
      res.status(404).json({ error: 'Invitation not found.' });
      return;
    }

    if (col) {
      await col.updateOne({ id }, { $set: { status: 'REVOKED' } });
    } else {
      memoryStore.adminInvitations.set(id, { ...inv, status: 'REVOKED' });
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: 'REVOKE_INVITATION',
      entityType: 'admin_invitation',
      entityId: id,
      summary: `Revoked admin invitation for ${inv.email}`,
    });

    res.json({ revoked: true });
  });

  app.put('/api/data/admin/profiles/:uid', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!isSuperAdmin(session)) {
      res.status(403).json({ error: 'Only Super Admin can manage administrator roles.' });
      return;
    }
    const uid = req.params.uid;
    if (!isSafeId(uid)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const col = getMongoCollection<UserProfile>('profiles');
    const target = col ? await col.findOne({ uid }) : memoryStore.profiles.get(uid) || null;
    if (!target) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }
    if (target.email.toLowerCase() === PERMANENT_SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Permanent Super Admin account cannot be modified or demoted.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const role = body.role === 'ADMIN' ? 'ADMIN' : 'USER';
    const status = body.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';

    const db = getMongoDb();
    if (db) {
      await db.collection<UserProfile>('profiles').updateOne({ uid }, { $set: { role, status } });
      if (role === 'ADMIN' && body.permissions && typeof body.permissions === 'object') {
        await db.collection<AdminPermissionRecord>('admin_permissions').updateOne(
          { adminUserId: uid },
          {
            $set: {
              adminUserId: uid,
              adminEmail: target.email,
              permissions: { ...EMPTY_PERMISSIONS, ...(body.permissions as Partial<AdminPermissionsMap>) },
              grantedBy: session.profile.uid,
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );
      } else if (role === 'USER') {
        await db.collection<AdminPermissionRecord>('admin_permissions').deleteOne({ adminUserId: uid });
      }
    } else {
      memoryStore.profiles.set(uid, { ...target, role, status });
      if (role === 'ADMIN' && body.permissions && typeof body.permissions === 'object') {
        memoryStore.adminPermissions.set(uid, {
          adminUserId: uid,
          adminEmail: target.email,
          permissions: { ...EMPTY_PERMISSIONS, ...(body.permissions as Partial<AdminPermissionsMap>) },
          grantedBy: session.profile.uid,
          updatedAt: new Date(),
        });
      } else if (role === 'USER') {
        memoryStore.adminPermissions.delete(uid);
      }
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: role === 'USER' ? 'REVOKE_ADMIN' : status === 'SUSPENDED' ? 'SUSPEND_ADMIN' : 'UPDATE_ADMIN',
      entityType: 'profile',
      entityId: uid,
      summary: `Set ${target.email} to role=${role}, status=${status}`,
    });

    res.json({ updated: true });
  });

  app.put('/api/data/admin/permissions/:uid', async (req: Request, res: Response) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    if (!isSuperAdmin(session)) {
      res.status(403).json({ error: 'Only Super Admin can update permissions.' });
      return;
    }
    const uid = req.params.uid;
    if (!isSafeId(uid)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const col = getMongoCollection<UserProfile>('profiles');
    const target = col ? await col.findOne({ uid }) : memoryStore.profiles.get(uid) || null;
    if (!target) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }
    if (target.email.toLowerCase() === PERMANENT_SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Super Admin permissions are permanent.' });
      return;
    }

    const permsInput = (req.body || {}).permissions;
    const permissions: AdminPermissionsMap = {
      ...EMPTY_PERMISSIONS,
      ...(typeof permsInput === 'object' && permsInput !== null
        ? (permsInput as Partial<AdminPermissionsMap>)
        : {}),
    };
    const rec: AdminPermissionRecord = {
      adminUserId: uid,
      adminEmail: target.email,
      permissions,
      grantedBy: session.profile.uid,
      updatedAt: new Date(),
    };

    const permCol = getMongoCollection<AdminPermissionRecord>('admin_permissions');
    if (permCol) {
      await permCol.updateOne({ adminUserId: uid }, { $set: rec }, { upsert: true });
    } else {
      memoryStore.adminPermissions.set(uid, rec);
    }

    await appendAuditLog({
      actorUserId: session.profile.uid,
      actorEmail: session.profile.email,
      action: 'UPDATE_PERMISSIONS',
      entityType: 'admin_permissions',
      entityId: uid,
      summary: `Updated granular permissions for ${target.email}`,
    });

    res.json({ updated: true });
  });
}
