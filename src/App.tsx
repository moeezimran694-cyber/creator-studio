import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  AdminPermissionsMap,
  AppListing,
  AppView,
  EMPTY_PERMISSIONS,
  Entitlement,
  Order,
  PaymentSetting,
  PERMANENT_SUPER_ADMIN_EMAIL,
  UserProfile,
  WebsiteSettingsBundle,
} from './types/index.ts';
import { auth, isValidGmailAddress } from './lib/firebase.ts';
import { DEFAULT_WEBSITE_SETTINGS, sanitizeSafeUrl } from './lib/defaults.ts';
import {
  requestSignedDownloadLink,
  seedInitialDatabaseIfNeeded,
  subscribeEnabledPaymentSettings,
  subscribeOwnAdminPermissions,
  subscribePublishedApps,
  subscribeUserEntitlements,
  subscribeUserOrders,
  subscribeWebsiteSettings,
  syncUserProfileOnLogin,
} from './lib/db.ts';
import {
  isServerAuthActive,
  notifyServerDataChanged,
  serverLogout,
  setServerSessionToken,
  type ServerAuthSessionResponse,
} from './lib/serverSession.ts';
import { ToastProvider, useToast } from './components/ToastContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Header } from './components/Header.tsx';
import { HeroSection } from './components/HeroSection.tsx';
import { MarketplaceSection } from './components/MarketplaceSection.tsx';
import { AboutSupportSection } from './components/AboutSupportSection.tsx';
import { Footer } from './components/Footer.tsx';
import { PurchaseModal } from './components/PurchaseModal.tsx';
import { MyDownloadsPage } from './components/MyDownloadsPage.tsx';
import { AuthModal, type AuthModalMode } from './components/AuthModal.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { AdminPortalAuth } from './components/admin/AdminPortalAuth.tsx';

function getInitialViewFromPath(): AppView {
  if (typeof window === 'undefined') return 'storefront';
  const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  if (pathname === '/admin') return 'admin';
  if (pathname === '/downloads') return 'downloads';
  return 'storefront';
}

