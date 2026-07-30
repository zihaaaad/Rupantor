import { X } from 'lucide-react';

interface SettingsModalProps {
  setIsSettingsOpen: (val: boolean) => void;
  previewText: string;
  setPreviewText: (val: string) => void;
}

export function SettingsModal({ setIsSettingsOpen, previewText, setPreviewText }: SettingsModalProps) {
  return (
    <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><h2 className="modal-title">Preferences</h2><p className="modal-subtitle">Configure your workspace</p></div>
          <button className="modal-close" onClick={() => setIsSettingsOpen(false)}><X size={20} /></button>
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
        </div>
        <div className="modal-footer"><button className="btn-secondary" onClick={() => setIsSettingsOpen(false)}>Done</button></div>
      </div>
    </div>
  );
}
