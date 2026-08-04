import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeFirestore, doc, runTransaction, type Firestore } from 'firebase/firestore';

// From Firebase Console > Project Settings > General > Your apps > SDK setup.
// These identifiers are public/client-safe by design — Firebase's actual
// security boundary is firestore.rules (see repo root), not this config.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAnUHW9GSEaxSkWYDVLFxwyL4LfZBN7y9o',
  authDomain: 'rupantorcrm.firebaseapp.com',
  projectId: 'rupantorcrm',
  storageBucket: 'rupantorcrm.firebasestorage.app',
  messagingSenderId: '68073937163',
  appId: '1:68073937163:web:8e6ea0578f9b4703cb6a0e',
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

function getDb(): Firestore {
  if (!db) {
    app = initializeApp(FIREBASE_CONFIG);
    // The main process is plain Node, not a browser — force long-polling
    // so Firestore's channel works without WebSocket/gRPC support.
    db = initializeFirestore(app, { experimentalForceLongPolling: true });
  }
  return db;
}

export interface RemoteLicenseDoc {
  email: string;
  name: string;
  plan: 'yearly' | 'lifetime';
  status: 'active' | 'revoked' | 'refunded';
  expiresAt: number | null; // ms epoch, null = lifetime
  deviceLimit: number;
  activatedDevices?: { deviceId: string; activatedAt: number }[];
}

export type OnlineCheckResult =
  | { ok: true; data: RemoteLicenseDoc }
  | { ok: false; reason: string };

// Thrown for legitimate rejections (not found / revoked / expired / device
// limit) so callers can tell them apart from real connectivity failures —
// only the latter should fall back to the cached offline grace period.
class LicenseRejection extends Error {}

// The license key IS the Firestore document ID (Firestore's auto-generated
// IDs are already unguessable ~20-char strings — that's what you hand the
// customer after creating their doc in the Firebase Console). Combined with
// `allow list: if false` in firestore.rules, knowing the key is what grants
// read access; nobody can enumerate other customers' licenses.
//
// Runs as a transaction so two devices activating at the exact same moment,
// right at the device-limit boundary, can't both slip through — the second
// transaction re-reads the post-first-write state before deciding.
export async function checkLicenseOnline(licenseKey: string, deviceId: string): Promise<OnlineCheckResult> {
  const ref = doc(getDb(), 'licenses', licenseKey);
  try {
    const data = await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new LicenseRejection('License key not found.');

      const current = snap.data() as RemoteLicenseDoc;
      if (current.status !== 'active') throw new LicenseRejection(`This license has been ${current.status}.`);
      if (current.expiresAt && Date.now() > current.expiresAt) throw new LicenseRejection('This license has expired.');

      const devices = current.activatedDevices || [];
      const alreadyRegistered = devices.some(d => d.deviceId === deviceId);
      if (!alreadyRegistered && devices.length >= current.deviceLimit) {
        throw new LicenseRejection(`Device limit reached (${current.deviceLimit}). Contact support to free up a slot.`);
      }

      const activatedDevices = alreadyRegistered ? devices : [...devices, { deviceId, activatedAt: Date.now() }];
      tx.update(ref, { activatedDevices, lastValidatedAt: Date.now() });
      return { ...current, activatedDevices };
    });
    return { ok: true, data };
  } catch (err) {
    if (err instanceof LicenseRejection) return { ok: false, reason: err.message };
    throw err; // real connectivity/permission error — let the caller fall back to cache
  }
}

// Lets a customer free up their own device slot (e.g. before wiping a PC or
// switching machines) without needing you to manually edit Firestore.
export async function deactivateDevice(licenseKey: string, deviceId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ref = doc(getDb(), 'licenses', licenseKey);
  try {
    await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new LicenseRejection('License key not found.');
      const current = snap.data() as RemoteLicenseDoc;
      const activatedDevices = (current.activatedDevices || []).filter(d => d.deviceId !== deviceId);
      tx.update(ref, { activatedDevices });
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof LicenseRejection ? err.message : 'Could not reach the license server.' };
  }
}
