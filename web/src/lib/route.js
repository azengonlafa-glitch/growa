// Driving route and travel time between two points, from the public OSRM demo server (OpenStreetMap data).
// It sends only the two coordinates, no account or personal data. If the server is slow or down we fall back to a
// straight-line estimate so the screen always has a time to show; `estimated: true` marks that case.
const cache = new Map();
const KMH = 24; // typical Bangkok city speed, only used for the fallback

function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function estimate(from, to) {
  const km = haversineKm(from, to) * 1.35; // roads are longer than the straight line
  return { coords: [[from.lat, from.lng], [to.lat, to.lng]], minutes: Math.max(1, Math.round((km / KMH) * 60)), km, estimated: true };
}

export async function fetchRoute(from, to) {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: ctrl.signal });
      const data = await res.json();
      const r = data.routes?.[0];
      if (!r) return estimate(from, to);
      return { coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), minutes: Math.max(1, Math.round(r.duration / 60)), km: r.distance / 1000, estimated: false };
    } catch {
      return estimate(from, to);
    } finally {
      clearTimeout(timer);
    }
  })();
  cache.set(key, job);
  return job;
}
