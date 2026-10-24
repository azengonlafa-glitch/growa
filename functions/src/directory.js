// Licensed-pharmacy directory imported from Thai FDA open data
// (scripts/import-fda-directory.mjs). Works without any API key.
// Locations are แขวง/เขต centres, so distances are approximate.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, latLng, str, distanceKm } from './common.js';
import { coveringCells } from './geohash.js';
import { licenseKey } from './license-key.js';

const MAX_RESULTS = 30;

// The directory is static open data that also ships with the app, so search it in memory. Reading it from
// Firestore cost hundreds of document reads per search and used up the free daily quota within hours.
const DIRECTORY_FILE = fileURLToPath(new URL('../../data/pharmacy-directory-bangkok.json', import.meta.url));
let inMemory;
function bundledDirectory() {
  if (inMemory === undefined) {
    inMemory = existsSync(DIRECTORY_FILE) ? JSON.parse(readFileSync(DIRECTORY_FILE, 'utf8')).pharmacies ?? null : null;
  }
  return inMemory;
}

// directoryId -> partner pharmacyId for stores that joined growa.
async function partnersByDirectoryId(ids) {
  const map = {};
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db.collection('pharmacies')
      .where('verificationStatus', '==', 'approved')
      .where('fdaDirectoryId', 'in', ids.slice(i, i + 30))
      .get();
    for (const d of snap.docs) map[d.data().fdaDirectoryId] = d.id;
  }
  return map;
}

export async function searchDirectory({ location, radiusKm, query = null }) {
  let r = radiusKm;
  let candidates = bundledDirectory();
  if (!candidates) {
    // No bundled file (for example a Firebase-deployed function): fall back to Firestore.
    // Firestore "in" accepts up to 30 values; shrink the radius until it fits.
    let cells = coveringCells(location.lat, location.lng, r);
    while (cells.length > 30) cells = coveringCells(location.lat, location.lng, (r *= 0.8));
    const snap = await db.collection('pharmacyDirectory').where('geohash5', 'in', cells).get();
    candidates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const q = query?.replace(/\s+/g, '').toLowerCase();
  const rows = candidates
    .filter((p) => !q || p.name.replace(/\s+/g, '').toLowerCase().includes(q))
    .map((p) => ({ p, km: distanceKm(location, p.geo) }))
    .filter(({ km }) => km <= r)
    .sort((a, b) => a.km - b.km || a.p.name.localeCompare(b.p.name, 'th'))
    .slice(0, MAX_RESULTS);

  const partners = rows.length ? await partnersByDirectoryId(rows.map(({ p }) => p.id)) : {};
  return {
    source: 'อย. ข้อมูลเปิด (ใบอนุญาตสถานที่ขายยา) + OpenStreetMap',
    radiusKm: Math.round(r * 10) / 10,
    places: rows.map(({ p, km }) => ({
      directoryId: p.id,
      placeId: null,
      name: p.name,
      address: `แขวง${p.subdistrict} เขต${p.district} ${p.province} ${p.zipcode}`,
      location: p.geo,
      locationApprox: p.geoPrecision, // "subdistrict" | "district"
      distanceKm: Math.round(km * 10) / 10,
      licenseNo: p.licenseNo,
      licenseType: p.licenseType,
      pharmacistHours: p.pharmacistHours,
      rating: null,
      userRatingCount: 0,
      openNow: null,
      partnerPharmacyId: partners[p.id] ?? null,
    })),
  };
}

export const searchPharmacyDirectory = onCall(async (req) => {
  requireAuth(req);
  const d = req.data ?? {};
  const radiusKm = Math.min(Math.max(Number(d.radiusM) || 3000, 200), 10000) / 1000;
  return searchDirectory({
    location: latLng(d.location),
    radiusKm,
    query: str(d.query, 'คำค้นหา', { max: 100, optional: true }),
  });
});

export async function findDirectoryByLicense(licenseNo) {
  const snap = await db.collection('pharmacyDirectory').where('licenseKey', '==', licenseKey(licenseNo)).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}
