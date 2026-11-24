import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import {
  confirmServerPasswordReset,
  isOwnerClaimed,
  isServerSessionToken,
  loginServerAccount,
  registerServerAccount,
  requestServerPasswordReset,
  resendServerVerificationCode,
  resolveServerSession,
  revokeServerSessionToken,
  setupOwnerServerAccount,
  verifyServerAccountEmail,
} from './server/auth.ts';
import {
  findServerAppAndFile,
  findServerOrderAndEntitlement,
  registerDataRoutes,
} from './server/dataRoutes.ts';
import {
  getMongoCollection,
  getMongoDb,
  hasUnsafeMongoKeys,
  initMongoConnection,
  memoryStore,
  pingMongoStatus,
} from './server/mongo.ts';
import type { DownloadLog } from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TOKEN_TTL_MS = 60_000; // 60 seconds single-use window
const SIGNING_SECRET =
  process.env.DOWNLOAD_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

const adminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: firebaseConfig.projectId });
const adminAuth = getAuth(adminApp);

const FIRESTORE_DB_ID = firebaseConfig.firestoreDatabaseId || '(default)';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${FIRESTORE_DB_ID}/documents`;
const PERMANENT_SUPER_ADMIN_EMAIL = 'moeezi396@gmail.com';

interface PendingDownloadToken {
  tokenId: string;
  userId: string;
  appId: string;
  orderId: string;
  fileName: string;
  downloadStoragePath: string;
  expiresAt: number;
  used: boolean;
  authKind: 'firebase' | 'server';
  idToken?: string;
}

const pendingTokens = new Map<string, PendingDownloadToken>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pendingTokens.entries()) {
    if (now > entry.expiresAt + 15_000 || entry.used) {
      pendingTokens.delete(key);
    }
  }
}, 30_000).unref();

function signTokenPayload(tokenId: string, exp: number): string {
  return crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`${tokenId}.${exp}`)
    .digest('hex');
}

function verifySignature(tokenId: string, exp: number, sig: string): boolean {
  const expected = signTokenPayload(tokenId, exp);
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(sig, 'utf8'));
}

function isSafeId(val: unknown): val is string {
  return typeof val === 'string' && val.length >= 1 && val.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(val);
}

function isBlockedPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '169.254.169.254' ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function sanitizeDownloadFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\-() ]+/g, '_').trim();
  return cleaned || 'creator-studio-package.bin';
}

interface FirestoreFieldValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
}

interface FirestoreDocResponse {
  name?: string;
  fields?: Record<string, FirestoreFieldValue>;
}

async function firestoreRestGet(
  docPath: string,
  idToken: string
): Promise<FirestoreDocResponse | null> {
  const res = await fetch(`${FIRESTORE_BASE_URL}/${docPath}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore read failed (${res.status}): ${text}`);
  }
  return (await res.json()) as FirestoreDocResponse;
}

async function firestoreRestCommitWrites(
  writes: Array<Record<string, unknown>>,
  idToken: string
): Promise<void> {
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${FIRESTORE_DB_ID}/documents:commit`;
  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore commit failed (${res.status}): ${text}`);
  }
}

function getStringField(docData: FirestoreDocResponse | null, key: string): string {
  return docData?.fields?.[key]?.stringValue || '';
}

function docResourceName(collectionPath: string, docId: string): string {
  return `projects/${firebaseConfig.projectId}/databases/${FIRESTORE_DB_ID}/documents/${collectionPath}/${docId}`;
}

async function isActiveFirebaseAdminCaller(
  uid: string,
  email: string,
  idToken: string
): Promise<boolean> {
  if (email === PERMANENT_SUPER_ADMIN_EMAIL) {
    return true;
  }
  const profileDoc = await firestoreRestGet(`profiles/${uid}`, idToken);
  if (!profileDoc) return false;
  const role = getStringField(profileDoc, 'role');
  const status = getStringField(profileDoc, 'status');
  return status === 'ACTIVE' && (role === 'ADMIN' || role === 'SUPER_ADMIN');
}

async function startServer() {
  await initMongoConnection();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Block MongoDB operator injection keys across /api/auth and /api/downloads
  app.use('/api', (req, res, next) => {
    if (req.body && hasUnsafeMongoKeys(req.body)) {
      res.status(400).json({ error: 'Invalid input structure.' });
      return;
    }
    next();
  });

  // ============================================================
  // SYSTEM & DATABASE STATUS (MongoDB + Firestore)
  // ============================================================
  app.get('/api/system/db-status', async (_req: Request, res: Response) => {
    try {
      const [mongo, ownerClaimed] = await Promise.all([
        pingMongoStatus(),
        isOwnerClaimed(),
      ]);
      res.json({
        ...mongo,
        ownerClaimed,
        firebaseProjectId: firebaseConfig.projectId,
        firestoreDatabaseId: FIRESTORE_DB_ID,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to check database status.',
      });
    }
  });

  // ============================================================
  // SERVER-SIDE GMAIL & PASSWORD AUTHENTICATION (scrypt + HMAC)
  // ============================================================
  app.get('/api/auth/status', async (_req: Request, res: Response) => {
    const [mongo, ownerClaimed] = await Promise.all([
      pingMongoStatus(),
      isOwnerClaimed(),
    ]);
    res.json({
      ownerClaimed,
      mongoConfigured: mongo.mongoConfigured,
      mongoConnected: mongo.mongoConnected,
      storageMode: mongo.storageMode,
    });
  });

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = await registerServerAccount({
        email: typeof body.email === 'string' ? body.email : '',
        password: typeof body.password === 'string' ? body.password : '',
        displayName: typeof body.displayName === 'string' ? body.displayName : '',
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Registration failed.',
      });
    }
  });

  app.post('/api/auth/owner-setup', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = await setupOwnerServerAccount({
        email: typeof body.email === 'string' ? body.email : '',
        password: typeof body.password === 'string' ? body.password : '',
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Owner setup failed.',
      });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = await loginServerAccount({
        email: typeof body.email === 'string' ? body.email : '',
        password: typeof body.password === 'string' ? body.password : '',
      });
      res.json(result);
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Invalid Gmail or password.',
      });
    }
  });

  app.post('/api/auth/verify-email', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const session = await verifyServerAccountEmail({
        email: typeof body.email === 'string' ? body.email : '',
        code: typeof body.code === 'string' ? body.code : '',
      });
      res.json(session);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Email verification failed.',
      });
    }
  });

  app.post('/api/auth/resend-verification', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = await resendServerVerificationCode(
        typeof body.email === 'string' ? body.email : ''
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to resend verification code.',
      });
    }
  });

  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = await requestServerPasswordReset(
        typeof body.email === 'string' ? body.email : ''
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to send reset code.',
      });
    }
  });

  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      await confirmServerPasswordReset({
        email: typeof body.email === 'string' ? body.email : '',
        code: typeof body.code === 'string' ? body.code : '',
        newPassword: typeof body.newPassword === 'string' ? body.newPassword : '',
      });
      res.json({ reset: true });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Password reset failed.',
      });
    }
  });

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const session = await resolveServerSession(token);
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired session.' });
      return;
    }
    res.json({
      profile: session.profile,
      permissions: session.permissions,
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      revokeServerSessionToken(authHeader.slice('Bearer '.length).trim());
    }
    res.json({ loggedOut: true });
  });

  // Mount MongoDB / server-store CRUD routes
  registerDataRoutes(app);

  // ============================================================
  // 1. Authorize download and mint fresh 60s single-use signed URL
  // ============================================================
  app.post('/api/downloads/authorize', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const rawToken = authHeader.slice('Bearer '.length).trim();
      const { appId, orderId } = (req.body || {}) as { appId?: unknown; orderId?: unknown };
      if (!isSafeId(appId)) {
        res.status(400).json({ error: 'Valid appId is required.' });
        return;
      }

      // Case 1: Server / MongoDB session token
      if (isServerSessionToken(rawToken)) {
        const session = await resolveServerSession(rawToken);
        if (!session) {
          res.status(401).json({ error: 'Session expired. Please log in again.' });
          return;
        }
        if (session.profile.status !== 'ACTIVE') {
          res.status(403).json({ error: 'Account is suspended.' });
          return;
        }

        const adminFreeAccess =
          session.profile.role === 'SUPER_ADMIN' || session.profile.role === 'ADMIN';
        const { app: appListing, appFile } = await findServerAppAndFile(appId);
        if (!appFile || !appFile.downloadStoragePath) {
          res.status(404).json({ error: 'Protected software package not configured.' });
          return;
        }

        let resolvedOrderId = 'admin_free_access';
        const resolvedAppName = appListing?.name || appId;

        if (!adminFreeAccess || (orderId && orderId !== 'admin_free_access')) {
          if (!isSafeId(orderId)) {
            res.status(400).json({ error: 'Valid orderId is required.' });
            return;
          }
          resolvedOrderId = orderId;
          const { order, entitlement } = await findServerOrderAndEntitlement(
            orderId,
            session.profile.uid,
            appId
          );
          if (!order) {
            res.status(404).json({ error: 'Order record not found.' });
            return;
          }
          if (order.userId !== session.profile.uid || order.appId !== appId) {
            res.status(403).json({ error: 'Order does not belong to the authenticated user.' });
            return;
          }
          if (order.status !== 'APPROVED') {
            res.status(403).json({ error: 'Payment has not been approved yet.' });
            return;
          }
          if (!entitlement) {
            res.status(403).json({ error: 'Download entitlement not found for this account.' });
            return;
          }
        }

        const tokenId = `tok_${crypto.randomBytes(18).toString('hex')}`;
        const logId = `dl_${crypto.randomBytes(14).toString('hex')}`;
        const expiresAtMs = Date.now() + TOKEN_TTL_MS;
        const fileName = sanitizeDownloadFilename(appFile.fileName || `${appId}-package.txt`);
        const now = new Date();

        const db = getMongoDb();
        if (db) {
          await db.collection('download_tokens').insertOne({
            tokenId,
            userId: session.profile.uid,
            appId,
            orderId: resolvedOrderId,
            used: false,
            expiresAt: new Date(expiresAtMs),
            createdAt: now,
          });
          await db.collection<DownloadLog>('download_logs').insertOne({
            id: logId,
            userId: session.profile.uid,
            appId,
            appName: resolvedAppName.slice(0, 120),
            createdAt: now,
          });
        } else {
          memoryStore.downloadTokens.set(tokenId, {
            tokenId,
            userId: session.profile.uid,
            appId,
            orderId: resolvedOrderId,
            used: false,
            expiresAt: new Date(expiresAtMs),
            createdAt: now,
          });
          memoryStore.downloadLogs.unshift({
            id: logId,
            userId: session.profile.uid,
            appId,
            appName: resolvedAppName.slice(0, 120),
            createdAt: now,
          });
        }

        pendingTokens.set(tokenId, {
          tokenId,
          userId: session.profile.uid,
          appId,
          orderId: resolvedOrderId,
          fileName,
          downloadStoragePath: appFile.downloadStoragePath,
          expiresAt: expiresAtMs,
          used: false,
          authKind: 'server',
        });

        const sig = signTokenPayload(tokenId, expiresAtMs);
        const signedUrl = `/api/downloads/stream?token=${encodeURIComponent(tokenId)}&exp=${expiresAtMs}&sig=${sig}`;
        res.json({
          signedUrl,
          fileName,
          expiresAt: expiresAtMs,
          expiresInSeconds: 60,
        });
        return;
      }

      // Case 2: Firebase ID Token
      const idToken = rawToken;
      const decoded = await adminAuth.verifyIdToken(idToken);
      const email = (decoded.email || '').toLowerCase();

      if (!decoded.email_verified || !email.endsWith('@gmail.com')) {
        res.status(403).json({ error: 'Verified @gmail.com account required.' });
        return;
      }

      const adminFreeAccess = await isActiveFirebaseAdminCaller(decoded.uid, email, idToken);
      let resolvedOrderId = 'admin_free_access';
      let resolvedAppName = appId;

      if (adminFreeAccess && (!orderId || orderId === 'admin_free_access')) {
        const appDoc = await firestoreRestGet(`apps/${appId}`, idToken);
        if (appDoc) {
          resolvedAppName = getStringField(appDoc, 'name') || appId;
        }
      } else {
        if (!isSafeId(orderId)) {
          res.status(400).json({ error: 'Valid orderId is required.' });
          return;
        }
        resolvedOrderId = orderId;

        const orderDoc = await firestoreRestGet(`orders/${orderId}`, idToken);
        if (!orderDoc) {
          res.status(404).json({ error: 'Order record not found.' });
          return;
        }
        const orderUserId = getStringField(orderDoc, 'userId');
        const orderAppId = getStringField(orderDoc, 'appId');
        const orderStatus = getStringField(orderDoc, 'status');
        resolvedAppName = getStringField(orderDoc, 'appName') || appId;

        if (orderUserId !== decoded.uid || orderAppId !== appId) {
          res.status(403).json({ error: 'Order does not belong to the authenticated user.' });
          return;
        }
        if (orderStatus !== 'APPROVED') {
          res.status(403).json({ error: 'Payment has not been approved yet.' });
          return;
        }

        const entitlementId = `${decoded.uid}_${appId}`;
        const entitlementDoc = await firestoreRestGet(`entitlements/${entitlementId}`, idToken);
        if (!entitlementDoc) {
          res.status(403).json({ error: 'Download entitlement not found for this account.' });
          return;
        }
      }

      const appFileDoc = await firestoreRestGet(`app_files/${appId}`, idToken);
      if (!appFileDoc) {
        res.status(404).json({ error: 'Protected software package not configured.' });
        return;
      }
      const downloadStoragePath = getStringField(appFileDoc, 'downloadStoragePath');
      const fileName = sanitizeDownloadFilename(
        getStringField(appFileDoc, 'fileName') || `${appId}-package.txt`
      );
      if (!downloadStoragePath) {
        res.status(404).json({ error: 'Protected software source is empty.' });
        return;
      }

      const tokenId = `tok_${crypto.randomBytes(18).toString('hex')}`;
      const logId = `dl_${crypto.randomBytes(14).toString('hex')}`;
      const expiresAtMs = Date.now() + TOKEN_TTL_MS;
      const expiresIso = new Date(expiresAtMs).toISOString();

      await firestoreRestCommitWrites(
        [
          {
            update: {
              name: docResourceName('download_tokens', tokenId),
              fields: {
                tokenId: { stringValue: tokenId },
                userId: { stringValue: decoded.uid },
                appId: { stringValue: appId },
                orderId: { stringValue: resolvedOrderId },
                used: { booleanValue: false },
                expiresAt: { timestampValue: expiresIso },
              },
            },
            updateTransforms: [
              { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
            ],
          },
          {
            update: {
              name: docResourceName('download_logs', logId),
              fields: {
                userId: { stringValue: decoded.uid },
                appId: { stringValue: appId },
                appName: { stringValue: resolvedAppName.slice(0, 120) },
              },
            },
            updateTransforms: [
              { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
            ],
          },
        ],
        idToken
      );

      pendingTokens.set(tokenId, {
        tokenId,
        userId: decoded.uid,
        appId,
        orderId: resolvedOrderId,
        fileName,
        downloadStoragePath,
        expiresAt: expiresAtMs,
        used: false,
        authKind: 'firebase',
        idToken,
      });

      const sig = signTokenPayload(tokenId, expiresAtMs);
      const signedUrl = `/api/downloads/stream?token=${encodeURIComponent(tokenId)}&exp=${expiresAtMs}&sig=${sig}`;

      res.json({
        signedUrl,
        fileName,
        expiresAt: expiresAtMs,
        expiresInSeconds: 60,
      });
    } catch (err) {
      console.error('Download authorization error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to authorize download.',
      });
    }
  });

  // ============================================================
  // 2. Single-use, 60s-expiring download stream endpoint
  // ============================================================
  app.get('/api/downloads/stream', async (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const exp = typeof req.query.exp === 'string' ? Number(req.query.exp) : 0;
    const sig = typeof req.query.sig === 'string' ? req.query.sig : '';

    if (!isSafeId(token) || !Number.isFinite(exp) || !sig || !verifySignature(token, exp, sig)) {
      res.status(403).send('Invalid or tampered temporary download signature.');
      return;
    }

    if (Date.now() > exp) {
      pendingTokens.delete(token);
      res.status(410).send('This temporary download link has expired (60s limit). Please request a new download link.');
      return;
    }

    const entry = pendingTokens.get(token);
    if (!entry || entry.used || Date.now() > entry.expiresAt) {
      pendingTokens.delete(token);
      res.status(410).send('This single-use download link has already been consumed or expired. Click Download Now to generate a fresh link.');
      return;
    }

    entry.used = true;
    const cachedIdToken = entry.idToken;
    const sourcePath = entry.downloadStoragePath;
    const safeFilename = sanitizeDownloadFilename(entry.fileName);
    pendingTokens.delete(token);

    if (entry.authKind === 'server') {
      const col = getMongoCollection('download_tokens');
      if (col) {
        void col
          .updateOne({ tokenId: token }, { $set: { used: true, usedAt: new Date() } })
          .catch(() => undefined);
      } else {
        const memTok = memoryStore.downloadTokens.get(token);
        if (memTok) {
          memTok.used = true;
          memTok.usedAt = new Date();
        }
      }
    } else if (cachedIdToken) {
      void firestoreRestCommitWrites(
        [
          {
            update: {
              name: docResourceName('download_tokens', token),
              fields: {
                tokenId: { stringValue: token },
                userId: { stringValue: entry.userId },
                appId: { stringValue: entry.appId },
                orderId: { stringValue: entry.orderId },
                used: { booleanValue: true },
                expiresAt: { timestampValue: new Date(entry.expiresAt).toISOString() },
              },
            },
            updateMask: { fieldPaths: ['used', 'usedAt'] },
            updateTransforms: [
              { fieldPath: 'usedAt', setToServerValue: 'REQUEST_TIME' },
            ],
          },
        ],
        cachedIdToken
      ).catch((err) => {
        console.error('Failed to mark download token used in Firestore:', err);
      });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

    if (sourcePath.startsWith('data:')) {
      const commaIdx = sourcePath.indexOf(',');
      if (commaIdx === -1) {
        res.status(500).send('Invalid stored package payload.');
        return;
      }
      const header = sourcePath.slice(5, commaIdx);
      const body = sourcePath.slice(commaIdx + 1);
      const isBase64 = header.includes(';base64');
      const mimeType = header.split(';')[0] || 'application/octet-stream';
      const buffer = isBase64
        ? Buffer.from(body, 'base64')
        : Buffer.from(decodeURIComponent(body), 'utf8');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(sourcePath);
    } catch {
      res.status(500).send('Invalid package storage URL.');
      return;
    }

    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || isBlockedPrivateHost(parsed.hostname)) {
      res.status(403).send('Blocked storage origin.');
      return;
    }

    try {
      const upstream = await fetch(parsed.toString(), { redirect: 'follow' });
      if (!upstream.ok) {
        res.status(502).send('Unable to retrieve software package from private storage.');
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const arrayBuf = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      console.error('Upstream download stream failed:', err);
      res.status(502).send('Error streaming software package.');
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Creator Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
