import { useState, useRef } from 'react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRun = async (e: React.MouseEvent, script: ScriptObj) => {
    e.stopPropagation();
    toast.loading(`Sending to ${script.targetApp}...`, { id: 'run' });
    const res = await (window as any).electronAPI.executeScript(script.path, script.targetApp);
    if (res.success) toast.success(res.message, { id: 'run' });
    else toast.error(res.message, { id: 'run' });
  };

  const handleView = async (script: ScriptObj) => {
    setViewingScript(script);
    try {
      const content = await (window as any).electronAPI.readFile(script.path);
      setCodeContent(content);
    } catch (e) {
      setCodeContent('// Error: File could not be read or does not exist at path:\n// ' + script.path);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setScripts(prev => prev.filter(s => s.id !== id));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newScripts = Array.from(files).map(file => {
        const nativePath = (file as any).path;
        return {
          id: `${file.name}-${Date.now()}`,
          name: file.name,
          path: nativePath,
          targetApp: 'Photoshop'
        } as ScriptObj;
      });
      setScripts(prev => [...newScripts, ...prev]);
    }
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
          <div className="bento-card" key={s.id} onClick={() => handleView(s)} style={{ cursor: 'pointer' }}>
            <FileCode size={32} style={{ color: 'var(--primary)', marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.1rem' }}>{s.name}</h3>
            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>{s.targetApp}</span>
            
            <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
              <button className="btn-secondary" style={{ flex: 1, background: 'var(--primary)', color: '#fff', border: 'none' }} onClick={(e) => handleRun(e, s)}>
                <Play size={14} fill="#fff" /> Run
              </button>
              <button className="icon-btn" onClick={(e) => handleDelete(e, s.id)}><X size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {viewingScript && (
        <div className="modal-overlay" onClick={() => setViewingScript(null)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><h2 className="modal-title">{viewingScript.name}</h2></div>
              <button className="modal-close" onClick={() => setViewingScript(null)}><X size={20} /></button>
            </div>
            <div className="modal-body scrollable">
              <pre style={{ background: '#111', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontSize: '0.85rem', color: '#0f0', fontFamily: 'monospace' }}>
                <code>{codeContent}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