function CreatorStudioApp() {
  const { showToast } = useToast();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [unverifiedUser, setUnverifiedUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<AdminPermissionsMap>({ ...EMPTY_PERMISSIONS });
  const [authLoading, setAuthLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');

  const [savedSettings, setSavedSettings] = useState<WebsiteSettingsBundle>(
    DEFAULT_WEBSITE_SETTINGS
  );
  const [previewSettings, setPreviewSettings] = useState<WebsiteSettingsBundle | null>(null);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [dbInitialized, setDbInitialized] = useState(false);

  const [apps, setApps] = useState<AppListing[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSetting[]>([]);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [userEntitlements, setUserEntitlements] = useState<Entitlement[]>([]);

  const [activeView, setActiveView] = useState<AppView>(() => getInitialViewFromPath());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc' | 'newest'>(
    'featured'
  );

  const [purchaseApp, setPurchaseApp] = useState<AppListing | null>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [adminDownloadingAppId, setAdminDownloadingAppId] = useState<string | null>(null);

  const effectiveSettings = previewEnabled && previewSettings ? previewSettings : savedSettings;

  const navigateView = useCallback((view: AppView) => {
    setActiveView(view);
    if (typeof window !== 'undefined') {
      const targetPath = view === 'admin' ? '/admin' : view === 'downloads' ? '/downloads' : '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // Support browser back/forward navigation between /, /downloads, and /admin
  useEffect(() => {
    const handlePopState = () => {
      setActiveView(getInitialViewFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Apply dynamic theme CSS variables and document title from Firestore website_settings
  useEffect(() => {
    const { appearance, branding } = effectiveSettings;
    const root = document.documentElement;
    root.style.setProperty('--cs-bg', appearance.backgroundColor || '#0A0A0F');
    root.style.setProperty('--cs-card', appearance.cardColor || '#12131A');
    root.style.setProperty('--cs-cyan', appearance.cyanColor || '#00F3FF');
    root.style.setProperty('--cs-purple', appearance.purpleColor || '#BC13FE');
    root.style.setProperty('--cs-green', appearance.greenColor || '#39FF14');
    root.style.setProperty(
      '--cs-font-heading',
      `'${appearance.headingFont || 'Orbitron'}', sans-serif`
    );
    root.style.setProperty(
      '--cs-font-body',
      `'${appearance.bodyFont || 'Poppins'}', sans-serif`
    );

    if (branding.websiteName) {
      document.title =
        activeView === 'admin'
          ? `${branding.websiteName} — Admin Portal`
          : `${branding.websiteName} — Digital Software Marketplace`;
    }

    const safeFavicon = sanitizeSafeUrl(branding.faviconUrl);
    if (safeFavicon) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = safeFavicon;
    }
  }, [effectiveSettings, activeView]);

  // Public Firestore subscriptions (live DB single source of truth)
  useEffect(() => {
    const unsubSettings = subscribeWebsiteSettings((bundle, initialized) => {
      setSavedSettings(bundle);
      setDbInitialized(initialized);
      setSortBy(bundle.marketplace.defaultSort || 'featured');
    });

    const unsubApps = subscribePublishedApps((items) => {
      setApps(items);
      setAppsLoading(false);
    });

    const unsubPayments = subscribeEnabledPaymentSettings(setPaymentSettings);

    return () => {
      unsubSettings();
      unsubApps();
      unsubPayments();
    };
  }, []);

  const syncInFlightRef = useRef<{ uid: string; promise: Promise<UserProfile> } | null>(null);

  const bootstrapVerifiedUser = useCallback(
    async (firebaseUser: User): Promise<UserProfile> => {
      if (syncInFlightRef.current && syncInFlightRef.current.uid === firebaseUser.uid) {
        return syncInFlightRef.current.promise;
      }

      const syncPromise = (async () => {
        const profile = await syncUserProfileOnLogin(firebaseUser);
        setUserProfile(profile);
        setUnverifiedUser(null);

        if (
          profile.email.toLowerCase() === PERMANENT_SUPER_ADMIN_EMAIL &&
          profile.role === 'SUPER_ADMIN'
        ) {
          const seeded = await seedInitialDatabaseIfNeeded(profile.uid, profile.email, false);
          if (seeded.seeded) {
            showToast('Starter marketplace catalog initialized in Firestore.', 'success');
          }
        } else if (profile.role === 'ADMIN' && profile.acceptedInvitationId) {
          showToast('Admin invitation accepted and activated.', 'success');
        }
        return profile;
      })();

      syncInFlightRef.current = { uid: firebaseUser.uid, promise: syncPromise };
      try {
        return await syncPromise;
      } finally {
        if (syncInFlightRef.current?.promise === syncPromise) {
          syncInFlightRef.current = null;
        }
      }
    },
    [showToast]
  );

  const handleServerAuthSession = useCallback(
    async (session: ServerAuthSessionResponse) => {
      setServerSessionToken(session.token);
      const hydratedProfile: UserProfile = {
        ...session.profile,
        createdAt: new Date(session.profile.createdAt),
        lastLogin: new Date(session.profile.lastLogin),
      };
      setUserProfile(hydratedProfile);
      setPermissions(session.permissions);
      setUnverifiedUser(null);
      setAuthLoading(false);
      notifyServerDataChanged();

      if (
        hydratedProfile.email.toLowerCase() === PERMANENT_SUPER_ADMIN_EMAIL &&
        hydratedProfile.role === 'SUPER_ADMIN'
      ) {
        try {
          const seeded = await seedInitialDatabaseIfNeeded(
            hydratedProfile.uid,
            hydratedProfile.email,
            false
          );
          if (seeded.seeded) {
            showToast('Starter marketplace catalog initialized.', 'success');
          }
        } catch {
          // ignore if already initialized
        }
      }
    },
    [showToast]
  );

  // Auth state listener & Super Admin auto-bootstrap (Email/Password + verified @gmail.com only)
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        if (!isServerAuthActive()) {
          setUserProfile(null);
          setUnverifiedUser(null);
          setPermissions({ ...EMPTY_PERMISSIONS });
          setUserOrders([]);
          setUserEntitlements([]);
        }
        setAuthLoading(false);
        return;
      }

      const email = (firebaseUser.email || '').trim().toLowerCase();
      if (!isValidGmailAddress(email)) {
        await signOut(auth);
        setUserProfile(null);
        setUnverifiedUser(null);
        setPermissions({ ...EMPTY_PERMISSIONS });
        setUserOrders([]);
        setUserEntitlements([]);
        setAuthLoading(false);
        showToast('Only @gmail.com addresses are allowed in Creator Studio.', 'error');
        return;
      }

      if (!firebaseUser.emailVerified) {
        setUserProfile(null);
        setUnverifiedUser(firebaseUser);
        setPermissions({ ...EMPTY_PERMISSIONS });
        setUserOrders([]);
        setUserEntitlements([]);
        setAuthLoading(false);
        return;
      }

      try {
        await bootstrapVerifiedUser(firebaseUser);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Failed to synchronize account profile.',
          'error'
        );
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubAuth();
  }, [bootstrapVerifiedUser, showToast]);

  // User-scoped Firestore subscriptions (orders, entitlements, own admin permissions)
  useEffect(() => {
    if (!userProfile) return;
    const unsubOrders = subscribeUserOrders(userProfile.uid, setUserOrders);
    const unsubEntitlements = subscribeUserEntitlements(userProfile.uid, setUserEntitlements);
    const unsubPerms = subscribeOwnAdminPermissions(
      userProfile.uid,
      userProfile.role,
      setPermissions
    );

    return () => {
      unsubOrders();
      unsubEntitlements();
      unsubPerms();
    };
  }, [userProfile?.uid, userProfile?.role]);

  const openAuthModal = (mode: AuthModalMode = 'login') => {
    setAuthModalMode(unverifiedUser ? 'verify' : mode);
    setAuthModalOpen(true);
  };

  const handleVerifiedRefresh = async (): Promise<UserProfile | null> => {
    const current = auth.currentUser;
    if (!current) return null;
    await current.reload();
    const refreshed = auth.currentUser;
    if (refreshed && refreshed.emailVerified && isValidGmailAddress(refreshed.email || '')) {
      // Force refresh ID token so Firestore Security Rules immediately see email_verified == true
      await refreshed.getIdToken(true);
      return bootstrapVerifiedUser(refreshed);
    }
    return null;
  };

  const handleRouteAfterModalAuth = (profile: UserProfile) => {
    setAuthModalOpen(false);
    setAuthModalMode('login');
    const isAdminAccount =
      profile.status === 'ACTIVE' &&
      (profile.role === 'SUPER_ADMIN' || profile.role === 'ADMIN');

    if (isAdminAccount && !purchaseApp && activeView !== 'downloads') {
      navigateView('admin');
      return;
    }
    if (!isAdminAccount && activeView === 'admin') {
      navigateView('storefront');
    }
  };

  const handleAdminFreeDownload = async (app: AppListing) => {
    setAdminDownloadingAppId(app.id);
    try {
      const result = await requestSignedDownloadLink(app.id);
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
      setAdminDownloadingAppId(null);
    }
  };

  const handleSignOut = async () => {
    await Promise.allSettled([signOut(auth), serverLogout()]);
    setServerSessionToken(null);
    setUserProfile(null);
    setUnverifiedUser(null);
    setPermissions({ ...EMPTY_PERMISSIONS });
    setUserOrders([]);
    setUserEntitlements([]);
    setAuthModalOpen(false);
    setPreviewEnabled(false);
    setPreviewSettings(null);
    notifyServerDataChanged();
    if (activeView !== 'admin') {
      navigateView('storefront');
    }
    showToast('Logged out.', 'info');
  };

  const handleManualSeed = async () => {
    if (!userProfile || userProfile.role !== 'SUPER_ADMIN') return;
    setSeeding(true);
    try {
      const res = await seedInitialDatabaseIfNeeded(userProfile.uid, userProfile.email, true);
      if (res.seeded) {
        showToast('Initialized 6 starter apps, payment methods, and website settings.', 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to seed database.', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const isActiveAdmin =
    userProfile &&
    userProfile.status === 'ACTIVE' &&
    (userProfile.role === 'SUPER_ADMIN' || userProfile.role === 'ADMIN');

  // Completely separate Admin Panel Portal route (/admin)
  if (activeView === 'admin') {
    if (!isActiveAdmin || !userProfile) {
      return (
        <AdminPortalAuth
          userProfile={userProfile}
          unverifiedUser={unverifiedUser}
          authLoading={authLoading}
          onVerifiedRefresh={handleVerifiedRefresh}
          onSyncVerifiedUser={bootstrapVerifiedUser}
          onServerAuthSession={(session) => void handleServerAuthSession(session)}
          onBackToStorefront={() => navigateView('storefront')}
        />
      );
    }

    return (
      <div
        className="min-h-screen text-white"
        style={{
          backgroundColor: effectiveSettings.appearance.backgroundColor || '#0A0A0F',
          fontFamily: `'${effectiveSettings.appearance.bodyFont || 'Poppins'}', sans-serif`,
        }}
      >
        <AdminDashboard
          user={userProfile}
          permissions={permissions}
          savedSettings={savedSettings}
          previewEnabled={previewEnabled}
          onTogglePreview={setPreviewEnabled}
          onDraftChange={setPreviewSettings}
          onBackToStorefront={() => navigateView('storefront')}
          onSignOut={() => void handleSignOut()}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-white"
      style={{
        backgroundColor: effectiveSettings.appearance.backgroundColor || '#0A0A0F',
        fontFamily: `'${effectiveSettings.appearance.bodyFont || 'Poppins'}', sans-serif`,
      }}
    >
      <Header
        settings={effectiveSettings}
        user={userProfile}
        authLoading={authLoading}
        activeView={activeView}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNavigateView={navigateView}
        onSelectCategory={(cat) => setSelectedCategory(cat)}
        onSignIn={() => openAuthModal('login')}
        onSignOut={() => void handleSignOut()}
      />

      {unverifiedUser && !userProfile && (
        <div className="border-b border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-200">
          Email verification pending for{' '}
          <strong className="text-white">{unverifiedUser.email}</strong>.{' '}
          <button
            type="button"
            onClick={() => openAuthModal('verify')}
            className="ml-2 font-semibold text-[#00F3FF] underline hover:text-white"
          >
            Verify Gmail to Unlock Account
          </button>
        </div>
      )}

      {previewEnabled && (
        <div className="border-b border-[#BC13FE]/40 bg-[#BC13FE]/20 px-4 py-2 text-center text-xs font-medium text-white">
          Website Editor Live Preview Mode — Changes are not published until you click Save Changes.{' '}
          <button
            type="button"
            onClick={() => navigateView('admin')}
            className="ml-2 font-semibold text-[#00F3FF] underline"
          >
            Return to Website Editor
          </button>
        </div>
      )}

      {activeView === 'downloads' ? (
        <>
          <MyDownloadsPage
            user={userProfile}
            orders={userOrders}
            entitlements={userEntitlements}
            apps={apps}
            settings={effectiveSettings}
            onSignIn={() => openAuthModal('login')}
            onBackToStore={() => navigateView('storefront')}
          />
          <Footer
            settings={effectiveSettings}
            onNavigateView={navigateView}
            onOpenLegal={setLegalModal}
          />
        </>
      ) : (
        <>
          <HeroSection
            settings={effectiveSettings}
            onExploreApps={() => {
              document.querySelector('#marketplace')?.scrollIntoView({ behavior: 'smooth' });
            }}
            onBrowseCategories={() => {
              document.querySelector('#categories')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          <MarketplaceSection
            apps={apps}
            loading={appsLoading}
            dbInitialized={dbInitialized}
            settings={effectiveSettings}
            user={userProfile}
            orders={userOrders}
            entitlements={userEntitlements}
            searchQuery={searchQuery}
            selectedCategory={selectedCategory}
            sortBy={sortBy}
            onSearchChange={setSearchQuery}
            onCategoryChange={setSelectedCategory}
            onSortChange={setSortBy}
            onPurchaseClick={(app) => setPurchaseApp(app)}
            onDownloadClick={() => navigateView('downloads')}
            onAdminFreeDownload={(app) => void handleAdminFreeDownload(app)}
            downloadingAppId={adminDownloadingAppId}
            onSignInForSetup={() => navigateView('admin')}
            onSeedDatabaseNow={() => void handleManualSeed()}
            seeding={seeding}
          />

          <AboutSupportSection
            settings={effectiveSettings}
            legalModal={legalModal}
            onCloseLegalModal={() => setLegalModal(null)}
          />

          <Footer
            settings={effectiveSettings}
            onNavigateView={navigateView}
            onOpenLegal={setLegalModal}
          />
        </>
      )}

      <PurchaseModal
        app={purchaseApp}
        user={userProfile}
        paymentSettings={paymentSettings}
        currencyLabel={effectiveSettings.marketplace.currencyLabel || 'Rs.'}
        onClose={() => setPurchaseApp(null)}
        onSignIn={() => openAuthModal('login')}
        onGoToDownloads={() => navigateView('downloads')}
      />

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        unverifiedUser={unverifiedUser}
        onClose={() => setAuthModalOpen(false)}
        onVerifiedRefresh={handleVerifiedRefresh}
        onSyncVerifiedUser={bootstrapVerifiedUser}
        onServerAuthSession={(session) => void handleServerAuthSession(session)}
        onRouteAfterAuth={handleRouteAfterModalAuth}
        onSwitchAccountReset={() => setAuthModalMode('login')}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <CreatorStudioApp />
      </ToastProvider>
    </ErrorBoundary>
  );
}
