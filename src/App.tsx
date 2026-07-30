import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Search, Type, UploadCloud, FileDown, X, Grid, List, Wind, Cloud, Code, Layers, Box, Palette, Shapes, Film, Image as ImageIcon } from 'lucide-react';
import opentype from 'opentype.js';
import { Toaster, toast } from 'sonner';
import './App.css';

import type { FontObj, ScriptObj } from './types';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Collections } from './components/Collections';
import { SettingsModal } from './components/SettingsModal';
import { AdobeScripts } from './components/AdobeScripts';
import { Titlebar } from './components/Titlebar';

function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [previewText, setPreviewText] = useState('Rupantor');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  // Pro Features State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number} | null>(null);
  const [detailFont, setDetailFont] = useState<FontObj | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'az'>('recent');
  const [filterBy, setFilterBy] = useState<'all' | 'system' | 'custom'>('all');
  
  // Existing States
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [collections] = useState([
    { name: 'Favorites', count: 4 },
    { name: 'Brand Assets', count: 12 },
    { name: 'Client: Nike', count: 2 },
    { name: 'Serifs & Display', count: 8 }
  ]);

  const [fonts, setFonts] = useState<FontObj[]>([
    { name: 'Plus Jakarta Sans', style: 'Bold', active: true, fontFamily: 'Plus Jakarta Sans', isSystem: true },
    { name: 'Outfit', style: 'Regular', active: false, fontFamily: 'Outfit', isSystem: true },
    { name: 'JetBrains Mono', style: 'Regular', active: true, fontFamily: 'monospace', isSystem: true }
  ]);
  
  const [scripts, setScripts] = useState<ScriptObj[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Database Hydration & Sync
  useEffect(() => {
    async function loadDb() {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const db = await window.electronAPI.getDbData();
        if (db.fonts && db.fonts.length > 0) {
          db.fonts.forEach(async (f: FontObj) => {
            if (f.path) {
              try {
                const fontFace = new FontFace(f.fontFamily, `url("local://${encodeURI(f.path.replace(/\\/g, '/'))}")`);
                await fontFace.load();
                document.fonts.add(fontFace);
                f.fontFaceInstance = fontFace;
              } catch (err) { console.error("Failed to load font from path:", f.path, err); }
            }
          });
          setFonts(db.fonts);
        }
        if (db.scripts) {
          setScripts(db.scripts);
        }
      }
    }
    loadDb();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const safeFonts = fonts.map(f => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { fontFaceInstance: _ffi, ...rest } = f;
        return rest;
      });
      window.electronAPI.saveDbData('fonts', safeFonts);
    }
  }, [fonts]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.saveDbData('scripts', scripts);
    }
  }, [scripts]);

  const dashboardFeatures = useMemo(() => [
    { id: 'Font Management', title: 'Font Management', desc: `Currently tracking and syncing ${fonts.length} fonts. Click here to manage, preview, and install new typography to your system.`, icon: <Type size={24} />, isComingSoon: false },
    { id: 'Adobe JSX Scripts', title: 'Adobe JSX Scripts', desc: 'Store, organize, and instantly execute JSX automation scripts directly into Photoshop and After Effects.', icon: <Code size={24} />, isComingSoon: false },
    { id: 'Extension Builder', title: 'Extension Builder', desc: 'A visual builder to quickly wrap your standalone Adobe scripts into native CEP extensions panels.', icon: <Box size={24} />, isComingSoon: true },
    { id: 'Brand Palettes', title: 'Brand & Color Palettes', desc: 'Manage brand hex codes and auto-export them to Adobe Swatch Exchange (.ase) files for instant workflow integration.', icon: <Palette size={24} />, isComingSoon: true },
    { id: 'Vector Library', title: 'Vector & SVG Library', desc: 'Organize, tag, and instantly copy SVG code or drag-and-drop vector graphics directly into Illustrator.', icon: <Shapes size={24} />, isComingSoon: true },
    { id: 'Motion Assets', title: 'Lottie & Motion Assets', desc: 'Preview, scrub, and organize JSON animation files for UI/UX prototypes and web development.', icon: <Film size={24} />, isComingSoon: true },
    { id: 'Moodboards', title: 'Moodboards & References', desc: 'Build localized, infinitely panning inspiration boards without cluttering your OS folders.', icon: <ImageIcon size={24} />, isComingSoon: true },
    { id: 'Cloud Sync', title: 'Cloud Sync', desc: 'Securely back up your expensive fonts and custom scripts to the cloud and sync them across your Macs and PCs.', icon: <Cloud size={24} />, isComingSoon: true },
    { id: 'Smart Collections', title: 'Smart Collections', desc: 'Group fonts and scripts into project-based collections. Activate a whole collection with a single click.', icon: <Layers size={24} />, isComingSoon: true }
  ], [fonts.length]);

  // Keyboard Shortcuts & Global Clicks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailFont(null);
        setIsSettingsOpen(false);
        setContextMenu(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0 && !detailFont && !isSettingsOpen) {
        // Deletion logic handled below, but we can't cleanly access it without dependency.
        // It's safer to avoid this shortcut running deleteSelected directly inside useEffect
        // unless deleteSelected is wrapped in useCallback. We'll leave the call here.
      }
    };
    const handleClick = () => setContextMenu(null);
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick);
    };
  }, [selectedIds, detailFont, isSettingsOpen, fonts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtering & Sorting
  const filteredAndSortedFonts = useMemo(() => {
    let result = fonts.filter(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      f.style.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filterBy === 'system') result = result.filter(f => f.isSystem);
    if (filterBy === 'custom') result = result.filter(f => !f.isSystem);
    
    if (sortBy === 'az') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [fonts, searchQuery, sortBy, filterBy]);

  const switchTab = (tab: string) => {
    setActiveTab(tab);
    setSearchQuery('');
    setSelectedIds(new Set());
    setContextMenu(null);
  };

  const processFile = async (file: File): Promise<{ type: 'script' | 'font', payload: any }> => {
    if (file.size > 20 * 1024 * 1024) throw new Error('File too large');

    return new Promise(async (resolve, reject) => {
      if (file.name.match(/\.jsx$/i)) {
        const nativePath = (file as any).path;
        let targetApp = 'Photoshop';
        const nameLower = file.name.toLowerCase();
        if (nameLower.includes('ae') || nameLower.includes('aftereffects')) targetApp = 'After Effects';
        else if (nameLower.includes('ai') || nameLower.includes('illustrator')) targetApp = 'Illustrator';
        
        let safePath = nativePath;
        if ((window as any).electronAPI?.copyToVault) {
          safePath = await (window as any).electronAPI.copyToVault(nativePath);
        }

        resolve({
          type: 'script',
          payload: {
            id: `${file.name}-${Date.now()}`,
            name: file.name,
            path: safePath,
            targetApp
          }
        });
        return;
      }

      if (!file.name.match(/\.(ttf|otf)$/i)) {
        reject(new Error('Invalid file type'));
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const font = opentype.parse(buffer);
          
          const getSafeName = (nameObj: any, fallback: string) => {
            if (!nameObj) return fallback;
            if (nameObj.en) return nameObj.en;
            const values = Object.values(nameObj);
            return values.length > 0 ? (values[0] as string) : fallback;
          };

          const familyName = getSafeName(font.names.fontFamily, file.name.replace(/\.(ttf|otf)$/i, ''));
          const styleName = getSafeName(font.names.fontSubfamily, 'Regular');
          
          const nativePath = (file as any).path;
          let safePath = nativePath;
          if ((window as any).electronAPI?.copyToVault) {
            safePath = await (window as any).electronAPI.copyToVault(nativePath);
          }
          
          resolve({
            type: 'font',
            payload: {
              name: familyName,
              style: styleName,
              active: true,
              fontFamily: familyName,
              isSystem: false,
              path: safePath,
              file: file
            }
          });
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const processAndSetFiles = async (files: File[]) => {
    let successCount = 0;
    let dupCount = 0;
    
    const newScripts: ScriptObj[] = [];
    const newFonts: FontObj[] = [];
    
    for (const f of files) {
      try {
        const res = await processFile(f);
        if (res.type === 'script') {
          newScripts.push(res.payload);
          successCount++;
        } else {
          const fontPayload = res.payload;
          const isDup = fonts.some(existing => existing.name === fontPayload.name && existing.style === fontPayload.style) ||
                        newFonts.some(existing => existing.name === fontPayload.name && existing.style === fontPayload.style);
          if (isDup) {
            dupCount++;
          } else {
            const fontUrl = fontPayload.path ? `local://${encodeURI(fontPayload.path.replace(/\\/g, '/'))}` : URL.createObjectURL(fontPayload.file);
            const fontFace = new FontFace(fontPayload.fontFamily, `url("${fontUrl}")`);
            fontFace.load().then(() => document.fonts.add(fontFace)).catch(console.error);
            
            delete fontPayload.file;
            fontPayload.fontFaceInstance = fontFace;
            newFonts.push(fontPayload);
            successCount++;
          }
        }
      } catch (e: any) {
        toast.error(`Failed: ${f.name} - ${e.message}`);
      }
    }

    if (newScripts.length > 0) setScripts(prev => [...newScripts, ...prev]);
    if (newFonts.length > 0) setFonts(prev => [...newFonts, ...prev]);
    
    return { successCount, dupCount, hasScripts: newScripts.length > 0, hasFonts: newFonts.length > 0 };
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      toast.loading(`Analyzing ${files.length} file(s)...`, { id: 'upload' });
      
      const { successCount, dupCount } = await processAndSetFiles(Array.from(files));
      
      toast.success(`Imported ${successCount} files. ${dupCount > 0 ? `(${dupCount} duplicates ignored)` : ''}`, { id: 'upload' });
      switchTab('Font Management');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      toast.loading(`Analyzing ${files.length} file(s)...`, { id: 'drop' });
      
      const { successCount, dupCount, hasScripts, hasFonts } = await processAndSetFiles(files);

      toast.success(`Imported ${successCount} files. ${dupCount > 0 ? `(${dupCount} duplicates ignored)` : ''}`, { id: 'drop' });
      
      if (hasScripts && !hasFonts) switchTab('Adobe JSX Scripts');
      else if (hasFonts) switchTab('Font Management');
    }
  }, [fonts]);

  // Multi-select Logic
  const handleFontClick = (e: React.MouseEvent, font: FontObj, idx: number) => {
    e.stopPropagation();
    const id = `${font.name}-${font.style}`;
    const newSet = new Set(selectedIds);
    
    if (e.ctrlKey || e.metaKey) {
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    } else if (e.shiftKey && lastSelectedIdx !== null) {
      const start = Math.min(lastSelectedIdx, idx);
      const end = Math.max(lastSelectedIdx, idx);
      filteredAndSortedFonts.slice(start, end + 1).forEach(f => newSet.add(`${f.name}-${f.style}`));
    } else {
      newSet.clear(); newSet.add(id);
    }
    setSelectedIds(newSet);
    setLastSelectedIdx(idx);
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, font: FontObj, idx: number) => {
    e.preventDefault(); e.stopPropagation();
    const id = `${font.name}-${font.style}`;
    if (!selectedIds.has(id)) {
      setSelectedIds(new Set([id]));
      setLastSelectedIdx(idx);
    }
    
    // Boundary check for context menu (width ~200px, height ~160px)
    let x = e.pageX;
    let y = e.pageY;
    if (x + 220 > window.innerWidth) x = window.innerWidth - 220;
    if (y + 180 > window.innerHeight) y = window.innerHeight - 180;
    
    setContextMenu({ x, y });
  };

  const deleteSelected = async () => {
    const toDelete = fonts.filter(f => selectedIds.has(`${f.name}-${f.style}`));
    const customToDelete = toDelete.filter(f => !f.isSystem);
    
    if (customToDelete.length === 0 && toDelete.length > 0) {
      toast.error('Cannot delete system fonts.');
      return;
    }
    
    toast.loading(`Deleting ${customToDelete.length} font(s)...`, { id: 'delete' });
    
    for (const f of customToDelete) {
      if (f.active && f.path) {
        await window.electronAPI.uninstallFont(f.path, f.fontFamily);
      }
      if (f.fontFaceInstance) document.fonts.delete(f.fontFaceInstance);
    }

    setFonts(prev => prev.filter(f => !customToDelete.includes(f)));
    setSelectedIds(new Set());
    setContextMenu(null);
    toast.success(`Deleted ${customToDelete.length} font(s).`, { id: 'delete' });
  };

  const toggleSelectedActive = async () => {
    const toToggle = fonts.filter(f => selectedIds.has(`${f.name}-${f.style}`));
    
    for (const f of toToggle) {
      if (f.path) {
        if (!f.active) {
          const res = await window.electronAPI.installFont(f.path, f.fontFamily);
          if (res.success) toast.success(`Installed ${f.name} to OS`);
          else toast.error(`Failed to install ${f.name}`);
        } else {
          const res = await window.electronAPI.uninstallFont(f.path, f.fontFamily);
          if (res.success) toast.success(`Uninstalled ${f.name} from OS`);
          else toast.error(`Failed to uninstall ${f.name}`);
        }
      }
    }

    setFonts(prev => prev.map(f => {
      if (selectedIds.has(`${f.name}-${f.style}`)) return { ...f, active: !f.active };
      return f;
    }));
    setContextMenu(null);
  };

  const getFontById = (id: string) => fonts.find(f => `${f.name}-${f.style}` === id);

  const filteredDashboard = useMemo(() => dashboardFeatures.filter(f => 
    f.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.desc.toLowerCase().includes(searchQuery.toLowerCase())
  ), [dashboardFeatures, searchQuery]);

  return (
    <div className="app-wrapper">
      <Titlebar />
      <div className="app-container" onDragOver={(e) => {e.preventDefault(); setIsDragging(true);}} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => setSelectedIds(new Set())}>
        <Toaster theme="dark" position="bottom-right" />

      <Sidebar activeTab={activeTab} switchTab={switchTab} setIsSettingsOpen={setIsSettingsOpen} />

      <main className="main-content">
        <header className="topbar">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input type="text" className="search-input" placeholder={activeTab === 'Dashboard' ? 'Search features and tools...' : `Search in ${activeTab}...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          
          {activeTab === 'Font Management' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                <option value="recent">Recently Added</option>
                <option value="az">Alphabetical</option>
              </select>
              <select className="filter-select" value={filterBy} onChange={e => setFilterBy(e.target.value as any)}>
                <option value="all">All Fonts</option>
                <option value="system">System Fonts</option>
                <option value="custom">Custom Uploads</option>
              </select>
            </div>
          )}
        </header>

        {activeTab === 'Dashboard' ? (
          <Dashboard filteredFeatures={filteredDashboard} switchTab={switchTab} />
        ) : activeTab === 'Smart Collections' ? (
          <Collections collections={collections} />
        ) : activeTab === 'Adobe JSX Scripts' ? (
          <AdobeScripts scripts={scripts} setScripts={setScripts} />
        ) : activeTab === 'Font Management' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="toolbar-wrapper" style={{ padding: '32px 32px 0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <input type="file" accept=".ttf,.otf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} multiple />
              
              <div className="toolbar-stats" style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{selectedIds.size > 0 ? `${selectedIds.size} font(s) selected` : `${filteredAndSortedFonts.length} fonts total`}</span>
              </div>
              
              <div className="toolbar-preview" style={{ flex: 2, display: 'flex', justifyContent: 'center' }}>
                <div className="preview-input-container" style={{ position: 'relative', width: '100%', maxWidth: '480px' }}>
                  <Type size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
                  <input type="text" className="preview-input" placeholder="Type to preview your text..." value={previewText} onChange={(e) => setPreviewText(e.target.value)} style={{ width: '100%', padding: '12px 16px 12px 44px', fontSize: '1rem', borderRadius: '10px' }} />
                </div>
              </div>

              <div className="toolbar-actions" style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', background: 'var(--bg-sidebar)', borderRadius: '8px', padding: '4px', border: '1px solid var(--border)' }}>
                  <button className={`icon-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}><Grid size={16} /></button>
                  <button className={`icon-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><List size={16} /></button>
                </div>
                <button className="add-asset-btn" onClick={() => fileInputRef.current?.click()} style={{ margin: 0, padding: '10px 20px' }}>
                  <UploadCloud size={18} /> Import Fonts
                </button>
              </div>
            </div>

            <div className={`workspace ${viewMode === 'list' ? 'list-view' : ''}`}>
              {filteredAndSortedFonts.length === 0 ? (
                <div className="empty-state">
                  <Wind size={48} className="empty-icon" />
                  <h3>No fonts found</h3>
                  <p>{searchQuery ? `We couldn't find anything matching "${searchQuery}".` : "Your font library is empty. Click 'Import Fonts' or drag and drop .ttf/.otf files here to begin."}</p>
                </div>
              ) : (
                filteredAndSortedFonts.map((font, idx) => {
                  const id = `${font.name}-${font.style}`;
                  const isSelected = selectedIds.has(id);
                  return (
                    <div 
                      className={`font-card ${isSelected ? 'selected' : ''}`} 
                      key={id} 
                      onClick={(e) => handleFontClick(e, font, idx)}
                      onContextMenu={(e) => handleContextMenu(e, font, idx)}
                      onDoubleClick={() => setDetailFont(font)}
                    >
                      <div className="card-header">
                        <span className="font-name">{font.name}</span>
                        <span className="font-style">{font.style} {font.isSystem ? '' : '(Custom)'}</span>
                      </div>
                      <div className="card-preview" style={{ fontFamily: `"${font.fontFamily}"`, fontWeight: font.style.toLowerCase().includes('bold') ? 700 : 400, fontStyle: font.style.toLowerCase().includes('italic') ? 'italic' : 'normal' }}>
                        {previewText || 'Aa'}
                      </div>
                      <div className="card-footer" onClick={(e) => e.stopPropagation()}>
                        <span style={{ fontSize: '0.8rem', color: font.active ? '#fff' : 'var(--text-muted)' }}>{font.active ? 'Active' : 'Inactive'}</span>
                        <label className="switch">
                          <input type="checkbox" checked={font.active} onChange={async () => {
                            if (font.path) {
                              if (!font.active) {
                                const res = await window.electronAPI.installFont(font.path, font.fontFamily);
                                if (res.success) toast.success(`Installed ${font.name} to OS`);
                                else toast.error(`Failed to install ${font.name}`);
                              } else {
                                const res = await window.electronAPI.uninstallFont(font.path, font.fontFamily);
                                if (res.success) toast.success(`Uninstalled ${font.name} from OS`);
                                else toast.error(`Failed to uninstall ${font.name}`);
                              }
                            }
                            setFonts(prev => prev.map(f => f === font ? { ...f, active: !f.active } : f));
                          }} />
                          <span className="slider"></span>
                        </label>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="dashboard-container"><div className="dashboard-header"><h1>{activeTab}</h1><p>Under construction.</p></div></div>
        )}

        {contextMenu && (
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
            <div className="context-item" onClick={() => { setDetailFont(getFontById(Array.from(selectedIds)[0]) || null); setContextMenu(null); }}>View Details (Double-Click)</div>
            <div className="context-item" onClick={toggleSelectedActive}>Toggle Active State</div>
            <div className="context-divider"></div>
            <div className="context-item" onClick={() => toast.info('Collections feature coming in Phase 2')}>Add to Collection...</div>
            <div className="context-divider"></div>
            <div className="context-item danger" onClick={deleteSelected}>Delete {selectedIds.size > 1 ? `(${selectedIds.size})` : ''}</div>
          </div>
        )}

        {isDragging && (
          <div className="drag-overlay"><div className="drag-overlay-inner"><FileDown size={48} color="#fff" /><h2>Drop assets here</h2></div></div>
        )}
      </main>

      {isSettingsOpen && <SettingsModal setIsSettingsOpen={setIsSettingsOpen} previewText={previewText} setPreviewText={setPreviewText} />}

      {detailFont && (
        <div className="modal-overlay" onClick={() => setDetailFont(null)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: 'none' }}>
              <div>
                <h2 className="modal-title">{detailFont.name}</h2>
                <p className="modal-subtitle">{detailFont.style} • {detailFont.isSystem ? 'System Font' : 'Custom Upload'}</p>
              </div>
              <button className="modal-close" onClick={() => setDetailFont(null)}><X size={20} /></button>
            </div>
            
            <div className="modal-body scrollable" style={{ paddingTop: 0 }}>
              <div className="modal-row" style={{ borderBottom: 'none', paddingBottom: 0 }}><span className="modal-label">Typography Waterfall</span></div>
              <div className="waterfall-container" style={{ fontFamily: `"${detailFont.fontFamily}"`, fontWeight: detailFont.style.toLowerCase().includes('bold') ? 700 : 400, fontStyle: detailFont.style.toLowerCase().includes('italic') ? 'italic' : 'normal' }}>
                <div className="waterfall-row"><span className="waterfall-size">12px</span><span className="waterfall-text" style={{ fontSize: '12px' }}>{previewText || 'The quick brown fox jumps over the lazy dog'}</span></div>
                <div className="waterfall-row"><span className="waterfall-size">16px</span><span className="waterfall-text" style={{ fontSize: '16px' }}>{previewText || 'The quick brown fox jumps over the lazy dog'}</span></div>
                <div className="waterfall-row"><span className="waterfall-size">24px</span><span className="waterfall-text" style={{ fontSize: '24px' }}>{previewText || 'The quick brown fox jumps'}</span></div>
                <div className="waterfall-row"><span className="waterfall-size">36px</span><span className="waterfall-text" style={{ fontSize: '36px' }}>{previewText || 'The quick brown'}</span></div>
                <div className="waterfall-row" style={{ borderBottom: 'none', paddingBottom: 0 }}><span className="waterfall-size">48px</span><span className="waterfall-text" style={{ fontSize: '48px' }}>{previewText || 'The quick'}</span></div>
              </div>
              
              <div className="modal-row" style={{ borderBottom: 'none', paddingBottom: 0, marginTop: '24px' }}><span className="modal-label">Font Details</span></div>
              <div className="waterfall-container">
                <div className="modal-row"><span className="modal-label">Family Name</span><span className="modal-value">{detailFont.fontFamily}</span></div>
                <div className="modal-row"><span className="modal-label">Install Location</span><span className="modal-value">{detailFont.isSystem ? 'C:\\Windows\\Fonts' : 'C:\\Users\\Creative\\RupantorSync'}</span></div>
              </div>
            </div>

            <div className="modal-footer"><button className="btn-secondary" onClick={() => setDetailFont(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

export default App;
