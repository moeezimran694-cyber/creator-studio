import React from 'react';
import {
  ArrowUpDown,
  Check,
  Clock,
  Download,
  Search,
  ShoppingBag,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  AppListing,
  Entitlement,
  Order,
  PERMANENT_SUPER_ADMIN_EMAIL,
  UserProfile,
  WebsiteSettingsBundle,
} from '../types/index.ts';
import { AppIconRenderer } from './BrandLogo.tsx';

interface MarketplaceSectionProps {
  apps: AppListing[];
  loading: boolean;
  dbInitialized: boolean;
  settings: WebsiteSettingsBundle;
  user: UserProfile | null;
  orders: Order[];
  entitlements: Entitlement[];
  searchQuery: string;
  selectedCategory: string;
  sortBy: 'featured' | 'price_asc' | 'price_desc' | 'newest';
  onSearchChange: (q: string) => void;
  onCategoryChange: (cat: string) => void;
  onSortChange: (sort: 'featured' | 'price_asc' | 'price_desc' | 'newest') => void;
  onPurchaseClick: (app: AppListing) => void;
  onDownloadClick: (app: AppListing) => void;
  onAdminFreeDownload?: (app: AppListing) => void;
  downloadingAppId?: string | null;
  onSignInForSetup: () => void;
  onSeedDatabaseNow?: () => void;
  seeding?: boolean;
}

