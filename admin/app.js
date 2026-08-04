import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, setDoc, updateDoc,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
// Same project as electron/firebaseLicense.ts — these are public/client-safe
// identifiers. Real security comes from firestore.rules + who can sign in.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAnUHW9GSEaxSkWYDVLFxwyL4LfZBN7y9o',
  authDomain: 'rupantorcrm.firebaseapp.com',
  projectId: 'rupantorcrm',
  storageBucket: 'rupantorcrm.firebasestorage.app',
  messagingSenderId: '68073937163',
  appId: '1:68073937163:web:8e6ea0578f9b4703cb6a0e',
};

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (sel) => document.querySelector(sel);
const PLAN_LABELS = { monthly: 'Monthly', yearly: 'Yearly', lifetime: 'Lifetime' };

// ---------- Auth ----------

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  $('#login-error').textContent = '';
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    $('#login-error').textContent = 'Login failed: ' + err.message;
  }
});

$('#google-login-btn').addEventListener('click', async () => {
  $('#login-error').textContent = '';
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    $('#login-error').textContent = 'Google sign-in failed: ' + err.message;
  }
});

$('#logout-btn').addEventListener('click', () => signOut(auth));

// Must match firestore.rules' isAdmin() check exactly. This client-side
// check only makes the UX clean (instant "access denied" instead of a
// half-broken dashboard full of permission errors) — the rules are what
// actually enforce this; anyone editing this file to bypass the check
// still can't read/write anything Firestore doesn't allow them to.
const ADMIN_EMAIL = 'zihad.connects@gmail.com';

onAuthStateChanged(auth, (user) => {
  if (user && user.email !== ADMIN_EMAIL) {
    $('#login-error').textContent = `Access denied: ${user.email} is not authorized for this panel.`;
    signOut(auth);
    return;
  }
  $('#login-screen').classList.toggle('hidden', !!user);
  $('#dashboard').classList.toggle('hidden', !user);
  if (user) {
    $('#admin-email').textContent = user.email;
    loadLicenses();
  }
});

// ---------- Data ----------

let allLicenses = [];

