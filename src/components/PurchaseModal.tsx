import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  LogIn,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import {
  AppListing,
  PaymentMethod,
  PaymentSetting,
  UserProfile,
} from '../types/index.ts';
import { compressImageToDataUrl, submitOrder } from '../lib/db.ts';
import { sanitizeSafeUrl } from '../lib/defaults.ts';
import { AppIconRenderer } from './BrandLogo.tsx';
import { useToast } from './ToastContext.tsx';

interface PurchaseModalProps {
  app: AppListing | null;
  user: UserProfile | null;
  paymentSettings: PaymentSetting[];
  currencyLabel: string;
  onClose: () => void;
  onSignIn: () => void;
  onGoToDownloads: () => void;
}

export function PurchaseModal({
  app,
  user,
  paymentSettings,
  currencyLabel,
  onClose,
  onSignIn,
  onGoToDownloads,
}: PurchaseModalProps) {
  const { showToast } = useToast();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('EasyPaisa');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState('');
  const [screenshotName, setScreenshotName] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
  const [lastSubmitAt, setLastSubmitAt] = useState(0);

  useEffect(() => {
    if (app) {
      setTransactionId('');
      setScreenshotDataUrl('');
      setScreenshotName('');
      setSubmittedOrderId(null);
      const firstEnabled = paymentSettings.find((p) => p.isEnabled);
      if (firstEnabled) {
        setSelectedMethod(firstEnabled.method);
      }
    }
  }, [app, paymentSettings]);

  if (!app) return null;

  const activeSetting = paymentSettings.find(
    (p) => p.method === selectedMethod && p.isEnabled
  );

  const handleCopyAccount = async (accNum: string) => {
    try {
      await navigator.clipboard.writeText(accNum);
      setCopied(true);
      showToast('Account number copied to clipboard.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Copy failed. Please copy the number manually.', 'error');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, 960, 0.75);
      setScreenshotDataUrl(compressed);
      setScreenshotName(file.name);
      showToast('Payment screenshot attached.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to attach screenshot.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('Please log in with your verified Gmail account first.', 'error');
      return;
    }
    if (!activeSetting) {
      showToast('Selected payment method is currently unavailable.', 'error');
      return;
    }
    if (Date.now() - lastSubmitAt < 4000) {
      showToast('Please wait a moment before submitting another order.', 'info');
      return;
    }
    const cleanTid = transactionId.trim();
    if (!/^\d{11}$/.test(cleanTid)) {
      showToast('Enter a valid 11-digit numeric Transaction ID.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const orderId = await submitOrder({
        user,
        app,
        paymentMethod: selectedMethod,
        transactionId: cleanTid,
        screenshotDataUrl: screenshotDataUrl || undefined,
      });
      setLastSubmitAt(Date.now());
      setSubmittedOrderId(orderId);
      showToast('Your payment has been submitted. Download access will unlock after payment confirmation.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Order submission failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const qrUrl = activeSetting ? sanitizeSafeUrl(activeSetting.qrImagePath) : '';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/15 bg-[#12131A] p-6 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3.5">
            <AppIconRenderer
              name={app.name}
              iconUrl={app.iconUrl}
              iconKey={app.iconKey}
              size="md"
            />
            <div>
              <h2 id="purchase-modal-title" className="font-display text-lg font-bold text-white">
                {app.name}
              </h2>
              <p className="mt-0.5 text-xs text-[#9BA3B8]">
                {app.category} · {app.version} · {app.fileSize}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-mono-tabular text-lg font-bold text-[#00F3FF]">
                {currencyLabel} {app.pricePkr.toLocaleString()}
              </div>
              <div className="text-[11px] text-[#9BA3B8]">PKR</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#9BA3B8] hover:bg-white/10 hover:text-white"
              aria-label="Close purchase modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Success Confirmation View */}
        {submittedOrderId ? (
          <div className="py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#39FF14]/40 bg-[#39FF14]/10 text-[#39FF14]">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="mt-4 font-display text-xl font-bold text-white">
              Payment Submitted
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#9BA3B8]">
              Your payment has been submitted. Download access will unlock after payment confirmation.
            </p>

            <div className="mt-5 rounded-xl border border-white/10 bg-[#0A0A0F] p-4 text-left text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="text-[#9BA3B8]">Order Tracking ID</span>
                <span className="font-mono-tabular text-white">{submittedOrderId}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[#9BA3B8]">11-Digit Transaction ID</span>
                <span className="font-mono-tabular text-[#00F3FF]">{transactionId}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-[#9BA3B8]">Status</span>
                <span className="font-semibold text-amber-300">PENDING</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToDownloads();
                }}
                className="rounded-lg bg-[#00F3FF] px-5 py-2.5 text-xs font-semibold text-[#0A0A0F] hover:bg-[#33F6FF]"
              >
                Track in My Downloads
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/15 px-5 py-2.5 text-xs font-medium text-white hover:bg-white/5"
              >
                Back to Marketplace
              </button>
            </div>
          </div>
        ) : !user ? (
          /* Require Email & Password Login before checkout submission */
          <div className="py-8 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-[#00F3FF]" />
            <h3 className="mt-3 font-display text-lg font-bold text-white">
              Login Required to Purchase
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#9BA3B8]">
              Log in with your verified Gmail address and password so your order and download entitlement stay bound securely to your account.
            </p>
            <button
              type="button"
              onClick={onSignIn}
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#00F3FF] px-6 py-2.5 text-sm font-semibold text-[#0A0A0F] hover:bg-[#33F6FF]"
            >
              <LogIn className="h-4 w-4" />
              Login with Gmail & Password
            </button>
          </div>
        ) : (
          /* Payment Method + Transaction Form */
          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            {/* Step 1: Select Payment Method */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#9BA3B8]">
                1. Choose Payment Method
              </label>
              <div className="mt-2.5 grid grid-cols-2 gap-3">
                {(['EasyPaisa', 'JazzCash'] as PaymentMethod[]).map((method) => {
                  const enabled = paymentSettings.some(
                    (p) => p.method === method && p.isEnabled
                  );
                  const isSelected = selectedMethod === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      disabled={!enabled}
                      onClick={() => setSelectedMethod(method)}
                      className={`flex min-h-[46px] items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                        !enabled
                          ? 'cursor-not-allowed border-white/5 bg-white/[0.02] text-[#9BA3B8]/40'
                          : isSelected
                            ? 'border-[#00F3FF] bg-[#00F3FF]/15 text-white'
                            : 'border-white/10 bg-[#0A0A0F] text-[#9BA3B8] hover:border-white/25 hover:text-white'
                      }`}
                    >
                      <CreditCard className="h-4 w-4 text-[#00F3FF]" />
                      {method}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Live Database Account Details */}
            {activeSetting ? (
              <div className="rounded-xl border border-[#00F3FF]/25 bg-[#0A0A0F] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#9BA3B8]">Account Title</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">
                      {activeSetting.accountTitle}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-[#9BA3B8]">{activeSetting.method} Number</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-mono-tabular text-base font-bold text-[#00F3FF]">
                        {activeSetting.accountNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyAccount(activeSetting.accountNumber)}
                        className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white hover:border-[#00F3FF]/50"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3 w-3 text-[#39FF14]" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-[#9BA3B8]">
                  {activeSetting.instructions}
                </p>

                {qrUrl && (
                  <div className="mt-3 flex justify-center border-t border-white/10 pt-3">
                    <img
                      src={qrUrl}
                      alt={`${activeSetting.method} QR Code`}
                      referrerPolicy="no-referrer"
                      className="h-36 w-36 rounded-lg border border-white/10 bg-white object-contain p-1"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
                Payment account details are not configured yet. Please contact the administrator.
              </div>
            )}

            {/* Step 3: 11-Digit Transaction ID & Screenshot */}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="tx-id-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#9BA3B8]"
                >
                  2. 11-Digit Transaction ID (TID) *
                </label>
                <input
                  id="tx-id-input"
                  type="text"
                  inputMode="numeric"
                  required
                  minLength={11}
                  maxLength={11}
                  pattern="\d{11}"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="12345678901"
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 font-mono-tabular text-sm text-white placeholder-[#9BA3B8]/60 focus:border-[#00F3FF] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[#9BA3B8]">
                  Enter the exact 11-digit numeric TID ({transactionId.length}/11 digits).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#9BA3B8]">
                  3. Payment Screenshot (Optional)
                </label>
                <label className="mt-1.5 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-white/20 bg-[#0A0A0F] px-4 py-3 text-xs text-[#9BA3B8] hover:border-[#00F3FF]/50 hover:text-white transition-colors">
                  <span className="flex items-center gap-2 truncate">
                    <Upload className="h-4 w-4 shrink-0 text-[#00F3FF]" />
                    <span className="truncate">
                      {screenshotName ? screenshotName : 'Choose receipt image (PNG, JPG, WebP)'}
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {screenshotDataUrl && (
                    <span className="ml-2 shrink-0 text-[#39FF14]">Attached</span>
                  )}
                </label>
                {screenshotDataUrl && (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={screenshotDataUrl}
                      alt="Payment receipt preview"
                      className="h-14 w-14 rounded-lg border border-white/15 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setScreenshotDataUrl('');
                        setScreenshotName('');
                      }}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Remove screenshot
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/15 px-4 py-2.5 text-xs font-medium text-[#9BA3B8] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !activeSetting}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#00F3FF] px-5 py-2.5 text-xs font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] disabled:opacity-50"
              >
                {submitting ? 'Submitting Payment...' : 'Confirm Payment Submitted'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
