import React from 'react';
import { MessageCircle } from 'lucide-react';
import { AppView, WebsiteSettingsBundle } from '../types/index.ts';
import { sanitizeSafeUrl } from '../lib/defaults.ts';
import { CreatorStudioMark } from './BrandLogo.tsx';

interface FooterProps {
  settings: WebsiteSettingsBundle;
  onNavigateView: (view: AppView) => void;
  onOpenLegal: (type: 'privacy' | 'terms') => void;
}

export function Footer({ settings, onNavigateView, onOpenLegal }: FooterProps) {
  const { branding, footer, support } = settings;
  const whatsappUrl = sanitizeSafeUrl(support.whatsappLink);
  const githubUrl = sanitizeSafeUrl(footer.githubUrl);
  const youtubeUrl = sanitizeSafeUrl(footer.youtubeUrl);
  const discordUrl = sanitizeSafeUrl(footer.discordUrl);

  const scrollToSection = (selector: string) => {
    onNavigateView('storefront');
    setTimeout(() => {
      if (selector === '#top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
      }
    }, 60);
  };

  return (
    <>
      <footer className="border-t border-white/10 bg-[#0A0A0F]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3">
                <CreatorStudioMark customLogoUrl={branding.customLogoUrl} />
                <span className="font-display text-lg font-bold text-white">
                  {branding.websiteName || 'Creator Studio'}
                </span>
              </div>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[#9BA3B8]">
                {footer.description}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#9BA3B8]">
                {githubUrl && (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#00F3FF]"
                  >
                    GitHub
                  </a>
                )}
                {youtubeUrl && (
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#00F3FF]"
                  >
                    YouTube
                  </a>
                )}
                {discordUrl && (
                  <a
                    href={discordUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#00F3FF]"
                  >
                    Discord
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
              <div>
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                  Marketplace
                </h4>
                <ul className="mt-3 space-y-2.5 text-sm text-[#9BA3B8]">
                  <li>
                    <button
                      type="button"
                      onClick={() => scrollToSection('#top')}
                      className="hover:text-[#00F3FF]"
                    >
                      Home
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => scrollToSection('#marketplace')}
                      className="hover:text-[#00F3FF]"
                    >
                      Apps
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigateView('downloads')}
                      className="hover:text-[#00F3FF]"
                    >
                      My Downloads
                    </button>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                  Company
                </h4>
                <ul className="mt-3 space-y-2.5 text-sm text-[#9BA3B8]">
                  <li>
                    <button
                      type="button"
                      onClick={() => scrollToSection('#about')}
                      className="hover:text-[#00F3FF]"
                    >
                      About
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => scrollToSection('#support')}
                      className="hover:text-[#00F3FF]"
                    >
                      Contact
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => scrollToSection('#support')}
                      className="hover:text-[#00F3FF]"
                    >
                      Support
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigateView('admin')}
                      className="text-[#BC13FE] hover:text-white"
                    >
                      Admin Panel
                    </button>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                  Legal & Help
                </h4>
                <ul className="mt-3 space-y-2.5 text-sm text-[#9BA3B8]">
                  <li>
                    <button
                      type="button"
                      onClick={() => onOpenLegal('privacy')}
                      className="hover:text-[#00F3FF]"
                    >
                      Privacy Policy
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onOpenLegal('terms')}
                      className="hover:text-[#00F3FF]"
                    >
                      Terms & Conditions
                    </button>
                  </li>
                  {whatsappUrl && (
                    <li>
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#39FF14] hover:underline"
                      >
                        WhatsApp Support
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-xs text-[#9BA3B8] sm:flex-row sm:items-center">
            <p>{footer.copyright}</p>
            <p>{support.supportEmail}</p>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Support Button */}
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contact WhatsApp Support"
          className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full border border-[#39FF14]/50 bg-[#12131A]/95 px-4 py-2.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md hover:border-[#39FF14] hover:bg-[#162119] transition-colors"
        >
          <MessageCircle className="h-4 w-4 text-[#39FF14]" />
          <span className="hidden sm:inline">WhatsApp Support</span>
        </a>
      )}
    </>
  );
}
