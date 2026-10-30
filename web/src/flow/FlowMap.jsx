import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { baseLayer } from './tiles.js';

const START_ZOOM = 15;
// Route colours run from light green at your end to light blue at the pharmacy.
const GREEN = [124, 224, 168];
const BLUE = [110, 190, 255];
const mixColor = (t) => `rgb(${GREEN.map((g, i) => Math.round(g + (BLUE[i] - g) * t)).join(',')})`;

// Ball pin: round glossy sphere head + thin angled metal needle (like a sewing/map pin).
// The needle tip sits at iconAnchor — bottom-right of the bounding box.
const TACK_W = 50;
const TACK_H = 66;
const TACK_AX = 46; // needle-tip x inside the viewBox (= pixel anchor x)
const TACK_AY = 64; // needle-tip y
const tack = (tone, cls = '', style = '') =>
  `<span class="tack tack-${tone}${cls}"${style}><svg viewBox="0 0 50 66" width="100%" height="100%" overflow="visible">`
  // Tiny shadow at needle tip
  + '<ellipse class="tack-shadow" cx="45" cy="64" rx="6" ry="2" />'
  // Thin metal needle — angled lower-right
  + '<line x1="20" y1="32" x2="46" y2="64" stroke="#8a9298" stroke-width="1.8" stroke-linecap="round" />'
  + '<line x1="20.8" y1="32" x2="46.8" y2="64" stroke="#d8e0e5" stroke-width="0.75" stroke-linecap="round" />'
  // Sphere / ball head
  + '<circle class="tack-head" cx="18" cy="17" r="16" />'
  // Soft large gloss (upper-left)
  + '<ellipse cx="11" cy="9" rx="7.5" ry="5.5" fill="#fff" opacity=".32" transform="rotate(-30 11 9)" />'
  // Sharp specular highlight
  + '<circle cx="9" cy="7" r="3.2" fill="#fff" opacity=".88" />'
  + '</svg></span>';
const tackIcon = (html, scale = 1) => L.divIcon({
  className: 'pin-wrap',
  html,
  iconSize: [TACK_W * scale, TACK_H * scale],
  iconAnchor: [TACK_AX * scale, TACK_AY * scale],
});

const DRAW_MS = 800;
const ANIM_MS = 1600; // longest entrance (route draw, then the time label pops)

// Splits the route into short pieces, each with its own colour, because a Leaflet line can only have one.
// While the route is younger than ANIM_MS, the pieces fade in one after another so the line draws itself from
// you to the store. `age` keeps that timing when the layers are redrawn halfway through.
function drawRoute(group, coords, age) {
  const pieces = Math.min(60, Math.max(8, Math.floor(coords.length / 2)));
  const step = (coords.length - 1) / pieces;
  const anim = (line, delay) => {
    const path = line.getElement();
    if (age >= ANIM_MS || !path) return;
    path.classList.add('route-in');
    path.style.animationDelay = `${delay - age}ms`;
  };
  anim(L.polyline(coords, { color: '#ffffff', weight: 12, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(group), 0);
  for (let i = 0; i < pieces; i++) {
    const a = Math.floor(i * step);
    const b = Math.min(coords.length - 1, Math.ceil((i + 1) * step));
    const line = L.polyline(coords.slice(a, b + 1), { color: mixColor(i / (pieces - 1)), weight: 7, opacity: 1, lineCap: i === 0 ? 'round' : 'butt', lineJoin: 'round', interactive: false }).addTo(group);
    anim(line, (i / pieces) * DRAW_MS);
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

  // Layers are rebuilt on every change, so entrance animations are timed from when the selection (or its route)
  // first appeared and resumed with a negative delay instead of restarting on each rebuild.
  const routeSeen = useRef({ id: null, at: 0 });
  const pinSeen = useRef({ id: null, at: 0 });
  useEffect(() => {
    layer.current.clearLayers();
    const now = performance.now();
    const route = routes[selectedId];
    if (route && routeSeen.current.id !== selectedId) routeSeen.current = { id: selectedId, at: now };
    if (pinSeen.current.id !== selectedId) pinSeen.current = { id: selectedId, at: now };
    const routeAge = route ? now - routeSeen.current.at : Infinity;
    const pinAge = now - pinSeen.current.at;
    if (route) drawRoute(layer.current, route.coords, routeAge);

    L.marker([center.lat, center.lng], {
      icon: tackIcon(tack('you')),
      keyboard: false, interactive: false, zIndexOffset: 800,
    }).bindTooltip('ตำแหน่งของคุณ', { permanent: true, direction: 'bottom', offset: [0, 4], className: 'you-tip' }).addTo(layer.current);

    for (const p of others) {
      L.circle([p.location.lat, p.location.lng], { radius: 350, color: '#9aa3a8', weight: 1, fillColor: '#9aa3a8', fillOpacity: 0.14, interactive: false })
        .addTo(layer.current);
    }
    for (const s of partners) {
      const active = s.id === selectedId;
      const minutes = routes[s.id]?.minutes;
      const marker = L.marker([s.geo.lat, s.geo.lng], {
        icon: active
          ? tackIcon(tack('on', pinAge < ANIM_MS ? ' tack-drop' : '', pinAge < ANIM_MS ? ` style="--d:${-pinAge}ms"` : ''), 1.3)
          : tackIcon(tack('store')),
        keyboard: false, zIndexOffset: active ? 500 : 0,
      }).on('click', () => onSelect(s.id)).addTo(layer.current);
      if (active && minutes) {
        marker.bindTooltip(`${minutes} นาที`, { permanent: true, direction: 'top', offset: [0, -70], className: `eta-tip${routeAge < ANIM_MS ? ' eta-pop' : ''}` });
        const tip = marker.getTooltip()?.getElement();
        if (tip && routeAge < ANIM_MS) tip.style.animationDelay = `${700 - routeAge}ms`;
      } else {
        marker.bindTooltip(minutes ? `${s.name} · ${minutes} นาที` : s.name, { direction: 'top', offset: [0, -54] });
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
