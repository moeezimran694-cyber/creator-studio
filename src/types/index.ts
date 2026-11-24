export const PERMANENT_SUPER_ADMIN_EMAIL = 'moeezi396@gmail.com';

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export type AdminPermissionKey =
  | 'orders_view'
  | 'orders_approve'
  | 'orders_reject'
  | 'apps_view'
  | 'apps_add'
  | 'apps_edit'
  | 'apps_delete'
  | 'apps_change_price'
  | 'apps_change_files'
  | 'content_edit'
  | 'appearance_edit'
  | 'payments_view'
  | 'payments_edit_easypaisa'
  | 'payments_edit_jazzcash';

export type AdminPermissionsMap = Record<AdminPermissionKey, boolean>;

export const EMPTY_PERMISSIONS: AdminPermissionsMap = {
  orders_view: false,
  orders_approve: false,
  orders_reject: false,
  apps_view: false,
  apps_add: false,
  apps_edit: false,
  apps_delete: false,
  apps_change_price: false,
  apps_change_files: false,
  content_edit: false,
  appearance_edit: false,
  payments_view: false,
  payments_edit_easypaisa: false,
  payments_edit_jazzcash: false,
};

export const FULL_PERMISSIONS: AdminPermissionsMap = {
  orders_view: true,
  orders_approve: true,
  orders_reject: true,
  apps_view: true,
  apps_add: true,
  apps_edit: true,
  apps_delete: true,
  apps_change_price: true,
  apps_change_files: true,
  content_edit: true,
  appearance_edit: true,
  payments_view: true,
  payments_edit_easypaisa: true,
  payments_edit_jazzcash: true,
};

export interface PermissionGroup {
  group: string;
  items: { key: AdminPermissionKey; label: string; description: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: 'Orders',
    items: [
      { key: 'orders_view', label: 'View Orders', description: 'Inspect customer orders, transaction IDs, and payment screenshots' },
      { key: 'orders_approve', label: 'Approve Payments', description: 'Verify orders and unlock download entitlements' },
      { key: 'orders_reject', label: 'Reject Payments', description: 'Decline invalid or unverified payment submissions' },
    ],
  },
  {
    group: 'Apps',
    items: [
      { key: 'apps_view', label: 'View Apps', description: 'View published and unpublished software records' },
      { key: 'apps_add', label: 'Add Apps', description: 'Create new software listings in the catalog' },
      { key: 'apps_edit', label: 'Edit Apps', description: 'Update titles, descriptions, features, versions, and visibility' },
      { key: 'apps_delete', label: 'Delete Apps', description: 'Permanently remove software listings' },
      { key: 'apps_change_price', label: 'Change Prices', description: 'Modify PKR pricing for catalog items' },
      { key: 'apps_change_files', label: 'Change Download Files', description: 'Replace protected software files or delivery URLs' },
    ],
  },
  {
    group: 'Website Content',
    items: [
      { key: 'content_edit', label: 'Edit Website Content', description: 'Modify hero, headings, branding, navigation, footer, support, and categories' },
    ],
  },
  {
    group: 'Appearance',
    items: [
      { key: 'appearance_edit', label: 'Edit Appearance', description: 'Customize theme colors, fonts, and marketplace grid layout' },
    ],
  },
  {
    group: 'Payment Settings',
    items: [
      { key: 'payments_view', label: 'View Payment Settings', description: 'Inspect EasyPaisa and JazzCash account configurations' },
      { key: 'payments_edit_easypaisa', label: 'Edit EasyPaisa', description: 'Update EasyPaisa account title, number, instructions, and QR' },
      { key: 'payments_edit_jazzcash', label: 'Edit JazzCash', description: 'Update JazzCash account title, number, instructions, and QR' },
    ],
  },
];

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  acceptedInvitationId?: string;
  createdAt: Date;
  lastLogin: Date;
}

export interface AdminPermissionRecord {
  adminUserId: string;
  adminEmail: string;
  permissions: AdminPermissionsMap;
  grantedBy: string;
  updatedAt: Date;
}

