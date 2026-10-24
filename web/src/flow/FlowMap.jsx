import { useEffect, useRef } from 'react';
import L from 'leaflet';

const css = () => {
  const s = getComputedStyle(document.documentElement);
  return (name) => s.getPropertyValue(name).trim();
};

// OpenStreetMap with the search radius, the user, partner stores (orderable) and
// licensed stores from the FDA directory (area centres only, so drawn as soft circles).
export default function FlowMap({ center, radiusKm, partners, others, selectedId, onSelect, height = 320 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef('');

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: false, zoomControl: true }).setView([center.lat, center.lng], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = css();
    layer.current.clearLayers();
    const ring = L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000, color: token('--primary'), weight: 2, dashArray: '6 8', fillColor: token('--primary'), fillOpacity: 0.05, interactive: false,
    }).addTo(layer.current);
    L.circleMarker([center.lat, center.lng], { radius: 8, color: '#fff', weight: 3, fillColor: token('--text'), fillOpacity: 1 })
      .bindTooltip('ตำแหน่งของคุณ').addTo(layer.current);

    for (const p of others) {
      L.circle([p.location.lat, p.location.lng], { radius: 350, color: token('--muted'), weight: 1, fillColor: token('--muted'), fillOpacity: 0.12, interactive: false })
        .addTo(layer.current);
    }
    for (const s of partners) {
      const active = s.id === selectedId;
      L.marker([s.geo.lat, s.geo.lng], {
        icon: L.divIcon({ className: 'pin-wrap', html: `<span class="pin${active ? ' pin-on' : ''}"><i></i></span>`, iconSize: [36, 36], iconAnchor: [18, 18] }),
        keyboard: false,
      })
        .bindTooltip(`${s.name}`)
        .on('click', () => onSelect(s.id))
        .addTo(layer.current);
    }

    // Re-frame only when the set of stores or the radius changes, not on every selection.
    const key = `${center.lat},${center.lng},${radiusKm},${partners.map((p) => p.id).join()}`;
    if (fitted.current !== key) {
      fitted.current = key;
      // Show the whole search radius first so the scan is visible; selecting a store zooms in on it.
      map.current.fitBounds(ring.getBounds());
    }
  }, [center, radiusKm, partners, others, selectedId, onSelect]);

  useEffect(() => {
    const s = partners.find((p) => p.id === selectedId);
    if (s) map.current.setView([s.geo.lat, s.geo.lng], Math.max(map.current.getZoom(), 13), { animate: true });
  }, [selectedId, partners]);

  return <div ref={el} className="map flow-map" style={{ height }} role="region" aria-label={`แผนที่ร้านยารัศมี ${radiusKm} กิโลเมตร`} />;
}
