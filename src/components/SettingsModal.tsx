import { useEffect, useState } from 'react';
import { X, RefreshCw, Heart, Code2 } from 'lucide-react';
import { toast } from 'sonner';

const SITE_URL = 'https://zihaaaad.github.io/Rupantor';
const REPO_URL = 'https://github.com/zihaaaad/Rupantor';

interface SettingsModalProps {
  setIsSettingsOpen: (val: boolean) => void;
  previewText: string;
  setPreviewText: (val: string) => void;
}

export function SettingsModal({ setIsSettingsOpen, previewText, setPreviewText }: SettingsModalProps) {
  const [version, setVersion] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(setVersion).catch(() => {});
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

          <div className="modal-row">
            <div>
              <span className="modal-label">Rupantor is free and open source</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '30ch' }}>
                Every feature, forever, at no cost. Donations keep it maintained.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <a className="btn-secondary" href={`${REPO_URL}`} target="_blank" rel="noreferrer">
                <Code2 size={14} /> Source
              </a>
              <a className="btn-secondary" href={`${SITE_URL}/#support`} target="_blank" rel="noreferrer">
                <Heart size={14} /> Support
              </a>
            </div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn-secondary" onClick={() => setIsSettingsOpen(false)}>Done</button></div>
      </div>
    </div>
  );
}
