import { useEffect, useRef } from 'react';
import L from 'leaflet';

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const lerp = (a, b, t) => a + (b - a) * t;

// Delivery map: pharmacy → home. The courier dot moves along a straight line by `progress` (0–1);
// there is no real routing or GPS here, so the page that uses it labels the route as simulated.
export default function TrackMap({ from, to, progress, height = 360 }) {
  const el = useRef(null);
  const map = useRef(null);
  const courier = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([from.lat, from.lng], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    const line = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], { color: token('--primary'), weight: 5, dashArray: '2 10', lineCap: 'round' }).addTo(map.current);
    L.circleMarker([from.lat, from.lng], { radius: 11, weight: 3, color: '#fff', fillColor: token('--primary'), fillOpacity: 1 }).bindTooltip('ร้านยา', { permanent: true, direction: 'top' }).addTo(map.current);
    L.circleMarker([to.lat, to.lng], { radius: 11, weight: 3, color: '#fff', fillColor: token('--text'), fillOpacity: 1 }).bindTooltip('บ้านคุณ', { permanent: true, direction: 'top' }).addTo(map.current);
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
