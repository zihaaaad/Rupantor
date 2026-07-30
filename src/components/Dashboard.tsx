import { SearchX } from 'lucide-react';

interface DashboardProps {
  filteredFeatures: any[];
  switchTab: (tab: string) => void;
  searchQuery: string;
}

export function Dashboard({ filteredFeatures, switchTab, searchQuery }: DashboardProps) {
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
        <div className="bento-grid">
          {filteredFeatures.map((feature, idx) => (
            <div 
              key={idx} 
              className={`bento-card ${feature.isComingSoon ? 'coming-soon' : ''}`} 
              onClick={() => !feature.isComingSoon && switchTab(feature.id)} 
              style={{ cursor: feature.isComingSoon ? 'not-allowed' : 'pointer' }}
            >
              {feature.isComingSoon && <span className="badge">Coming Soon</span>}
              <div className="bento-icon">{feature.icon}</div>
              <div className="bento-title">{feature.title}</div>
              <div className="bento-desc">{feature.desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
