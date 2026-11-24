import React, { useEffect, useState } from 'react';
import {
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AdminPermissionsMap,
  AppListing,
  UserProfile,
} from '../../types/index.ts';
import {
  compressImageToDataUrl,
  createAppListing,
  deleteAppListing,
  fetchProtectedAppFile,
  readSmallFileToDataUrl,
  toggleAppFlag,
  updateAppListing,
} from '../../lib/db.ts';
import { AppIconRenderer } from '../BrandLogo.tsx';
import { useToast } from '../ToastContext.tsx';

interface AdminAppsManagerProps {
  mode: 'list' | 'add';
  user: UserProfile;
  permissions: AdminPermissionsMap;
  apps: AppListing[];
  categories: string[];
  onSwitchToAdd: () => void;
  onSwitchToList: () => void;
}

const BUILTIN_ICON_KEYS = [
  { key: '', label: 'Generic Software Icon' },
  { key: 'youtube', label: 'YouTube Play Emblem' },
  { key: 'moviebox', label: 'MovieBox Cinema Emblem' },
  { key: 'capcut', label: 'CapCut Blade Emblem' },
  { key: 'spotify', label: 'Spotify Audio Emblem' },
  { key: 'remini', label: 'Remini AI Lens Emblem' },
  { key: 'netflix', label: 'Netflix N Emblem' },
];

