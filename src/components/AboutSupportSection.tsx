import React, { useState } from 'react';
import { Mail, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { WebsiteSettingsBundle } from '../types/index.ts';
import { WORKSPACE_BANNER_IMAGE, sanitizeSafeUrl } from '../lib/defaults.ts';

export function AboutSupportSection({
  settings,
  legalModal,
  onCloseLegalModal,
}: {
  settings: WebsiteSettingsBundle;
  legalModal: 'privacy' | 'terms' | null;
  onCloseLegalModal: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const { content, support } = settings;
  const aboutImg = sanitizeSafeUrl(content.aboutBannerImage) || WORKSPACE_BANNER_IMAGE;
  const whatsappUrl = sanitizeSafeUrl(support.whatsappLink);

  return (
    <>
      {/* About & Support Split */}
      <section
        id="about"
        className="border-t border-white/10 bg-[#0D0E14] py-16"
      >
        <div className="mx-auto grid max-w-7xl items-stretch gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#12131A] lg:col-span-6">
            {!imgFailed && aboutImg ? (
              <img
                src={aboutImg}
                alt="Creator Studio engineering workstation"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="h-full min-h-[260px] w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[260px] items-center justify-center bg-[#12131A] p-8 text-[#9BA3B8]">
                Creator Studio Workspace
              </div>
            )}
          </div>

          <div
            id="support"
            className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#12131A] p-8 lg:col-span-6"
          >
            <div>
              <h2 className="font-display text-2xl font-bold text-white">
                {content.aboutHeading}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#9BA3B8]">
                {content.aboutDescription}
              </p>

              <div className="mt-6 border-t border-white/10 pt-6">
                <h3 className="font-display text-base font-bold text-white">
                  Direct Support & Payment Verification Desk
                </h3>
                <p className="mt-2 text-sm text-[#9BA3B8]">
                  {support.contactMessage}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2.5 text-xs font-semibold text-[#0A0A0F] hover:bg-[#5BFF3B] transition-colors whitespace-nowrap"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp ({support.whatsappNumber})
                </a>
              )}

              {support.supportEmail && (
                <a
                  href={`mailto:${support.supportEmail}`}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold text-white hover:border-[#00F3FF]/50 transition-colors whitespace-nowrap"
                >
                  <Mail className="h-4 w-4 text-[#00F3FF]" />
                  {support.supportEmail}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Policy / Terms Modal */}
      {legalModal && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#12131A] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#00F3FF]" />
                <h3 className="font-display text-lg font-bold text-white">
                  {legalModal === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseLegalModal}
                className="rounded-lg p-1.5 text-[#9BA3B8] hover:bg-white/10 hover:text-white"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto text-sm leading-relaxed text-[#9BA3B8] whitespace-pre-line">
              {legalModal === 'privacy' ? content.privacyPolicy : content.termsConditions}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onCloseLegalModal}
                className="rounded-lg bg-[#00F3FF] px-5 py-2 text-xs font-semibold text-[#0A0A0F]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
