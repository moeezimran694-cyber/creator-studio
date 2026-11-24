import React, { useEffect, useState } from 'react';
import { CreditCard, Save, Upload } from 'lucide-react';
import {
  AdminPermissionsMap,
  PaymentSetting,
  UserProfile,
} from '../../types/index.ts';
import { compressImageToDataUrl, savePaymentSetting } from '../../lib/db.ts';
import { useToast } from '../ToastContext.tsx';

interface AdminPaymentSettingsProps {
  user: UserProfile;
  permissions: AdminPermissionsMap;
  paymentSettings: PaymentSetting[];
}

export function AdminPaymentSettings({
  user,
  permissions,
  paymentSettings,
}: AdminPaymentSettingsProps) {
  const { showToast } = useToast();
  const isSuper = user.role === 'SUPER_ADMIN';
  const canEditEasypaisa = isSuper || permissions.payments_edit_easypaisa;
  const canEditJazzcash = isSuper || permissions.payments_edit_jazzcash;

  const [epState, setEpState] = useState({
    accountTitle: '',
    accountNumber: '',
    instructions: '',
    qrImagePath: '',
    isEnabled: true,
  });

  const [jcState, setJcState] = useState({
    accountTitle: '',
    accountNumber: '',
    instructions: '',
    qrImagePath: '',
    isEnabled: true,
  });

  const [savingMethod, setSavingMethod] = useState<'easypaisa' | 'jazzcash' | null>(null);

  useEffect(() => {
    const ep = paymentSettings.find((p) => p.id === 'easypaisa');
    if (ep) {
      setEpState({
        accountTitle: ep.accountTitle,
        accountNumber: ep.accountNumber,
        instructions: ep.instructions,
        qrImagePath: ep.qrImagePath || '',
        isEnabled: ep.isEnabled,
      });
    }
    const jc = paymentSettings.find((p) => p.id === 'jazzcash');
    if (jc) {
      setJcState({
        accountTitle: jc.accountTitle,
        accountNumber: jc.accountNumber,
        instructions: jc.instructions,
        qrImagePath: jc.qrImagePath || '',
        isEnabled: jc.isEnabled,
      });
    }
  }, [paymentSettings]);

  const handleQrUpload = async (
    file: File,
    setter: (dataUrl: string) => void
  ) => {
    try {
      const dataUrl = await compressImageToDataUrl(file, 512, 0.85);
      setter(dataUrl);
      showToast('QR code image uploaded.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'QR upload failed.', 'error');
    }
  };

  const handleSave = async (
    methodId: 'easypaisa' | 'jazzcash',
    state: typeof epState
  ) => {
    if (!state.accountTitle.trim() || !state.accountNumber.trim()) {
      showToast('Account title and account number are required.', 'error');
      return;
    }
    setSavingMethod(methodId);
    try {
      await savePaymentSetting({
        actor: user,
        methodId,
        ...state,
      });
      showToast(
        `${methodId === 'easypaisa' ? 'EasyPaisa' : 'JazzCash'} settings saved to database.`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSavingMethod(null);
    }
  };

  const renderCard = (
    methodId: 'easypaisa' | 'jazzcash',
    title: string,
    state: typeof epState,
    setState: React.Dispatch<React.SetStateAction<typeof epState>>,
    canEdit: boolean
  ) => (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-[#12131A] p-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <CreditCard className="h-5 w-5 text-[#00F3FF]" />
          <h2 className="font-display text-lg font-bold text-white">{title}</h2>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-white">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={state.isEnabled}
            onChange={(e) => setState((s) => ({ ...s, isEnabled: e.target.checked }))}
            className="h-4 w-4 accent-[#39FF14]"
          />
          Enabled in Checkout
        </label>
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#9BA3B8]">Account Title *</label>
        <input
          type="text"
          disabled={!canEdit}
          value={state.accountTitle}
          onChange={(e) => setState((s) => ({ ...s, accountTitle: e.target.value }))}
          className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 text-sm text-white disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#9BA3B8]">Account Number *</label>
        <input
          type="text"
          disabled={!canEdit}
          value={state.accountNumber}
          onChange={(e) => setState((s) => ({ ...s, accountNumber: e.target.value }))}
          className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] px-3.5 py-2.5 font-mono-tabular text-sm text-[#00F3FF] disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#9BA3B8]">Payment Instructions *</label>
        <textarea
          rows={3}
          disabled={!canEdit}
          value={state.instructions}
          onChange={(e) => setState((s) => ({ ...s, instructions: e.target.value }))}
          className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0A0A0F] p-3 text-xs text-white disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#9BA3B8]">Optional QR Image</label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="text"
            disabled={!canEdit}
            value={state.qrImagePath}
            onChange={(e) => setState((s) => ({ ...s, qrImagePath: e.target.value }))}
            placeholder="https://... or upload QR image"
            className="flex-1 rounded-lg border border-white/15 bg-[#0A0A0F] px-3 py-2 text-xs text-white disabled:opacity-50"
          />
          {canEdit && (
            <label className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white">
              <Upload className="inline h-3.5 w-3.5 mr-1" />
              QR
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    void handleQrUpload(f, (url) =>
                      setState((s) => ({ ...s, qrImagePath: url }))
                    );
                  }
                }}
              />
            </label>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        {canEdit ? (
          <button
            type="button"
            disabled={savingMethod === methodId}
            onClick={() => void handleSave(methodId, state)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#00F3FF] px-5 py-2 text-xs font-semibold text-[#0A0A0F] hover:bg-[#33F6FF] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {savingMethod === methodId ? 'Saving...' : `Save ${title}`}
          </button>
        ) : (
          <span className="text-xs text-[#9BA3B8]">Read-only (no edit permission)</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Payment Settings</h1>
        <p className="mt-1 text-xs text-[#9BA3B8]">
          Account details configured here are displayed dynamically inside the storefront Purchase modal.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {renderCard('easypaisa', 'EasyPaisa', epState, setEpState, canEditEasypaisa)}
        {renderCard('jazzcash', 'JazzCash', jcState, setJcState, canEditJazzcash)}
      </div>
    </div>
  );
}