export function AdminAppsManager({
  mode,
  user,
  permissions,
  apps,
  categories,
  onSwitchToAdd,
  onSwitchToList,
}: AdminAppsManagerProps) {
  const { showToast, confirmAction } = useToast();
  const isSuper = user.role === 'SUPER_ADMIN';
  const canAdd = isSuper || permissions.apps_add;
  const canEdit = isSuper || permissions.apps_edit;
  const canDelete = isSuper || permissions.apps_delete;
  const canChangePrice = isSuper || permissions.apps_change_price;
  const canChangeFiles = isSuper || permissions.apps_change_files;

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [page, setPage] = useState(1);
  const perPage = 8;

  const [editingApp, setEditingApp] = useState<AppListing | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [iconKey, setIconKey] = useState('');
  const [category, setCategory] = useState(categories[0] || 'Entertainment');
  const [version, setVersion] = useState('v1.0.0');
  const [fileSize, setFileSize] = useState('50 MB');
  const [pricePkr, setPricePkr] = useState('150');
  const [description, setDescription] = useState('');
  const [featuresText, setFeaturesText] = useState('');
  const [downloadStoragePath, setDownloadStoragePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isPublished, setIsPublished] = useState(true);

  const resetForm = () => {
    setEditingApp(null);
    setName('');
    setIconUrl('');
    setIconKey('');
    setCategory(categories[0] || 'Entertainment');
    setVersion('v1.0.0');
    setFileSize('50 MB');
    setPricePkr('150');
    setDescription('');
    setFeaturesText('');
    setDownloadStoragePath('');
    setFileName('');
    setReleaseNotes('');
    setIsFeatured(false);
    setIsPublished(true);
  };

  useEffect(() => {
    if (mode === 'add') {
      resetForm();
    }
  }, [mode]);

  const startEdit = async (app: AppListing) => {
    setEditingApp(app);
    setName(app.name);
    setIconUrl(app.iconUrl || '');
    setIconKey(app.iconKey || '');
    setCategory(app.category);
    setVersion(app.version);
    setFileSize(app.fileSize);
    setPricePkr(String(app.pricePkr));
    setDescription(app.description);
    setFeaturesText(app.features.join('\n'));
    setIsFeatured(app.isFeatured);
    setIsPublished(app.isPublished);
    setDownloadStoragePath('');
    setFileName('');
    setReleaseNotes('');

    if (canChangeFiles || isSuper || permissions.apps_view) {
      try {
        const fileDoc = await fetchProtectedAppFile(app.id);
        if (fileDoc) {
          setDownloadStoragePath(fileDoc.downloadStoragePath);
          setFileName(fileDoc.fileName);
          setReleaseNotes(fileDoc.releaseNotes || '');
        }
      } catch {
        // Admin may not have file permission
      }
    }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 256, 0.85);
      setIconUrl(dataUrl);
      showToast('App icon uploaded and optimized.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Icon upload failed.', 'error');
    }
  };

  const handlePackageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readSmallFileToDataUrl(file);
      setDownloadStoragePath(dataUrl);
      setFileName(file.name);
      showToast(`Attached package "${file.name}".`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'File attachment failed.', 'error');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const features = featuresText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!name.trim() || !description.trim()) {
      showToast('App name and description are required.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingApp) {
        await updateAppListing({
          actor: user,
          existingApp: editingApp,
          updates: {
            name,
            iconUrl,
            iconKey,
            category,
            version,
            fileSize,
            description,
            features,
            pricePkr: Number(pricePkr) || 0,
            isFeatured,
            isPublished,
          },
          fileUpdates:
            canChangeFiles && downloadStoragePath.trim()
              ? { downloadStoragePath, fileName, releaseNotes }
              : undefined,
          canEditDetails: canEdit,
          canEditPrice: canChangePrice,
          canEditFiles: canChangeFiles,
        });
        showToast(`Saved updates to "${name}".`, 'success');
        resetForm();
        onSwitchToList();
      } else {
        if (!downloadStoragePath.trim()) {
          showToast('Provide a protected download URL or upload a package file.', 'error');
          setSaving(false);
          return;
        }
        await createAppListing({
          actor: user,
          name,
          iconUrl,
          iconKey,
          category,
          version,
          fileSize,
          description,
          features,
          pricePkr: Number(pricePkr) || 0,
          isFeatured,
          isPublished,
          downloadStoragePath,
          fileName: fileName || `${name.toLowerCase().replace(/\s+/g, '-')}-${version}.txt`,
          releaseNotes,
        });
        showToast(`Created "${name}" in database.`, 'success');
        resetForm();
        onSwitchToList();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save app.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (app: AppListing) => {
    const confirmed = await confirmAction({
      title: `Delete "${app.name}"?`,
      description:
        'This permanently deletes the app listing and its protected download file record from the database. Existing order history remains intact.',
      confirmLabel: 'Delete Permanently',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await deleteAppListing(user, app);
      showToast(`Deleted "${app.name}".`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const showForm = mode === 'add' || editingApp !== null;

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">
              {editingApp ? `Edit App: ${editingApp.name}` : 'Add New Software Listing'}
            </h1>
            <p className="mt-1 text-xs text-[#9BA3B8]">
              Changes save directly to Firestore and update the public storefront immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetForm();
              onSwitchToList();
            }}
            className="rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-white hover:bg-white/5"
          >
            Back to Apps
          </button>
        </div>

        <form
          onSubmit={handleFormSubmit}
          className="grid gap-6 rounded-2xl border border-white/10 bg-[#12131A] p-6 lg:grid-cols-2"
        >
          <div>
            <label className="block text-xs font-semibold text-[#9BA3B8]">App Name *</label>
            <input
              type="text"
              required
              disabled={Boolean(editingApp) && !canEdit}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CapCut Pro"
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white focus:border-[#00F3FF] focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA3B8]">Category *</label>
            <select
              disabled={Boolean(editingApp) && !canEdit}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white focus:border-[#00F3FF] focus:outline-none disabled:opacity-50"
            >
              {Array.from(new Set([...categories, category])).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">Version *</label>
              <input
                type="text"
                required
                disabled={Boolean(editingApp) && !canEdit}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="v1.0.0"
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2.5 font-mono-tabular text-sm text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">File Size *</label>
              <input
                type="text"
                required
                disabled={Boolean(editingApp) && !canEdit}
                value={fileSize}
                onChange={(e) => setFileSize(e.target.value)}
                placeholder="88 MB"
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2.5 font-mono-tabular text-sm text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#9BA3B8]">
                Price (PKR) *
              </label>
              <input
                type="number"
                required
                min={0}
                disabled={!canChangePrice}
                value={pricePkr}
                onChange={(e) => setPricePkr(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2.5 font-mono-tabular text-sm text-white disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA3B8]">
              Icon URL, Built-in Emblem, or Upload
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="text"
                disabled={Boolean(editingApp) && !canEdit}
                value={iconUrl}
                onChange={(e) => setIconUrl(e.target.value)}
                placeholder="https://... or upload icon"
                className="flex-1 rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2.5 text-xs text-white disabled:opacity-50"
              />
              <label className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-medium text-white hover:border-[#00F3FF]/50">
                <Upload className="inline h-3.5 w-3.5 mr-1" />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  disabled={Boolean(editingApp) && !canEdit}
                  onChange={handleIconUpload}
                  className="hidden"
                />
              </label>
            </div>
            <select
              disabled={Boolean(editingApp) && !canEdit}
              value={iconKey}
              onChange={(e) => setIconKey(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-[#9BA3B8]"
            >
              {BUILTIN_ICON_KEYS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-[#9BA3B8]">Description *</label>
            <textarea
              required
              rows={3}
              disabled={Boolean(editingApp) && !canEdit}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description shown on the marketplace card..."
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] p-3 text-sm text-white disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9BA3B8]">
              Features (one per line)
            </label>
            <textarea
              rows={4}
              disabled={Boolean(editingApp) && !canEdit}
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              placeholder={'4K export presets\nOffline audio guide\nCross-device sync'}
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] p-3 text-xs text-white disabled:opacity-50"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-[#9BA3B8]">
              Protected Download File / Delivery URL {!editingApp && '*'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                disabled={!canChangeFiles && Boolean(editingApp)}
                value={downloadStoragePath}
                onChange={(e) => setDownloadStoragePath(e.target.value)}
                placeholder="https://... or upload package (<= 380 KB)"
                className="flex-1 rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2.5 text-xs text-white disabled:opacity-50"
              />
              <label className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-medium text-white hover:border-[#00F3FF]/50">
                <Upload className="inline h-3.5 w-3.5 mr-1" />
                File
                <input
                  type="file"
                  disabled={!canChangeFiles && Boolean(editingApp)}
                  onChange={handlePackageUpload}
                  className="hidden"
                />
              </label>
            </div>
            <input
              type="text"
              disabled={!canChangeFiles && Boolean(editingApp)}
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Download filename (e.g. CapCut-Pro-v12.8.0.zip)"
              className="w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white disabled:opacity-50"
            />
            <input
              type="text"
              disabled={!canChangeFiles && Boolean(editingApp)}
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              placeholder="Optional release notes / setup instructions"
              className="w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white disabled:opacity-50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-6 lg:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                disabled={Boolean(editingApp) && !canEdit}
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 accent-[#00F3FF]"
              />
              Published on Storefront
            </label>

            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                disabled={Boolean(editingApp) && !canEdit}
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="h-4 w-4 accent-[#BC13FE]"
              />
              Featured App
            </label>
          </div>

          <div className="flex justify-end gap-3 border-t border-white/10 pt-4 lg:col-span-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onSwitchToList();
              }}
              className="rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-[#9BA3B8] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#00F3FF] px-6 py-2.5 text-xs font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingApp ? 'Save App Changes' : 'Create App Listing'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Filter & paginate list
  const filtered = apps.filter((a) => {
    const matchCat = catFilter === 'All' || a.category === catFilter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || a.name.toLowerCase().includes(q) || a.version.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Manage Applications</h1>
          <p className="mt-1 text-xs text-[#9BA3B8]">
            {apps.length} total listings stored in Firestore
          </p>
        </div>

        {canAdd && (
          <button
            type="button"
            onClick={onSwitchToAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-[#00F3FF] px-4 py-2.5 text-xs font-semibold text-[#0A0A0F] hover:bg-[#33F6FF]"
          >
            <Plus className="h-4 w-4" />
            Add App
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA3B8]" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search apps..."
            className="w-full rounded-lg border border-white/10 bg-[#12131A] py-2 pl-9 pr-3 text-xs text-white focus:border-[#00F3FF] focus:outline-none"
          />
        </div>

        <select
          value={catFilter}
          onChange={(e) => {
            setCatFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-[#12131A] px-3 py-2 text-xs text-white"
        >
          {['All', ...categories].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Data Table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#12131A]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-[#9BA3B8]">
                <th className="px-4 py-3 font-medium">App</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[#9BA3B8]">
                    No applications match your filter.
                  </td>
                </tr>
              ) : (
                paged.map((app) => (
                  <tr key={app.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <AppIconRenderer
                          name={app.name}
                          iconUrl={app.iconUrl}
                          iconKey={app.iconKey}
                          size="sm"
                        />
                        <span className="font-semibold text-white">{app.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#9BA3B8]">{app.category}</td>
                    <td className="px-4 py-3 font-mono-tabular text-white">{app.version}</td>
                    <td className="px-4 py-3 font-mono-tabular text-[#9BA3B8]">
                      {app.fileSize}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#00F3FF]">
                      Rs. {app.pricePkr.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          app.isPublished ? 'text-[#39FF14]' : 'text-[#9BA3B8]'
                        }`}
                      >
                        {app.isPublished ? 'Published' : 'Draft'}
                      </span>
                      {app.isFeatured && (
                        <span className="ml-2 text-[#BC13FE]">· Featured</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              title={app.isFeatured ? 'Unfeature' : 'Feature'}
                              onClick={() =>
                                toggleAppFlag(user, app, 'isFeatured', !app.isFeatured)
                              }
                              className={`rounded-lg p-1.5 hover:bg-white/10 ${
                                app.isFeatured ? 'text-[#BC13FE]' : 'text-[#9BA3B8]'
                              }`}
                            >
                              <Star className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title={app.isPublished ? 'Unpublish' : 'Publish'}
                              onClick={() =>
                                toggleAppFlag(user, app, 'isPublished', !app.isPublished)
                              }
                              className="rounded-lg p-1.5 text-[#9BA3B8] hover:bg-white/10 hover:text-white"
                            >
                              {app.isPublished ? (
                                <Eye className="h-4 w-4 text-[#39FF14]" />
                              ) : (
                                <EyeOff className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        )}
                        {(canEdit || canChangePrice || canChangeFiles) && (
                          <button
                            type="button"
                            title="Edit app"
                            onClick={() => void startEdit(app)}
                            className="rounded-lg p-1.5 text-[#00F3FF] hover:bg-white/10"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            title="Delete app"
                            onClick={() => void handleDelete(app)}
                            className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-[#9BA3B8]">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-white/15 px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-white/15 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
