import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import {
  AdminPermissionsMap,
  Order,
  OrderStatus,
  UserProfile,
} from '../../types/index.ts';
import {
  approveOrder,
  fetchOrderScreenshot,
  rejectOrder,
} from '../../lib/db.ts';
import { useToast } from '../ToastContext.tsx';

interface AdminOrdersManagerProps {
  user: UserProfile;
  permissions: AdminPermissionsMap;
  orders: Order[];
}

export function AdminOrdersManager({
  user,
  permissions,
  orders,
}: AdminOrdersManagerProps) {
  const { showToast, confirmAction } = useToast();
  const isSuper = user.role === 'SUPER_ADMIN';
  const canApprove = isSuper || permissions.orders_approve;
  const canReject = isSuper || permissions.orders_reject;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [screenshotModal, setScreenshotModal] = useState<{
    order: Order;
    dataUrl: string | null;
    loading: boolean;
  } | null>(null);
  const [rejectModalOrder, setRejectModalOrder] = useState<Order | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const filtered = orders.filter((o) => {
    const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      o.userEmail.toLowerCase().includes(q) ||
      o.appName.toLowerCase().includes(q) ||
      o.transactionId.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const handleViewScreenshot = async (order: Order) => {
    setScreenshotModal({ order, dataUrl: null, loading: true });
    try {
      const dataUrl = await fetchOrderScreenshot(order.id);
      setScreenshotModal({ order, dataUrl, loading: false });
    } catch (err) {
      setScreenshotModal(null);
      showToast(err instanceof Error ? err.message : 'Unable to load receipt.', 'error');
    }
  };

  const handleApprove = async (order: Order) => {
    if (!isSuper && order.userId === user.uid) {
      showToast('Admins cannot approve their own orders.', 'error');
      return;
    }
    const ok = await confirmAction({
      title: `Approve Payment ${order.transactionId}?`,
      description: `This verifies Rs. ${order.amountPkr} via ${order.paymentMethod} for ${order.userEmail} and immediately unlocks their protected download for ${order.appName}.`,
      confirmLabel: 'Approve & Unlock Download',
    });
    if (!ok) return;

    setProcessingId(order.id);
    try {
      await approveOrder(order, user);
      showToast(`Order ${order.transactionId} approved and download unlocked.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Approval failed.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalOrder) return;
    if (!isSuper && rejectModalOrder.userId === user.uid) {
      showToast('Admins cannot reject their own orders.', 'error');
      return;
    }
    setProcessingId(rejectModalOrder.id);
    try {
      await rejectOrder(rejectModalOrder, user, rejectionReason);
      showToast(`Order ${rejectModalOrder.transactionId} marked as Rejected.`, 'info');
      setRejectModalOrder(null);
      setRejectionReason('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Rejection failed.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Orders & Payments</h1>
        <p className="mt-1 text-xs text-[#9BA3B8]">
          Verify EasyPaisa & JazzCash transaction IDs before unlocking software downloads.
        </p>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by customer email, app, or TID..."
            className="w-full rounded-lg border border-white/10 bg-[#12131A] py-2 pl-9 pr-3 text-xs text-white focus:border-[#00F3FF] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#12131A] p-1">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === status
                  ? 'bg-[#00F3FF] text-[#0A0A0F]'
                  : 'text-[#9BA3B8] hover:text-white'
              }`}
            >
              {status === 'ALL' ? 'All' : status}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#12131A]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-[#9BA3B8]">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">App</th>
                <th className="px-4 py-3 font-medium">Method & TID</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[#9BA3B8]">
                    No orders match this filter.
                  </td>
                </tr>
              ) : (
                paged.map((ord) => (
                  <tr key={ord.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{ord.userName}</div>
                      <div className="text-[11px] text-[#9BA3B8]">{ord.userEmail}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{ord.appName}</td>
                    <td className="px-4 py-3">
                      <div className="text-[#9BA3B8]">{ord.paymentMethod}</div>
                      <div className="font-mono-tabular text-[#00F3FF]">
                        {ord.transactionId}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-white">
                      Rs. {ord.amountPkr.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-[#9BA3B8]">
                      {ord.createdAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          ord.status === 'APPROVED'
                            ? 'text-[#39FF14]'
                            : ord.status === 'PENDING'
                              ? 'text-amber-300'
                              : 'text-red-400'
                        }`}
                      >
                        {ord.status}
                      </span>
                      {ord.reviewedByEmail && (
                        <div className="text-[10px] text-[#9BA3B8]">
                          by {ord.reviewedByEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {ord.hasScreenshot && (
                          <button
                            type="button"
                            onClick={() => void handleViewScreenshot(ord)}
                            title="View payment receipt"
                            className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-medium text-white hover:border-[#00F3FF]/50"
                          >
                            <Eye className="h-3.5 w-3.5 text-[#00F3FF]" />
                            Receipt
                          </button>
                        )}
                        {canApprove && ord.status !== 'APPROVED' && (
                          <button
                            type="button"
                            disabled={processingId === ord.id}
                            onClick={() => void handleApprove(ord)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#39FF14]/20 px-2.5 py-1.5 text-[11px] font-semibold text-[#39FF14] hover:bg-[#39FF14]/30 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                        )}
                        {canReject && ord.status !== 'REJECTED' && (
                          <button
                            type="button"
                            disabled={processingId === ord.id}
                            onClick={() => {
                              setRejectModalOrder(ord);
                              setRejectionReason('');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-[#9BA3B8]">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-white/15 px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-white/15 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Screenshot Preview Modal */}
      {screenshotModal && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#12131A] p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-white">
                  Payment Receipt · {screenshotModal.order.transactionId}
                </h3>
                <p className="text-xs text-[#9BA3B8]">
                  {screenshotModal.order.userEmail} · Rs. {screenshotModal.order.amountPkr}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScreenshotModal(null)}
                className="rounded-lg p-1.5 text-[#9BA3B8] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-center">
              {screenshotModal.loading ? (
                <p className="py-12 text-xs text-[#9BA3B8]">Loading receipt image...</p>
              ) : screenshotModal.dataUrl ? (
                <img
                  src={screenshotModal.dataUrl}
                  alt="Payment screenshot"
                  className="max-h-[65vh] rounded-xl border border-white/10 object-contain"
                />
              ) : (
                <p className="py-12 text-xs text-[#9BA3B8]">No screenshot found.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModalOrder && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleRejectSubmit}
            className="w-full max-w-md rounded-2xl border border-white/15 bg-[#12131A] p-6"
          >
            <h3 className="font-display text-lg font-bold text-white">
              Reject Payment {rejectModalOrder.transactionId}
            </h3>
            <p className="mt-1 text-xs text-[#9BA3B8]">
              Provide clear instructions for {rejectModalOrder.userEmail}.
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Transaction ID not found in EasyPaisa statement. Please verify TID and contact support."
              className="mt-4 w-full rounded-lg border border-white/15 bg-[#0A0A0F] p-3 text-xs text-white focus:border-[#00F3FF] focus:outline-none"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectModalOrder(null)}
                className="rounded-lg border border-white/15 px-4 py-2 text-xs text-[#9BA3B8] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processingId === rejectModalOrder.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
