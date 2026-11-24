import { WebsiteSettingsBundle } from '../types/index.ts';

export const HERO_BACKDROP_IMAGE = '/src/assets/images/hero_studio_backdrop_1795450903546.jpg';
export const FEATURED_SUITE_IMAGE = '/src/assets/images/featured_editing_suite_1795450903516.jpg';
export const WORKSPACE_BANNER_IMAGE = '/src/assets/images/creator_workspace_visual_1795450903944.jpg';

export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettingsBundle = {
  hero: {
    headline: 'Unlock Premium Apps & Tools Instantly',
    subtitle:
      'Discover apps, software and digital tools in one place. Simple ordering, convenient payments and a streamlined download experience.',
    primaryButtonText: 'Explore Apps',
    primaryButtonLink: '#marketplace',
    secondaryButtonText: 'Browse Categories',
    secondaryButtonLink: '#categories',
    backgroundImage: HERO_BACKDROP_IMAGE,
    bannerImage: FEATURED_SUITE_IMAGE,
    isVisible: true,
  },
  branding: {
    websiteName: 'Creator Studio',
    logoText: 'Creator Studio',
    faviconUrl: '',
    customLogoUrl: '',
  },
  appearance: {
    backgroundColor: '#0A0A0F',
    cardColor: '#12131A',
    cyanColor: '#00F3FF',
    purpleColor: '#BC13FE',
    greenColor: '#39FF14',
    headingFont: 'Orbitron',
    bodyFont: 'Poppins',
    gridColumns: 3,
  },
  content: {
    aboutHeading: 'Built for Creators, Editors & Power Users',
    aboutDescription:
      'Creator Studio curates legitimate software bundles, official digital licenses, and creative toolkits with fast local payment verification through EasyPaisa and JazzCash. Every order is verified manually by our team before unlocking your protected download portal.',
    aboutBannerImage: WORKSPACE_BANNER_IMAGE,
    announcementText: 'Verified EasyPaisa & JazzCash Checkout · Instant Portal Delivery Upon Approval',
    announcementEnabled: true,
    promoMessage: 'Need bulk team licenses or custom creator packages? Reach our support desk directly.',
    privacyPolicy:
      'Creator Studio collects only the Gmail identity, transaction reference, and optional payment receipt needed to verify your software order and grant protected download access. We never sell personal data or expose private payment proofs publicly.',
    termsConditions:
      'All software listings represent authorized digital distributions, official creator toolkits, or licensed access guides. Downloads unlock exclusively after valid payment verification by an authorized administrator. Refund requests for unverified or duplicate transactions can be submitted via Support within 48 hours.',
  },
  navigation: {
    links: [
      { id: 'nav-home', label: 'Home', target: '#top' },
      { id: 'nav-apps', label: 'Apps', target: '#marketplace' },
      { id: 'nav-downloads', label: 'My Downloads', target: 'view:downloads' },
      { id: 'nav-support', label: 'Support', target: '#support' },
    ],
  },
  footer: {
    description:
      'Premium dark-tech software marketplace delivering curated creator applications, editing tools, and verified digital downloads.',
    copyright: '© 2026 Creator Studio. All rights reserved.',
    supportLink: '#support',
    githubUrl: '',
    youtubeUrl: '',
    discordUrl: '',
  },
  support: {
    whatsappNumber: '+92 300 0000000',
    whatsappLink: 'https://wa.me/923000000000',
    supportEmail: 'support@creatorstudio.pk',
    contactMessage: 'Have a payment verification question or need help with your download? Message us on WhatsApp or email support.',
  },
  marketplace: {
    categories: ['Entertainment', 'Video Editing', 'Tools'],
    currencyLabel: 'Rs.',
    showPriceBadge: true,
    showFeaturedRibbon: true,
    defaultSort: 'featured',
  },
};

export interface StarterAppSeed {
  id: string;
  name: string;
  iconKey: string;
  category: string;
  version: string;
  fileSize: string;
  description: string;
  features: string[];
  pricePkr: number;
  isFeatured: boolean;
  isPublished: boolean;
  fileName: string;
  releaseNotes: string;
}

