import { useEffect, useRef } from 'react';
import L from 'leaflet';

// OpenStreetMap map with circle markers (no image assets needed).
// Directory locations are แขวง/เขต centres, so they are drawn as soft areas.
export default function PharmacyMap({ center, places, partners, onSelect }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([center.lat, center.lng], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current.setView([center.lat, center.lng]);
    layer.current.clearLayers();
    L.circleMarker([center.lat, center.lng], { radius: 8, color: '#1d5fa8', fillOpacity: 0.9 })
      .bindTooltip('ตำแหน่งของคุณ').addTo(layer.current);

    // Group directory pharmacies that share an approximate centre.
    const groups = new Map();
    for (const p of places) {
      const key = `${p.location.lat},${p.location.lng}`;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    for (const [, group] of groups) {
      const { lat, lng } = group[0].location;
      L.circle([lat, lng], { radius: 350, color: '#0f766e', weight: 1, fillOpacity: 0.12 })
        .bindTooltip(`${group.length} ร้านใน${group[0].locationApprox === 'district' ? 'เขต' : 'แขวง'}นี้ (ตำแหน่งโดยประมาณ)`)
        .on('click', () => onSelect?.(group[0]))
        .addTo(layer.current);
    }
    for (const s of partners) {
      L.circleMarker([s.geo.lat, s.geo.lng], { radius: 9, color: '#b45309', fillColor: '#f59e0b', fillOpacity: 1 })
        .bindTooltip(`${s.name} · สั่งซื้อได้`)
        .on('click', () => { window.location.hash = `#/store/${s.id}`; })
        .addTo(layer.current);
    }
  }, [center, places, partners, onSelect]);

  return <div ref={el} className="map" role="region" aria-label="แผนที่ร้านยา" />;
}