export function MarketplaceSection({
  apps,
  loading,
  dbInitialized,
  settings,
  user,
  orders,
  entitlements,
  searchQuery,
  selectedCategory,
  sortBy,
  onSearchChange,
  onCategoryChange,
  onSortChange,
  onPurchaseClick,
  onDownloadClick,
  onAdminFreeDownload,
  downloadingAppId,
  onSignInForSetup,
  onSeedDatabaseNow,
  seeding,
}: MarketplaceSectionProps) {
  const isActiveAdmin = Boolean(
    user &&
      user.status === 'ACTIVE' &&
      (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN')
  );
  const categories = ['All', ...settings.marketplace.categories];
  const currency = settings.marketplace.currencyLabel || 'Rs.';

  const filteredApps = apps
    .filter((app) => {
      const matchesCat =
        selectedCategory === 'All' ||
        app.category.toLowerCase() === selectedCategory.toLowerCase();
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        app.name.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.category.toLowerCase().includes(q) ||
        app.features.some((f) => f.toLowerCase().includes(q));
      return matchesCat && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'price_asc') return a.pricePkr - b.pricePkr;
      if (sortBy === 'price_desc') return b.pricePkr - a.pricePkr;
      if (sortBy === 'newest') return b.createdAt.getTime() - a.createdAt.getTime();
      // featured first
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const getAppUserState = (appId: string) => {
    const hasEntitlement = entitlements.some((e) => e.appId === appId);
    if (hasEntitlement) return { status: 'APPROVED' as const };
    const latestOrder = orders.find((o) => o.appId === appId);
    if (latestOrder) return { status: latestOrder.status, order: latestOrder };
    return { status: 'NONE' as const };
  };

  const gridClass =
    settings.appearance.gridColumns === 4
      ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  return (
    <section id="marketplace" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      {/* Section Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
            Software & App Marketplace
          </h2>
          <p className="mt-1.5 text-sm text-[#9BA3B8]">
            {settings.content.promoMessage}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter catalog..."
              aria-label="Filter software catalog"
              className="w-full rounded-lg border border-white/10 bg-[#12131A] py-2 pl-9 pr-3 text-sm text-white placeholder-[#9BA3B8] focus:border-[#00F3FF]/60 focus:outline-none"
            />
          </div>

          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9BA3B8]" />
            <select
              value={sortBy}
              onChange={(e) =>
                onSortChange(
                  e.target.value as 'featured' | 'price_asc' | 'price_desc' | 'newest'
                )
              }
              aria-label="Sort apps"
              className="appearance-none rounded-lg border border-white/10 bg-[#12131A] py-2 pl-8 pr-8 text-sm text-white focus:border-[#00F3FF]/60 focus:outline-none"
            >
              <option value="featured">Featured First</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="newest">Newest Added</option>
            </select>
          </div>
        </div>
      </div>

      {/* Category Filter Buttons */}
      <div
        id="categories"
        role="tablist"
        aria-label="App categories"
        className="mt-6 flex flex-wrap items-center gap-2 border-b border-white/10 pb-5"
      >
        {categories.map((cat) => {
          const active = selectedCategory.toLowerCase() === cat.toLowerCase();
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onCategoryChange(cat)}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#00F3FF] text-[#0A0A0F]'
                  : 'border border-white/10 bg-[#12131A] text-[#9BA3B8] hover:border-white/25 hover:text-white'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className={`mt-8 grid gap-6 ${gridClass}`}>
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className="h-80 animate-pulse rounded-2xl border border-white/10 bg-[#12131A] p-6"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-white/10" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-2/3 rounded bg-white/10" />
                  <div className="h-3 w-1/2 rounded bg-white/5" />
                </div>
              </div>
              <div className="mt-6 space-y-2.5">
                <div className="h-3 w-full rounded bg-white/5" />
                <div className="h-3 w-5/6 rounded bg-white/5" />
                <div className="h-3 w-3/4 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unseeded database state (honest DB truth) */}
      {!loading && apps.length === 0 && !searchQuery && selectedCategory === 'All' && (
        <div className="mt-10 rounded-2xl border border-[#00F3FF]/25 bg-[#12131A] p-8 text-center">
          <h3 className="font-display text-xl font-bold text-white">
            {dbInitialized ? 'No Published Apps Yet' : 'Marketplace Database Ready for Initialization'}
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#9BA3B8]">
            Creator Studio renders directly from your live Firestore database.{' '}
            {user?.role === 'SUPER_ADMIN'
              ? 'Click below to seed the 6 starter applications, EasyPaisa/JazzCash payment templates, and customizable storefront settings into Firestore.'
              : `Log in with the permanent Super Admin account (${PERMANENT_SUPER_ADMIN_EMAIL}) to initialize the starter catalog or add your own apps.`}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {user?.role === 'SUPER_ADMIN' && onSeedDatabaseNow ? (
              <button
                type="button"
                disabled={seeding}
                onClick={onSeedDatabaseNow}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#00F3FF] px-6 py-2.5 text-sm font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {seeding ? 'Initializing Database...' : 'Initialize 6 Starter Apps & Defaults'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignInForSetup}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#00F3FF] px-6 py-2.5 text-sm font-semibold text-[#0A0A0F] hover:bg-[#33F6FF]"
              >
                Login as Super Admin
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty Search / Filter State */}
      {!loading && apps.length > 0 && filteredApps.length === 0 && (
        <div className="mt-10 rounded-2xl border border-white/10 bg-[#12131A] p-10 text-center">
          <p className="font-display text-lg font-bold text-white">No Matching Software Found</p>
          <p className="mt-2 text-sm text-[#9BA3B8]">
            Try clearing your search filter or switching to All categories.
          </p>
          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              onCategoryChange('All');
            }}
            className="mt-5 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:border-[#00F3FF]/50"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* App Cards Grid */}
      {!loading && filteredApps.length > 0 && (
        <div className={`mt-8 grid gap-6 ${gridClass}`}>
          {filteredApps.map((app) => {
            const state = getAppUserState(app.id);
            return (
              <article
                key={app.id}
                className="cs-glass-card cs-cyan-border-hover flex flex-col justify-between rounded-2xl p-6 transition-all duration-200"
              >
                <div>
                  {/* Card Header: Icon + Name + Unboxed Metadata */}
                  <div className="flex items-start gap-4">
                    <AppIconRenderer
                      name={app.name}
                      iconUrl={app.iconUrl}
                      iconKey={app.iconKey}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate font-display text-base font-bold text-white">
                          {app.name}
                        </h3>
                        {settings.marketplace.showFeaturedRibbon && app.isFeatured && (
                          <span className="shrink-0 text-[11px] font-semibold text-[#BC13FE]">
                            Featured
                          </span>
                        )}
                      </div>

                      {/* Clean unboxed metadata with typographic separators */}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#9BA3B8]">
                        <span>{app.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{app.version}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{app.fileSize}</span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-[#9BA3B8]">
                    {app.description}
                  </p>

                  {/* Features list */}
                  {app.features.length > 0 && (
                    <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-4">
                      {app.features.slice(0, 4).map((feat, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-white/85"
                        >
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00F3FF]" />
                          <span className="leading-snug">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Card Footer: Price + Action + Status */}
                <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
                  <div>
                    {isActiveAdmin ? (
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono-tabular text-lg font-bold text-[#39FF14]">
                          FREE
                        </span>
                        {settings.marketplace.showPriceBadge && app.pricePkr > 0 && (
                          <span className="font-mono-tabular text-xs text-[#9BA3B8] line-through">
                            {currency} {app.pricePkr.toLocaleString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      settings.marketplace.showPriceBadge && (
                        <div className="font-mono-tabular text-lg font-bold text-white">
                          {currency} {app.pricePkr.toLocaleString()}
                        </div>
                      )
                    )}
                    <div className="mt-0.5 text-[11px] font-medium">
                      {isActiveAdmin ? (
                        <span className="inline-flex items-center gap-1 text-[#39FF14]">
                          <Check className="h-3 w-3" />
                          Admin Free Access
                        </span>
                      ) : state.status === 'APPROVED' ? (
                        <span className="inline-flex items-center gap-1 text-[#39FF14]">
                          <Check className="h-3 w-3" />
                          Download Ready
                        </span>
                      ) : state.status === 'PENDING' ? (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <Clock className="h-3 w-3" />
                          Verification Pending
                        </span>
                      ) : state.status === 'REJECTED' ? (
                        <span className="inline-flex items-center gap-1 text-red-400">
                          <XCircle className="h-3 w-3" />
                          Payment Rejected
                        </span>
                      ) : (
                        <span className="text-[#9BA3B8]">Instant Portal Access</span>
                      )}
                    </div>
                  </div>

                  {isActiveAdmin ? (
                    <button
                      type="button"
                      disabled={downloadingAppId === app.id}
                      onClick={() =>
                        onAdminFreeDownload ? onAdminFreeDownload(app) : onDownloadClick(app)
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#39FF14] px-4 py-2 text-xs font-bold text-[#0A0A0F] hover:bg-[#5BFF3B] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {downloadingAppId === app.id ? 'Starting...' : 'Download Free'}
                    </button>
                  ) : state.status === 'APPROVED' ? (
                    <button
                      type="button"
                      onClick={() => onDownloadClick(app)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#39FF14] px-4 py-2 text-xs font-semibold text-[#0A0A0F] hover:bg-[#5BFF3B] transition-colors whitespace-nowrap shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                  ) : state.status === 'PENDING' ? (
                    <button
                      type="button"
                      onClick={() => onDownloadClick(app)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      View Status
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPurchaseClick(app)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#00F3FF] px-4 py-2 text-xs font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] transition-colors whitespace-nowrap shrink-0"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" />
                      {state.status === 'REJECTED' ? 'Retry Purchase' : 'Buy & Unlock'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
