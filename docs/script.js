// Rupantor project site — release lookup + copy-to-clipboard helpers.

const REPO_OWNER = 'zihaaaad';
const REPO_NAME = 'Rupantor';
const RELEASES_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

// Lucide replaces each <i data-lucide> with an <svg>, so it has to run before
// anything measures or styles those icons. Both this file and the CDN script
// are deferred, and deferred scripts execute in document order — so lucide is
// already defined here.
lucide.createIcons();

/* ---------- Latest release ---------- */

const winBtn = document.getElementById('win-download');
const macBtn = document.getElementById('mac-download');
const winMeta = document.getElementById('win-meta');
const macMeta = document.getElementById('mac-meta');
const versionBadge = document.getElementById('version-badge');

async function loadLatestRelease() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`GitHub API responded ${response.status}`);

        const data = await response.json();
        const version = data.tag_name;

        let winSetupUrl = '';
        let macDmgUrl = '';

        for (const asset of data.assets) {
            // Match the installer exactly, not the .exe.blockmap sidecar
            // electron-builder publishes next to it — a substring match would
            // hit both, and the blockmap is listed last, so it would win.
            if (asset.name.endsWith('Setup.exe')) winSetupUrl = asset.browser_download_url;
            if (asset.name.endsWith('.dmg')) macDmgUrl = asset.browser_download_url;
        }

        if (winSetupUrl) {
            winBtn.href = winSetupUrl;
            winMeta.textContent = `${version} · Windows 10/11 · Free`;
        } else {
            winMeta.textContent = 'See all builds on GitHub';
        }

        if (macDmgUrl) {
            macBtn.href = macDmgUrl;
            // Only an arm64 .dmg is published today (see build.yml). Don't
            // advertise "Universal" until an x64 build actually ships, or
            // Intel users get a binary that needs Rosetta without warning.
            macMeta.textContent = `${version} · Apple Silicon · Free`;
        } else {
            macMeta.textContent = 'See all builds on GitHub';
        }

        if (versionBadge && version) {
            versionBadge.textContent = `${version} out now · Free & MIT licensed`;
        }
    } catch (error) {
        console.error('Could not load the latest release:', error);
        // The buttons already point at the releases page in the markup, so
        // a failure here degrades to "go pick a build yourself" rather than
        // leaving a dead control.
        winMeta.textContent = 'Browse releases on GitHub';
        macMeta.textContent = 'Browse releases on GitHub';
        winBtn.href = RELEASES_URL;
        macBtn.href = RELEASES_URL;
    }
}

loadLatestRelease();

/* ---------- Copy to clipboard ---------- */

const toast = document.getElementById('toast');
let toastTimer;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

async function copyText(text) {
    // navigator.clipboard needs a secure context; GitHub Pages is https, but
    // this also gets opened from a local file:// checkout, where it's absent.
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    document.execCommand('copy');
    document.body.removeChild(scratch);
}

for (const button of document.querySelectorAll('.copy-btn')) {
    button.addEventListener('click', async () => {
        const value = button.dataset.copy;
        const label = button.dataset.label || 'Value';
        try {
            await copyText(value);
            showToast(`${label} copied — ${value}`);
            button.classList.add('copied');
            setTimeout(() => button.classList.remove('copied'), 2000);
        } catch {
            showToast(`Copy blocked by your browser — ${value}`);
        }
    });
}
