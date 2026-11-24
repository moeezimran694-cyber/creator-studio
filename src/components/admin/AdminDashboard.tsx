import React, { useEffect, useState } from 'react';
import {
  Activity,
  CreditCard,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Palette,
  PlusCircle,
  Shield,
  ShoppingCart,
  Users,
  X,
} from 'lucide-react';
import {
  AdminInvitation,
  AdminPermissionRecord,
  AdminPermissionsMap,
  AdminTab,
  AppListing,
  AuditLog,
  DownloadLog,
  Order,
  PaymentSetting,
  UserProfile,
  WebsiteSettingsBundle,
} from '../../types/index.ts';
import {
  seedInitialDatabaseIfNeeded,
  subscribeAdminInvitations,
  subscribeAllAdminPermissions,
  subscribeAllAppsAdmin,
  subscribeAllOrdersAdmin,
  subscribeAllPaymentSettingsAdmin,
  subscribeAuditLogs,
  subscribeDownloadLogsAdmin,
  subscribeProfilesAdmin,
} from '../../lib/db.ts';
import { useToast } from '../ToastContext.tsx';
import { AdminOverview } from './AdminOverview.tsx';
import { AdminAppsManager } from './AdminAppsManager.tsx';
import { AdminOrdersManager } from './AdminOrdersManager.tsx';
import { AdminTeamManager } from './AdminTeamManager.tsx';
import { AdminWebsiteEditor } from './AdminWebsiteEditor.tsx';
import { AdminPaymentSettings } from './AdminPaymentSettings.tsx';
import { AdminAuditLogs } from './AdminAuditLogs.tsx';

interface AdminDashboardProps {
  user: UserProfile;
  permissions: AdminPermissionsMap;
  savedSettings: WebsiteSettingsBundle;
  previewEnabled: boolean;
  onTogglePreview: (enabled: boolean) => void;
  onDraftChange: (draft: WebsiteSettingsBundle) => void;
  onBackToStorefront: () => void;
  onSignOut: () => void;
}

