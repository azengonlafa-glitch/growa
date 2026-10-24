import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { go, useAction, useQueryData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Badge, Button, ErrorText, Icon, Loading, MockBadge, Notice } from '../components/ui.jsx';
import { Splash } from '../components/Flair.jsx';
import FlowPage from './FlowPage.jsx';
import FlowMap from './FlowMap.jsx';
import { useFlow } from './state.jsx';

const RADIUS_KM = 50;
const VICTORY_MONUMENT = { lat: 13.765, lng: 100.5381 };

function km(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export default function MapStep() {
  const { profile, staffOf } = useSession();
  const flow = useFlow();
  const [center, setCenter] = useState(() => flow.center ?? profile?.addresses?.[0]?.geo ?? VICTORY_MONUMENT);
  const [selectedId, setSelectedId] = useState(flow.pharmacy?.id ?? null);
  const [others, setOthers] = useState([]);
  const [showOthers, setShowOthers] = useState(false);
  const { busy, error, run, setError } = useAction();

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

  // Directory stores are shown for context only; the FDA directory search reaches about 10 km.
  useEffect(() => {
    let cancelled = false;
    call('searchPharmacies', { location: center, radiusM: 10000 })
      .then((res) => !cancelled && setOthers((res.places ?? []).filter((p) => !p.partnerPharmacyId)))
      .catch(() => !cancelled && setOthers([]));
    return () => { cancelled = true; };
  }, [center]);

  const locate = () => {
    if (!navigator.geolocation) return setError('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setSelectedId(null); },
      () => setError('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง ใช้ที่อยู่ในโปรไฟล์แทน'),
    );
  };
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
    <FlowPage
      step={1}
      title="เลือกร้านยาใกล้คุณ"
      wide
      hero={<Splash title="สั่งยาง่ายเหมือนเรียกรถ" sub="เลือกร้านยาใกล้คุณ ตอบคำถามสั้น ๆ แล้วรอรับที่บ้าน" chips={[['locate', 'สแกนร้านใกล้คุณ'], ['shield', 'เภสัชกรช่วยดู'], ['truck', 'ติดตามคนส่ง']]} />}
      footer={(
        <>
          <Button size="lg" block disabled={!selected} busy={busy} onClick={next}>
            {selected ? 'เลือกร้านนี้' : 'แตะร้านบนแผนที่หรือในรายการ'}
          </Button>
        </>
      )}
    >
      {staffOf.length ? (
        <a className="tile tile-peach" href="#/pharmacist" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <span className="tile-icon"><Icon name="list" /></span>
          <div><div className="tile-label">งานของร้าน {staffOf[0].pharmacy.name}</div><div className="muted small">คำสั่งซื้อใหม่ คิวประเมิน และการจัดส่ง</div></div>
        </a>
      ) : null}

      <div className="split">
      <div className="stack split-map">
      <p className="muted">สแกนร้านยาพาร์ทเนอร์ในรัศมี {RADIUS_KM} กิโลเมตรจากตำแหน่งของคุณ</p>
      <FlowMap center={center} radiusKm={RADIUS_KM} partners={partners} others={showOthers ? others : []} selectedId={selectedId} onSelect={onSelect} />
      <div className="row">
        <Button size="sm" variant="secondary" onClick={locate}><Icon name="locate" size={20} />ใช้ตำแหน่งของฉัน</Button>
        <Button size="sm" variant="ghost" onClick={() => { setCenter(VICTORY_MONUMENT); setSelectedId(null); }}>ใช้ตำแหน่งตัวอย่าง (อนุสาวรีย์ชัยฯ)</Button>
      </div>
      <ErrorText>{error}</ErrorText>
      </div>

      <div className="stack split-list">
      <div className="between">
        <h2>ร้านที่สั่งซื้อได้ ({partners.length})</h2>
        <MockBadge />
      </div>
      {loading ? <Loading /> : partners.length ? (
        <div className="option-list" role="group" aria-label="ร้านยาพาร์ทเนอร์">
          {partners.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`option store-option${p.id === selectedId ? ' selected' : ''}`}
              aria-pressed={p.id === selectedId}
              onClick={() => setSelectedId(p.id)}
            >
              <span className="option-box" aria-hidden>{p.id === selectedId ? '✓' : ''}</span>
              <span className="store-option-main">
                <strong>{p.name}</strong>
                <span className="muted small">{p.address}</span>
                <span className="row small">
                  <span className="num">{p.km.toFixed(1)} กม.</span>
                  {p.ratingCount ? <span>★ {p.ratingAvg} ({p.ratingCount})</span> : null}
                  {p.services?.includes('telepharmacy') ? <Badge tone="good">ปรึกษาเภสัชกรได้</Badge> : null}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Notice tone="warn" title={`ไม่พบร้านพาร์ทเนอร์ในรัศมี ${RADIUS_KM} กม.`}>
          ลองใช้ตำแหน่งตัวอย่างด้านบน ร้านพาร์ทเนอร์ตัวอย่างอยู่ในกรุงเทพฯ
        </Notice>
      )}

      <label className="check">
        <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} />
        แสดงร้านยาที่มีใบอนุญาตรอบตัว ({others.length}) บนแผนที่
      </label>
      <p className="muted small">
        ร้านอื่นสั่งซื้อออนไลน์ไม่ได้ ข้อมูล อย. ไม่มีที่อยู่ร้าน ตำแหน่งจึงเป็นจุดกึ่งกลางแขวง/เขต และค้นหาได้ไกลสุดราว 10 กม.
      </p>
      </div>
      </div>
    </FlowPage>
  );
}
