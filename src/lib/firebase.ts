import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const FIREBASE_AUTH_PROVIDERS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

export function normalizeGmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidGmailAddress(email: string): boolean {
  const normalized = normalizeGmailAddress(email);
  if (normalized.length < 11 || normalized.length > 254) return false;
  const parts = normalized.split('@');
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts;
  if (domain !== 'gmail.com') return false;
  if (localPart.length < 1 || localPart.length > 64) return false;
  if (localPart.includes('..')) return false;
  return /^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$/.test(localPart);
}

export interface CredentialValidationResult {
  valid: boolean;
  email: string;
  error?: string;
}

const GMAIL_DOMAIN_TYPOS = new Set([
  'gmal.com',
  'gmial.com',
  'gmai.com',
  'gamil.com',
  'gnail.com',
  'gmail.co',
  'gmail.con',
  'gmail.cm',
  'gmail.om',
  'gmail.org',
  'gmail.net',
  'googlemail.com',
]);

export function validateGmailEmail(rawEmail: string): CredentialValidationResult {
  const email = normalizeGmailAddress(rawEmail);
  if (!email) {
    return { valid: false, email, error: 'Please enter your @gmail.com address.' };
  }
  if (email.endsWith('@gmail')) {
    return {
      valid: false,
      email,
      error: `Please complete your Gmail address with ".com" (for example: ${email}.com).`,
    };
  }
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      valid: false,
      email,
      error: 'Enter a valid Gmail address (for example: yourname@gmail.com).',
    };
  }
  const [, domain] = parts;
  if (GMAIL_DOMAIN_TYPOS.has(domain)) {
    return {
      valid: false,
      email,
      error: `Check your Gmail spelling ("@${domain}") — it must end strictly with @gmail.com.`,
    };
  }
  if (domain !== 'gmail.com') {
    return {
      valid: false,
      email,
      error: 'Only Gmail addresses ending in @gmail.com are allowed.',
    };
  }
  if (!isValidGmailAddress(email)) {
    return {
      valid: false,
      email,
      error: 'Enter a valid Gmail address using standard letters, numbers, dots, or "+" before @gmail.com.',
    };
  }
  return { valid: true, email };
}

export function validateGmailCredentials(params: {
  email: string;
  password: string;
  confirmPassword?: string;
  minPasswordLength?: number;
}): CredentialValidationResult {
  const emailCheck = validateGmailEmail(params.email);
  if (!emailCheck.valid) {
    return emailCheck;
  }
  if (!params.password) {
    return { valid: false, email: emailCheck.email, error: 'Please enter your password.' };
  }
  if (params.minPasswordLength && params.password.length < params.minPasswordLength) {
    return {
      valid: false,
      email: emailCheck.email,
      error: `Password must be at least ${params.minPasswordLength} characters long.`,
    };
  }
  if (
    params.confirmPassword !== undefined &&
    params.password !== params.confirmPassword
  ) {
    return {
      valid: false,
      email: emailCheck.email,
      error: 'Passwords do not match.',
    };
  }
  return { valid: true, email: emailCheck.email };
}

export interface ParsedFirebaseAuthError {
  code: string;
  message: string;
  needsProviderEnable: boolean;
}

export function parseFirebaseAuthError(
  err: unknown,
  context: 'customer' | 'admin' = 'customer'
): ParsedFirebaseAuthError {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';

  if (code === 'auth/operation-not-allowed') {
    return {
      code,
      message:
        context === 'admin'
          ? 'Email/Password sign-in is disabled in your Firebase project. Open Firebase Auth Providers below, enable Email/Password (click Save), then try again.'
          : 'Email/Password sign-in is currently disabled in Firebase Console. Enable Authentication -> Sign-in method -> Email/Password in your Firebase project, then retry.',
      needsProviderEnable: true,
    };
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return {
      code,
      message:
        context === 'admin'
          ? 'Incorrect admin Gmail or password. If this is your first time setting up the owner account, switch to "Owner First Setup".'
          : 'Incorrect Gmail address or password.',
      needsProviderEnable: false,
    };
  }
  if (code === 'auth/invalid-email') {
    return {
      code,
      message: 'Please enter a valid @gmail.com address.',
      needsProviderEnable: false,
    };
  }
  if (code === 'auth/email-already-in-use') {
    return {
      code,
      message:
        context === 'admin'
          ? 'This owner account already exists. Use "Admin Login" or "Forgot password?".'
          : 'An account with this Gmail address already exists. Please switch to Login.',
      needsProviderEnable: false,
    };
  }
  if (code === 'auth/weak-password') {
    return {
      code,
      message: 'Password must be at least 8 characters long.',
      needsProviderEnable: false,
    };
  }
  if (code === 'auth/user-disabled') {
    return {
      code,
      message: 'This account has been disabled. Please contact support.',
      needsProviderEnable: false,
    };
  }
  if (code === 'auth/too-many-requests') {
    return {
      code,
      message: 'Too many attempts detected. Please wait a moment and try again.',
      needsProviderEnable: false,
    };
  }
  if (code === 'auth/network-request-failed') {
    return {
      code,
      message: 'Network error communicating with authentication service. Check your connection and retry.',
      needsProviderEnable: false,
    };
  }
  return {
    code,
    message: err instanceof Error ? err.message : 'Authentication failed. Please try again.',
    needsProviderEnable: false,
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<{ connected: boolean; message?: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { connected: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return { connected: false, message: 'Firestore client is offline. Verify Firebase configuration.' };
    }
    return { connected: true };
  }
}

void testConnection();