async function loadLicenses() {
  $('#license-table-body').innerHTML = `<tr><td colspan="7" class="muted">Loading...</td></tr>`;
  try {
    const q = query(collection(db, 'licenses'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    allLicenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable(allLicenses);
  } catch (err) {
    $('#license-table-body').innerHTML = `<tr><td colspan="7" class="error">Failed to load: ${err.message}</td></tr>`;
  }
}

function fmtDate(ms) {
  return ms ? new Date(ms).toLocaleDateString() : '—';
}

function renderTable(licenses) {
  const tbody = $('#license-table-body');
  if (licenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">No licenses yet. Create one above.</td></tr>`;
    return;
  }
  tbody.innerHTML = licenses.map(l => {
    const devices = l.activatedDevices || [];
    return `
      <tr data-id="${l.id}">
        <td>
          <div class="cell-primary">${escapeHtml(l.name || '')}</div>
          <div class="cell-secondary">${escapeHtml(l.email || '')}</div>
        </td>
        <td>${PLAN_LABELS[l.plan] || l.plan || 'Unknown'}</td>
        <td><span class="status-badge status-${l.status || 'unknown'}">${l.status || 'unknown'}</span></td>
        <td>${devices.length} / ${l.deviceLimit ?? '—'}</td>
        <td>${fmtDate(l.expiresAt)}</td>
        <td class="cell-secondary key-cell" title="${l.id}">${l.id}</td>
        <td class="actions-cell"></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr').forEach(row => {
    const id = row.dataset.id;
    const license = licenses.find(l => l.id === id);
    const actionsCell = row.querySelector('.actions-cell');

    const copyBtn = makeBtn('Copy Key', () => {
      navigator.clipboard.writeText(id);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy Key', 1200);
    });
    const detailBtn = makeBtn('Manage', () => openDetail(license));

    actionsCell.append(copyBtn, detailBtn);
  });
}

function makeBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'btn-small';
  btn.textContent = label;
  btn.onclick = onClick;
  return btn;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Search ----------

$('#search-input').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = !q ? allLicenses : allLicenses.filter(l =>
    (l.name || '').toLowerCase().includes(q) ||
    (l.email || '').toLowerCase().includes(q) ||
    l.id.toLowerCase().includes(q)
  );
  renderTable(filtered);
});

// ---------- Create license ----------

$('#new-license-btn').addEventListener('click', () => $('#new-license-modal').classList.remove('hidden'));
$('#cancel-new-license').addEventListener('click', () => $('#new-license-modal').classList.add('hidden'));

$('#new-license-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#nl-name').value.trim();
  const email = $('#nl-email').value.trim();
  const plan = $('#nl-plan').value;
  const deviceLimit = parseInt($('#nl-device-limit').value, 10) || 2;
  const transactionId = $('#nl-transaction-id').value.trim();
  const amount = parseFloat($('#nl-amount').value) || 0;
  const paymentMethod = $('#nl-payment-method').value;

  const issuedAt = Date.now();
  // Explicit per-plan mapping rather than a plan === 'yearly' ? ... : null
  // ternary — that pattern silently treats any *other* plan (including a
  // future new one) as lifetime/never-expiring, which is exactly backwards.
  const PLAN_DURATIONS_MS = {
    monthly: 30 * 24 * 60 * 60 * 1000,
    yearly: 365 * 24 * 60 * 60 * 1000,
    lifetime: null,
  };
  const expiresAt = plan in PLAN_DURATIONS_MS && PLAN_DURATIONS_MS[plan] !== null
    ? issuedAt + PLAN_DURATIONS_MS[plan]
    : null;

  const newDocRef = doc(collection(db, 'licenses'));
  const licenseData = {
    name, email, plan, deviceLimit, transactionId, amount, paymentMethod,
    status: 'active',
    expiresAt,
    activatedDevices: [],
    createdAt: issuedAt,
  };

  try {
    await setDoc(newDocRef, licenseData);
    $('#new-license-modal').classList.add('hidden');
    $('#new-license-form').reset();
    $('#result-key').textContent = newDocRef.id;
    $('#result-modal').classList.remove('hidden');
    loadLicenses();
  } catch (err) {
    alert('Failed to create license: ' + err.message);
  }
});

$('#close-result').addEventListener('click', () => $('#result-modal').classList.add('hidden'));
$('#copy-result-key').addEventListener('click', () => {
  navigator.clipboard.writeText($('#result-key').textContent);
});

// ---------- Manage / detail modal ----------

let currentLicense = null;

function openDetail(license) {
  currentLicense = license;
  $('#detail-name').textContent = license.name || '(no name)';
  $('#detail-email').textContent = license.email || '';
  $('#detail-key').textContent = license.id;
  $('#detail-status').value = license.status;
  $('#detail-device-limit').value = license.deviceLimit ?? 2;

  const devices = license.activatedDevices || [];
  $('#detail-devices').innerHTML = devices.length === 0
    ? '<div class="muted">No devices activated yet.</div>'
    : devices.map(d => `
        <div class="device-row">
          <span class="cell-secondary">${escapeHtml(d.deviceId)} — activated ${fmtDate(d.activatedAt)}</span>
          <button class="btn-small btn-danger-small" data-device="${escapeHtml(d.deviceId)}">Remove</button>
        </div>
      `).join('');

  $('#detail-devices').querySelectorAll('[data-device]').forEach(btn => {
    btn.onclick = () => removeDevice(btn.dataset.device);
  });

  $('#detail-modal').classList.remove('hidden');
}

$('#close-detail').addEventListener('click', () => $('#detail-modal').classList.add('hidden'));

$('#save-detail').addEventListener('click', async () => {
  if (!currentLicense) return;
  const status = $('#detail-status').value;
  const deviceLimit = parseInt($('#detail-device-limit').value, 10) || 1;
  try {
    await updateDoc(doc(db, 'licenses', currentLicense.id), { status, deviceLimit });
    $('#detail-modal').classList.add('hidden');
    loadLicenses();
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
});

async function removeDevice(deviceId) {
  if (!currentLicense) return;
  if (!confirm('Remove this device? The customer will need to re-activate on it.')) return;
  const updatedDevices = (currentLicense.activatedDevices || []).filter(d => d.deviceId !== deviceId);
  try {
    await updateDoc(doc(db, 'licenses', currentLicense.id), { activatedDevices: updatedDevices });
    currentLicense.activatedDevices = updatedDevices;
    openDetail(currentLicense);
    loadLicenses();
  } catch (err) {
    alert('Failed to remove device: ' + err.message);
  }
}
