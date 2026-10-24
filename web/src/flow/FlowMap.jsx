import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { baseLayer } from './tiles.js';

const START_ZOOM = 15;
// Route colours run from light green at your end to light blue at the pharmacy.
const GREEN = [124, 224, 168];
const BLUE = [110, 190, 255];
const mixColor = (t) => `rgb(${GREEN.map((g, i) => Math.round(g + (BLUE[i] - g) * t)).join(',')})`;

// Splits the route into short pieces, each with its own colour, because a Leaflet line can only have one.
function drawRoute(group, coords) {
  const pieces = Math.min(60, Math.max(8, Math.floor(coords.length / 2)));
  const step = (coords.length - 1) / pieces;
  L.polyline(coords, { color: '#ffffff', weight: 12, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(group);
  for (let i = 0; i < pieces; i++) {
    const a = Math.floor(i * step);
    const b = Math.min(coords.length - 1, Math.ceil((i + 1) * step));
    L.polyline(coords.slice(a, b + 1), { color: mixColor(i / (pieces - 1)), weight: 7, opacity: 1, lineCap: i === 0 ? 'round' : 'butt', lineJoin: 'round', interactive: false }).addTo(group);
  }
}

// Full-bleed map: opens on the user's pin, shows partner stores (orderable) as pins, and draws the route to the
// chosen store. Licensed stores from the FDA directory are area centres only, so they are soft circles.
// `inset` is how many pixels of the map are covered by floating panels, so the pin stays in the visible part.
export default function FlowMap({ center, partners, others, routes = {}, selectedId, onSelect, inset = { top: 0, right: 0, bottom: 0, left: 0 }, height = '100%' }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const insetRef = useRef(inset);
  insetRef.current = inset;

  // Moves the map so `target` sits in the middle of what the panels leave visible.
  const showAt = (target, zoom, animate = true) => {
    const i = insetRef.current;
    const offX = (i.left - i.right) / 2;
    const offY = (i.top - i.bottom) / 2;
    const px = map.current.project(target, zoom).subtract([offX, offY]);
    map.current.setView(map.current.unproject(px, zoom), zoom, { animate });
  };

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: true, zoomControl: false, attributionControl: false }).setView([center.lat, center.lng], START_ZOOM);
    L.control.attribution({ position: 'topleft', prefix: false }).addTo(map.current);
    baseLayer().addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    showAt(center, START_ZOOM, false);
    return () => map.current.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    layer.current.clearLayers();
    const route = routes[selectedId];
    if (route) drawRoute(layer.current, route.coords);

    L.marker([center.lat, center.lng], {
      icon: L.divIcon({ className: 'pin-wrap', html: '<span class="you"><i></i></span>', iconSize: [44, 44], iconAnchor: [22, 22] }),
      keyboard: false, interactive: false, zIndexOffset: 800,
    }).bindTooltip('ตำแหน่งของคุณ', { permanent: true, direction: 'bottom', offset: [0, 16], className: 'you-tip' }).addTo(layer.current);

    for (const p of others) {
      L.circle([p.location.lat, p.location.lng], { radius: 350, color: '#9aa3a8', weight: 1, fillColor: '#9aa3a8', fillOpacity: 0.14, interactive: false })
        .addTo(layer.current);
    }
    for (const s of partners) {
      const active = s.id === selectedId;
      const minutes = routes[s.id]?.minutes;
      const marker = L.marker([s.geo.lat, s.geo.lng], {
        icon: L.divIcon({ className: 'pin-wrap', html: `<span class="pin${active ? ' pin-on' : ''}"><i></i></span>`, iconSize: [36, 36], iconAnchor: [18, 18] }),
        keyboard: false, zIndexOffset: active ? 500 : 0,
      }).on('click', () => onSelect(s.id)).addTo(layer.current);
      if (active && minutes) {
        marker.bindTooltip(`${minutes} นาที`, { permanent: true, direction: 'top', offset: [0, -14], className: 'eta-tip' });
      } else {
        marker.bindTooltip(minutes ? `${s.name} · ${minutes} นาที` : s.name, { direction: 'top', offset: [0, -12] });
      }
    }
  }, [center, partners, others, routes, selectedId, onSelect]);

  // Re-centre on the user when the position changes (e.g. "use my location").
  const lastCenter = useRef(center);
  useEffect(() => {
    if (lastCenter.current === center) return;
    lastCenter.current = center;
    showAt(center, START_ZOOM);
  });

  // The panels are measured after the map is created, so re-centre once their size is known (and when they resize).
  useEffect(() => {
    const s = partners.find((p) => p.id === selectedId);
    if (!s) showAt(center, map.current.getZoom(), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inset.left, inset.bottom, inset.top]);

  // Picking a store frames the whole route (or you and the store, until the route arrives).
  const routeReady = Boolean(routes[selectedId]);
  useEffect(() => {
    const s = partners.find((p) => p.id === selectedId);
    if (!s) return;
    const i = insetRef.current;
    const pts = routes[selectedId]?.coords ?? [[center.lat, center.lng], [s.geo.lat, s.geo.lng]];
    map.current.fitBounds(L.latLngBounds(pts), {
      paddingTopLeft: [i.left + 56, i.top + 110], paddingBottomRight: [i.right + 56, i.bottom + 56], maxZoom: 16, animate: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, routeReady]);

  // Panels change size with the viewport; let Leaflet re-measure.
  useEffect(() => {
    const ro = new ResizeObserver(() => map.current?.invalidateSize());
    ro.observe(el.current);
    return () => ro.disconnect();
  }, []);

  return <div ref={el} className="map flow-map map-fill" style={{ height }} role="region" aria-label="แผนที่ร้านยาใกล้ตำแหน่งของคุณ" />;
}
