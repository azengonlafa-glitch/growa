// Step 1: a full-screen map that opens on where you are, with the nearby partner pharmacies on it.
// The list and the confirm button live in a sheet that floats over the map (bottom sheet on a phone,
// side panel on a computer), the way ride-hailing apps do it.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { go, useAction, useQueryData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { loadPrefs } from '../lib/prefs.js';
import { fetchRoute } from '../lib/route.js';
import { Button, ErrorText, Icon, Loading, MockBadge, Notice } from '../components/ui.jsx';
import FlowMap from './FlowMap.jsx';
import StoreInfo from './StoreInfo.jsx';
import { useFlow } from './state.jsx';

const RADIUS_KM = 50;
const VICTORY_MONUMENT = { lat: 13.765, lng: 100.5381 };
const DESKTOP = '(min-width: 900px)';
const NONE = []; // stable empty list so the map does not redraw on every render

function km(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// How much of the map the floating sheet covers, so the map can keep your pin in the visible part.
function useInset(ref) {
  const [inset, setInset] = useState({ top: 72, right: 0, bottom: 0, left: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const side = window.matchMedia(DESKTOP).matches;
      setInset(side
        ? { top: 72, right: 0, bottom: 0, left: el.offsetWidth + 40 }
        : { top: 72, right: 0, bottom: el.offsetHeight + 12, left: 0 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [ref]);
  return inset;
}

export default function MapStep() {
  const { profile, staffOf } = useSession();
  const flow = useFlow();
  const [center, setCenter] = useState(() => flow.center ?? profile?.addresses?.[0]?.geo ?? VICTORY_MONUMENT);
  const [selectedId, setSelectedId] = useState(flow.pharmacy?.id ?? null);
  const [others, setOthers] = useState([]);
  const [showOthers, setShowOthers] = useState(false);
  const [infoId, setInfoId] = useState(null);
  const { busy, error, run, setError } = useAction();
  const sheet = useRef(null);
  const inset = useInset(sheet);

  const [stores, loading] = useQueryData(query(collection(db, 'pharmacies'), where('verificationStatus', '==', 'approved')), []);
  const partners = useMemo(
    () => stores
      .filter((p) => p.geo)
      .map((p) => ({ ...p, km: km(center, p.geo) }))
      .filter((p) => p.km <= RADIUS_KM)
      .sort((a, b) => a.km - b.km),
    [stores, center],
  );
  const selected = partners.find((p) => p.id === selectedId) ?? null;

  // Driving route and travel time to the nearest few stores, so each row can say how long it takes to get there.
  const [routes, setRoutes] = useState({});
  const nearKey = partners.slice(0, 5).map((p) => p.id).join();
  useEffect(() => {
    let cancelled = false;
    setRoutes({});
    partners.slice(0, 5).forEach((p) => {
      fetchRoute(center, p.geo).then((r) => { if (!cancelled) setRoutes((prev) => ({ ...prev, [p.id]: r })); });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, nearKey]);

  // The map starts with the partner (sample) stores only. The FDA directory, about 10 km around, is searched only
  // when the customer ticks the box, so opening the map does not touch the directory at all.
  useEffect(() => {
    if (!showOthers) return undefined;
    let cancelled = false;
    call('searchPharmacies', { location: center, radiusM: 10000 })
      .then((res) => !cancelled && setOthers((res.places ?? []).filter((p) => !p.partnerPharmacyId)))
      .catch(() => !cancelled && setOthers([]));
    return () => { cancelled = true; };
  }, [center, showOthers]);

  const locate = () => {
    if (!navigator.geolocation) return setError('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setSelectedId(null); },
      () => setError('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง ใช้ที่อยู่ในโปรไฟล์แทน'),
    );
  };
  const closeInfo = useCallback(() => setInfoId(null), []);
  // Opt-in (Settings): start on the current position instead of the saved address.
  useEffect(() => {
    if (flow.center || !loadPrefs().autoLocate || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onSelect = useCallback((id) => setSelectedId(id), []);

  const next = () => run(async () => {
    const changed = flow.pharmacy?.id !== selected.id;
    flow.update({
      center,
      pharmacy: { id: selected.id, name: selected.name, address: selected.address, phone: selected.phone ?? null, geo: selected.geo, sample: selected.sample === true },
      ...(changed ? { kind: null, triage: null, consult: null, cart: [] } : {}),
    });
    go('choose');
  });

  return (
    <div className="mapfull">
      <FlowMap center={center} partners={partners} routes={routes} others={showOthers ? others : NONE} selectedId={selectedId} onSelect={onSelect} inset={inset} />

      <header className="map-top">
        <div className="map-title">
          <span className="map-step">ขั้นที่ 1 จาก 5 · เลือกร้าน</span>
          <h1>เลือกร้านยาใกล้คุณ</h1>
        </div>
        <a className="round-btn" href="#/care" aria-label="โฮมแคร์และเมนู"><Icon name="people" /></a>
      </header>

      <button type="button" className="map-fab" style={{ bottom: inset.left ? 28 : inset.bottom + 14 }} onClick={locate} aria-label="ไปที่ตำแหน่งของฉัน">
        <Icon name="locate" size={26} />
      </button>

      <section className="map-sheet" ref={sheet} aria-label="ร้านยาใกล้คุณ">
        <span className="sheet-grab" aria-hidden />
        <div className="sheet-scroll">
          {staffOf.length ? (
            <a className="tile tile-peach" href="#/pharmacist" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <span className="tile-icon"><Icon name="list" /></span>
              <div><div className="tile-label">งานของร้าน {staffOf[0].pharmacy.name}</div><div className="muted small">คำสั่งซื้อใหม่ คิวประเมิน และการจัดส่ง</div></div>
            </a>
          ) : null}

          <div className="between">
            <h2>ร้านที่สั่งซื้อได้ ({partners.length})</h2>
            <MockBadge />
          </div>
          {loading ? <Loading /> : partners.length ? (
            <div className="store-list" role="group" aria-label="ร้านยาพาร์ทเนอร์">
              {partners.map((p) => {
                const route = routes[p.id];
                return (
                  <div key={p.id} className={`store-item${p.id === selectedId ? ' on' : ''}`}>
                  <button
                    type="button"
                    className={`store-row${p.id === selectedId ? ' on' : ''}`}
                    aria-pressed={p.id === selectedId}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span className="store-avatar" aria-hidden><Icon name="store" size={30} stroke={1.8} /></span>
                    <span className="store-info">
                      <strong>{p.name}</strong>
                      <span className="store-sub">
                        {p.ratingCount ? <span>★ {p.ratingAvg}</span> : null}
                        {p.services?.includes('telepharmacy') ? <span><Icon name="shield" size={14} /> ปรึกษาเภสัชกรได้</span> : null}
                      </span>
                      <span className="store-sub">{p.address}</span>
                    </span>
                    <span className="store-eta">
                      {route ? <strong className="num">{route.minutes} นาที</strong> : <span className="eta-wait" aria-label="กำลังคำนวณเวลา" />}
                      <span className="num">{(route?.km ?? p.km).toFixed(1)} กม.</span>
                    </span>
                  </button>
                  <button type="button" className="store-more" onClick={() => setInfoId(p.id)} aria-label={`ดูรีวิวและข้อมูลของ ${p.name}`}>
                    <Icon name="info" size={16} stroke={2.2} />รีวิว · ข้อมูลร้าน
                  </button>
                  </div>
                );
              })}
            </div>
                    ) : (
            <Notice tone="warn" title={`ไม่พบร้านพาร์ทเนอร์ในรัศมี ${RADIUS_KM} กม.`}>
              ลองใช้ตำแหน่งตัวอย่างด้านล่าง ร้านพาร์ทเนอร์ตัวอย่างอยู่ในกรุงเทพฯ
            </Notice>
          )}

          <ErrorText>{error}</ErrorText>
          <p className="muted small">เวลาเดินทางเป็นการขับรถโดยประมาณจากข้อมูลแผนที่ ไม่รวมการจราจร</p>
          <details className="more">
            <summary>ตัวเลือกตำแหน่งและแผนที่</summary>
            <div className="stack">
          <div className="row">
            <Button size="sm" variant="secondary" onClick={locate}><Icon name="locate" size={20} />ใช้ตำแหน่งของฉัน</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCenter(VICTORY_MONUMENT); setSelectedId(null); }}>ใช้ตำแหน่งตัวอย่าง (อนุสาวรีย์ชัยฯ)</Button>
          </div>
          <label className="check">
            <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} />
            แสดงร้านยาที่มีใบอนุญาตรอบตัวบนแผนที่{showOthers ? ` (${others.length})` : ''}
          </label>
          <p className="muted small">
            ร้านอื่นสั่งซื้อออนไลน์ไม่ได้ ข้อมูล อย. ไม่มีที่อยู่ร้าน ตำแหน่งจึงเป็นจุดกึ่งกลางแขวง/เขต และค้นหาได้ไกลสุดราว 10 กม. ตำแหน่งของคุณเริ่มจากที่อยู่ในโปรไฟล์
          </p>
            </div>
          </details>
        </div>
        <div className="sheet-cta">
          <Button size="lg" block disabled={!selected} busy={busy} onClick={next}>
            {selected ? `เลือก ${selected.name}` : 'แตะร้านบนแผนที่หรือในรายการ'}
          </Button>
        </div>
      </section>

      {infoId && partners.some((p) => p.id === infoId) ? (
        <StoreInfo
          pharmacy={partners.find((p) => p.id === infoId)}
          route={routes[infoId]}
          chosen={selectedId === infoId}
          onClose={closeInfo}
          onChoose={() => { setSelectedId(infoId); closeInfo(); }}
        />
      ) : null}
    </div>
  );
}