export const STARTER_APPS_SEED: StarterAppSeed[] = [
  {
    id: 'youtube-premium',
    name: 'YouTube Premium',
    iconKey: 'youtube',
    category: 'Entertainment',
    version: 'v19.45.36',
    fileSize: '88 MB',
    description:
      'Authorized YouTube Premium digital access package with official setup guide, creator playback tools, and desktop companion launcher.',
    features: [
      'Ad-free official playback configuration',
      'Background play & offline playlist guide',
      'YouTube Music creator audio pack',
      'Verified multi-device setup support',
    ],
    pricePkr: 150,
    isFeatured: true,
    isPublished: true,
    fileName: 'CreatorStudio-YouTube-Premium-v19.45.36-Guide.txt',
    releaseNotes: 'Official onboarding bundle and verified client configuration instructions for v19.45.36.',
  },
  {
    id: 'moviebox-pro-vip',
    name: 'MovieBox Pro VIP',
    iconKey: 'moviebox',
    category: 'Entertainment',
    version: 'v15.2',
    fileSize: '64 MB',
    description:
      'Authorized cinema catalog launcher and 4K media organizer toolkit with subtitle sync utilities and watch-list management.',
    features: [
      '4K HDR media playback presets',
      'Multi-language subtitle pack support',
      'Cross-device watchlist synchronization',
      'Official installer & setup verification',
    ],
    pricePkr: 200,
    isFeatured: true,
    isPublished: true,
    fileName: 'CreatorStudio-MovieBox-Pro-VIP-v15.2-Package.txt',
    releaseNotes: 'Includes verified MovieBox Pro VIP v15.2 client setup instructions and checksum.',
  },
  {
    id: 'capcut-pro',
    name: 'CapCut Pro',
    iconKey: 'capcut',
    category: 'Video Editing',
    version: 'v12.8.0',
    fileSize: '145 MB',
    description:
      'Complete creator video editing suite package with LUT presets, smooth keyframe templates, and high-bitrate export profiles.',
    features: [
      '4K 60fps creator export presets',
      'Curated LUTs & motion transition pack',
      'Auto-caption & audio mastering guide',
      'Desktop & mobile workflow sync',
    ],
    pricePkr: 250,
    isFeatured: true,
    isPublished: true,
    fileName: 'CreatorStudio-CapCut-Pro-v12.8.0-Suite.txt',
    releaseNotes: 'CapCut Pro v12.8.0 creator kit, LUT pack manifest, and verified download guide.',
  },
  {
    id: 'spotify-premium',
    name: 'Spotify Premium',
    iconKey: 'spotify',
    category: 'Entertainment',
    version: 'v8.9.84',
    fileSize: '52 MB',
    description:
      'Authorized high-fidelity audio streaming setup and lossless playlist migration toolkit for music lovers and podcasters.',
    features: [
      '320 kbps high-bitrate audio settings',
      'Offline playlist backup & sync tools',
      'Lossless EQ studio profiles',
      'Dedicated creator audio support',
    ],
    pricePkr: 120,
    isFeatured: false,
    isPublished: true,
    fileName: 'CreatorStudio-Spotify-Premium-v8.9.84-Kit.txt',
    releaseNotes: 'Verified Spotify Premium v8.9.84 configuration guide and audio EQ preset bundle.',
  },
  {
    id: 'remini-ai-photo-enhancer',
    name: 'Remini AI Photo Enhancer',
    iconKey: 'remini',
    category: 'Tools',
    version: 'v3.7.780',
    fileSize: '78 MB',
    description:
      'AI portrait restoration and ultra-HD photo upscaling workflow toolkit for photographers, thumbnail designers, and studios.',
    features: [
      'Batch portrait sharpening presets',
      '4x resolution upscaling workflows',
      'Skin tone & grain preservation guide',
      'RAW & PNG studio export templates',
    ],
    pricePkr: 150,
    isFeatured: false,
    isPublished: true,
    fileName: 'CreatorStudio-Remini-AI-v3.7.780-Toolkit.txt',
    releaseNotes: 'Remini AI Photo Enhancer v3.7.780 authorized studio workflow package.',
  },
  {
    id: 'netflix',
    name: 'Netflix',
    iconKey: 'netflix',
    category: 'Entertainment',
    version: 'v8.130.0',
    fileSize: '45 MB',
    description:
      'Authorized streaming companion and Smart TV / mobile UHD calibration package for optimal playback and offline downloads.',
    features: [
      'UHD 4K & Dolby audio setup guide',
      'Bandwidth & buffer optimization tool',
      'Profile PIN & parental controls setup',
      'Official client verification checklist',
    ],
    pricePkr: 200,
    isFeatured: false,
    isPublished: true,
    fileName: 'CreatorStudio-Netflix-v8.130.0-Guide.txt',
    releaseNotes: 'Netflix v8.130.0 verified client setup and UHD calibration pack.',
  },
];

export const STARTER_PAYMENT_SETTINGS = [
  {
    id: 'easypaisa' as const,
    method: 'EasyPaisa' as const,
    accountTitle: 'Creator Studio Official',
    accountNumber: '0300-0000001',
    instructions:
      'Send the exact PKR amount to this EasyPaisa account. Enter your 11-digit TID / Transaction ID below and attach a screenshot for fast verification.',
    qrImagePath: '',
    isEnabled: true,
  },
  {
    id: 'jazzcash' as const,
    method: 'JazzCash' as const,
    accountTitle: 'Creator Studio Official',
    accountNumber: '0301-0000002',
    instructions:
      'Transfer the exact PKR amount via JazzCash App or *786#. Copy the TID reference number and upload your payment receipt below.',
    qrImagePath: '',
    isEnabled: true,
  },
];

export function sanitizeSafeUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#') || trimmed.startsWith('/src/') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

export function buildPackageManifestPayload(app: StarterAppSeed): string {
  const manifest = [
    '============================================================',
    'CREATOR STUDIO — VERIFIED DIGITAL SOFTWARE DELIVERY',
    '============================================================',
    `Application : ${app.name}`,
    `Version     : ${app.version}`,
    `Category    : ${app.category}`,
    `Size        : ${app.fileSize}`,
    `Price       : Rs. ${app.pricePkr} PKR`,
    '------------------------------------------------------------',
    'Description:',
    app.description,
    '',
    'Included Features:',
    ...app.features.map((f, idx) => `  ${idx + 1}. ${f}`),
    '',
    'Release Notes:',
    app.releaseNotes,
    '',
    'Notice: Replace this starter package manifest with your',
    'authorized installer URL or uploaded package via Admin ->',
    'Manage Apps -> Edit Download File.',
    '============================================================',
  ].join('\n');

  return `data:text/plain;charset=utf-8,${encodeURIComponent(manifest)}`;
}