export interface AdminInvitation {
  id: string;
  email: string;
  invitationTokenHash: string;
  permissions: AdminPermissionsMap;
  invitedBy: string;
  expiresAt: Date;
  createdAt: Date;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  acceptedUid?: string;
  acceptedAt?: Date;
}

export interface AppListing {
  id: string;
  name: string;
  iconUrl?: string;
  iconKey?: string;
  category: string;
  version: string;
  fileSize: string;
  description: string;
  features: string[];
  pricePkr: number;
  isFeatured: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppFile {
  appId: string;
  downloadStoragePath: string;
  fileName: string;
  releaseNotes?: string;
  updatedBy: string;
  updatedAt: Date;
}

export type OrderStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PaymentMethod = 'EasyPaisa' | 'JazzCash';

export interface Order {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  appId: string;
  appName: string;
  transactionId: string;
  paymentMethod: PaymentMethod;
  hasScreenshot: boolean;
  amountPkr: number;
  status: OrderStatus;
  rejectionReason?: string;
  reviewedBy?: string | null;
  reviewedByEmail?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
}

export interface Entitlement {
  id: string;
  userId: string;
  appId: string;
  orderId: string;
  grantedBy: string;
  grantedAt: Date;
}

export interface PaymentSetting {
  id: 'easypaisa' | 'jazzcash';
  method: PaymentMethod;
  accountTitle: string;
  accountNumber: string;
  instructions: string;
  qrImagePath?: string;
  isEnabled: boolean;
  updatedBy: string;
  updatedAt: Date;
}

export interface NavLinkItem {
  id: string;
  label: string;
  target: string;
  isExternal?: boolean;
}

export interface HeroSettings {
  headline: string;
  subtitle: string;
  primaryButtonText: string;
  primaryButtonLink: string;
  secondaryButtonText: string;
  secondaryButtonLink: string;
  backgroundImage: string;
  bannerImage: string;
  isVisible: boolean;
}

export interface BrandingSettings {
  websiteName: string;
  logoText: string;
  faviconUrl: string;
  customLogoUrl: string;
}

export interface AppearanceSettings {
  backgroundColor: string;
  cardColor: string;
  cyanColor: string;
  purpleColor: string;
  greenColor: string;
  headingFont: 'Orbitron' | 'Poppins' | 'JetBrains Mono';
  bodyFont: 'Poppins' | 'JetBrains Mono';
  gridColumns: 3 | 4;
}

export interface ContentSettings {
  aboutHeading: string;
  aboutDescription: string;
  aboutBannerImage: string;
  announcementText: string;
  announcementEnabled: boolean;
  promoMessage: string;
  privacyPolicy: string;
  termsConditions: string;
}

export interface FooterSettings {
  description: string;
  copyright: string;
  supportLink: string;
  githubUrl: string;
  youtubeUrl: string;
  discordUrl: string;
}

export interface SupportSettings {
  whatsappNumber: string;
  whatsappLink: string;
  supportEmail: string;
  contactMessage: string;
}

export interface MarketplaceSettings {
  categories: string[];
  currencyLabel: string;
  showPriceBadge: boolean;
  showFeaturedRibbon: boolean;
  defaultSort: 'featured' | 'price_asc' | 'price_desc' | 'newest';
}

export interface WebsiteSettingsBundle {
  hero: HeroSettings;
  branding: BrandingSettings;
  appearance: AppearanceSettings;
  content: ContentSettings;
  navigation: { links: NavLinkItem[] };
  footer: FooterSettings;
  support: SupportSettings;
  marketplace: MarketplaceSettings;
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  oldValue?: string;
  newValue?: string;
  createdAt: Date;
}

export interface DownloadLog {
  id: string;
  userId: string;
  appId: string;
  appName: string;
  createdAt: Date;
}

export type AppView = 'storefront' | 'downloads' | 'admin';
export type AdminTab =
  | 'dashboard'
  | 'apps'
  | 'add-app'
  | 'orders'
  | 'admins'
  | 'permissions'
  | 'website-editor'
  | 'payments'
  | 'logs';
