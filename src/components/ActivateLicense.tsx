import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { LicenseStatus } from '../types';

interface ActivateLicenseProps {
  onActivated: (status: LicenseStatus) => void;
  reason?: string;
}

export function ActivateLicense({ onActivated, reason }: ActivateLicenseProps) {
  const [key, setKey] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleActivate = async () => {
    if (!key.trim()) return;
    setSubmitting(true);
    try {
      const status = await window.electronAPI.activateLicense(key.trim());
      if (status.valid) {
        toast.success('License activated. Welcome to Rupantor!');
        onActivated(status);
      } else {
        toast.error(status.reason || 'Invalid license key.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="modal-content" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
          <div className="bento-icon" style={{ marginBottom: 0 }}><ShieldCheck size={24} /></div>
          <div>
            <h2 className="modal-title">Activate Rupantor</h2>
            <p className="modal-subtitle">{reason || 'Enter your license key to continue.'}</p>
          </div>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="modal-label">License Key</span>
            <input
              type="text"
              className="settings-input"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleActivate(); }}
              placeholder="Paste your license key here"
              spellCheck={false}
              style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </div>

          <div className="waterfall-container" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: '#fff' }}>Don't have a license yet?</strong>
            <p style={{ margin: '8px 0 0' }}>
              Send payment via bKash or Nagad to <strong style={{ color: '#fff' }}>01732109847</strong>, then send your transaction ID to the same number on <strong style={{ color: '#fff' }}>WhatsApp</strong> to receive your license key.
            </p>
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'stretch' }}>
          <button className="add-asset-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={handleActivate} disabled={submitting || !key.trim()}>
            <KeyRound size={16} /> {submitting ? 'Activating...' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}
