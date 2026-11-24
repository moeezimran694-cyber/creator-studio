import React, { useState } from 'react';
import { ArrowDownRight, Layers } from 'lucide-react';
import { WebsiteSettingsBundle } from '../types/index.ts';
import { HERO_BACKDROP_IMAGE, sanitizeSafeUrl } from '../lib/defaults.ts';

interface HeroSectionProps {
  settings: WebsiteSettingsBundle;
  onExploreApps: () => void;
  onBrowseCategories: () => void;
}

export function HeroSection({
  settings,
  onExploreApps,
  onBrowseCategories,
}: HeroSectionProps) {
  const [bgError, setBgError] = useState(false);
  const [bannerError, setBannerError] = useState(false);

  const { hero, content } = settings;
  if (!hero.isVisible) {
    return null;
  }

  const bgSrc = sanitizeSafeUrl(hero.backgroundImage) || HERO_BACKDROP_IMAGE;
  const bannerSrc = sanitizeSafeUrl(hero.bannerImage);

  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-[#0A0A0F]">
      {/* Announcement strip when enabled */}
      {content.announcementEnabled && content.announcementText && (
        <div className="border-b border-[#00F3FF]/20 bg-[#12131A]/90 px-4 py-2 text-center text-xs font-medium text-[#9BA3B8]">
          <span className="text-[#00F3FF] font-semibold mr-2">Notice:</span>
          {content.announcementText}
        </div>
      )}

      {/* Hero Backdrop with measured contrast scrim */}
      <div className="relative">
        {!bgError && bgSrc && (
          <img
            src={bgSrc}
            alt="Creator Studio digital software environment"
            referrerPolicy="no-referrer"
            onError={() => setBgError(true)}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45"
          />
        )}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0A0A0F] via-[#0A0A0F]/85 to-[#0A0A0F]/55"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0A0A0F] via-transparent to-[#0A0A0F]/60"
          aria-hidden="true"
        />

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-7">
            <h1
              className="font-display font-bold leading-[1.12] text-white"
              style={{
                fontSize: 'clamp(2.15rem, 4vw, 3.6rem)',
                textWrap: 'balance',
              }}
            >
              {hero.headline}
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#9BA3B8] sm:text-lg">
              {hero.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  if (hero.primaryButtonLink && hero.primaryButtonLink.startsWith('#')) {
                    const el = document.querySelector(hero.primaryButtonLink);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth' });
                      return;
                    }
                  }
                  onExploreApps();
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#00F3FF] px-6 py-3 text-sm font-semibold text-[#0A0A0F] shadow-[0_0_24px_rgba(0,243,255,0.3)] hover:bg-[#33F6FF] transition-colors whitespace-nowrap shrink-0"
              >
                {hero.primaryButtonText || 'Explore Apps'}
                <ArrowDownRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (hero.secondaryButtonLink && hero.secondaryButtonLink.startsWith('#')) {
                    const el = document.querySelector(hero.secondaryButtonLink);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth' });
                      return;
                    }
                  }
                  onBrowseCategories();
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/20 bg-[#12131A]/80 px-6 py-3 text-sm font-semibold text-white hover:border-[#00F3FF]/60 hover:bg-[#12131A] transition-colors whitespace-nowrap shrink-0"
              >
                <Layers className="h-4 w-4 text-[#BC13FE]" />
                {hero.secondaryButtonText || 'Browse Categories'}
              </button>
            </div>
          </div>

          {/* Showcase frame */}
          <div className="lg:col-span-5">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#12131A]/90 shadow-2xl">
              {bannerSrc && !bannerError ? (
                <img
                  src={bannerSrc}
                  alt="Creator Studio featured software suite"
                  referrerPolicy="no-referrer"
                  onError={() => setBannerError(true)}
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-[#12131A] via-[#0A0A0F] to-[#1A1326] p-8">
                  <span className="font-display text-xl font-bold text-[#00F3FF]">
                    Creator Studio
                  </span>
                </div>
              )}
              <div className="border-t border-white/10 px-5 py-4">
                <p className="text-xs font-medium text-[#9BA3B8]">
                  EasyPaisa & JazzCash Local Checkout · Protected Download Delivery
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
