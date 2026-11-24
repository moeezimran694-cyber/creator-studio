import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  LogIn,
  MessageCircle,
  Package,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  AppListing,
  Entitlement,
  Order,
  UserProfile,
  WebsiteSettingsBundle,
} from '../types/index.ts';
import { requestSignedDownloadLink } from '../lib/db.ts';
import { sanitizeSafeUrl } from '../lib/defaults.ts';
import { useToast } from './ToastContext.tsx';

interface MyDownloadsPageProps {
  user: UserProfile | null;
  orders: Order[];
  entitlements: Entitlement[];
  apps: AppListing[];
  settings: WebsiteSettingsBundle;
  onSignIn: () => void;
  onBackToStore: () => void;
}

export function MyDownloadsPage({
  user,
  orders,
  entitlements,
  apps,
  settings,
  onSignIn,
  onBackToStore,
}: MyDownloadsPageProps) {
  const { showToast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [recentDownloads, setRecentDownloads] = useState<
    Record<string, { fileName: string; generatedAt: string }>
  >({});
  const currency = settings.marketplace.currencyLabel || 'Rs.';
  const whatsappUrl = sanitizeSafeUrl(settings.support.whatsappLink);

  const handleDownload = async (order: Order) => {
    if (!user) return;
    setDownloadingId(order.id);
    try {
      const result = await requestSignedDownloadLink(order.appId, order.id);
      setRecentDownloads((prev) => ({
        ...prev,
        [order.id]: {
          fileName: result.fileName,
          generatedAt: new Date().toLocaleTimeString(),
        },
      }));
      showToast(
        `Temporary 60s single-use download started for ${order.appName} (${result.fileName}).`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Unable to verify download entitlement.',
        'error'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const isActiveAdmin = Boolean(
    user &&
      user.status === 'ACTIVE' &&
      (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN')
  );

  const handleAdminFreeDownload = async (app: AppListing) => {
    if (!user) return;
    setDownloadingId(`admin-${app.id}`);
    try {
      const result = await requestSignedDownloadLink(app.id);
      setRecentDownloads((prev) => ({
        ...prev,
        [`admin-${app.id}`]: {
          fileName: result.fileName,
          generatedAt: new Date().toLocaleTimeString(),
        },
      }));
      showToast(
        `Admin free download started for ${app.name} (${result.fileName}).`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Unable to start admin download.',
        'error'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <main className="mx-auto min-h-[70vh] max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <button
            type="button"
            onClick={onBackToStore}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#9BA3B8] hover:text-[#00F3FF]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Marketplace
          </button>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
            My Downloads & Orders
          </h1>
          <p className="mt-1 text-sm text-[#9BA3B8]">
            Verified download access unlocks automatically after payment approval. Every download generates a fresh 60-second single-use link.
          </p>
        </div>

        {user && (
          <div className="rounded-xl border border-white/10 bg-[#12131A] px-4 py-2.5 text-xs">
            <span className="text-[#9BA3B8]">Logged in as </span>
            <span className="font-semibold text-white">{user.email}</span>
          </div>
        )}
      </div>

      {isActiveAdmin && apps.length > 0 && (
        <section className="mt-8 rounded-2xl border border-[#39FF14]/30 bg-[#12131A] p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#39FF14]">
                <CheckCircle2 className="h-4 w-4" />
                Admin Free Access — All Software Unlocked
              </span>
              <p className="mt-1 text-xs text-[#9BA3B8]">
                All marketplace packages are 100% free for authenticated Administrators.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {apps.map((app) => {
              const adminDlKey = `admin-${app.id}`;
              const lastAdminDl = recentDownloads[adminDlKey];
              return (
                <div
                  key={app.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#0A0A0F] p-4"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-sm font-bold text-white">
                      {app.name}
                    </h3>
                    <p className="mt-0.5 font-mono-tabular text-[11px] text-[#9BA3B8]">
                      {app.version} · {app.fileSize} · <span className="text-[#39FF14]">FREE</span>
                    </p>
                    {lastAdminDl && (
                      <p className="mt-1 text-[11px] text-[#9BA3B8]">
                        Started {lastAdminDl.fileName} at {lastAdminDl.generatedAt}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={downloadingId === adminDlKey}
                    onClick={() => void handleAdminFreeDownload(app)}
                    className="inline-flex shrink-0 min-h-[40px] items-center gap-1.5 rounded-lg bg-[#39FF14] px-4 py-2 text-xs font-bold text-[#0A0A0F] hover:bg-[#5BFF3B] transition-colors disabled:opacity-60"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloadingId === adminDlKey ? 'Starting...' : 'DOWNLOAD NOW'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!user ? (
        <div className="mt-12 rounded-2xl border border-white/10 bg-[#12131A] p-10 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-[#00F3FF]" />
          <h2 className="mt-4 font-display text-xl font-bold text-white">
            Login to Access Your Downloads
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#9BA3B8]">
            Your order statuses and protected software downloads are tied strictly to your verified Gmail &amp; password account.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#00F3FF] px-6 py-2.5 text-sm font-semibold text-[#0A0A0F] hover:bg-[#33F6FF]"
          >
            <LogIn className="h-4 w-4" />
            Login with Gmail &amp; Password
          </button>
        </div>
      ) : orders.length === 0 && !isActiveAdmin ? (
        <div className="mt-12 rounded-2xl border border-white/10 bg-[#12131A] p-10 text-center">
          <Package className="mx-auto h-12 w-12 text-[#9BA3B8]" />
          <h2 className="mt-4 font-display text-xl font-bold text-white">
            No Orders Yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#9BA3B8]">
            Browse the Creator Studio marketplace to order your first software package.
          </p>
          <button
            type="button"
            onClick={onBackToStore}
            className="mt-6 rounded-lg bg-[#00F3FF] px-6 py-2.5 text-sm font-semibold text-[#0A0A0F] hover:bg-[#33F6FF]"
          >
            Explore Apps
          </button>
        </div>
      ) : orders.length === 0 ? null : (
        <div className="mt-8 space-y-4">
          {orders.map((order) => {
            const hasEntitlement = entitlements.some((e) => e.appId === order.appId);
            const appMeta = apps.find((a) => a.id === order.appId);
            const isApprovedAndEntitled = order.status === 'APPROVED' && hasEntitlement;
            const lastDownload = recentDownloads[order.id];

            return (
              <div
                key={order.id}
                className="flex flex-col justify-between gap-5 rounded-2xl border border-white/10 bg-[#12131A] p-6 md:flex-row md:items-center"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-display text-lg font-bold text-white">
                      {order.appName}
                    </h3>
                    {appMeta && (
                      <span className="font-mono-tabular text-xs text-[#9BA3B8]">
                        {appMeta.version} · {appMeta.fileSize}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#9BA3B8]">
                    <span>
                      Transaction ID:{' '}
                      <strong className="font-mono-tabular text-white">
                        {order.transactionId}
                      </strong>
                    </span>
                    <span>
                      Method: <strong className="text-white">{order.paymentMethod}</strong>
                    </span>
                    <span>
                      Amount:{' '}
                      <strong className="font-mono-tabular text-white">
                        {currency} {order.amountPkr.toLocaleString()}
                      </strong>
                    </span>
                    <span>
                      Date:{' '}
                      <strong className="font-mono-tabular text-white">
                        {order.createdAt.toLocaleDateString()}
                      </strong>
                    </span>
                  </div>

                  {/* Status Feedback */}
                  <div className="pt-1 text-xs">
                    {isApprovedAndEntitled ? (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#39FF14]">
                          <CheckCircle2 className="h-4 w-4" />
                          Payment Approved — Download Available
                        </span>
                        {lastDownload && (
                          <p className="text-[11px] text-[#9BA3B8]">
                            Single-use link for <strong className="text-white">{lastDownload.fileName}</strong> generated at {lastDownload.generatedAt}. Click DOWNLOAD NOW anytime to generate a new 60-second link.
                          </p>
                        )}
                      </div>
                    ) : order.status === 'PENDING' ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300">
                        <Clock className="h-4 w-4" />
                        Payment verification pending
                      </span>
                    ) : (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-red-400">
                          <XCircle className="h-4 w-4" />
                          Payment rejected
                        </span>
                        <p className="text-[#9BA3B8]">
                          {order.rejectionReason ||
                            'Unable to verify this transaction ID. Please contact support with your payment receipt.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                <div className="flex shrink-0 items-center gap-3">
                  {isApprovedAndEntitled ? (
                    <button
                      type="button"
                      disabled={downloadingId === order.id}
                      onClick={() => handleDownload(order)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2.5 text-xs font-bold tracking-wide text-[#0A0A0F] hover:bg-[#5BFF3B] transition-colors disabled:opacity-60"
                    >
                      <Download className="h-4 w-4" />
                      {downloadingId === order.id ? 'Generating Link...' : 'DOWNLOAD NOW'}
                    </button>
                  ) : order.status === 'REJECTED' && whatsappUrl ? (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:border-[#39FF14]/50"
                    >
                      <MessageCircle className="h-4 w-4 text-[#39FF14]" />
                      Contact Support
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="rounded-lg border border-white/10 bg-[#0A0A0F] px-4 py-2.5 text-xs font-medium text-[#9BA3B8]">
                      Locked Until Approved
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
