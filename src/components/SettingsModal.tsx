import { useEffect, useState } from 'react';
import { X, RefreshCw, MonitorX } from 'lucide-react';
import { toast } from 'sonner';
import type { LicenseStatus, LicensePlan } from '../types';

const PLAN_LABELS: Record<LicensePlan, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  lifetime: 'Lifetime',
};

interface SettingsModalProps {
  setIsSettingsOpen: (val: boolean) => void;
  previewText: string;
  setPreviewText: (val: string) => void;
  onDeviceDeactivated: () => void;
}

export function SettingsModal({ setIsSettingsOpen, previewText, setPreviewText, onDeviceDeactivated }: SettingsModalProps) {
  const [version, setVersion] = useState('');
  const [checking, setChecking] = useState(false);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(setVersion).catch(() => {});
    }
    if (typeof window !== 'undefined' && window.electronAPI?.getLicenseStatus) {
      window.electronAPI.getLicenseStatus().then(setLicense).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.onUpdateNotAvailable) return;
    const offNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
      setChecking(false);
      toast.success("You're on the latest version.", { id: 'manual-update-check' });
    });
    const offError = window.electronAPI.onUpdateError((message: string) => {
      setChecking(false);
      toast.error(`Update check failed: ${message}`, { id: 'manual-update-check' });
    });
    return () => { offNotAvailable(); offError(); };
  }, []);

  const handleCheckForUpdates = async () => {
    setChecking(true);
    toast.loading('Checking for updates...', { id: 'manual-update-check' });
    try {
      await window.electronAPI.checkForUpdates();
    } catch {
      setChecking(false);
      toast.error('Update check is unavailable in this build.', { id: 'manual-update-check' });
    }
  };

  const handleDeactivateDevice = async () => {
    if (!confirm("Deactivate this device? You'll need to re-enter your license key to use Rupantor here again.")) return;
    setDeactivating(true);
    try {
      const result = await window.electronAPI.deactivateDevice();
      if (result.ok) {
        toast.success('Device deactivated. Free to activate elsewhere.');
        onDeviceDeactivated();
      } else {
        toast.error(result.reason || 'Could not deactivate this device.');
      }
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><h2 className="modal-title">Preferences</h2><p className="modal-subtitle">Configure your workspace</p></div>
          <button className="modal-close" aria-label="Close" onClick={() => setIsSettingsOpen(false)}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="modal-label">Default Preview Text</span>
            <input
              type="text"
              className="settings-input"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="e.g. The quick brown fox..."
            />
          </div>

          <div className="modal-row" style={{ marginTop: '8px' }}>
            <div>
              <span className="modal-label">Version</span>
              <div className="modal-value" style={{ marginTop: '4px' }}>{version ? `v${version}` : '—'}</div>
            </div>
            <button className="btn-secondary" onClick={handleCheckForUpdates} disabled={checking}>
              <RefreshCw size={14} className={checking ? 'spin' : ''} /> Check for Updates
            </button>
          </div>

          {license && (
            <div className="modal-row">
              <div>
                <span className="modal-label">License</span>
                <div className="modal-value" style={{ marginTop: '4px' }}>
                  {license.valid && license.payload
                    ? `${PLAN_LABELS[license.payload.plan]} — ${license.payload.name}`
                    : 'Not activated'}
                </div>
                {license.valid && license.payload?.expiresAt && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Renews by {new Date(license.payload.expiresAt).toLocaleDateString()}
                  </div>
                )}
              </div>
              {license.valid && (
                <button className="btn-secondary" onClick={handleDeactivateDevice} disabled={deactivating}>
                  <MonitorX size={14} /> Deactivate This Device
                </button>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer"><button className="btn-secondary" onClick={() => setIsSettingsOpen(false)}>Done</button></div>
      </div>
    </div>
  );
}
