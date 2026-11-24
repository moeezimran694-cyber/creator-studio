import React, { useEffect, useState } from 'react';
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
  ArrowLeft,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import {
  auth,
  parseFirebaseAuthError,
  validateGmailCredentials,
  validateGmailEmail,
} from '../../lib/firebase.ts';
import {
  fetchDbStatus,
  serverForgotPassword,
  serverLogin,
  serverOwnerSetup,
  serverResendVerification,
  serverResetPassword,
  serverVerifyEmail,
  type DbStatusSnapshot,
  type ServerAuthSessionResponse,
} from '../../lib/serverSession.ts';
import { PERMANENT_SUPER_ADMIN_EMAIL, UserProfile } from '../../types/index.ts';
import { CreatorStudioMark } from '../BrandLogo.tsx';
import { useToast } from '../ToastContext.tsx';

type PortalMode = 'login' | 'owner-setup' | 'forgot' | 'verify';

interface AdminPortalAuthProps {
  userProfile: UserProfile | null;
  unverifiedUser: User | null;
  authLoading: boolean;
  onVerifiedRefresh: () => Promise<UserProfile | null>;
  onSyncVerifiedUser: (firebaseUser: User) => Promise<UserProfile>;
  onServerAuthSession: (session: ServerAuthSessionResponse) => void;
  onBackToStorefront: () => void;
}

