// Builds data/pharmacy-directory-bangkok.json from the Thai FDA open dataset
// "ใบอนุญาตสถานที่ด้านยา" (drug_location_license-2024) and OpenStreetMap
// district/subdistrict centres.
//
// The FDA file has no street address or coordinates, so each pharmacy is
// placed at the centre of its แขวง (geoPrecision "subdistrict") or เขต
// (geoPrecision "district"). The UI must show this as an approximate area.
//
// Usage: node scripts/import-fda-directory.mjs
//   needs data/raw/fda/drug_location_license-2024.xlsx (downloaded from
//   catalog.fda.moph.go.th); fetches/caches OSM boundaries on first run.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { geohashEncode } from '../functions/src/geohash.js';
import { licenseKey } from '../functions/src/license-key.js';

const XLSX = 'data/raw/fda/drug_location_license-2024.xlsx';
const OSM_CACHE = 'data/raw/osm/bangkok-admin.json';
const OUT = 'data/pharmacy-directory-bangkok.json';
const PROVINCE = 'กรุงเทพมหานคร';
const MIN_EXPIRY_YEAR = 2024;

const norm = (s) => String(s ?? '').replace(/\s+/g, '').trim();
const cell = (v) => (v == null ? '' : typeof v === 'object' && 'text' in v ? String(v.text) : String(v)).trim();

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

async function loadOsm() {
  if (!existsSync(OSM_CACHE)) {
    mkdirSync('data/raw/osm', { recursive: true });
    const query = '[out:json][timeout:120];rel["boundary"="administrative"]["admin_level"~"^(6|8)$"](13.45,100.30,14.0,100.95);out center tags;';
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': 'growa-hackathon-prototype/0.1', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    writeFileSync(OSM_CACHE, await res.text());
  }
  const { elements } = JSON.parse(readFileSync(OSM_CACHE, 'utf8'));
  const districts = new Map();
  const subdistricts = new Map(); // name -> [centre]
  for (const e of elements) {
    if (!e.center || !e.tags?.name) continue;
    const centre = { lat: e.center.lat, lng: e.center.lon };
    const name = norm(e.tags.name);
    if (e.tags.admin_level === '6' && name.startsWith('เขต')) districts.set(name.slice(3), centre);
    if (e.tags.admin_level === '8' && name.startsWith('แขวง')) {
      const key = name.slice(4);
      subdistricts.set(key, [...(subdistricts.get(key) ?? []), centre]);
    }
  }
  return { districts, subdistricts };
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const rows = [];
wb.worksheets[0].eachRow((row, n) => {
  if (n > 1) rows.push(row.values.slice(1).map(cell));
});
// Columns: lcntpcd, lcnno_no, thanm, licen_time, thathmblnm, thaamphrnm,
//          thachngwtnm, zipcode, cncnm, appdate, expyear, Newcode
const pharmacies = rows.filter((r) => r[0] === 'ขายยาแผนปัจจุบัน'
  && r[8].startsWith('คงอยู่')
  && r[6] === PROVINCE
  && Number(r[10]) >= MIN_EXPIRY_YEAR);

const { districts, subdistricts } = await loadOsm();
const stats = { subdistrict: 0, district: 0, none: 0 };
const out = [];
for (const r of pharmacies) {
  const [, licenseNo, name, hours, subdistrict, district, province, zipcode, status, , expYear, code] = r;
  const dCentre = districts.get(norm(district));
  const candidates = subdistricts.get(norm(subdistrict)) ?? [];
  // Same แขวง name can exist in several เขต: take the one nearest its own เขต.
  const sCentre = dCentre
    ? candidates.map((c) => [c, distanceKm(c, dCentre)]).filter(([, d]) => d < 12).sort((a, b) => a[1] - b[1])[0]?.[0]
    : candidates.length === 1 ? candidates[0] : null;
  const geo = sCentre ?? dCentre ?? null;
  const geoPrecision = sCentre ? 'subdistrict' : dCentre ? 'district' : null;
  stats[geoPrecision ?? 'none']++;
  if (!geo) continue;

  out.push({
    id: code,
    name,
    licenseNo,
    licenseKey: licenseKey(licenseNo),
    licenseType: 'ขย.1',
    licenseStatus: status,
    licenseExpiryYear: Number(expYear),
    pharmacistHours: hours || null,
    subdistrict, district, province, zipcode,
    geo: { lat: Math.round(geo.lat * 1e5) / 1e5, lng: Math.round(geo.lng * 1e5) / 1e5 },
    geoPrecision,
    geohash5: geohashEncode(geo.lat, geo.lng, 5),
  });
}

mkdirSync('data', { recursive: true });
writeFileSync(OUT, `${JSON.stringify({
  source: 'สำนักงานคณะกรรมการอาหารและยา (อย.) — ใบอนุญาตสถานที่ด้านยา, catalog.fda.moph.go.th (ข้อมูลปี 2024)',
  locationSource: 'ศูนย์กลางแขวง/เขตจาก OpenStreetMap contributors (ODbL)',
  generatedAt: new Date().toISOString(),
  count: out.length,
  pharmacies: out,
}, null, 1)}\n`);
console.log(`ขย.1 active in ${PROVINCE}: ${pharmacies.length}`);
console.log(`located by แขวง: ${stats.subdistrict}, by เขต: ${stats.district}, not located: ${stats.none}`);
console.log(`wrote ${OUT}`);
