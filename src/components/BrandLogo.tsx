import React, { useState } from 'react';
import { Package } from 'lucide-react';
import { sanitizeSafeUrl } from '../lib/defaults.ts';

export function CreatorStudioMark({ customLogoUrl }: { customLogoUrl?: string }) {
  const [imgError, setImgError] = useState(false);
  const safeCustom = sanitizeSafeUrl(customLogoUrl);

  if (safeCustom && !imgError) {
    return (
      <img
        src={safeCustom}
        alt="Creator Studio"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="h-9 w-9 rounded-lg object-cover border border-[#00F3FF]/40"
      />
    );
  }

  return (
    <div
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#00F3FF]/45 bg-[#12131A]"
      style={{ boxShadow: '0 0 14px rgba(0, 243, 255, 0.25)' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 36 36" className="h-7 w-7" fill="none">
        <rect
          x="2"
          y="2"
          width="32"
          height="32"
          rx="7"
          stroke="url(#csLogoGrad)"
          strokeWidth="1.5"
          fill="#0A0A0F"
        />
        {/* CS monogram stylized */}
        <path
          d="M14.5 12.2C13.6 11.4 12.4 11 11 11C8.2 11 6.5 13 6.5 16C6.5 19 8.2 21 11 21C12.5 21 13.7 20.5 14.5 19.7"
          stroke="#00F3FF"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M22.5 12.4C21.8 11.4 20.5 11 19.2 11C17.4 11 16.3 12 16.3 13.4C16.3 15 17.7 15.5 19.5 16C21.3 16.5 22.7 17.1 22.7 18.7C22.7 20.2 21.4 21 19.3 21C17.8 21 16.5 20.4 15.8 19.4"
          stroke="#FFFFFF"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        {/* Download / Play arrow accent */}
        <path d="M26 13.5L30.5 16L26 18.5V13.5Z" fill="#00F3FF" />
        <path
          d="M18 24.2V28M18 28L15.6 25.8M18 28L20.4 25.8"
          stroke="#BC13FE"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="csLogoGrad" x1="2" y1="2" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00F3FF" />
            <stop offset="1" stopColor="#BC13FE" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export function AppIconRenderer({
  name,
  iconUrl,
  iconKey,
  size = 'md',
}: {
  name: string;
  iconUrl?: string;
  iconKey?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const safeUrl = sanitizeSafeUrl(iconUrl);
  const dim = size === 'sm' ? 'h-10 w-10' : size === 'lg' ? 'h-14 w-14' : 'h-12 w-12';
  const svgDim = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-8 w-8' : 'h-7 w-7';

  if (safeUrl && !failed) {
    return (
      <img
        src={safeUrl}
        alt={`${name} icon`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${dim} shrink-0 rounded-xl border border-white/10 bg-[#0A0A0F] object-cover`}
      />
    );
  }

  const key = (iconKey || '').toLowerCase();

  if (key === 'youtube') {
    return (
      <div className={`${dim} flex shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-[#1B0D12]`}>
        <svg viewBox="0 0 32 32" className={svgDim} fill="none">
          <rect x="3" y="7" width="26" height="18" rx="5" fill="#FF1E3C" />
          <path d="M13.5 12L21 16L13.5 20V12Z" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }

  if (key === 'moviebox') {
    return (
      <div className={`${dim} flex shrink-0 items-center justify-center rounded-xl border border-[#00F3FF]/30 bg-[#0C1821]`}>
        <svg viewBox="0 0 32 32" className={svgDim} fill="none">
          <rect x="4" y="5" width="24" height="22" rx="4" stroke="#00F3FF" strokeWidth="2" />
          <path d="M4 11H28" stroke="#00F3FF" strokeWidth="1.6" />
          <path d="M10 5L13 11M19 5L22 11" stroke="#BC13FE" strokeWidth="1.8" />
          <path d="M13.5 15L20 18.5L13.5 22V15Z" fill="#00F3FF" />
        </svg>
      </div>
    );
  }

  if (key === 'capcut') {
    return (
      <div className={`${dim} flex shrink-0 items-center justify-center rounded-xl border border-[#00F3FF]/35 bg-[#0B161B]`}>
        <svg viewBox="0 0 32 32" className={svgDim} fill="none">
          <path d="M6 10L22 22M22 10L6 22" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="20" y="7" width="7" height="18" rx="2" stroke="#00F3FF" strokeWidth="2" />
        </svg>
      </div>
    );
  }

  if (key === 'spotify') {
    return (
      <div className={`${dim} flex shrink-0 items-center justify-center rounded-xl border border-[#39FF14]/30 bg-[#0C1B12]`}>
        <svg viewBox="0 0 32 32" className={svgDim} fill="none">
          <circle cx="16" cy="16" r="12" fill="#1DB954" />
          <path d="M9.5 13C14 11.5 19.5 11.8 23 13.8" stroke="#0A0A0F" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M10.5 17C14.2 15.8 18.6 16.1 21.5 17.8" stroke="#0A0A0F" strokeWidth="2" strokeLinecap="round" />
          <path d="M11.8 20.8C14.7 19.9 17.8 20.2 20 21.4" stroke="#0A0A0F" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (key === 'remini') {
    return (
      <div className={`${dim} flex shrink-0 items-center justify-center rounded-xl border border-[#BC13FE]/35 bg-[#190E24]`}>
        <svg viewBox="0 0 32 32" className={svgDim} fill="none">
          <circle cx="16" cy="16" r="10" stroke="#BC13FE" strokeWidth="2" />
          <circle cx="16" cy="16" r="5" stroke="#00F3FF" strokeWidth="2" />
          <circle cx="16" cy="16" r="2" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }

  if (key === 'netflix') {
    return (
      <div className={`${dim} flex shrink-0 items-center justify-center rounded-xl border border-red-600/35 bg-[#1B0A0D]`}>
        <svg viewBox="0 0 32 32" className={svgDim} fill="none">
          <path d="M9 26V6H13L19 20V6H23V26H19L13 12V26H9Z" fill="#E50914" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`${dim} flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#0F1219] text-[#00F3FF]`}>
      <Package className="h-6 w-6" />
    </div>
  );
}
