// Minimal geohash helpers for "pharmacies near me" queries without a geo index.
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohashEncode(lat, lng, precision = 5) {
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let hash = '';
  let bits = 0;
  let value = 0;
  let even = true;
  while (hash.length < precision) {
    const range = even ? lngRange : latRange;
    const coord = even ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    value <<= 1;
    if (coord >= mid) {
      value |= 1;
      range[0] = mid;
    } else {
      range[1] = mid;
    }
    even = !even;
    if (++bits === 5) {
      hash += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

// Geohash cells (precision 5, ~4.9 x 4.9 km) that cover a circle, by sampling
// a grid over its bounding box. Small radii give at most a handful of cells.
export function coveringCells(lat, lng, radiusKm, precision = 5) {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const steps = Math.max(2, Math.ceil(radiusKm / 1.5));
  const cells = new Set();
  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      cells.add(geohashEncode(lat + (dLat * i) / steps, lng + (dLng * j) / steps, precision));
    }
  }
  return [...cells];
}