export function AdminDashboard({
  user,
  permissions,
  savedSettings,
  previewEnabled,
  onTogglePreview,
  onDraftChange,
  onBackToStorefront,
  onSignOut,
}: AdminDashboardProps) {
  const { showToast } = useToast();
  const isSuper = user.role === 'SUPER_ADMIN';
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [apps, setApps] = useState<AppListing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSetting[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [permRecords, setPermRecords] = useState<AdminPermissionRecord[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [downloadLogs, setDownloadLogs] = useState<DownloadLog[]>([]);
  const [seeding, setSeeding] = useState(false);

  // Subscribe strictly to collections permitted for this admin
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    if (isSuper || permissions.apps_view) {
      unsubs.push(subscribeAllAppsAdmin(setApps));
    }
    if (isSuper || permissions.orders_view) {
      unsubs.push(subscribeAllOrdersAdmin(setOrders));
    }
    if (isSuper || permissions.payments_view) {
      unsubs.push(subscribeAllPaymentSettingsAdmin(setPaymentSettings));
    }
    if (isSuper) {
      unsubs.push(subscribeProfilesAdmin(setProfiles));
      unsubs.push(subscribeAllAdminPermissions(setPermRecords));
      unsubs.push(subscribeAdminInvitations(setInvitations));
    }
    if (isSuper || user.role === 'ADMIN') {
      unsubs.push(subscribeAuditLogs(setAuditLogs));
      unsubs.push(subscribeDownloadLogsAdmin(setDownloadLogs));
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [
    isSuper,
    user.role,
    permissions.apps_view,
    permissions.orders_view,
    permissions.payments_view,
  ]);

  const handleSeedDatabase = async () => {
    setSeeding(true);
    try {
      const res = await seedInitialDatabaseIfNeeded(user.uid, user.email, true);
      if (res.seeded) {
        showToast('Starter catalog and default settings saved to Firestore.', 'success');
      } else {
        showToast('Database already contains all starter records.', 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Database seeding failed.', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const navItems: {
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    {
      id: 'apps',
      label: 'Manage Apps',
      icon: Package,
      visible: isSuper || permissions.apps_view,
    },
    {
      id: 'add-app',
      label: 'Add App',
      icon: PlusCircle,
      visible: isSuper || permissions.apps_add,
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: ShoppingCart,
      visible: isSuper || permissions.orders_view,
    },
    {
      id: 'admins',
      label: 'Admin Management',
      icon: Users,
      visible: isSuper,
    },
    {
      id: 'permissions',
      label: 'Permissions',
      icon: KeyRound,
      visible: isSuper,
    },
    {
      id: 'website-editor',
      label: 'Website Editor',
      icon: Palette,
      visible: isSuper || permissions.content_edit || permissions.appearance_edit,
    },
    {
      id: 'payments',
      label: 'Payment Settings',
      icon: CreditCard,
      visible: isSuper || permissions.payments_view,
    },
    {
      id: 'logs',
      label: 'Activity Logs',
      icon: Activity,
      visible: true,
    },
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0A0A0F] px-3.5 py-3">
          <Shield className="h-5 w-5 shrink-0 text-[#BC13FE]" />
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-white">{user.displayName}</p>
            <p className="truncate text-[11px] font-semibold text-[#00F3FF]">{user.role}</p>
          </div>
        </div>

        <nav className="space-y-1" aria-label="Admin sidebar navigation">
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[#00F3FF] text-[#0A0A0F]'
                      : 'text-[#9BA3B8] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
        </nav>
      </div>

      <div className="mt-6 space-y-1.5 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onBackToStorefront}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-medium text-[#9BA3B8] hover:bg-white/5 hover:text-white"
        >
          <Globe className="h-4 w-4 shrink-0 text-[#00F3FF]" />
          Public Storefront
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-medium text-red-400 hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#0A0A0F]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#12131A] lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Trigger */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center justify-between border-b border-white/10 bg-[#12131A] px-4 py-3 lg:hidden">
          <span className="font-display text-sm font-bold text-white">
            Admin Control Center
          </span>
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-white"
            aria-label="Toggle admin menu"
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileNavOpen && (
          <div className="border-b border-white/10 bg-[#12131A] lg:hidden">
            {sidebarContent}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            {activeTab === 'dashboard' && (
              <AdminOverview
                user={user}
                apps={apps}
                orders={orders}
                downloadLogs={downloadLogs}
                onSeedDatabase={() => void handleSeedDatabase()}
                seeding={seeding}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {(activeTab === 'apps' || activeTab === 'add-app') && (
              <AdminAppsManager
                mode={activeTab === 'add-app' ? 'add' : 'list'}
                user={user}
                permissions={permissions}
                apps={apps}
                categories={savedSettings.marketplace.categories}
                onSwitchToAdd={() => setActiveTab('add-app')}
                onSwitchToList={() => setActiveTab('apps')}
              />
            )}

            {activeTab === 'orders' && (
              <AdminOrdersManager
                user={user}
                permissions={permissions}
                orders={orders}
              />
            )}

            {(activeTab === 'admins' || activeTab === 'permissions') && (
              <AdminTeamManager
                mode={activeTab === 'permissions' ? 'permissions' : 'admins'}
                user={user}
                profiles={profiles}
                permissionRecords={permRecords}
                invitations={invitations}
                auditLogs={auditLogs}
              />
            )}

            {activeTab === 'website-editor' && (
              <AdminWebsiteEditor
                user={user}
                permissions={permissions}
                savedSettings={savedSettings}
                previewEnabled={previewEnabled}
                onTogglePreview={onTogglePreview}
                onDraftChange={onDraftChange}
                onPreviewStorefront={onBackToStorefront}
              />
            )}

            {activeTab === 'payments' && (
              <AdminPaymentSettings
                user={user}
                permissions={permissions}
                paymentSettings={paymentSettings}
              />
            )}

            {activeTab === 'logs' && <AdminAuditLogs logs={auditLogs} />}
          </div>
        </main>
      </div>
    </div>
  );
}
