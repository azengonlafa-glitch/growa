import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { baseLayer } from './tiles.js';

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const lerp = (a, b, t) => a + (b - a) * t;

// Pushpin SVG — same style as FlowMap's tack. `color` is a CSS custom-property value like #e8333f.
function tackHtml(headColor, shaftColor, shadow = true) {
  return `<span class="tack"><svg viewBox="0 0 48 64" width="100%" height="100%">`
    + (shadow ? `<ellipse style="fill:rgb(0 0 0/.22)" cx="30" cy="61" rx="8" ry="2.8" />` : '')
    + `<line x1="22" y1="36" x2="32" y2="62" stroke="#8a9298" stroke-width="2.2" stroke-linecap="round" />`
    + `<line x1="22.6" y1="36" x2="32.6" y2="62" stroke="#d6dde2" stroke-width="0.9" stroke-linecap="round" />`
    + `<ellipse cx="22" cy="35" rx="9" ry="3.5" fill="${shaftColor}" />`
    + `<circle cx="22" cy="19" r="17" fill="${headColor}" stroke="${shaftColor}" stroke-width="1.5" />`
    + `<ellipse cx="15.5" cy="11" rx="7" ry="5" fill="#fff" opacity=".38" transform="rotate(-20 15.5 11)" />`
    + `<circle cx="13" cy="9" r="3" fill="#fff" opacity=".82" />`
    + `</svg></span>`;
}
const tackIcon = (html) => L.divIcon({ className: 'pin-wrap', html, iconSize: [48, 64], iconAnchor: [24, 64] });

// Delivery map: pharmacy → home. The courier dot moves along a straight line by `progress` (0–1);
// there is no real routing or GPS here, so the page that uses it labels the route as simulated.
export default function TrackMap({ from, to, progress, height = 360 }) {
  const el = useRef(null);
  const map = useRef(null);
  const courier = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([from.lat, from.lng], 13);
    baseLayer().addTo(map.current);
    const path = [[from.lat, from.lng], [to.lat, to.lng]];
    L.polyline(path, { color: '#ffffff', weight: 12, opacity: 0.95, lineCap: 'round' }).addTo(map.current);
    const line = L.polyline(path, { color: '#5fd39a', weight: 7, lineCap: 'round' }).addTo(map.current);
    L.marker([from.lat, from.lng], { icon: tackIcon(tackHtml('#e8333f', '#a11622')), keyboard: false, interactive: false, zIndexOffset: 200 })
      .bindTooltip('ร้านยา', { permanent: true, direction: 'top', offset: [0, -68] }).addTo(map.current);
    L.marker([to.lat, to.lng], { icon: tackIcon(tackHtml('#2f7fe0', '#1855a3')), keyboard: false, interactive: false, zIndexOffset: 100 })
      .bindTooltip('บ้านคุณ', { permanent: true, direction: 'top', offset: [0, -68] }).addTo(map.current);
    courier.current = L.marker([from.lat, from.lng], { icon: L.divIcon({ className: 'pin-wrap', html: '<span class="rider">🛵</span>', iconSize: [44, 44], iconAnchor: [22, 22] }), keyboard: false }).bindTooltip('ผู้ส่ง').addTo(map.current);
    map.current.fitBounds(line.getBounds(), { padding: [48, 48], maxZoom: 15 });
    return () => map.current.remove();
    // The route is fixed for an order; only the courier moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.lat, from.lng, to.lat, to.lng]);

  useEffect(() => {
    const p = Math.max(0, Math.min(1, progress));
    courier.current?.setLatLng([lerp(from.lat, to.lat, p), lerp(from.lng, to.lng, p)]);
  }, [progress, from.lat, from.lng, to.lat, to.lng]);

  return <div ref={el} className="map flow-map track-map" style={{ height }} role="region" aria-label="แผนที่เส้นทางจัดส่งจากร้านยาถึงบ้าน (จำลอง)" />;
}