export function AdminPortalAuth({
  userProfile,
  unverifiedUser,
  authLoading,
  onVerifiedRefresh,
  onSyncVerifiedUser,
  onServerAuthSession,
  onBackToStorefront,
}: AdminPortalAuthProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<PortalMode>(unverifiedUser ? 'verify' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const [dbStatus, setDbStatus] = useState<DbStatusSnapshot | null>(null);
  const [serverVerifyEmailAddr, setServerVerifyEmailAddr] = useState('');
  const [serverVerifyCode, setServerVerifyCode] = useState('');
  const [serverPreviewCode, setServerPreviewCode] = useState('');
  const [serverResetPending, setServerResetPending] = useState(false);
  const [serverResetCode, setServerResetCode] = useState('');
  const [serverNewPassword, setServerNewPassword] = useState('');

  useEffect(() => {
    void fetchDbStatus(true)
      .then((status) => {
        setDbStatus(status);
        if (!status.ownerClaimed && !unverifiedUser && !userProfile) {
          setMode('owner-setup');
          setInfoMsg(
            'First-time setup: create the permanent Super Admin password below to unlock Admin Panel.'
          );
        }
      })
      .catch(() => undefined);
  }, [unverifiedUser, userProfile]);

  const activeUnverified =
    unverifiedUser || (auth.currentUser && !auth.currentUser.emailVerified ? auth.currentUser : null);
  const isServerVerify = Boolean(serverVerifyEmailAddr);

  const effectiveMode: PortalMode =
    (activeUnverified || isServerVerify) && !userProfile
      ? 'verify'
      : mode === 'verify' && !activeUnverified && !isServerVerify
        ? 'login'
        : mode;

  const clearAlerts = () => {
    setErrorMsg('');
    setInfoMsg('');
  };

  const completeServerAdminLogin = async (cleanEmail: string) => {
    const res = await serverLogin({ email: cleanEmail, password });
    if (res.authenticated) {
      onServerAuthSession(res.session);
      showToast('Admin credentials verified.', 'success');
      return;
    }

    setServerVerifyEmailAddr(res.email);
    setServerVerifyCode(res.verificationPreviewCode);
    setServerPreviewCode(res.verificationPreviewCode);
    setMode('verify');
    setInfoMsg(
      `Verification code ready for ${res.email}. Confirm the 6-digit code below to enter the Admin Panel.`
    );
  };

  const completeServerOwnerSetup = async (cleanEmail: string) => {
    const res = await serverOwnerSetup({ email: cleanEmail, password });
    setServerVerifyEmailAddr(res.email);
    setServerVerifyCode(res.verificationPreviewCode);
    setServerPreviewCode(res.verificationPreviewCode);
    setMode('verify');
    setInfoMsg(
      `Owner account created for ${res.email}. Confirm the 6-digit verification code below to enter the Admin Panel.`
    );
    showToast('Owner credentials created! Confirm verification code.', 'info');
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    const validation = validateGmailCredentials({ email, password });
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Only verified @gmail.com addresses are allowed.');
      return;
    }

    setSubmitting(true);
    try {
      if (dbStatus?.mongoConnected) {
        await completeServerAdminLogin(validation.email);
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
              `Verification link sent to ${validation.email}. Verify your Gmail inbox, then click "I Verified My Gmail — Enter Admin Panel".`
            );
          } catch {
            setInfoMsg(
              `Your Gmail (${validation.email}) is not verified yet. Open the link in your inbox or click "Resend Email".`
            );
          }
          setMode('verify');
          return;
        }

        await current.getIdToken(true);
        await onSyncVerifiedUser(current);
        showToast('Admin credentials verified.', 'success');
      } catch (fbErr) {
        const parsed = parseFirebaseAuthError(fbErr, 'admin');
        if (parsed.needsProviderEnable) {
          if (dbStatus && !dbStatus.ownerClaimed && validation.email === PERMANENT_SUPER_ADMIN_EMAIL) {
            try {
              await completeServerAdminLogin(validation.email);
              return;
            } catch {
              setMode('owner-setup');
              setInfoMsg(
                'Owner credentials have not been set yet. Create your initial Super Admin password below.'
              );
              return;
            }
          }
          await completeServerAdminLogin(validation.email);
          return;
        }
        setErrorMsg(parsed.message);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Admin authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOwnerSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    const validation = validateGmailCredentials({
      email,
      password,
      confirmPassword,
      minPasswordLength: 8,
    });
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Enter valid owner Gmail credentials.');
      return;
    }

    if (validation.email !== PERMANENT_SUPER_ADMIN_EMAIL) {
      setErrorMsg(
        'First-Time Owner Setup is restricted strictly to the permanent owner Gmail address.'
      );
      return;
    }

    setSubmitting(true);
    try {
      if (dbStatus?.mongoConnected) {
        await completeServerOwnerSetup(validation.email);
        return;
      }

      try {
        const cred = await createUserWithEmailAndPassword(auth, validation.email, password);
        await updateProfile(cred.user, { displayName: 'Super Admin' });
        try {
          await sendEmailVerification(cred.user);
          setInfoMsg(
            `Owner account created for ${validation.email}. Verify the confirmation email in your Gmail inbox to unlock the Admin Panel.`
          );
        } catch {
          setInfoMsg(
            `Owner account created for ${validation.email}. Click "Resend Email" if the verification link did not arrive.`
          );
        }
        setMode('verify');
        showToast('Owner account created! Verify your Gmail to unlock Admin Panel.', 'info');
      } catch (fbErr) {
        const parsed = parseFirebaseAuthError(fbErr, 'admin');
        if (parsed.needsProviderEnable) {
          await completeServerOwnerSetup(validation.email);
          return;
        }
        setErrorMsg(parsed.message);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Owner setup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    const emailCheck = validateGmailEmail(email);
    if (!emailCheck.valid) {
      setErrorMsg(emailCheck.error || 'Enter your registered admin @gmail.com address.');
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
        setMode('login');
        setInfoMsg('Admin password updated successfully. You can now log in.');
        showToast('Admin password reset complete.', 'success');
        return;
      }

      if (dbStatus?.mongoConnected) {
        const res = await serverForgotPassword(emailCheck.email);
        setServerResetPending(true);
        if (res.resetPreviewCode) setServerResetCode(res.resetPreviewCode);
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
        showToast('Admin password reset email sent.', 'success');
      } catch (fbErr) {
        const parsed = parseFirebaseAuthError(fbErr, 'admin');
        if (parsed.needsProviderEnable) {
          const res = await serverForgotPassword(emailCheck.email);
          setServerResetPending(true);
          if (res.resetPreviewCode) setServerResetCode(res.resetPreviewCode);
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
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send reset code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckVerified = async () => {
    clearAlerts();
    setSubmitting(true);
    try {
      if (isServerVerify) {
        const session = await serverVerifyEmail({
          email: serverVerifyEmailAddr,
          code: serverVerifyCode,
        });
        onServerAuthSession(session);
        showToast('Admin Gmail verified! Opening dashboard...', 'success');
        return;
      }

      const profile = await onVerifiedRefresh();
      if (profile) {
        showToast('Admin Gmail verified! Opening dashboard...', 'success');
      } else {
        setErrorMsg('Gmail is still unverified. Click the verification link in your inbox first.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    clearAlerts();
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

      const targetUser = activeUnverified || auth.currentUser;
      if (!targetUser) {
        setMode('login');
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

  const handleSwitchAccount = async () => {
    await signOut(auth);
    setServerVerifyEmailAddr('');
    setServerVerifyCode('');
    setServerPreviewCode('');
    setMode('login');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    clearAlerts();
  };

  // Logged in as a regular customer or suspended account trying to access /admin
  const isDeniedAccount =
    userProfile &&
    (userProfile.status === 'SUSPENDED' ||
      (userProfile.role !== 'SUPER_ADMIN' && userProfile.role !== 'ADMIN'));

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0A0A0F] px-4 py-12 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(188,19,254,0.12),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(0,243,255,0.08),transparent_45%)]" />

      <div className="relative z-10 w-full max-w-md">
        <button
          type="button"
          onClick={onBackToStorefront}
          className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-[#9BA3B8] hover:text-[#00F3FF] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Public Storefront
        </button>

        <div className="rounded-2xl border border-[#BC13FE]/35 bg-[#12131A] p-6 shadow-[0_0_60px_rgba(188,19,254,0.14)] sm:p-8">
          {/* Portal Header */}
          <div className="flex items-center gap-3.5 border-b border-white/10 pb-5">
            <CreatorStudioMark />
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#BC13FE]">
                <Shield className="h-3.5 w-3.5" />
                Restricted Admin Portal
              </div>
              <h1 className="font-display text-xl font-bold text-white">
                Admin Panel Access
              </h1>
            </div>
          </div>

          {authLoading ? (
            <div className="py-12 text-center text-sm text-[#9BA3B8]">
              Checking administrator session...
            </div>
          ) : isDeniedAccount && userProfile ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs leading-relaxed text-red-200">
                <div className="flex items-center gap-2 font-semibold text-red-300">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  {userProfile.status === 'SUSPENDED'
                    ? 'Administrator Account Suspended'
                    : 'Administrator Access Denied'}
                </div>
                <p className="mt-2">
                  Currently logged in as <strong className="text-white">{userProfile.email}</strong> ({userProfile.role}).
                </p>
                <p className="mt-1.5 text-[#9BA3B8]">
                  Only authorized Administrators can enter the Admin Panel.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleSwitchAccount()}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#BC13FE] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#C93CFE] transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Logout &amp; Switch to Admin Gmail
              </button>

              <button
                type="button"
                onClick={onBackToStorefront}
                className="w-full rounded-lg border border-white/15 py-2.5 text-xs font-medium text-[#9BA3B8] hover:text-white"
              >
                Return to Storefront
              </button>
            </div>
          ) : (
            <>
              {(effectiveMode === 'login' || effectiveMode === 'owner-setup') && (
                <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#0A0A0F] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      clearAlerts();
                    }}
                    className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                      effectiveMode === 'login'
                        ? 'bg-[#BC13FE] text-white'
                        : 'text-[#9BA3B8] hover:text-white'
                    }`}
                  >
                    Admin Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('owner-setup');
                      clearAlerts();
                    }}
                    className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                      effectiveMode === 'owner-setup'
                        ? 'bg-[#BC13FE] text-white'
                        : 'text-[#9BA3B8] hover:text-white'
                    }`}
                  >
                    Owner First Setup
                  </button>
                </div>
              )}

              {errorMsg && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-200">
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

              {/* ADMIN LOGIN */}
              {effectiveMode === 'login' && (
                <form onSubmit={handleAdminLogin} className="mt-5 space-y-4">
                  <div>
                    <label
                      htmlFor="admin-login-gmail"
                      className="block text-xs font-semibold text-[#9BA3B8]"
                    >
                      Admin Gmail Address (@gmail.com)
                    </label>
                    <div className="relative mt-1.5">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
                      <input
                        id="admin-login-gmail"
                        type="email"
                        required
                        autoComplete="off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter admin Gmail (@gmail.com)"
                        className="w-full rounded-lg border border-white/15 bg-[#0A0A0F] py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#BC13FE] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="admin-login-password"
                        className="block text-xs font-semibold text-[#9BA3B8]"
                      >
                        Admin Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          clearAlerts();
                        }}
                        className="text-xs font-medium text-[#00F3FF] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative mt-1.5">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
                      <input
                        id="admin-login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter admin password"
                        className="w-full rounded-lg border border-white/15 bg-[#0A0A0F] py-2.5 pl-10 pr-10 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#BC13FE] focus:outline-none"
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
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#BC13FE] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(188,19,254,0.3)] hover:bg-[#C93CFE] transition-colors disabled:opacity-60"
                  >
                    <KeyRound className="h-4 w-4" />
                    {submitting ? 'Verifying Admin Access...' : 'Unlock Admin Panel'}
                  </button>
                </form>
              )}

              {/* FIRST-TIME OWNER SETUP */}
              {effectiveMode === 'owner-setup' && (
                <form onSubmit={handleOwnerSetup} className="mt-5 space-y-4">
                  <p className="rounded-xl border border-white/10 bg-[#0A0A0F] p-3 text-xs leading-relaxed text-[#9BA3B8]">
                    Create the initial password for the permanent Super Admin account. Once created and verified, use Admin Login anytime.
                  </p>

                  <div>
                    <label
                      htmlFor="owner-setup-gmail"
                      className="block text-xs font-semibold text-[#9BA3B8]"
                    >
                      Owner Gmail Address (@gmail.com)
                    </label>
                    <input
                      id="owner-setup-gmail"
                      type="email"
                      required
                      autoComplete="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter owner Gmail (@gmail.com)"
                      className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#BC13FE] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="owner-setup-pass"
                      className="block text-xs font-semibold text-[#9BA3B8]"
                    >
                      Set Owner Password
                    </label>
                    <input
                      id="owner-setup-pass"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Choose password (min 8 chars)"
                      className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#BC13FE] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="owner-setup-confirm"
                      className="block text-xs font-semibold text-[#9BA3B8]"
                    >
                      Confirm Owner Password
                    </label>
                    <input
                      id="owner-setup-confirm"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat owner password"
                      className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#BC13FE] focus:outline-none"
                    />
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#9BA3B8]">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#BC13FE]"
                    />
                    Show password
                  </label>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#00F3FF] px-5 py-2.5 text-sm font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] transition-colors disabled:opacity-60"
                  >
                    {submitting ? 'Creating Owner Account...' : 'Create Owner Credentials'}
                  </button>
                </form>
              )}

              {/* FORGOT PASSWORD */}
              {effectiveMode === 'forgot' && (
                <form onSubmit={handleForgotPassword} className="mt-5 space-y-4">
                  <p className="text-xs leading-relaxed text-[#9BA3B8]">
                    Enter your registered Admin <strong className="text-white">@gmail.com</strong> address to reset your password.
                  </p>
                  <div>
                    <label
                      htmlFor="admin-forgot-gmail"
                      className="block text-xs font-semibold text-[#9BA3B8]"
                    >
                      Admin Gmail Address
                    </label>
                    <input
                      id="admin-forgot-gmail"
                      type="email"
                      required
                      autoComplete="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter admin Gmail (@gmail.com)"
                      className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#BC13FE] focus:outline-none"
                    />
                  </div>

                  {serverResetPending && (
                    <>
                      <div>
                        <label
                          htmlFor="admin-reset-code"
                          className="block text-xs font-semibold text-[#9BA3B8]"
                        >
                          6-Digit Reset Code
                        </label>
                        <input
                          id="admin-reset-code"
                          type="text"
                          inputMode="numeric"
                          required
                          maxLength={6}
                          value={serverResetCode}
                          onChange={(e) =>
                            setServerResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                          }
                          placeholder="6-digit code"
                          className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 font-mono-tabular text-sm text-white focus:border-[#BC13FE] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="admin-reset-pass"
                          className="block text-xs font-semibold text-[#9BA3B8]"
                        >
                          New Admin Password
                        </label>
                        <input
                          id="admin-reset-pass"
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={serverNewPassword}
                          onChange={(e) => setServerNewPassword(e.target.value)}
                          placeholder="Min 8 chars"
                          className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white focus:border-[#BC13FE] focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#BC13FE] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#C93CFE] disabled:opacity-60"
                  >
                    {submitting
                      ? 'Processing...'
                      : serverResetPending
                        ? 'Confirm New Admin Password'
                        : 'Reset Admin Password'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setServerResetPending(false);
                      setMode('login');
                      clearAlerts();
                    }}
                    className="w-full text-center text-xs font-medium text-[#9BA3B8] hover:text-white"
                  >
                    Back to Admin Login
                  </button>
                </form>
              )}

              {/* EMAIL VERIFICATION */}
              {effectiveMode === 'verify' && (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-[#BC13FE]/35 bg-[#0A0A0F] p-4 text-xs leading-relaxed text-[#9BA3B8]">
                    <p className="font-semibold text-white">
                      Verification required for {serverVerifyEmailAddr || activeUnverified?.email || email}
                    </p>
                    {isServerVerify ? (
                      <p className="mt-1.5">
                        Confirm the 6-digit verification code below to enter the Admin Panel
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
                        Open your Gmail inbox (and check Spam), click the verification link, then click below to enter the Admin Panel.
                      </p>
                    )}
                  </div>

                  {isServerVerify && (
                    <div>
                      <label
                        htmlFor="admin-verify-code"
                        className="block text-xs font-semibold text-[#9BA3B8]"
                      >
                        6-Digit Verification Code
                      </label>
                      <input
                        id="admin-verify-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={serverVerifyCode}
                        onChange={(e) =>
                          setServerVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
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
                        ? 'Verify Gmail & Enter Admin Panel'
                        : 'I Verified My Gmail — Enter Admin Panel'}
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleResendVerification()}
                      className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:border-[#BC13FE]/50"
                    >
                      {isServerVerify ? 'Resend Code' : 'Resend Email'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSwitchAccount()}
                      className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-[#9BA3B8] hover:text-white"
                    >
                      Switch Gmail
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Honest MongoDB / Database Status Footer */}
          {dbStatus && (
            <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0A0A0F] px-3.5 py-2.5 text-[11px] text-[#9BA3B8]">
              <Database
                className={`h-4 w-4 shrink-0 ${
                  dbStatus.mongoConnected ? 'text-[#39FF14]' : 'text-amber-300'
                }`}
              />
              <span>
                {dbStatus.mongoConnected ? (
                  <>
                    MongoDB Connected (<strong className="text-white">{dbStatus.mongoDbName}</strong>)
                  </>
                ) : (
                  <>
                    MongoDB not configured yet — add <code className="text-[#00F3FF]">MONGODB_URI</code> in Secrets for MongoDB persistence.
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
