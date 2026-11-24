import crypto from 'node:crypto';
import {
  EMPTY_PERMISSIONS,
  FULL_PERMISSIONS,
  PERMANENT_SUPER_ADMIN_EMAIL,
  type AdminInvitation,
  type AdminPermissionRecord,
  type AdminPermissionsMap,
  type UserProfile,
} from '../src/types/index.ts';
import {
  type AuthAccountRecord,
  getMongoCollection,
  memoryStore,
  seedStarterDataIfEmpty,
  stripMongoInternalId,
} from './mongo.ts';

const AUTH_SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const VERIFY_CODE_TTL_MS = 1000 * 60 * 15; // 15 minutes

export interface ServerSessionPayload {
  jti: string;
  uid: string;
  email: string;
  emailVerified: boolean;
  exp: number;
}

export interface AuthSessionResult {
  token: string;
  profile: UserProfile;
  permissions: AdminPermissionsMap;
  expiresAt: number;
}

export function normalizeGmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function isValidGmailServer(email: string): boolean {
  if (email.length < 11 || email.length > 254) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts;
  if (domain !== 'gmail.com') return false;
  if (localPart.length < 1 || localPart.length > 64) return false;
  if (localPart.includes('..')) return false;
  return /^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$/.test(localPart);
}

function hashPasswordScrypt(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPasswordScrypt(password: string, storedHash: string, salt: string): boolean {
  if (!storedHash || !salt) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function timingSafeEqualsText(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function generateSixDigitCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

function signSessionToken(payload: ServerSessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', AUTH_SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `cs_srv.${encoded}.${sig}`;
}

export function isServerSessionToken(token: string): boolean {
  return token.startsWith('cs_srv.');
}

export function revokeServerSessionToken(token: string): void {
  const verified = decodeRawSessionToken(token);
  if (verified) {
    memoryStore.revokedTokens.add(verified.jti);
  }
}

function decodeRawSessionToken(token: string): ServerSessionPayload | null {
  if (!token.startsWith('cs_srv.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', AUTH_SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ServerSessionPayload;
    if (
      !parsed ||
      typeof parsed.jti !== 'string' ||
      typeof parsed.uid !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (Date.now() > parsed.exp || memoryStore.revokedTokens.has(parsed.jti)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function findAuthAccountByEmail(email: string): Promise<AuthAccountRecord | null> {
  const col = getMongoCollection<AuthAccountRecord>('auth_accounts');
  if (col) {
    const doc = await col.findOne({ email });
    return doc ? stripMongoInternalId(doc) : null;
  }
  return memoryStore.authAccounts.get(email) || null;
}

async function saveAuthAccount(record: AuthAccountRecord): Promise<void> {
  const col = getMongoCollection<AuthAccountRecord>('auth_accounts');
  if (col) {
    await col.updateOne({ email: record.email }, { $set: record }, { upsert: true });
    return;
  }
  memoryStore.authAccounts.set(record.email, record);
}

export async function findProfileByUid(uid: string): Promise<UserProfile | null> {
  const col = getMongoCollection<UserProfile>('profiles');
  if (col) {
    const doc = await col.findOne({ uid });
    return doc ? stripMongoInternalId(doc) : null;
  }
  return memoryStore.profiles.get(uid) || null;
}

async function saveProfile(profile: UserProfile): Promise<void> {
  const col = getMongoCollection<UserProfile>('profiles');
  if (col) {
    await col.updateOne({ uid: profile.uid }, { $set: profile }, { upsert: true });
    return;
  }
  memoryStore.profiles.set(profile.uid, profile);
}

async function getAdminPermissionsForProfile(profile: UserProfile): Promise<AdminPermissionsMap> {
  if (profile.role === 'SUPER_ADMIN' && profile.status === 'ACTIVE') {
    return { ...FULL_PERMISSIONS };
  }
  if (profile.role !== 'ADMIN' || profile.status !== 'ACTIVE') {
    return { ...EMPTY_PERMISSIONS };
  }
  const col = getMongoCollection<AdminPermissionRecord>('admin_permissions');
  if (col) {
    const doc = await col.findOne({ adminUserId: profile.uid });
    return doc ? { ...EMPTY_PERMISSIONS, ...doc.permissions } : { ...EMPTY_PERMISSIONS };
  }
  const rec = memoryStore.adminPermissions.get(profile.uid);
  return rec ? { ...EMPTY_PERMISSIONS, ...rec.permissions } : { ...EMPTY_PERMISSIONS };
}

async function claimPendingAdminInvitationIfAny(
  uid: string,
  email: string,
  displayName: string
): Promise<UserProfile> {
  const now = new Date();
  const isOwner = email === PERMANENT_SUPER_ADMIN_EMAIL;
  const existingProfile = await findProfileByUid(uid);

  let pendingInvitation: AdminInvitation | null = null;
  if (!isOwner) {
    const invCol = getMongoCollection<AdminInvitation>('admin_invitations');
    if (invCol) {
      const found = await invCol.findOne({
        email,
        status: 'PENDING',
        expiresAt: { $gt: now },
      });
      if (found) pendingInvitation = stripMongoInternalId(found);
    } else {
      for (const inv of memoryStore.adminInvitations.values()) {
        if (inv.email === email && inv.status === 'PENDING' && new Date(inv.expiresAt) > now) {
          pendingInvitation = inv;
          break;
        }
      }
    }
  }

  if (!existingProfile) {
    if (pendingInvitation) {
      const nextProfile: UserProfile = {
        uid,
        email,
        displayName: displayName.slice(0, 120),
        role: 'ADMIN',
        status: 'ACTIVE',
        acceptedInvitationId: pendingInvitation.id,
        createdAt: now,
        lastLogin: now,
      };
      await saveProfile(nextProfile);

      const permCol = getMongoCollection<AdminPermissionRecord>('admin_permissions');
      const permRecord: AdminPermissionRecord = {
        adminUserId: uid,
        adminEmail: email,
        permissions: { ...EMPTY_PERMISSIONS, ...pendingInvitation.permissions },
        grantedBy: pendingInvitation.invitedBy,
        updatedAt: now,
      };
      if (permCol) {
        await permCol.updateOne({ adminUserId: uid }, { $set: permRecord }, { upsert: true });
        await getMongoCollection<AdminInvitation>('admin_invitations')?.updateOne(
          { id: pendingInvitation.id },
          { $set: { status: 'ACCEPTED', acceptedUid: uid, acceptedAt: now } }
        );
      } else {
        memoryStore.adminPermissions.set(uid, permRecord);
        const storedInv = memoryStore.adminInvitations.get(pendingInvitation.id);
        if (storedInv) {
          storedInv.status = 'ACCEPTED';
          storedInv.acceptedUid = uid;
          storedInv.acceptedAt = now;
        }
      }
      return nextProfile;
    }

    const createdProfile: UserProfile = {
      uid,
      email,
      displayName: displayName.slice(0, 120),
      role: isOwner ? 'SUPER_ADMIN' : 'USER',
      status: 'ACTIVE',
      createdAt: now,
      lastLogin: now,
    };
    await saveProfile(createdProfile);

    if (isOwner) {
      await seedStarterDataIfEmpty(uid, email, false);
    }
    return createdProfile;
  }

  const updatedProfile: UserProfile = {
    ...existingProfile,
    displayName: displayName.slice(0, 120) || existingProfile.displayName,
    lastLogin: now,
  };

  if (isOwner) {
    updatedProfile.role = 'SUPER_ADMIN';
    updatedProfile.status = 'ACTIVE';
    await seedStarterDataIfEmpty(uid, email, false);
  } else if (
    pendingInvitation &&
    existingProfile.role === 'USER' &&
    existingProfile.status === 'ACTIVE'
  ) {
    updatedProfile.role = 'ADMIN';
    updatedProfile.acceptedInvitationId = pendingInvitation.id;
    const permCol = getMongoCollection<AdminPermissionRecord>('admin_permissions');
    const permRecord: AdminPermissionRecord = {
      adminUserId: uid,
      adminEmail: email,
      permissions: { ...EMPTY_PERMISSIONS, ...pendingInvitation.permissions },
      grantedBy: pendingInvitation.invitedBy,
      updatedAt: now,
    };
    if (permCol) {
      await permCol.updateOne({ adminUserId: uid }, { $set: permRecord }, { upsert: true });
      await getMongoCollection<AdminInvitation>('admin_invitations')?.updateOne(
        { id: pendingInvitation.id },
        { $set: { status: 'ACCEPTED', acceptedUid: uid, acceptedAt: now } }
      );
    } else {
      memoryStore.adminPermissions.set(uid, permRecord);
      const storedInv = memoryStore.adminInvitations.get(pendingInvitation.id);
      if (storedInv) {
        storedInv.status = 'ACCEPTED';
        storedInv.acceptedUid = uid;
        storedInv.acceptedAt = now;
      }
    }
  }

  await saveProfile(updatedProfile);
  return updatedProfile;
}

export async function isOwnerClaimed(): Promise<boolean> {
  if ((process.env.ADMIN_ACCESS_PASSCODE || '').trim()) {
    return true;
  }
  const owner = await findAuthAccountByEmail(PERMANENT_SUPER_ADMIN_EMAIL);
  return Boolean(owner);
}

export async function issueSessionForAccount(account: AuthAccountRecord): Promise<AuthSessionResult> {
  const profile = await claimPendingAdminInvitationIfAny(
    account.uid,
    account.email,
    account.displayName
  );
  const permissions = await getAdminPermissionsForProfile(profile);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = signSessionToken({
    jti: crypto.randomBytes(16).toString('hex'),
    uid: profile.uid,
    email: profile.email,
    emailVerified: true,
    exp: expiresAt,
  });
  return { token, profile, permissions, expiresAt };
}

export async function registerServerAccount(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{
  email: string;
  requiresVerification: true;
  verificationPreviewCode: string;
}> {
  const email = normalizeGmail(params.email);
  if (!isValidGmailServer(email)) {
    throw new Error('Only Gmail addresses ending in @gmail.com are allowed.');
  }
  if (!params.password || params.password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  const displayName = params.displayName.trim().slice(0, 80);
  if (displayName.length < 2) {
    throw new Error('Please enter your full name (at least 2 characters).');
  }

  const existing = await findAuthAccountByEmail(email);
  if (existing) {
    throw new Error('An account with this Gmail address already exists. Please log in instead.');
  }

  const uid = `usr_${crypto.randomBytes(12).toString('hex')}`;
  const { hash, salt } = hashPasswordScrypt(params.password);
  const verificationCode = generateSixDigitCode();
  const now = new Date();

  await saveAuthAccount({
    uid,
    email,
    displayName,
    passwordHash: hash,
    passwordSalt: salt,
    emailVerified: false,
    verificationCodeHash: sha256(verificationCode),
    verificationExpiresAt: new Date(now.getTime() + VERIFY_CODE_TTL_MS),
    createdAt: now,
    updatedAt: now,
  });

  return {
    email,
    requiresVerification: true,
    verificationPreviewCode: verificationCode,
  };
}

export async function setupOwnerServerAccount(params: {
  email: string;
  password: string;
}): Promise<{
  email: string;
  requiresVerification: true;
  verificationPreviewCode: string;
}> {
  const email = normalizeGmail(params.email);
  if (email !== PERMANENT_SUPER_ADMIN_EMAIL) {
    throw new Error('First-Time Owner Setup is restricted strictly to the permanent owner Gmail address.');
  }
  if (!params.password || params.password.length < 8) {
    throw new Error('Admin password must be at least 8 characters long.');
  }

  if ((process.env.ADMIN_ACCESS_PASSCODE || '').trim()) {
    throw new Error(
      'Owner passcode is configured via server environment secrets. Use Admin Login directly.'
    );
  }

  const existing = await findAuthAccountByEmail(email);
  if (existing) {
    throw new Error('Owner credentials are already set up. Use Admin Login or Forgot password.');
  }

  const uid = `usr_owner_${crypto.randomBytes(8).toString('hex')}`;
  const { hash, salt } = hashPasswordScrypt(params.password);
  const verificationCode = generateSixDigitCode();
  const now = new Date();

  await saveAuthAccount({
    uid,
    email,
    displayName: 'Super Admin',
    passwordHash: hash,
    passwordSalt: salt,
    emailVerified: false,
    verificationCodeHash: sha256(verificationCode),
    verificationExpiresAt: new Date(now.getTime() + VERIFY_CODE_TTL_MS),
    createdAt: now,
    updatedAt: now,
  });

  return {
    email,
    requiresVerification: true,
    verificationPreviewCode: verificationCode,
  };
}

export async function loginServerAccount(params: {
  email: string;
  password: string;
}): Promise<
  | { authenticated: true; session: AuthSessionResult }
  | { authenticated: false; requiresVerification: true; email: string; verificationPreviewCode: string }
> {
  const email = normalizeGmail(params.email);
  if (!isValidGmailServer(email)) {
    throw new Error('Only Gmail addresses ending in @gmail.com are allowed.');
  }
  if (!params.password) {
    throw new Error('Please enter your password.');
  }

  const envAdminPasscode = (process.env.ADMIN_ACCESS_PASSCODE || '').trim();
  let account = await findAuthAccountByEmail(email);

  // Environment ADMIN_ACCESS_PASSCODE overrides any stored fallback for permanent Super Admin
  if (email === PERMANENT_SUPER_ADMIN_EMAIL && envAdminPasscode) {
    if (!timingSafeEqualsText(params.password, envAdminPasscode)) {
      throw new Error('Incorrect admin Gmail or password.');
    }
    const now = new Date();
    if (!account) {
      const { hash, salt } = hashPasswordScrypt(params.password);
      account = {
        uid: `usr_owner_${crypto.randomBytes(8).toString('hex')}`,
        email,
        displayName: 'Super Admin',
        passwordHash: hash,
        passwordSalt: salt,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };
      await saveAuthAccount(account);
    } else if (!account.emailVerified) {
      account = { ...account, emailVerified: true, updatedAt: now };
      await saveAuthAccount(account);
    }
    const session = await issueSessionForAccount(account);
    return { authenticated: true, session };
  }

  if (!account || !verifyPasswordScrypt(params.password, account.passwordHash, account.passwordSalt)) {
    throw new Error('Incorrect Gmail address or password.');
  }

  if (!account.emailVerified) {
    const verificationCode = generateSixDigitCode();
    account = {
      ...account,
      verificationCodeHash: sha256(verificationCode),
      verificationExpiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS),
      updatedAt: new Date(),
    };
    await saveAuthAccount(account);
    return {
      authenticated: false,
      requiresVerification: true,
      email,
      verificationPreviewCode: verificationCode,
    };
  }

  const session = await issueSessionForAccount(account);
  if (session.profile.status === 'SUSPENDED') {
    throw new Error('This account has been suspended by an administrator.');
  }
  return { authenticated: true, session };
}

export async function verifyServerAccountEmail(params: {
  email: string;
  code: string;
}): Promise<AuthSessionResult> {
  const email = normalizeGmail(params.email);
  const code = params.code.trim();
  if (!isValidGmailServer(email)) {
    throw new Error('Valid @gmail.com address is required.');
  }
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Enter the 6-digit verification code.');
  }

  const account = await findAuthAccountByEmail(email);
  if (!account) {
    throw new Error('Account not found.');
  }
  if (account.emailVerified) {
    return issueSessionForAccount(account);
  }
  if (
    !account.verificationCodeHash ||
    !account.verificationExpiresAt ||
    new Date(account.verificationExpiresAt) < new Date()
  ) {
    throw new Error('Verification code expired. Click "Resend Code" to get a new one.');
  }
  if (!timingSafeEqualsText(sha256(code), account.verificationCodeHash)) {
    throw new Error('Incorrect verification code. Please check and try again.');
  }

  const verifiedAccount: AuthAccountRecord = {
    ...account,
    emailVerified: true,
    verificationCodeHash: null,
    verificationExpiresAt: null,
    updatedAt: new Date(),
  };
  await saveAuthAccount(verifiedAccount);
  return issueSessionForAccount(verifiedAccount);
}

export async function resendServerVerificationCode(rawEmail: string): Promise<{
  email: string;
  verificationPreviewCode: string;
}> {
  const email = normalizeGmail(rawEmail);
  if (!isValidGmailServer(email)) {
    throw new Error('Valid @gmail.com address is required.');
  }
  const account = await findAuthAccountByEmail(email);
  if (!account) {
    throw new Error('Account not found.');
  }
  const code = generateSixDigitCode();
  await saveAuthAccount({
    ...account,
    verificationCodeHash: sha256(code),
    verificationExpiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS),
    updatedAt: new Date(),
  });
  return { email, verificationPreviewCode: code };
}

export async function requestServerPasswordReset(rawEmail: string): Promise<{
  email: string;
  resetPreviewCode?: string;
}> {
  const email = normalizeGmail(rawEmail);
  if (!isValidGmailServer(email)) {
    throw new Error('Enter your registered @gmail.com address.');
  }
  const account = await findAuthAccountByEmail(email);
  if (!account) {
    // Do not confirm account absence if unknown
    return { email };
  }
  const code = generateSixDigitCode();
  await saveAuthAccount({
    ...account,
    resetCodeHash: sha256(code),
    resetExpiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS),
    updatedAt: new Date(),
  });
  return { email, resetPreviewCode: code };
}

export async function confirmServerPasswordReset(params: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  const email = normalizeGmail(params.email);
  const code = params.code.trim();
  if (!isValidGmailServer(email)) {
    throw new Error('Enter a valid @gmail.com address.');
  }
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Enter the 6-digit password reset code.');
  }
  if (!params.newPassword || params.newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }
  const account = await findAuthAccountByEmail(email);
  if (
    !account ||
    !account.resetCodeHash ||
    !account.resetExpiresAt ||
    new Date(account.resetExpiresAt) < new Date() ||
    !timingSafeEqualsText(sha256(code), account.resetCodeHash)
  ) {
    throw new Error('Invalid or expired password reset code.');
  }

  const { hash, salt } = hashPasswordScrypt(params.newPassword);
  await saveAuthAccount({
    ...account,
    passwordHash: hash,
    passwordSalt: salt,
    resetCodeHash: null,
    resetExpiresAt: null,
    updatedAt: new Date(),
  });
}

export async function resolveServerSession(token: string): Promise<{
  payload: ServerSessionPayload;
  profile: UserProfile;
  permissions: AdminPermissionsMap;
} | null> {
  const payload = decodeRawSessionToken(token);
  if (!payload) return null;
  const profile = await findProfileByUid(payload.uid);
  if (!profile || profile.email !== payload.email) return null;
  const permissions = await getAdminPermissionsForProfile(profile);
  return { payload, profile, permissions };
}
