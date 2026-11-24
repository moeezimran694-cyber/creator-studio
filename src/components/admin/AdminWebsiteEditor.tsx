import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AdminPermissionsMap,
  UserProfile,
  WebsiteSettingsBundle,
} from '../../types/index.ts';
import { compressImageToDataUrl, saveWebsiteSettingSection } from '../../lib/db.ts';
import { useToast } from '../ToastContext.tsx';

type EditorSubTab =
  | 'hero'
  | 'branding'
  | 'appearance'
  | 'content'
  | 'navigation'
  | 'footer'
  | 'support-marketplace';

interface AdminWebsiteEditorProps {
  user: UserProfile;
  permissions: AdminPermissionsMap;
  savedSettings: WebsiteSettingsBundle;
  previewEnabled: boolean;
  onTogglePreview: (enabled: boolean) => void;
  onDraftChange: (draft: WebsiteSettingsBundle) => void;
  onPreviewStorefront: () => void;
}

export function AdminWebsiteEditor({
  user,
  permissions,
  savedSettings,
  previewEnabled,
  onTogglePreview,
  onDraftChange,
  onPreviewStorefront,
}: AdminWebsiteEditorProps) {
  const { showToast } = useToast();
  const isSuper = user.role === 'SUPER_ADMIN';
  const canEditContent = isSuper || permissions.content_edit;
  const canEditAppearance = isSuper || permissions.appearance_edit;

  const [subTab, setSubTab] = useState<EditorSubTab>(
    canEditContent ? 'hero' : 'appearance'
  );
  const [draft, setDraft] = useState<WebsiteSettingsBundle>(savedSettings);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    setDraft(savedSettings);
  }, [savedSettings]);

  const updateDraft = (updater: (prev: WebsiteSettingsBundle) => WebsiteSettingsBundle) => {
    setDraft((prev) => {
      const next = updater(prev);
      if (previewEnabled) {
        onDraftChange(next);
      }
      return next;
    });
  };

  const handleTogglePreview = () => {
    const nextState = !previewEnabled;
    onTogglePreview(nextState);
    if (nextState) {
      onDraftChange(draft);
      showToast('Live preview enabled across storefront.', 'info');
    } else {
      onDraftChange(savedSettings);
      showToast('Preview reset to saved database values.', 'info');
    }
  };

  const handleImageUpload = async (
    file: File,
    applyUrl: (url: string) => void
  ) => {
    try {
      const dataUrl = await compressImageToDataUrl(file, 1280, 0.8);
      applyUrl(dataUrl);
      showToast('Image compressed and loaded into editor.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed.', 'error');
    }
  };

  const saveSection = async <K extends keyof WebsiteSettingsBundle>(key: K) => {
    setSaving(true);
    try {
      await saveWebsiteSettingSection({
        actor: user,
        settingKey: key,
        settingValue: draft[key],
      });
      showToast(`Saved "${key}" settings to database.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAllAllowed = async () => {
    setSaving(true);
    try {
      if (canEditContent) {
        await saveWebsiteSettingSection({ actor: user, settingKey: 'hero', settingValue: draft.hero });
        await saveWebsiteSettingSection({ actor: user, settingKey: 'branding', settingValue: draft.branding });
        await saveWebsiteSettingSection({ actor: user, settingKey: 'content', settingValue: draft.content });
        await saveWebsiteSettingSection({ actor: user, settingKey: 'navigation', settingValue: draft.navigation });
        await saveWebsiteSettingSection({ actor: user, settingKey: 'footer', settingValue: draft.footer });
        await saveWebsiteSettingSection({ actor: user, settingKey: 'support', settingValue: draft.support });
        await saveWebsiteSettingSection({ actor: user, settingKey: 'marketplace', settingValue: draft.marketplace });
      }
      if (canEditAppearance) {
        await saveWebsiteSettingSection({ actor: user, settingKey: 'appearance', settingValue: draft.appearance });
      }
      onTogglePreview(false);
      showToast('All website customization changes saved to Firestore.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save changes.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: EditorSubTab; label: string; allowed: boolean }[] = [
    { id: 'hero', label: 'Hero Editor', allowed: canEditContent },
    { id: 'branding', label: 'Branding', allowed: canEditContent },
    { id: 'appearance', label: 'Appearance & Theme', allowed: canEditAppearance },
    { id: 'content', label: 'Content & Legal', allowed: canEditContent },
    { id: 'navigation', label: 'Navigation', allowed: canEditContent },
    { id: 'footer', label: 'Footer', allowed: canEditContent },
    { id: 'support-marketplace', label: 'Support & Marketplace', allowed: canEditContent },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Website Customization Studio
          </h1>
          <p className="mt-1 text-xs text-[#9BA3B8]">
            Edit any storefront section, theme, navigation link, or support detail with live database persistence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleTogglePreview}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
              previewEnabled
                ? 'border-[#BC13FE] bg-[#BC13FE]/20 text-white'
                : 'border-white/15 bg-[#12131A] text-[#9BA3B8] hover:text-white'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            {previewEnabled ? 'Preview Active' : 'Preview Changes'}
          </button>

          {previewEnabled && (
            <button
              type="button"
              onClick={onPreviewStorefront}
              className="rounded-lg border border-[#00F3FF]/50 bg-[#00F3FF]/10 px-3.5 py-2 text-xs font-semibold text-[#00F3FF]"
            >
              Open Storefront Preview
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveAllAllowed()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#00F3FF] px-5 py-2 text-xs font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Sub-module Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
        {tabs
          .filter((t) => t.allowed)
          .map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                subTab === tab.id
                  ? 'bg-[#00F3FF] text-[#0A0A0F]'
                  : 'border border-white/10 bg-[#12131A] text-[#9BA3B8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
      </div>

      {/* HERO EDITOR */}
      {subTab === 'hero' && canEditContent && (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-[#12131A] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-white">Hero Section</h2>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-white">
              <input
                type="checkbox"
                checked={draft.hero.isVisible}
                onChange={(e) =>
                  updateDraft((d) => ({ ...d, hero: { ...d.hero, isVisible: e.target.checked } }))
                }
                className="h-4 w-4 accent-[#00F3FF]"
              />
              Show Hero Section
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[#9BA3B8]">Main Heading</label>
              <input
                type="text"
                value={draft.hero.headline}
                onChange={(e) =>
                  updateDraft((d) => ({ ...d, hero: { ...d.hero, headline: e.target.value } }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[#9BA3B8]">Subtitle</label>
              <textarea
                rows={2}
                value={draft.hero.subtitle}
                onChange={(e) =>
                  updateDraft((d) => ({ ...d, hero: { ...d.hero, subtitle: e.target.value } }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] p-3 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Primary Button Text</label>
              <input
                type="text"
                value={draft.hero.primaryButtonText}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    hero: { ...d.hero, primaryButtonText: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Primary Button Link</label>
              <input
                type="text"
                value={draft.hero.primaryButtonLink}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    hero: { ...d.hero, primaryButtonLink: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Secondary Button Text</label>
              <input
                type="text"
                value={draft.hero.secondaryButtonText}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    hero: { ...d.hero, secondaryButtonText: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Secondary Button Link</label>
              <input
                type="text"
                value={draft.hero.secondaryButtonLink}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    hero: { ...d.hero, secondaryButtonLink: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Hero Background Image</label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={draft.hero.backgroundImage}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      hero: { ...d.hero, backgroundImage: e.target.value },
                    }))
                  }
                  className="flex-1 rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
                />
                <label className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white">
                  <Upload className="inline h-3.5 w-3.5" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        void handleImageUpload(f, (url) =>
                          updateDraft((d) => ({ ...d, hero: { ...d.hero, backgroundImage: url } }))
                        );
                    }}
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Hero Showcase Banner Image</label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={draft.hero.bannerImage}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      hero: { ...d.hero, bannerImage: e.target.value },
                    }))
                  }
                  className="flex-1 rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
                />
                <label className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white">
                  <Upload className="inline h-3.5 w-3.5" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        void handleImageUpload(f, (url) =>
                          updateDraft((d) => ({ ...d, hero: { ...d.hero, bannerImage: url } }))
                        );
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSection('hero')}
              className="rounded-lg bg-[#00F3FF] px-4 py-2 text-xs font-semibold text-[#0A0A0F]"
            >
              Save Hero Section
            </button>
          </div>
        </div>
      )}

      {/* BRANDING EDITOR */}
      {subTab === 'branding' && canEditContent && (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-[#12131A] p-6">
          <h2 className="font-display text-base font-bold text-white">Branding Identity</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Website Name</label>
              <input
                type="text"
                value={draft.branding.websiteName}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    branding: { ...d.branding, websiteName: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2.5 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Header Logo Title</label>
              <input
                type="text"
                value={draft.branding.logoText}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    branding: { ...d.branding, logoText: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2.5 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Custom Logo URL / Upload</label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={draft.branding.customLogoUrl}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      branding: { ...d.branding, customLogoUrl: e.target.value },
                    }))
                  }
                  placeholder="Leave blank for default CS neon emblem"
                  className="flex-1 rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
                />
                <label className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white">
                  <Upload className="inline h-3.5 w-3.5" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        void handleImageUpload(f, (url) =>
                          updateDraft((d) => ({
                            ...d,
                            branding: { ...d.branding, customLogoUrl: url },
                          }))
                        );
                    }}
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Favicon URL</label>
              <input
                type="text"
                value={draft.branding.faviconUrl}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    branding: { ...d.branding, faviconUrl: e.target.value },
                  }))
                }
                placeholder="https://.../favicon.png"
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSection('branding')}
              className="rounded-lg bg-[#00F3FF] px-4 py-2 text-xs font-semibold text-[#0A0A0F]"
            >
              Save Branding
            </button>
          </div>
        </div>
      )}

      {/* APPEARANCE EDITOR */}
      {subTab === 'appearance' && canEditAppearance && (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-[#12131A] p-6">
          <h2 className="font-display text-base font-bold text-white">Colors, Fonts & Layout</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ['backgroundColor', 'Background'],
                ['cardColor', 'Card Surface'],
                ['cyanColor', 'Primary Accent'],
                ['purpleColor', 'Badge Accent'],
                ['greenColor', 'Success Accent'],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-[#9BA3B8]">{label}</label>
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-white/15 bg-[#0A0A0F] p-2">
                  <input
                    type="color"
                    value={draft.appearance[field]}
                    onChange={(e) =>
                      updateDraft((d) => ({
                        ...d,
                        appearance: { ...d.appearance, [field]: e.target.value },
                      }))
                    }
                    className="h-7 w-9 cursor-pointer border-0 bg-transparent"
                  />
                  <span className="font-mono-tabular text-xs text-white">
                    {draft.appearance[field]}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Heading Font</label>
              <select
                value={draft.appearance.headingFont}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    appearance: {
                      ...d.appearance,
                      headingFont: e.target.value as 'Orbitron' | 'Poppins' | 'JetBrains Mono',
                    },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              >
                <option value="Orbitron">Orbitron</option>
                <option value="Poppins">Poppins</option>
                <option value="JetBrains Mono">JetBrains Mono</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Body Font</label>
              <select
                value={draft.appearance.bodyFont}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    appearance: {
                      ...d.appearance,
                      bodyFont: e.target.value as 'Poppins' | 'JetBrains Mono',
                    },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              >
                <option value="Poppins">Poppins</option>
                <option value="JetBrains Mono">JetBrains Mono</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Desktop Card Columns</label>
              <select
                value={draft.appearance.gridColumns}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    appearance: {
                      ...d.appearance,
                      gridColumns: Number(e.target.value) === 4 ? 4 : 3,
                    },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              >
                <option value={3}>3 Columns per Row</option>
                <option value={4}>4 Columns per Row</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSection('appearance')}
              className="rounded-lg bg-[#00F3FF] px-4 py-2 text-xs font-semibold text-[#0A0A0F]"
            >
              Save Appearance
            </button>
          </div>
        </div>
      )}

      {/* CONTENT & LEGAL EDITOR */}
      {subTab === 'content' && canEditContent && (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-[#12131A] p-6">
          <h2 className="font-display text-base font-bold text-white">
            About, Announcements & Policies
          </h2>
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#0A0A0F] p-4">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs font-semibold text-[#9BA3B8]">
                  Top Announcement Banner Text
                </label>
                <input
                  type="text"
                  value={draft.content.announcementText}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      content: { ...d.content, announcementText: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#12131A] px-3 py-2 text-xs text-white"
                />
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-white">
                <input
                  type="checkbox"
                  checked={draft.content.announcementEnabled}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      content: { ...d.content, announcementEnabled: e.target.checked },
                    }))
                  }
                  className="h-4 w-4 accent-[#00F3FF]"
                />
                Show Announcement
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">
                Marketplace Promotional Message
              </label>
              <input
                type="text"
                value={draft.content.promoMessage}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    content: { ...d.content, promoMessage: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">About Heading</label>
              <input
                type="text"
                value={draft.content.aboutHeading}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    content: { ...d.content, aboutHeading: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">About Description</label>
              <textarea
                rows={3}
                value={draft.content.aboutDescription}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    content: { ...d.content, aboutDescription: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] p-3 text-xs text-white"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8]">Privacy Policy</label>
                <textarea
                  rows={4}
                  value={draft.content.privacyPolicy}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      content: { ...d.content, privacyPolicy: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] p-3 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8]">
                  Terms & Conditions
                </label>
                <textarea
                  rows={4}
                  value={draft.content.termsConditions}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      content: { ...d.content, termsConditions: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] p-3 text-xs text-white"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSection('content')}
              className="rounded-lg bg-[#00F3FF] px-4 py-2 text-xs font-semibold text-[#0A0A0F]"
            >
              Save Content
            </button>
          </div>
        </div>
      )}

      {/* NAVIGATION EDITOR */}
      {subTab === 'navigation' && canEditContent && (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-[#12131A] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-white">Header Navigation Links</h2>
            <button
              type="button"
              onClick={() =>
                updateDraft((d) => ({
                  ...d,
                  navigation: {
                    links: [
                      ...d.navigation.links,
                      { id: `nav-${Date.now()}`, label: 'New Link', target: '#marketplace' },
                    ],
                  },
                }))
              }
              className="inline-flex items-center gap-1 rounded-lg border border-[#00F3FF]/40 px-3 py-1.5 text-xs font-semibold text-[#00F3FF]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Link
            </button>
          </div>

          <div className="space-y-3">
            {draft.navigation.links.map((link, idx) => (
              <div
                key={link.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#0A0A0F] p-3"
              >
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      navigation: {
                        links: d.navigation.links.map((item, i) =>
                          i === idx ? { ...item, label: e.target.value } : item
                        ),
                      },
                    }))
                  }
                  placeholder="Label"
                  className="w-40 rounded-lg border border-white/15 bg-[#12131A] px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={link.target}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      navigation: {
                        links: d.navigation.links.map((item, i) =>
                          i === idx ? { ...item, target: e.target.value } : item
                        ),
                      },
                    }))
                  }
                  placeholder="#marketplace, view:downloads, or https://..."
                  className="flex-1 min-w-[200px] rounded-lg border border-white/15 bg-[#12131A] px-3 py-2 text-xs text-white"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() =>
                      updateDraft((d) => {
                        const arr = [...d.navigation.links];
                        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                        return { ...d, navigation: { links: arr } };
                      })
                    }
                    className="rounded p-1.5 text-[#9BA3B8] hover:text-white disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === draft.navigation.links.length - 1}
                    onClick={() =>
                      updateDraft((d) => {
                        const arr = [...d.navigation.links];
                        [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                        return { ...d, navigation: { links: arr } };
                      })
                    }
                    className="rounded p-1.5 text-[#9BA3B8] hover:text-white disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft((d) => ({
                        ...d,
                        navigation: {
                          links: d.navigation.links.filter((_, i) => i !== idx),
                        },
                      }))
                    }
                    className="rounded p-1.5 text-red-400 hover:bg-red-500/10"
                    aria-label="Delete link"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSection('navigation')}
              className="rounded-lg bg-[#00F3FF] px-4 py-2 text-xs font-semibold text-[#0A0A0F]"
            >
              Save Navigation
            </button>
          </div>
        </div>
      )}

      {/* FOOTER EDITOR */}
      {subTab === 'footer' && canEditContent && (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-[#12131A] p-6">
          <h2 className="font-display text-base font-bold text-white">Footer Configuration</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[#9BA3B8]">Footer Description</label>
              <textarea
                rows={2}
                value={draft.footer.description}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    footer: { ...d.footer, description: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] p-3 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Copyright Line</label>
              <input
                type="text"
                value={draft.footer.copyright}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    footer: { ...d.footer, copyright: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Support Link</label>
              <input
                type="text"
                value={draft.footer.supportLink}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    footer: { ...d.footer, supportLink: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">YouTube URL</label>
              <input
                type="text"
                value={draft.footer.youtubeUrl}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    footer: { ...d.footer, youtubeUrl: e.target.value },
                  }))
                }
                placeholder="https://youtube.com/..."
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Discord URL</label>
              <input
                type="text"
                value={draft.footer.discordUrl}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    footer: { ...d.footer, discordUrl: e.target.value },
                  }))
                }
                placeholder="https://discord.gg/..."
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSection('footer')}
              className="rounded-lg bg-[#00F3FF] px-4 py-2 text-xs font-semibold text-[#0A0A0F]"
            >
              Save Footer
            </button>
          </div>
        </div>
      )}

      {/* SUPPORT & MARKETPLACE EDITOR */}
      {subTab === 'support-marketplace' && canEditContent && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-white/10 bg-[#12131A] p-6">
            <h2 className="font-display text-base font-bold text-white">
              Support & WhatsApp Button
            </h2>
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">WhatsApp Number</label>
              <input
                type="text"
                value={draft.support.whatsappNumber}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    support: { ...d.support, whatsappNumber: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">WhatsApp Link</label>
              <input
                type="text"
                value={draft.support.whatsappLink}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    support: { ...d.support, whatsappLink: e.target.value },
                  }))
                }
                placeholder="https://wa.me/92300..."
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Support Email</label>
              <input
                type="email"
                value={draft.support.supportEmail}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    support: { ...d.support, supportEmail: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Contact Message</label>
              <textarea
                rows={2}
                value={draft.support.contactMessage}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    support: { ...d.support, contactMessage: e.target.value },
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] p-3 text-xs text-white"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveSection('support')}
                className="rounded-lg bg-[#00F3FF] px-4 py-2 text-xs font-semibold text-[#0A0A0F]"
              >
                Save Support
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/10 bg-[#12131A] p-6">
            <h2 className="font-display text-base font-bold text-white">Marketplace Settings</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8]">Currency Label</label>
                <input
                  type="text"
                  value={draft.marketplace.currencyLabel}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      marketplace: { ...d.marketplace, currencyLabel: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#9BA3B8]">Default Sort</label>
                <select
                  value={draft.marketplace.defaultSort}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      marketplace: {
                        ...d.marketplace,
                        defaultSort: e.target.value as 'featured' | 'price_asc' | 'price_desc' | 'newest',
                      },
                    }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
                >
                  <option value="featured">Featured First</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="newest">Newest Added</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">App Categories</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.marketplace.categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-1 text-xs text-white"
                  >
                    {cat}
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft((d) => ({
                          ...d,
                          marketplace: {
                            ...d.marketplace,
                            categories: d.marketplace.categories.filter((c) => c !== cat),
                          },
                        }))
                      }
                      className="text-[#9BA3B8] hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Add category..."
                  className="flex-1 rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = newCategory.trim();
                    if (!clean || draft.marketplace.categories.includes(clean)) return;
                    updateDraft((d) => ({
                      ...d,
                      marketplace: {
                        ...d.marketplace,
                        categories: [...d.marketplace.categories, clean],
                      },
                    }));
                    setNewCategory('');
                  }}
                  className="rounded-lg border border-[#00F3FF]/40 px-3 py-2 text-xs font-semibold text-[#00F3FF]"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-5 pt-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-white">
                <input
                  type="checkbox"
                  checked={draft.marketplace.showPriceBadge}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      marketplace: { ...d.marketplace, showPriceBadge: e.target.checked },
                    }))
                  }
                  className="h-4 w-4 accent-[#00F3FF]"
                />
                Display Prices on Cards
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-white">
                <input
                  type="checkbox"
                  checked={draft.marketplace.showFeaturedRibbon}
                  onChange={(e) =>
                    updateDraft((d) => ({
                      ...d,
                      marketplace: { ...d.marketplace, showFeaturedRibbon: e.target.checked },
                    }))
                  }
                  className="h-4 w-4 accent-[#BC13FE]"
                />
                Highlight Featured Apps
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveSection('marketplace')}
                className="rounded-lg bg-[#00F3FF] px-4 py-2 text-xs font-semibold text-[#0A0A0F]"
              >
                Save Marketplace Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
