import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Globe,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import { fetchDbStatus, type DbStatusSnapshot } from '../../lib/serverSession.ts';
import {
  AppListing,
  DownloadLog,
  Order,
  UserProfile,
} from '../../types/index.ts';

interface AdminOverviewProps {
  user: UserProfile;
  apps: AppListing[];
  orders: Order[];
  downloadLogs: DownloadLog[];
  onSeedDatabase: () => void;
  seeding: boolean;
  onNavigateTab: (tab: 'apps' | 'add-app' | 'orders' | 'website-editor') => void;
}

export function AdminOverview({
  user,
  apps,
  orders,
  downloadLogs,
  onSeedDatabase,
  seeding,
  onNavigateTab,
}: AdminOverviewProps) {
  const [dbStatus, setDbStatus] = useState<DbStatusSnapshot | null>(null);
  const [dbChecking, setDbChecking] = useState(false);

  const loadDbStatus = useCallback(async (force = false) => {
    setDbChecking(true);
    try {
      const status = await fetchDbStatus(force);
      setDbStatus(status);
    } catch {
      // ignore status check error
    } finally {
      setDbChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadDbStatus(true);
  }, [loadDbStatus]);

  const totalApps = apps.length;
  const publishedApps = apps.filter((a) => a.isPublished).length;
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === 'PENDING').length;
  const approvedOrders = orders.filter((o) => o.status === 'APPROVED').length;
  const rejectedOrders = orders.filter((o) => o.status === 'REJECTED').length;
  const totalDownloads = downloadLogs.length;

  const approvedRevenue = orders
    .filter((o) => o.status === 'APPROVED')
    .reduce((sum, o) => sum + (o.amountPkr || 0), 0);

  const stats = [
    { label: 'Total Apps', value: totalApps, icon: Package, accent: 'text-[#00F3FF]' },
    { label: 'Published Apps', value: publishedApps, icon: Globe, accent: 'text-[#39FF14]' },
    { label: 'Total Orders', value: totalOrders, icon: ShoppingCart, accent: 'text-white' },
    { label: 'Pending Orders', value: pendingOrders, icon: Clock, accent: 'text-amber-300' },
    { label: 'Approved Orders', value: approvedOrders, icon: CheckCircle2, accent: 'text-[#39FF14]' },
    { label: 'Total Downloads', value: totalDownloads, icon: Download, accent: 'text-[#BC13FE]' },
  ];

  // Category distribution for clean visual bar chart
  const categoryCounts = apps.reduce<Record<string, number>>((acc, app) => {
    acc[app.category] = (acc[app.category] || 0) + 1;
    return acc;
  }, {});
  const categoryEntries = Object.entries(categoryCounts);
  const maxCatCount = Math.max(1, ...categoryEntries.map(([, c]) => c));

  const maxOrderMetric = Math.max(1, pendingOrders, approvedOrders, rejectedOrders);

  return (
    <div className="space-y-8">
      {/* Header + Optional Seed Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Operations Overview
          </h1>
          <p className="mt-1 text-sm text-[#9BA3B8]">
            Signed in as <span className="text-white font-medium">{user.email}</span> ·{' '}
            <span className="text-[#00F3FF] font-semibold">{user.role}</span>
          </p>
        </div>

        {user.role === 'SUPER_ADMIN' && apps.length < 6 && (
          <button
            type="button"
            disabled={seeding}
            onClick={onSeedDatabase}
            className="inline-flex items-center gap-2 rounded-lg bg-[#00F3FF] px-4 py-2.5 text-xs font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {seeding ? 'Seeding Database...' : 'Restore Starter Apps & Defaults'}
          </button>
        )}
      </div>

      {/* 6 KPI Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-[#12131A] p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#9BA3B8]">{item.label}</span>
                <Icon className={`h-4 w-4 ${item.accent}`} />
              </div>
              <div className={`mt-3 font-display text-3xl font-bold tabular-nums ${item.accent}`}>
                {item.value.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Honest Database Connection Status (MongoDB + Cloud Firestore) */}
      <div className="rounded-2xl border border-white/10 bg-[#12131A] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-[#00F3FF]" />
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Database Connection Status
              </h2>
              <p className="text-xs text-[#9BA3B8]">
                Live storage health for MongoDB and Cloud Firestore
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={dbChecking}
            onClick={() => void loadDbStatus(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-1.5 text-xs font-semibold text-white hover:border-[#00F3FF]/50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${dbChecking ? 'animate-spin' : ''}`} />
            {dbChecking ? 'Checking...' : 'Refresh DB Status'}
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#0A0A0F] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">MongoDB Primary Store</span>
              {dbStatus?.mongoConnected ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#39FF14]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Connected
                </span>
              ) : dbStatus?.mongoConfigured ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Connection Error
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Not Configured
                </span>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#9BA3B8]">
              {dbStatus?.mongoConnected ? (
                <>
                  Connected to database <strong className="text-white">{dbStatus.mongoDbName}</strong>.
                  Apps, orders, accounts, payment settings, and downloads are persisting to MongoDB.
                </>
              ) : dbStatus?.mongoConfigured ? (
                <>
                  <span className="text-red-300">{dbStatus.mongoError || 'Unable to ping MongoDB cluster.'}</span>
                </>
              ) : (
                <>
                  Add <code className="text-[#00F3FF]">MONGODB_URI</code> (and optional{' '}
                  <code className="text-[#00F3FF]">MONGODB_DB_NAME</code>) in AI Studio{' '}
                  <strong className="text-white">Settings → Secrets</strong>, then restart the server
                  to connect your MongoDB Atlas database.
                </>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0A0A0F] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">Cloud Firestore</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#00F3FF]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Provisioned
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#9BA3B8]">
              Project: <strong className="text-white">{dbStatus?.firebaseProjectId || 'decisive-ellipse-qggh3'}</strong>
              <br />
              Database ID:{' '}
              <span className="font-mono-tabular text-[11px] text-white">
                {dbStatus?.firestoreDatabaseId || 'ai-studio-5ffa4f2b-21b5-4576-8e0e-37011a5af68b'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Analytics Row: Order Status Chart + Catalog Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#12131A] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Order Verification Pipeline
              </h2>
              <p className="mt-0.5 text-xs text-[#9BA3B8]">
                Approved revenue:{' '}
                <span className="font-mono-tabular font-semibold text-[#39FF14]">
                  Rs. {approvedRevenue.toLocaleString()}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="text-xs font-semibold text-[#00F3FF] hover:underline"
            >
              Review Orders
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {[
              { label: 'Pending Verification', count: pendingOrders, color: '#FBBF24' },
              { label: 'Approved & Unlocked', count: approvedOrders, color: '#39FF14' },
              { label: 'Rejected', count: rejectedOrders, color: '#F87171' },
            ].map((row) => (
              <div key={row.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#9BA3B8]">{row.label}</span>
                  <span className="font-mono-tabular font-semibold text-white">
                    {row.count}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((row.count / maxOrderMetric) * 100)}%`,
                      backgroundColor: row.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#12131A] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Catalog Distribution
              </h2>
              <p className="mt-0.5 text-xs text-[#9BA3B8]">
                Apps grouped by active marketplace category
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('apps')}
              className="text-xs font-semibold text-[#00F3FF] hover:underline"
            >
              Manage Apps
            </button>
          </div>

          {categoryEntries.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[#9BA3B8]">
              No applications in catalog yet.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {categoryEntries.map(([cat, count]) => (
                <div key={cat} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-medium">{cat}</span>
                    <span className="font-mono-tabular text-[#9BA3B8]">
                      {count} {count === 1 ? 'app' : 'apps'}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#00F3FF] to-[#BC13FE]"
                      style={{ width: `${Math.round((count / maxCatCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders Quick Table */}
      <div className="rounded-2xl border border-white/10 bg-[#12131A] p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 className="font-display text-base font-bold text-white">Recent Orders</h2>
          <button
            type="button"
            onClick={() => onNavigateTab('orders')}
            className="text-xs font-semibold text-[#00F3FF] hover:underline"
          >
            View All Orders
          </button>
        </div>
        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9BA3B8]">
            No customer orders recorded yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[#9BA3B8]">
                  <th className="py-2.5 pr-4 font-medium">Customer</th>
                  <th className="py-2.5 pr-4 font-medium">App</th>
                  <th className="py-2.5 pr-4 font-medium">Method</th>
                  <th className="py-2.5 pr-4 font-medium">Transaction ID</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Amount</th>
                  <th className="py-2.5 pl-4 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.slice(0, 6).map((ord) => (
                  <tr key={ord.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 pr-4 text-white">{ord.userEmail}</td>
                    <td className="py-3 pr-4 font-medium text-white">{ord.appName}</td>
                    <td className="py-3 pr-4 text-[#9BA3B8]">{ord.paymentMethod}</td>
                    <td className="py-3 pr-4 font-mono-tabular text-[#00F3FF]">
                      {ord.transactionId}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono-tabular text-white">
                      Rs. {ord.amountPkr.toLocaleString()}
                    </td>
                    <td className="py-3 pl-4 text-right font-semibold">
                      <span
                        className={
                          ord.status === 'APPROVED'
                            ? 'text-[#39FF14]'
                            : ord.status === 'PENDING'
                              ? 'text-amber-300'
                              : 'text-red-400'
                        }
                      >
                        {ord.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
