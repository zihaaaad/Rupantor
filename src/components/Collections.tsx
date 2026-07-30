import { FolderPlus, Folder } from 'lucide-react';
import { toast } from 'sonner';

interface CollectionsProps {
  collections: { name: string; count: number }[];
}

export function Collections({ collections }: CollectionsProps) {
  return (
    <div className="dashboard-container">
      <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1>Smart Collections</h1><p>Organize your typography, scripts, and brand assets into project-based folders.</p></div>
        <button className="btn-secondary" onClick={() => toast.info('New Collection coming in Phase 2')}><FolderPlus size={16} /> New Collection</button>
      </div>
      <div className="bento-grid">
        {collections.map((col, idx) => (
          <div className="bento-card" key={idx} style={{ padding: '28px', cursor: 'pointer', alignItems: 'center', textAlign: 'center' }}>
            <Folder size={48} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 6px 0', fontFamily: 'var(--font-heading)', color: '#fff', fontSize: '1.25rem' }}>{col.name}</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{col.count} Items</p>
          </div>
        ))}
      </div>
    </div>
  );
}
