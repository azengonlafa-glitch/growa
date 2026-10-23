// Google Places (New) proxy for pharmacy search, details and reviews.
//
// Google's terms only allow storing place IDs, so everything else (name,
// rating, hours, reviews) is fetched live on each request and never written
// to Firestore. The UI must show the Google attribution and each review's
// author attribution returned here.
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { db, HttpsError, requireAuth, str, latLng } from './common.js';
import { searchDirectory } from './directory.js';

const GOOGLE_MAPS_API_KEY = defineSecret('GOOGLE_MAPS_API_KEY');
const BASE = 'https://places.googleapis.com/v1';

const LIST_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
  'places.rating', 'places.userRatingCount', 'places.currentOpeningHours.openNow',
  'places.googleMapsUri',
].join(',');

const DETAIL_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount',
  'regularOpeningHours.weekdayDescriptions', 'currentOpeningHours.openNow',
  'nationalPhoneNumber', 'googleMapsUri', 'reviews',
].join(',');

async function placesFetch(path, { method = 'GET', fieldMask, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY.value(),
      'X-Goog-FieldMask': fieldMask,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('Places API error', res.status, detail.slice(0, 500));
    if (res.status === 404) throw new HttpsError('not-found', 'ไม่พบสถานที่นี้ใน Google');
    throw new HttpsError('unavailable', 'ดึงข้อมูลจาก Google ไม่สำเร็จ');
  }
  return res.json();
}

function toSummary(p) {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? null,
    address: p.formattedAddress ?? null,
    location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? 0,
    openNow: p.currentOpeningHours?.openNow ?? null,
    googleMapsUri: p.googleMapsUri ?? null,
  };
}

// placeId -> partner pharmacyId for stores that joined MediLink and are approved.
async function partnerIndex(placeIds) {
  const map = {};
  for (let i = 0; i < placeIds.length; i += 30) {
    const snap = await db.collection('pharmacies')
      .where('verificationStatus', '==', 'approved')
      .where('googlePlaceId', 'in', placeIds.slice(i, i + 30))
      .get();
    for (const d of snap.docs) map[d.data().googlePlaceId] = d.id;
  }
  return map;
}

export const searchPharmacies = onCall({ secrets: [GOOGLE_MAPS_API_KEY] }, async (req) => {
  requireAuth(req);
  const d = req.data ?? {};
  const center = latLng(d.location);
  const radius = Math.min(Math.max(Number(d.radiusM) || 3000, 200), 20000);
  const query = str(d.query, 'คำค้นหา', { max: 100, optional: true });
  // No Google key configured: fall back to the FDA licensed-pharmacy directory.
  if (!GOOGLE_MAPS_API_KEY.value()) {
    return searchDirectory({ location: center, radiusKm: Math.min(radius, 10000) / 1000, query });
  }
  const circle = { center: { latitude: center.lat, longitude: center.lng }, radius };

  const result = query
    ? await placesFetch('/places:searchText', {
        method: 'POST', fieldMask: LIST_FIELDS,
        body: { textQuery: query, includedType: 'pharmacy', locationBias: { circle }, languageCode: 'th', maxResultCount: 20 },
      })
    : await placesFetch('/places:searchNearby', {
        method: 'POST', fieldMask: LIST_FIELDS,
        body: { includedTypes: ['pharmacy'], locationRestriction: { circle }, rankPreference: 'DISTANCE', languageCode: 'th', maxResultCount: 20 },
      });

  const places = (result.places ?? []).map(toSummary);
  const partners = places.length ? await partnerIndex(places.map((p) => p.placeId)) : {};
  return {
    source: 'Google Maps',
    places: places.map((p) => ({ ...p, partnerPharmacyId: partners[p.placeId] ?? null })),
  };
});

export const getPharmacyPlaceDetails = onCall({ secrets: [GOOGLE_MAPS_API_KEY] }, async (req) => {
  requireAuth(req);
  const placeId = str(req.data?.placeId, 'placeId', { max: 300 });
  if (!/^[A-Za-z0-9_-]+$/.test(placeId)) throw new HttpsError('invalid-argument', 'placeId ไม่ถูกต้อง');
  if (!GOOGLE_MAPS_API_KEY.value()) {
    throw new HttpsError('failed-precondition', 'ยังไม่ได้ตั้งค่า Google Maps API key');
  }

  const p = await placesFetch(`/places/${placeId}?languageCode=th`, { fieldMask: DETAIL_FIELDS });
  const partners = await partnerIndex([p.id]);
  return {
    source: 'Google Maps',
    ...toSummary(p),
    phone: p.nationalPhoneNumber ?? null,
    openingHours: p.regularOpeningHours?.weekdayDescriptions ?? [],
    partnerPharmacyId: partners[p.id] ?? null,
    // Google returns at most 5 reviews; show them with author attribution.
    reviews: (p.reviews ?? []).map((r) => ({
      rating: r.rating ?? null,
      text: r.text?.text ?? r.originalText?.text ?? '',
      relativeTime: r.relativePublishTimeDescription ?? null,
      publishTime: r.publishTime ?? null,
      author: r.authorAttribution?.displayName ?? null,
      authorUri: r.authorAttribution?.uri ?? null,
      authorPhotoUri: r.authorAttribution?.photoUri ?? null,
      googleMapsUri: r.googleMapsUri ?? null,
    })),
  };
});
