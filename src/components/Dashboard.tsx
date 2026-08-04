import { SearchX } from 'lucide-react';

interface DashboardProps {
  filteredFeatures: any[];
  switchTab: (tab: string) => void;
}

export function Dashboard({ filteredFeatures, switchTab }: DashboardProps) {
  const available = filteredFeatures.filter(f => !f.isComingSoon);
  const comingSoon = filteredFeatures.filter(f => f.isComingSoon);

  const renderCard = (feature: any, idx: number) => (
    <div
      key={idx}
      role="button"
      tabIndex={feature.isComingSoon ? -1 : 0}
      aria-disabled={feature.isComingSoon}
      className={`bento-card ${feature.isComingSoon ? 'coming-soon' : ''}`}
      onClick={() => !feature.isComingSoon && switchTab(feature.id)}
      onKeyDown={(e) => {
        if (!feature.isComingSoon && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          switchTab(feature.id);
        }
      }}
      style={{ cursor: feature.isComingSoon ? 'not-allowed' : 'pointer' }}
    >
      {feature.isComingSoon && <span className="badge">Coming Soon</span>}
      <div className="bento-icon">{feature.icon}</div>
      <div className="bento-title">{feature.title}</div>
      <div className="bento-desc">{feature.desc}</div>
    </div>
  );

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Welcome to Rupantor</h1>
        <p>Your central command for creative assets and workflows.</p>
      </div>
      {filteredFeatures.length === 0 ? (
        <div className="empty-state">
          <SearchX size={48} className="empty-icon" />
          <h3>No features found</h3>
        </div>
      ) : (
        <>
          {available.length > 0 && (
            <div className="bento-grid">
              {available.map(renderCard)}
            </div>
          )}
          {comingSoon.length > 0 && (
            <>
              <div className="section-label">On the Roadmap</div>
              <div className="bento-grid">
                {comingSoon.map(renderCard)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
