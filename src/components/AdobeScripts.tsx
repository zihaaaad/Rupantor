import { useState, useRef, useEffect } from 'react';
import { FileCode, Play, X, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import type { ScriptObj } from '../types';

interface AdobeScriptsProps {
  scripts: ScriptObj[];
  setScripts: React.Dispatch<React.SetStateAction<ScriptObj[]>>;
}

export function AdobeScripts({ scripts, setScripts }: AdobeScriptsProps) {
  const [viewingScript, setViewingScript] = useState<ScriptObj | null>(null);
  const [codeContent, setCodeContent] = useState('');
  const [readFailed, setReadFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewingScript(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRun = async (e: React.MouseEvent, script: ScriptObj) => {
    e.stopPropagation();
    toast.loading(`Sending to ${script.targetApp}...`, { id: 'run' });
    const res = await window.electronAPI.executeScript(script.path, script.targetApp);
    if (res.success) toast.success(res.message, { id: 'run' });
    else toast.error(res.message, { id: 'run' });
  };

  const handleView = async (script: ScriptObj) => {
    setViewingScript(script);
    setReadFailed(false);
    try {
      const content = await window.electronAPI.readFile(script.path);
      setCodeContent(content);
    } catch {
      setReadFailed(true);
      setCodeContent('// Could not read this file — it may have been moved or deleted:\n// ' + script.path);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const scriptToDelete = scripts.find(s => s.id === id);
    if (scriptToDelete) {
      await window.electronAPI.deleteFromVault(scriptToDelete.path);
    }
    setScripts(prev => prev.filter(s => s.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newScripts: ScriptObj[] = [];
      let dupCount = 0;

      for (const file of Array.from(files)) {
        const isDup = scripts.some(s => s.name === file.name) || newScripts.some(s => s.name === file.name);
        if (isDup) { dupCount++; continue; }

        const nativePath = window.electronAPI.pathForFile(file);
        let targetApp: ScriptObj['targetApp'] = 'Photoshop';
        const nameLower = file.name.toLowerCase();
        if (nameLower.includes('ae') || nameLower.includes('aftereffects')) targetApp = 'After Effects';
        else if (nameLower.includes('ai') || nameLower.includes('illustrator')) targetApp = 'Illustrator';

        let vaultPath = nativePath;
        if (nativePath) {
          vaultPath = await window.electronAPI.copyToVault(nativePath);
        }

        newScripts.push({
          id: `${file.name}-${Date.now()}`,
          name: file.name,
          path: vaultPath,
          targetApp
        });
      }

      if (newScripts.length > 0) setScripts(prev => [...newScripts, ...prev]);
      if (dupCount > 0) toast.info(`${dupCount} duplicate script(s) ignored`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', color: '#fff' }}>Adobe JSX Scripts</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Store and instantly execute ExtendScript automation.</p>
        </div>
        <input type="file" accept=".jsx" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileUpload} multiple />
        <button className="add-asset-btn" onClick={() => fileInputRef.current?.click()} style={{ margin: 0 }}>
          <UploadCloud size={18} /> Import JSX
        </button>
      </div>

      <div className="bento-grid">
        {scripts.length === 0 ? (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            <FileCode size={48} className="empty-icon" />
            <h3>No scripts found</h3>
            <p>Import .jsx files to start automating your workflows.</p>
          </div>
        ) : scripts.map(s => (
          <div
            className="bento-card"
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => handleView(s)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleView(s); } }}
            style={{ cursor: 'pointer' }}
          >
            <FileCode size={32} style={{ color: 'var(--accent-blue)', marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.1rem' }}>{s.name}</h3>
            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>{s.targetApp}</span>

            <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
              <button className="btn-secondary" style={{ flex: 1, background: 'var(--accent-blue)', color: '#fff', border: 'none' }} onClick={(e) => handleRun(e, s)}>
                <Play size={14} fill="#fff" /> Run
              </button>
              <button className="icon-btn" aria-label={`Delete ${s.name}`} onClick={(e) => handleDelete(e, s.id)}><X size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {viewingScript && (
        <div className="modal-overlay" onClick={() => setViewingScript(null)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><h2 className="modal-title">{viewingScript.name}</h2></div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-secondary" style={{ padding: '6px 12px' }} disabled={readFailed} onClick={async () => {
                  toast.loading('Saving script...', { id: 'save' });
                  const res = await window.electronAPI.writeFile(viewingScript.path, codeContent);
                  if (res.success) toast.success('Script saved successfully!', { id: 'save' });
                  else toast.error('Failed to save script', { id: 'save' });
                }}>Save</button>
                <button className="modal-close" aria-label="Close" onClick={() => setViewingScript(null)}><X size={20} /></button>
              </div>
            </div>
            <div className="modal-body scrollable" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <textarea 
                value={codeContent}
                onChange={e => setCodeContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const target = e.target as HTMLTextAreaElement;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    const newValue = codeContent.substring(0, start) + '  ' + codeContent.substring(end);
                    setCodeContent(newValue);
                    setTimeout(() => {
                      target.selectionStart = target.selectionEnd = start + 2;
                    }, 0);
                  }
                }}
                spellCheck={false}
                style={{ 
                  flex: 1, background: '#111', color: '#0f0', fontFamily: 'monospace', 
                  fontSize: '0.85rem', padding: '16px', border: 'none', resize: 'none',
                  outline: 'none', width: '100%', height: '100%', lineHeight: '1.5'
                }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
