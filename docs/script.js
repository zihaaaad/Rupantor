// Initialize Lucide icons
lucide.createIcons();

// GitHub Repo details
const REPO_OWNER = 'zihaaaad';
const REPO_NAME = 'Rupantor';
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

// Elements
const winBtn = document.getElementById('win-download');
const macBtn = document.getElementById('mac-download');
const winMeta = document.getElementById('win-meta');
const macMeta = document.getElementById('mac-meta');
const versionBadge = document.getElementById('version-badge');

async function fetchLatestRelease() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch release info');
        
        const data = await response.json();
        const version = data.tag_name;
        
        let winSetupUrl = '';
        let macDmgUrl = '';
        
        // Find correct assets
        data.assets.forEach(asset => {
            // We want the Setup.exe itself, not Portable or the .exe.blockmap
            // sidecar electron-builder publishes alongside it — .includes()
            // matches both, and since the blockmap is listed after the real
            // installer it would win and overwrite winSetupUrl.
            if (asset.name.endsWith('Setup.exe')) {
                winSetupUrl = asset.browser_download_url;
            }
            if (asset.name.endsWith('.dmg')) {
                macDmgUrl = asset.browser_download_url;
            }
        });

        // Update UI
        if (winSetupUrl) {
            winBtn.href = winSetupUrl;
            winBtn.classList.remove('disabled');
            winMeta.textContent = `${version} • 64-bit`;
        } else {
            winMeta.textContent = 'Windows build unavailable';
        }

        if (macDmgUrl) {
            macBtn.href = macDmgUrl;
            macBtn.classList.remove('disabled');
            // Only an arm64 .dmg is currently published (see build.yml) — Intel
            // Macs need Rosetta. Don't claim "Universal" until an x64/universal
            // build is actually published, or Intel users get a binary that
            // doesn't run natively despite being told it does.
            macMeta.textContent = `${version} • Apple Silicon`;
        } else {
            macMeta.textContent = 'Mac build unavailable';
        }

        if (versionBadge) {
            versionBadge.textContent = `${version} Available Now`;
        }

    } catch (error) {
        console.error('Error fetching release:', error);
        winMeta.textContent = 'Check GitHub for downloads';
        macMeta.textContent = 'Check GitHub for downloads';
        winBtn.href = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
        macBtn.href = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
        winBtn.classList.remove('disabled');
        macBtn.classList.remove('disabled');
    }
}

// Execute
fetchLatestRelease();
