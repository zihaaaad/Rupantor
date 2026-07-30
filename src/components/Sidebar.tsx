import { 
  LayoutDashboard, Type, Layers, Code, Box, Settings, 
  Palette, Shapes, Film, Image as ImageIcon 
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  switchTab: (tab: string) => void;
  setIsSettingsOpen: (val: boolean) => void;
}

export function Sidebar({ activeTab, switchTab, setIsSettingsOpen }: SidebarProps) {
  
  const renderNavGroup = (title: string, items: { icon: any, label: string }[]) => (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ 
        fontSize: '0.7rem', 
        fontWeight: 600, 
        color: 'var(--text-faint)', 
        textTransform: 'uppercase', 
        letterSpacing: '0.05em',
        padding: '0 14px',
        marginBottom: '8px'
      }}>
        {title}
      </div>
      {items.map((item, idx) => (
        <div 
          key={idx} 
          className={`nav-item ${activeTab === item.label ? 'active' : ''}`} 
          onClick={() => switchTab(item.label)}
        >
          {item.icon}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <aside className="sidebar" style={{ overflowY: 'auto' }}>
      <div className="sidebar-header" style={{ paddingBottom: '32px' }}>
        <img src="/logo.jpg" alt="Rupantor Logo" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover' }} />
        <span>Rupantor</span>
      </div>
      
      <nav className="sidebar-nav">
        {renderNavGroup('Overview', [
          { icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
          { icon: <Layers size={18} />, label: 'Smart Collections' }
        ])}

        {renderNavGroup('Asset Library', [
          { icon: <Type size={18} />, label: 'Font Management' },
          { icon: <Palette size={18} />, label: 'Brand Palettes' },
          { icon: <Shapes size={18} />, label: 'Vector Library' },
          { icon: <Film size={18} />, label: 'Motion Assets' }
        ])}

        {renderNavGroup('Creative Workflows', [
          { icon: <Code size={18} />, label: 'Adobe JSX Scripts' },
          { icon: <Box size={18} />, label: 'Extension Builder' },
          { icon: <ImageIcon size={18} />, label: 'Moodboards' }
        ])}
      </nav>

      <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="nav-item" onClick={() => setIsSettingsOpen(true)}>
          <Settings size={18} />
          <span>Settings</span>
        </div>
      </div>
    </aside>
  );
}
