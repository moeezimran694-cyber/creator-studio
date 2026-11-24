import React, { useState } from 'react';
import {
  Download,
  LogIn,
  LogOut,
  Menu,
  Search,
  Shield,
  X,
} from 'lucide-react';
import {
  AppView,
  NavLinkItem,
  UserProfile,
  WebsiteSettingsBundle,
} from '../types/index.ts';
import { sanitizeSafeUrl } from '../lib/defaults.ts';
import { CreatorStudioMark } from './BrandLogo.tsx';

interface HeaderProps {
  settings: WebsiteSettingsBundle;
  user: UserProfile | null;
  authLoading: boolean;
  activeView: AppView;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onNavigateView: (view: AppView) => void;
  onSelectCategory: (cat: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function Header({
  settings,
  user,
  authLoading,
  activeView,
  searchQuery,
  onSearchChange,
  onNavigateView,
  onSelectCategory,
  onSignIn,
  onSignOut,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdminUser =
    user &&
    user.status === 'ACTIVE' &&
    (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN');

  const handleNavClick = (link: NavLinkItem) => {
    setMobileMenuOpen(false);
    if (link.target === 'view:downloads') {
      onNavigateView('downloads');
      return;
    }
    if (link.target === 'view:admin') {
      onNavigateView('admin');
      return;
    }
    if (link.target.startsWith('#')) {
      if (activeView !== 'storefront') {
        onNavigateView('storefront');
        setTimeout(() => {
          const el = document.querySelector(link.target);
          el?.scrollIntoView({ behavior: 'smooth' });
        }, 80);
      } else if (link.target === '#top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const el = document.querySelector(link.target);
        el?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    const safe = sanitizeSafeUrl(link.target);
    if (safe) {
      window.open(safe, '_blank', 'noopener,noreferrer');
    }
  };

  const navLinks = settings.navigation.links.slice(0, 5);

  return (
    <header
      id="top"
      className="sticky top-0 z-50 border-b border-white/10 bg-[#0A0A0F]/90 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Logo */}
        <button
          type="button"
          onClick={() => {
            onNavigateView('storefront');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex shrink-0 items-center gap-3 text-left focus-visible:outline-none"
        >
          <CreatorStudioMark customLogoUrl={settings.branding.customLogoUrl} />
          <span className="font-display text-lg font-bold tracking-wide text-white whitespace-nowrap">
            {settings.branding.logoText || settings.branding.websiteName || 'Creator Studio'}
          </span>
        </button>

        {/* Zone 2: Nav Links + Compact Search (Desktop) */}
        <div className="hidden lg:flex items-center gap-6 flex-1 justify-center">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                if (activeView !== 'storefront') {
                  onNavigateView('storefront');
                }
              }}
              placeholder="Search apps & tools..."
              aria-label="Search apps"
              className="w-full rounded-lg border border-white/10 bg-[#12131A] py-1.5 pl-9 pr-3 text-sm text-white placeholder-[#9BA3B8] focus:border-[#00F3FF]/60 focus:outline-none"
            />
          </div>

          <nav aria-label="Primary navigation" className="flex items-center gap-5">
            {navLinks.map((link) => {
              const isDownloadsActive =
                activeView === 'downloads' && link.target === 'view:downloads';
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => handleNavClick(link)}
                  className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isDownloadsActive
                      ? 'text-[#00F3FF]'
                      : 'text-[#9BA3B8] hover:text-white'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Zone 3: Primary Action / Auth */}
        <div className="hidden lg:flex items-center gap-2.5 shrink-0">
          {isAdminUser ? (
            <button
              type="button"
              onClick={() => onNavigateView(activeView === 'admin' ? 'storefront' : 'admin')}
              className="inline-flex items-center gap-2 rounded-lg border border-[#BC13FE]/50 bg-[#BC13FE]/15 px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#BC13FE]/25 transition-colors whitespace-nowrap shrink-0"
            >
              <Shield className="h-3.5 w-3.5 text-[#BC13FE]" />
              {activeView === 'admin' ? 'View Storefront' : 'Admin Panel'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onNavigateView('downloads')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'downloads'
                    ? 'border-[#00F3FF]/60 bg-[#00F3FF]/15 text-[#00F3FF]'
                    : 'border-white/15 bg-white/5 text-white hover:border-white/30'
                }`}
              >
                <Download className="h-3.5 w-3.5" />
                My Downloads
              </button>
              <button
                type="button"
                onClick={() => onNavigateView('admin')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#BC13FE]/40 bg-[#BC13FE]/10 px-3 py-2 text-xs font-semibold text-white hover:border-[#BC13FE] hover:bg-[#BC13FE]/20 transition-colors whitespace-nowrap shrink-0"
              >
                <Shield className="h-3.5 w-3.5 text-[#BC13FE]" />
                Admin Login
              </button>
            </>
          )}

          {user ? (
            <div className="flex items-center gap-2">
              <span
                className="max-w-[130px] truncate text-xs text-[#9BA3B8]"
                title={user.email}
              >
                {user.displayName}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                title="Logout"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-[#9BA3B8] hover:text-white hover:border-white/30 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={authLoading}
              onClick={onSignIn}
              className="inline-flex items-center gap-2 rounded-lg bg-[#00F3FF] px-4 py-2 text-xs font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <LogIn className="h-3.5 w-3.5" />
              {authLoading ? 'Loading...' : 'Customer Login'}
            </button>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-[#12131A] text-white lg:hidden"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-white/10 bg-[#0A0A0F] px-4 pb-5 pt-4 lg:hidden">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                if (activeView !== 'storefront') {
                  onNavigateView('storefront');
                }
              }}
              placeholder="Search apps & tools..."
              className="w-full rounded-lg border border-white/15 bg-[#12131A] py-2.5 pl-9 pr-3 text-sm text-white placeholder-[#9BA3B8]"
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {['All', ...settings.marketplace.categories].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  onSelectCategory(cat);
                  onNavigateView('storefront');
                  setMobileMenuOpen(false);
                }}
                className="rounded-lg border border-white/10 bg-[#12131A] px-3 py-1.5 text-xs font-medium text-[#9BA3B8] hover:border-[#00F3FF]/50 hover:text-white"
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1 border-t border-white/10 pt-3">
            {navLinks.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => handleNavClick(link)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm font-medium text-white hover:bg-white/5"
              >
                {link.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onNavigateView('admin');
                setMobileMenuOpen(false);
              }}
              className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[#BC13FE] hover:bg-[#BC13FE]/10"
            >
              <Shield className="h-4 w-4" />
              {isAdminUser ? 'Admin Panel' : 'Admin Login (Separate Portal)'}
            </button>
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            {user ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
                  <p className="truncate text-xs text-[#9BA3B8]">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={authLoading}
                onClick={() => {
                  onSignIn();
                  setMobileMenuOpen(false);
                }}
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#00F3FF] px-4 py-2.5 text-sm font-semibold text-[#0A0A0F]"
              >
                <LogIn className="h-4 w-4" />
                Login with Gmail & Password
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
