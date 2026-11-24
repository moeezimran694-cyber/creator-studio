import React, { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  User as UserIcon,
  X,
} from 'lucide-react';
import {
  auth,
  parseFirebaseAuthError,
  validateGmailCredentials,
  validateGmailEmail,
} from '../lib/firebase.ts';
import {
  fetchDbStatus,
  serverForgotPassword,
  serverLogin,
  serverRegister,
  serverResendVerification,
  serverResetPassword,
  serverVerifyEmail,
  type ServerAuthSessionResponse,
} from '../lib/serverSession.ts';
import { UserProfile } from '../types/index.ts';
import { CreatorStudioMark } from './BrandLogo.tsx';
import { useToast } from './ToastContext.tsx';

export type AuthModalMode = 'login' | 'register' | 'forgot' | 'verify';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: AuthModalMode;
  unverifiedUser: User | null;
  onClose: () => void;
  onVerifiedRefresh: () => Promise<UserProfile | null>;
  onSyncVerifiedUser: (firebaseUser: User) => Promise<UserProfile>;
  onServerAuthSession: (session: ServerAuthSessionResponse) => void;
  onRouteAfterAuth: (profile: UserProfile) => void;
  onSwitchAccountReset: () => void;
}

export function AuthModal({
  isOpen,
  initialMode = 'login',
  unverifiedUser,
  onClose,
  onVerifiedRefresh,
  onSyncVerifiedUser,
  onServerAuthSession,
  onRouteAfterAuth,
  onSwitchAccountReset,
}: AuthModalProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Server/MongoDB verification & password reset states
  const [serverVerifyEmailAddr, setServerVerifyEmailAddr] = useState('');
  const [serverVerifyCode, setServerVerifyCode] = useState('');
  const [serverPreviewCode, setServerPreviewCode] = useState('');
  const [serverResetPending, setServerResetPending] = useState(false);
  const [serverResetCode, setServerResetCode] = useState('');
  const [serverNewPassword, setServerNewPassword] = useState('');
  const [mongoConnected, setMongoConnected] = useState(false);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const startMode: AuthModalMode = unverifiedUser
        ? 'verify'
        : initialMode === 'verify'
          ? 'login'
          : initialMode;
      setMode(startMode);
      setErrorMsg('');
      setInfoMsg('');
      setServerVerifyEmailAddr('');
      setServerVerifyCode('');
      setServerPreviewCode('');
      setServerResetPending(false);
      setServerResetCode('');
      setServerNewPassword('');
      void fetchDbStatus()
        .then((s) => setMongoConnected(s.mongoConnected))
        .catch(() => undefined);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialMode, unverifiedUser]);

  if (!isOpen) return null;

  const activeUnverifiedUser =
    unverifiedUser || (auth.currentUser && !auth.currentUser.emailVerified ? auth.currentUser : null);
  const isServerVerify = Boolean(serverVerifyEmailAddr);
  const renderMode: AuthModalMode =
    mode === 'verify' && !activeUnverifiedUser && !isServerVerify ? 'login' : mode;

  const switchMode = (next: AuthModalMode) => {
    setMode(next);
    setErrorMsg('');
    setInfoMsg('');
    if (next !== 'verify') {
      setServerVerifyEmailAddr('');
      setServerVerifyCode('');
      setServerPreviewCode('');
    }
    if (next !== 'forgot') {
      setServerResetPending(false);
      setServerResetCode('');
      setServerNewPassword('');
    }
  };

  const completeServerLogin = async (cleanEmail: string) => {
    const res = await serverLogin({ email: cleanEmail, password });
    if (res.authenticated) {
      onServerAuthSession(res.session);
      showToast(
        res.session.profile.role === 'ADMIN' || res.session.profile.role === 'SUPER_ADMIN'
          ? 'Logged in as Administrator. Free access enabled.'
          : 'Logged in successfully.',
        'success'
      );
      onRouteAfterAuth(res.session.profile);
      return;
    }

    setServerVerifyEmailAddr(res.email);
    setServerVerifyCode(res.verificationPreviewCode);
    setServerPreviewCode(res.verificationPreviewCode);
    setMode('verify');
    setInfoMsg(
      `Verification code generated for ${res.email}. Confirm the 6-digit code below to activate your account.`
    );
  };

  const completeServerRegister = async (cleanEmail: string, cleanName: string) => {
    const res = await serverRegister({
      email: cleanEmail,
      password,
      displayName: cleanName,
    });
    setServerVerifyEmailAddr(res.email);
    setServerVerifyCode(res.verificationPreviewCode);
    setServerPreviewCode(res.verificationPreviewCode);
    setMode('verify');
    setInfoMsg(
      `Account created for ${res.email}. Enter the 6-digit verification code below to unlock your account.`
    );
    showToast('Account created! Confirm verification code.', 'info');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const validation = validateGmailCredentials({ email, password });
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Invalid Gmail credentials.');
      return;
    }

    setSubmitting(true);
    try {
      if (mongoConnected) {
        await completeServerLogin(validation.email);
        return;
      }

      try {
        const cred = await signInWithEmailAndPassword(auth, validation.email, password);
        await cred.user.reload();
        const current = auth.currentUser || cred.user;

        if (!current.emailVerified) {
          try {
            await sendEmailVerification(current);
            setInfoMsg(
              `Verification link sent to ${validation.email}. Verify your Gmail inbox, then click "I Verified My Gmail — Continue".`
            );
          } catch {
            setInfoMsg(
              `Your Gmail (${validation.email}) is not verified yet. Open the verification link in your inbox or click "Resend Email".`
            );
          }
          setMode('verify');
          return;
        }

        await current.getIdToken(true);
        const profile = await onSyncVerifiedUser(current);
        if (profile.status === 'SUSPENDED') {
          await signOut(auth);
          setErrorMsg('Your account has been suspended by an administrator.');
          return;
        }

        showToast(
          profile.role === 'ADMIN' || profile.role === 'SUPER_ADMIN'
            ? 'Logged in as Administrator. Free access enabled.'
            : 'Logged in successfully.',
          'success'
        );
        onRouteAfterAuth(profile);
      } catch (fbErr) {
        const parsed = parseFirebaseAuthError(fbErr, 'customer');
        if (parsed.needsProviderEnable) {
          await completeServerLogin(validation.email);
          return;
        }
        setErrorMsg(parsed.message);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanName = displayName.trim();
    if (!cleanName || cleanName.length < 2) {
      setErrorMsg('Please enter your full name (at least 2 characters).');
      return;
    }

    const validation = validateGmailCredentials({
      email,
      password,
      confirmPassword,
      minPasswordLength: 8,
    });
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Please enter valid Gmail credentials.');
      return;
    }

    setSubmitting(true);
    try {
      if (mongoConnected) {
        await completeServerRegister(validation.email, cleanName);
        return;
      }

      try {
        const cred = await createUserWithEmailAndPassword(auth, validation.email, password);
        await updateProfile(cred.user, { displayName: cleanName.slice(0, 80) });
        try {
          await sendEmailVerification(cred.user);
          setInfoMsg(
            `Verification link sent to ${validation.email}. Verify your Gmail inbox, then click "I Verified My Gmail — Continue".`
          );
        } catch {
          setInfoMsg(
            `Account created for ${validation.email}. Click "Resend Email" if you did not receive the verification link.`
          );
        }
        setMode('verify');
        showToast('Account created! Please verify your Gmail address.', 'info');
      } catch (fbErr) {
        const parsed = parseFirebaseAuthError(fbErr, 'customer');
        if (parsed.needsProviderEnable) {
          await completeServerRegister(validation.email, cleanName);
          return;
        }
        setErrorMsg(parsed.message);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Account creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const emailCheck = validateGmailEmail(email);
    if (!emailCheck.valid) {
      setErrorMsg(emailCheck.error || 'Enter your registered @gmail.com address.');
      return;
    }

    setSubmitting(true);
    try {
      if (serverResetPending) {
        await serverResetPassword({
          email: emailCheck.email,
          code: serverResetCode,
          newPassword: serverNewPassword,
        });
        setServerResetPending(false);
        setServerResetCode('');
        setServerNewPassword('');
        switchMode('login');
        setInfoMsg('Password updated successfully. You can now log in.');
        showToast('Password reset complete.', 'success');
        return;
      }

      if (mongoConnected) {
        const res = await serverForgotPassword(emailCheck.email);
        setServerResetPending(true);
        if (res.resetPreviewCode) {
          setServerResetCode(res.resetPreviewCode);
        }
        setInfoMsg(
          res.resetPreviewCode
            ? `Reset code for ${res.email}: ${res.resetPreviewCode}. Enter it below with your new password.`
            : `If an account exists for ${res.email}, a reset code has been generated.`
        );
        return;
      }

      try {
        await sendPasswordResetEmail(auth, emailCheck.email);
        setInfoMsg(
          `Password reset link sent to ${emailCheck.email}. Check your Gmail inbox and spam folder.`
        );
        showToast('Password reset email sent.', 'success');
      } catch (fbErr) {
        const parsed = parseFirebaseAuthError(fbErr, 'customer');
        if (parsed.needsProviderEnable) {
          const res = await serverForgotPassword(emailCheck.email);
          setServerResetPending(true);
          if (res.resetPreviewCode) {
            setServerResetCode(res.resetPreviewCode);
          }
          setInfoMsg(
            res.resetPreviewCode
              ? `Reset code for ${res.email}: ${res.resetPreviewCode}. Enter it below with your new password.`
              : `If an account exists for ${res.email}, a reset code has been generated.`
          );
          return;
        }
        setErrorMsg(parsed.message);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process password reset.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      if (isServerVerify) {
        const res = await serverResendVerification(serverVerifyEmailAddr);
        setServerVerifyCode(res.verificationPreviewCode);
        setServerPreviewCode(res.verificationPreviewCode);
        setInfoMsg(`New verification code generated for ${res.email}.`);
        showToast('Verification code refreshed.', 'success');
        return;
      }

      const targetUser = activeUnverifiedUser || auth.currentUser;
      if (!targetUser) {
        switchMode('login');
        return;
      }
      await sendEmailVerification(targetUser);
      setInfoMsg(`Verification email re-sent to ${targetUser.email}.`);
      showToast('Verification email re-sent.', 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to resend verification.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckVerified = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      if (isServerVerify) {
        const session = await serverVerifyEmail({
          email: serverVerifyEmailAddr,
          code: serverVerifyCode,
        });
        if (session.profile.status === 'SUSPENDED') {
          setErrorMsg('Your account has been suspended by an administrator.');
          return;
        }
        onServerAuthSession(session);
        showToast('Gmail verified! Access unlocked.', 'success');
        onRouteAfterAuth(session.profile);
        return;
      }

      const profile = await onVerifiedRefresh();
      if (!profile) {
        setErrorMsg('Your Gmail is still showing unverified. Open the link in your inbox first.');
        return;
      }
      if (profile.status === 'SUSPENDED') {
        await signOut(auth);
        setMode('login');
        setErrorMsg('Your account has been suspended by an administrator.');
        return;
      }
      showToast('Gmail verified! Access unlocked.', 'success');
      onRouteAfterAuth(profile);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    setSubmitting(true);
    try {
      await signOut(auth);
      onSwitchAccountReset();
      setServerVerifyEmailAddr('');
      setServerVerifyCode('');
      setServerPreviewCode('');
      setPassword('');
      setConfirmPassword('');
      switchMode('login');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#12131A] p-6 shadow-[0_0_50px_rgba(0,243,255,0.12)] sm:p-7">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <CreatorStudioMark />
            <div>
              <h2 id="auth-modal-title" className="font-display text-lg font-bold text-white">
                {renderMode === 'login'
                  ? 'Account Login'
                  : renderMode === 'register'
                    ? 'Create Account'
                    : renderMode === 'forgot'
                      ? 'Reset Password'
                      : 'Verify Your Gmail'}
              </h2>
              <p className="text-xs text-[#9BA3B8]">
                {renderMode === 'verify'
                  ? 'Email verification is required'
                  : 'Gmail (@gmail.com) & password only'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#9BA3B8] hover:bg-white/10 hover:text-white"
            aria-label="Close login modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs (Login / Create Account) */}
        {(renderMode === 'login' || renderMode === 'register') && (
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#0A0A0F] p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                renderMode === 'login'
                  ? 'bg-[#00F3FF] text-[#0A0A0F]'
                  : 'text-[#9BA3B8] hover:text-white'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                renderMode === 'register'
                  ? 'bg-[#00F3FF] text-[#0A0A0F]'
                  : 'text-[#9BA3B8] hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Error & Info Banners */}
        {errorMsg && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}
        {infoMsg && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#39FF14]/40 bg-[#39FF14]/10 p-3 text-xs text-white">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#39FF14]" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* LOGIN FORM */}
        {renderMode === 'login' && (
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label htmlFor="login-gmail" className="block text-xs font-semibold text-[#9BA3B8]">
                Gmail Address (@gmail.com)
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
                <input
                  id="login-gmail"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full rounded-lg border border-white/15 bg-[#0A0A0F] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#00F3FF] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="block text-xs font-semibold text-[#9BA3B8]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-xs font-medium text-[#00F3FF] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-white/15 bg-[#0A0A0F] py-2.5 pl-10 pr-10 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#00F3FF] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9BA3B8] hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#00F3FF] px-5 py-2.5 text-sm font-semibold text-[#0A0A0F] shadow-[0_0_20px_rgba(0,243,255,0.25)] hover:bg-[#33F6FF] transition-colors disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              {submitting ? 'Signing In...' : 'Login'}
            </button>
          </form>
        )}

        {/* CREATE ACCOUNT FORM */}
        {renderMode === 'register' && (
          <form onSubmit={handleRegister} className="mt-5 space-y-4">
            <div>
              <label htmlFor="reg-name" className="block text-xs font-semibold text-[#9BA3B8]">
                Full Name
              </label>
              <div className="relative mt-1.5">
                <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="w-full rounded-lg border border-white/15 bg-[#0A0A0F] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#00F3FF] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-gmail" className="block text-xs font-semibold text-[#9BA3B8]">
                Gmail Address (@gmail.com only)
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
                <input
                  id="reg-gmail"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full rounded-lg border border-white/15 bg-[#0A0A0F] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#00F3FF] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="reg-pass" className="block text-xs font-semibold text-[#9BA3B8]">
                  Password
                </label>
                <input
                  id="reg-pass"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 chars"
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#00F3FF] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="reg-confirm" className="block text-xs font-semibold text-[#9BA3B8]">
                  Confirm Password
                </label>
                <input
                  id="reg-confirm"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#00F3FF] focus:outline-none"
                />
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#9BA3B8]">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#00F3FF]"
              />
              Show password
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#00F3FF] px-5 py-2.5 text-sm font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] transition-colors disabled:opacity-60"
            >
              {submitting ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD FORM */}
        {renderMode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="mt-5 space-y-4">
            <p className="text-xs leading-relaxed text-[#9BA3B8]">
              Enter your registered <strong className="text-white">@gmail.com</strong> address to reset your password.
            </p>
            <div>
              <label htmlFor="forgot-gmail" className="block text-xs font-semibold text-[#9BA3B8]">
                Gmail Address
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
                <input
                  id="forgot-gmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full rounded-lg border border-white/15 bg-[#0A0A0F] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#00F3FF] focus:outline-none"
                />
              </div>
            </div>

            {serverResetPending && (
              <>
                <div>
                  <label htmlFor="reset-code" className="block text-xs font-semibold text-[#9BA3B8]">
                    6-Digit Reset Code
                  </label>
                  <input
                    id="reset-code"
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    value={serverResetCode}
                    onChange={(e) => setServerResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 font-mono-tabular text-sm text-white focus:border-[#00F3FF] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reset-new-pass" className="block text-xs font-semibold text-[#9BA3B8]">
                    New Password
                  </label>
                  <input
                    id="reset-new-pass"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={serverNewPassword}
                    onChange={(e) => setServerNewPassword(e.target.value)}
                    placeholder="Min 8 chars"
                    className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white focus:border-[#00F3FF] focus:outline-none"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#00F3FF] px-5 py-2.5 text-sm font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] disabled:opacity-60"
            >
              {submitting
                ? 'Processing...'
                : serverResetPending
                  ? 'Confirm New Password'
                  : 'Reset Password'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full text-center text-xs font-medium text-[#9BA3B8] hover:text-white"
            >
              Back to Login
            </button>
          </form>
        )}

        {/* EMAIL VERIFICATION PENDING VIEW */}
        {renderMode === 'verify' && (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-[#00F3FF]/30 bg-[#0A0A0F] p-4 text-xs leading-relaxed text-[#9BA3B8]">
              <p className="font-semibold text-white">
                Verification required for {serverVerifyEmailAddr || activeUnverifiedUser?.email || email}
              </p>
              {isServerVerify ? (
                <p className="mt-1.5">
                  Enter the 6-digit verification code below to confirm your Gmail account
                  {serverPreviewCode ? (
                    <>
                      {' '}
                      (code:{' '}
                      <span className="font-mono-tabular font-bold text-[#00F3FF]">
                        {serverPreviewCode}
                      </span>
                      ).
                    </>
                  ) : (
                    '.'
                  )}
                </p>
              ) : (
                <p className="mt-1.5">
                  Open your Gmail inbox (and check Spam), click the verification link, then click the button below to unlock your account.
                </p>
              )}
            </div>

            {isServerVerify && (
              <div>
                <label htmlFor="verify-code-input" className="block text-xs font-semibold text-[#9BA3B8]">
                  6-Digit Verification Code
                </label>
                <input
                  id="verify-code-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={serverVerifyCode}
                  onChange={(e) => setServerVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-center font-mono-tabular text-base font-bold tracking-widest text-white focus:border-[#39FF14] focus:outline-none"
                />
              </div>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleCheckVerified()}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2.5 text-sm font-semibold text-[#0A0A0F] hover:bg-[#5BFF3B] disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {submitting
                ? 'Checking...'
                : isServerVerify
                  ? 'Verify Gmail & Continue'
                  : 'I Verified My Gmail — Continue'}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleResendVerification()}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:border-[#00F3FF]/50"
              >
                {isServerVerify ? 'Resend Code' : 'Resend Email'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSwitchAccount()}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-[#9BA3B8] hover:text-white"
              >
                Use Different Gmail
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
