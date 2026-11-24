import React, { useState } from 'react';
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Lock,
  MailPlus,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  AdminInvitation,
  AdminPermissionKey,
  AdminPermissionRecord,
  AdminPermissionsMap,
  AuditLog,
  EMPTY_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMANENT_SUPER_ADMIN_EMAIL,
  UserProfile,
} from '../../types/index.ts';
import {
  inviteAdminByEmail,
  promoteOrUpdateAdmin,
  revokeAdminInvitation,
  updateAdminPermissions,
} from '../../lib/db.ts';
import { isValidGmailAddress } from '../../lib/firebase.ts';
import { useToast } from '../ToastContext.tsx';

interface AdminTeamManagerProps {
  mode: 'admins' | 'permissions';
  user: UserProfile;
  profiles: UserProfile[];
  permissionRecords: AdminPermissionRecord[];
  invitations: AdminInvitation[];
  auditLogs: AuditLog[];
}

export function AdminTeamManager({
  mode,
  user,
  profiles,
  permissionRecords,
  invitations,
  auditLogs,
}: AdminTeamManagerProps) {
  const { showToast, confirmAction } = useToast();

  // Guard: Super Admin ONLY
  if (user.role !== 'SUPER_ADMIN') {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-[#12131A] p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-red-400" />
        <h2 className="mt-3 font-display text-lg font-bold text-white">
          Super Admin Access Required
        </h2>
        <p className="mt-2 text-sm text-[#9BA3B8]">
          Only the permanent Super Admin ({PERMANENT_SUPER_ADMIN_EMAIL}) can manage administrators and assign permissions.
        </p>
      </div>
    );
  }

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDays, setInviteDays] = useState(7);
  const [invitePerms, setInvitePerms] = useState<AdminPermissionsMap>({
    ...EMPTY_PERMISSIONS,
    orders_view: true,
    apps_view: true,
  });
  const [inviting, setInviting] = useState(false);

  const [selectedAdminUid, setSelectedAdminUid] = useState<string>('');
  const [draftPerms, setDraftPerms] = useState<AdminPermissionsMap>({ ...EMPTY_PERMISSIONS });
  const [savingPerms, setSavingPerms] = useState(false);

  const adminsList = profiles.filter((p) => p.role === 'ADMIN' || p.role === 'SUPER_ADMIN');
  const regularUsers = profiles.filter((p) => p.role === 'USER');

  const activeSelectedAdmin =
    adminsList.find((a) => a.uid === selectedAdminUid && a.role === 'ADMIN') ||
    adminsList.find((a) => a.role === 'ADMIN') ||
    null;

  const selectAdminForPerms = (admin: UserProfile) => {
    setSelectedAdminUid(admin.uid);
    const rec = permissionRecords.find((r) => r.adminUserId === admin.uid);
    setDraftPerms({ ...EMPTY_PERMISSIONS, ...(rec?.permissions || {}) });
  };

  // Sync draft when switching into permissions tab
  React.useEffect(() => {
    if (mode === 'permissions' && activeSelectedAdmin && selectedAdminUid !== activeSelectedAdmin.uid) {
      selectAdminForPerms(activeSelectedAdmin);
    }
  }, [mode, activeSelectedAdmin?.uid]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = inviteEmail.trim().toLowerCase();
    if (!isValidGmailAddress(cleanEmail)) {
      showToast('Only verified Gmail addresses ending in @gmail.com are allowed.', 'error');
      return;
    }
    setInviting(true);
    try {
      const existingUser = profiles.find(
        (p) => p.email.toLowerCase() === cleanEmail
      );
      if (existingUser) {
        await promoteOrUpdateAdmin({
          actor: user,
          targetProfile: existingUser,
          role: 'ADMIN',
          status: 'ACTIVE',
          permissions: invitePerms,
        });
        showToast(`${existingUser.email} promoted to Admin immediately.`, 'success');
      } else {
        await inviteAdminByEmail({
          actor: user,
          email: cleanEmail,
          permissions: invitePerms,
          expiresInDays: inviteDays,
        });
        showToast(
          `Admin invitation created for ${cleanEmail}. Once they create/verify their Gmail account and log in, Admin access activates automatically.`,
          'success'
        );
      }
      setInviteEmail('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to invite admin.', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleSavePermissions = async () => {
    if (!activeSelectedAdmin) return;
    setSavingPerms(true);
    try {
      await updateAdminPermissions({
        actor: user,
        targetProfile: activeSelectedAdmin,
        permissions: draftPerms,
      });
      showToast(`Permissions saved for ${activeSelectedAdmin.email}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update permissions.', 'error');
    } finally {
      setSavingPerms(false);
    }
  };

  const handleToggleSuspend = async (admin: UserProfile) => {
    const nextStatus = admin.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const ok = await confirmAction({
      title: `${nextStatus === 'SUSPENDED' ? 'Suspend' : 'Reactivate'} ${admin.email}?`,
      description:
        nextStatus === 'SUSPENDED'
          ? 'Suspended admins immediately lose all backend and Firestore administrative access.'
          : 'Reactivating restores their assigned permissions immediately.',
      confirmLabel: nextStatus === 'SUSPENDED' ? 'Suspend Admin' : 'Reactivate Admin',
      destructive: nextStatus === 'SUSPENDED',
    });
    if (!ok) return;
    try {
      await promoteOrUpdateAdmin({
        actor: user,
        targetProfile: admin,
        role: 'ADMIN',
        status: nextStatus,
      });
      showToast(`${admin.email} status updated to ${nextStatus}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed.', 'error');
    }
  };

  const handleRemoveAdmin = async (admin: UserProfile) => {
    const ok = await confirmAction({
      title: `Revoke Admin Privileges for ${admin.email}?`,
      description:
        'This demotes the account back to a standard User and deletes their Admin permissions record.',
      confirmLabel: 'Remove Admin',
      destructive: true,
    });
    if (!ok) return;
    try {
      await promoteOrUpdateAdmin({
        actor: user,
        targetProfile: admin,
        role: 'USER',
        status: 'ACTIVE',
      });
      showToast(`Removed admin privileges for ${admin.email}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove admin.', 'error');
    }
  };

  const renderPermissionMatrix = (
    perms: AdminPermissionsMap,
    onChange: (key: AdminPermissionKey, val: boolean) => void
  ) => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {PERMISSION_GROUPS.map((group) => (
        <div
          key={group.group}
          className="rounded-xl border border-white/10 bg-[#0A0A0F] p-4"
        >
          <h4 className="font-display text-xs font-bold uppercase tracking-wider text-[#00F3FF]">
            {group.group}
          </h4>
          <div className="mt-3 space-y-2.5">
            {group.items.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-2.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={Boolean(perms[item.key])}
                  onChange={(e) => onChange(item.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#00F3FF]"
                />
                <span>
                  <span className="block font-medium text-white">{item.label}</span>
                  <span className="block text-[11px] text-[#9BA3B8]">
                    {item.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (mode === 'permissions') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Granular Admin Permissions
          </h1>
          <p className="mt-1 text-xs text-[#9BA3B8]">
            Permissions are enforced directly in Firestore Security Rules as well as the dashboard UI.
          </p>
        </div>

        {adminsList.filter((a) => a.role === 'ADMIN').length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#12131A] p-8 text-center text-sm text-[#9BA3B8]">
            No delegated admins yet. Invite or promote an admin under Admin Management first.
          </div>
        ) : (
          <div className="space-y-6 rounded-2xl border border-white/10 bg-[#12131A] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                {adminsList
                  .filter((a) => a.role === 'ADMIN')
                  .map((admin) => {
                    const selected = activeSelectedAdmin?.uid === admin.uid;
                    return (
                      <button
                        key={admin.uid}
                        type="button"
                        onClick={() => selectAdminForPerms(admin)}
                        className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                          selected
                            ? 'bg-[#00F3FF] text-[#0A0A0F]'
                            : 'border border-white/15 bg-[#0A0A0F] text-[#9BA3B8] hover:text-white'
                        }`}
                      >
                        {admin.email}
                      </button>
                    );
                  })}
              </div>

              <button
                type="button"
                disabled={savingPerms || !activeSelectedAdmin}
                onClick={() => void handleSavePermissions()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2.5 text-xs font-semibold text-[#0A0A0F] hover:bg-[#5BFF3B] disabled:opacity-50"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {savingPerms ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>

            {renderPermissionMatrix(draftPerms, (key, val) =>
              setDraftPerms((prev) => ({ ...prev, [key]: val }))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">
          Admin Management
        </h1>
        <p className="mt-1 text-xs text-[#9BA3B8]">
          Invite administrators by verified Gmail, assign granular permissions, suspend or remove access, and review login activity.
        </p>
      </div>

      {/* Add / Invite Admin Form */}
      <form
        onSubmit={handleInviteSubmit}
        className="space-y-5 rounded-2xl border border-white/10 bg-[#12131A] p-6"
      >
        <div className="flex items-center gap-2">
          <MailPlus className="h-5 w-5 text-[#00F3FF]" />
          <h2 className="font-display text-base font-bold text-white">
            Add or Invite Admin by Gmail
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#9BA3B8]">
              Verified Gmail Address *
            </label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@gmail.com"
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white focus:border-[#00F3FF] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA3B8]">
              Invitation Expiry (Days)
            </label>
            <select
              value={inviteDays}
              onChange={(e) => setInviteDays(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white"
            >
              <option value={1}>1 Day</option>
              <option value={3}>3 Days</option>
              <option value={7}>7 Days</option>
              <option value={14}>14 Days</option>
              <option value={30}>30 Days</option>
            </select>
          </div>
        </div>

        <div>
          <p className="mb-2.5 text-xs font-semibold text-[#9BA3B8]">
            Initial Permissions
          </p>
          {renderPermissionMatrix(invitePerms, (key, val) =>
            setInvitePerms((prev) => ({ ...prev, [key]: val }))
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={inviting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#00F3FF] px-5 py-2.5 text-xs font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" />
            {inviting ? 'Processing...' : 'Create Admin / Send Invitation'}
          </button>
        </div>
      </form>

      {/* Active Admins & Super Admin Table */}
      <div className="rounded-2xl border border-white/10 bg-[#12131A] p-6">
        <h2 className="font-display text-base font-bold text-white">
          Administrator Accounts
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[#9BA3B8]">
                <th className="py-2.5 pr-4 font-medium">Admin</th>
                <th className="py-2.5 pr-4 font-medium">Role</th>
                <th className="py-2.5 pr-4 font-medium">Status</th>
                <th className="py-2.5 pr-4 font-medium">Last Login</th>
                <th className="py-2.5 pr-4 font-medium">Recent Activity</th>
                <th className="py-2.5 pl-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {adminsList.map((admin) => {
                const isPermanentOwner =
                  admin.email.toLowerCase() === PERMANENT_SUPER_ADMIN_EMAIL;
                const recentLog = auditLogs.find((l) => l.actorUserId === admin.uid);
                return (
                  <tr key={admin.uid}>
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-white">{admin.displayName}</div>
                      <div className="text-[11px] text-[#9BA3B8]">{admin.email}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          admin.role === 'SUPER_ADMIN'
                            ? 'text-[#BC13FE]'
                            : 'text-[#00F3FF]'
                        }`}
                      >
                        <Shield className="h-3.5 w-3.5" />
                        {admin.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`font-semibold ${
                          admin.status === 'ACTIVE' ? 'text-[#39FF14]' : 'text-red-400'
                        }`}
                      >
                        {admin.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono-tabular text-[#9BA3B8]">
                      {admin.lastLogin.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-[#9BA3B8]">
                      {recentLog ? recentLog.summary : 'No logged changes yet'}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      {isPermanentOwner ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#9BA3B8]">
                          <Lock className="h-3 w-3 text-[#BC13FE]" />
                          Permanent Owner
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleToggleSuspend(admin)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                              admin.status === 'ACTIVE'
                                ? 'border-amber-400/30 text-amber-300 hover:bg-amber-400/10'
                                : 'border-[#39FF14]/30 text-[#39FF14] hover:bg-[#39FF14]/10'
                            }`}
                          >
                            {admin.status === 'ACTIVE' ? (
                              <>
                                <Ban className="h-3 w-3" />
                                Suspend
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3" />
                                Reactivate
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemoveAdmin(admin)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invitations History */}
      <div className="rounded-2xl border border-white/10 bg-[#12131A] p-6">
        <h2 className="font-display text-base font-bold text-white">
          Admin Invitations ({invitations.length})
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[#9BA3B8]">
                <th className="py-2.5 pr-4 font-medium">Invited Gmail</th>
                <th className="py-2.5 pr-4 font-medium">Status</th>
                <th className="py-2.5 pr-4 font-medium">Expires</th>
                <th className="py-2.5 pl-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[#9BA3B8]">
                    No pending or past invitations.
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => {
                  const expired = inv.expiresAt < new Date() && inv.status === 'PENDING';
                  return (
                    <tr key={inv.id}>
                      <td className="py-3 pr-4 font-medium text-white">{inv.email}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`font-semibold ${
                            inv.status === 'ACCEPTED'
                              ? 'text-[#39FF14]'
                              : inv.status === 'REVOKED' || expired
                                ? 'text-red-400'
                                : 'text-amber-300'
                          }`}
                        >
                          {expired ? 'EXPIRED' : inv.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono-tabular text-[#9BA3B8]">
                        {inv.expiresAt.toLocaleDateString()}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        {inv.status === 'PENDING' && !expired && (
                          <button
                            type="button"
                            onClick={() => void revokeAdminInvitation(user, inv)}
                            className="rounded-lg border border-red-500/30 px-2.5 py-1 text-[11px] text-red-400 hover:bg-red-500/10"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Registered Users (Quick Promote) */}
      {regularUsers.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#12131A] p-6">
          <h2 className="font-display text-base font-bold text-white">
            Registered Storefront Users ({regularUsers.length})
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[#9BA3B8]">
                  <th className="py-2.5 pr-4 font-medium">User</th>
                  <th className="py-2.5 pr-4 font-medium">Last Login</th>
                  <th className="py-2.5 pl-4 font-medium text-right">Promote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {regularUsers.map((u) => (
                  <tr key={u.uid}>
                    <td className="py-3 pr-4">
                      <span className="font-medium text-white">{u.displayName}</span>
                      <span className="ml-2 text-[#9BA3B8]">{u.email}</span>
                    </td>
                    <td className="py-3 pr-4 font-mono-tabular text-[#9BA3B8]">
                      {u.lastLogin.toLocaleDateString()}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          void promoteOrUpdateAdmin({
                            actor: user,
                            targetProfile: u,
                            role: 'ADMIN',
                            status: 'ACTIVE',
                            permissions: { ...EMPTY_PERMISSIONS, orders_view: true, apps_view: true },
                          }).then(() => showToast(`Promoted ${u.email} to Admin.`, 'success'))
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-[#00F3FF]/40 px-3 py-1 text-[11px] font-semibold text-[#00F3FF] hover:bg-[#00F3FF]/10"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Make Admin
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
