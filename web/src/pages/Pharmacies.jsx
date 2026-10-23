import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { useAction, useQueryData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Badge, Button, Card, ErrorText, Loading, MockBadge, PageHeader, Segmented } from '../components/ui.jsx';
import PharmacyMap from '../components/PharmacyMap.jsx';

const VICTORY_MONUMENT = { lat: 13.765, lng: 100.5381 };

function km(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export default function Pharmacies() {
  const { profile } = useSession();
  const home = profile?.addresses?.[0]?.geo ?? VICTORY_MONUMENT;
  const [center, setCenter] = useState(home);
  const [radius, setRadius] = useState('2000');
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const { busy, error, run, setError } = useAction();

  const [partners] = useQueryData(query(collection(db, 'pharmacies'), where('verificationStatus', '==', 'approved')), []);
  const partnersNear = useMemo(
    () => partners.map((p) => ({ ...p, km: km(center, p.geo) })).sort((a, b) => a.km - b.km),
    [partners, center],
  );

  const search = useCallback((q = text) => run(async () => {
    setResult(await call('searchPharmacies', { location: center, radiusM: Number(radius), query: q || null }));
  }), [center, radius, text, run]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search(); }, [center, radius]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง ใช้ที่อยู่ในโปรไฟล์แทน'),
    );
  };

  const places = result?.places ?? [];
  return (
    <div className="stack-lg">
      <PageHeader
        title="ร้านยาใกล้ฉัน"
        subtitle="ร้านพาร์ทเนอร์สั่งซื้อและปรึกษาเภสัชกรได้ ร้านอื่นแสดงจากข้อมูลใบอนุญาตของ อย."
        actions={<Button variant="secondary" size="sm" onClick={useMyLocation}>◎ ใช้ตำแหน่งปัจจุบัน</Button>}
      />

      <section className="stack">
        <div className="section-title"><h2>ร้านพาร์ทเนอร์ที่สั่งซื้อได้</h2><MockBadge /></div>
        <div className="grid-cards">
          {partnersNear.map((p) => (
            <a key={p.id} className="card card-link stack" href={`#/store/${p.id}`}>
              <h3>{p.name}</h3>
              <p className="muted small">{p.address}</p>
              <div className="row">
                <Badge tone="good">สั่งซื้อได้</Badge>
                <span className="small num">{p.km.toFixed(1)} กม.</span>
                {p.ratingCount ? <span className="small">★ {p.ratingAvg} ({p.ratingCount})</span> : null}
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="stack">
        <div className="section-title">
          <h2>ร้านยาที่มีใบอนุญาตในพื้นที่</h2>
          <span className="muted small">{result?.source ?? ''}</span>
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input style={{ flex: '1 1 200px' }} placeholder="ค้นหาชื่อร้าน" value={text} onChange={(e) => setText(e.target.value)} aria-label="ค้นหาชื่อร้าน" />
          <Button type="submit" busy={busy}>ค้นหา</Button>
        </form>
        <Segmented value={radius} onChange={setRadius} options={[['1000', '1 กม.'], ['2000', '2 กม.'], ['5000', '5 กม.']]} />
        <ErrorText>{error}</ErrorText>

        <PharmacyMap center={center} places={places} partners={partnersNear} onSelect={setSelected} />
        <p className="muted small">
          ข้อมูล อย. ไม่มีที่อยู่ร้าน ตำแหน่งบนแผนที่จึงเป็นจุดกึ่งกลางของแขวง/เขต ระยะทางเป็นค่าโดยประมาณ
        </p>

        {busy && !result ? <Loading /> : null}
        <Card>
          {places.length ? (
            <div className="list">
              {places.map((p) => (
                <div key={p.directoryId ?? p.placeId} className="list-item" style={selected?.directoryId === p.directoryId ? { background: 'var(--primary-soft)' } : null}>
                  <div className="list-item-main stack" style={{ gap: 2 }}>
                    <strong>{p.name}</strong>
                    <span className="muted small">{p.address}</span>
                    <span className="small">
                      {p.licenseNo ? <>ใบอนุญาต {p.licenseNo} · </> : null}
                      {p.pharmacistHours ? <>เภสัชกรปฏิบัติการ {p.pharmacistHours}</> : null}
                    </span>
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                    <span className="small num">~{p.distanceKm} กม.</span>
                    {p.partnerPharmacyId
                      ? <a className="btn btn-primary btn-sm" href={`#/store/${p.partnerPharmacyId}`}>สั่งซื้อ</a>
                      : <Badge>ยังไม่เข้าร่วม</Badge>}
                  </div>
                </div>
              ))}
            </div>
          ) : !busy ? <p className="muted">ไม่พบร้านยาในรัศมีนี้</p> : null}
        </Card>
      </section>
    </div>
  );
}
