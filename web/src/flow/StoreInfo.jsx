// Details of one pharmacy, opened from a small button on its row in step 1: rating, reviews, address,
// phone, opening hours, services and delivery fees. A bottom sheet on a phone, a centred card on a computer.
import { useEffect, useMemo, useRef } from 'react';
import { collection, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useQueryData } from '../lib/hooks.js';
import { baht, timeAgo } from '../lib/format.js';
import { Badge, Button, Empty, Icon, Loading, MockBadge } from '../components/ui.jsx';

const DAYS = [['mon', 'จันทร์'], ['tue', 'อังคาร'], ['wed', 'พุธ'], ['thu', 'พฤหัสบดี'], ['fri', 'ศุกร์'], ['sat', 'เสาร์'], ['sun', 'อาทิตย์']];
const SERVICES = { delivery: 'จัดส่งถึงบ้าน', telepharmacy: 'ปรึกษาเภสัชกรออนไลน์', refill: 'เติมยาประจำ' };
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Opening hours are Bangkok time (UTC+7), whatever the device clock says.
const todayKey = () => WEEKDAY_KEYS[new Date(Date.now() + 7 * 3600 * 1000).getUTCDay()];

export function Stars({ value, size = 18 }) {
  return (
    <span className="stars" role="img" aria-label={`${value} จาก 5 ดาว`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" className={n <= Math.round(value) ? 'on' : ''} aria-hidden>
          <path d="M12 3l2.7 5.8 6.3.8-4.6 4.3 1.2 6.3L12 17.1 6.4 20.2l1.2-6.3L3 9.6l6.3-.8z" />
        </svg>
      ))}
    </span>
  );
}

function Hours({ hours }) {
  const today = todayKey();
  if (!hours || !Object.keys(hours).length) return <p className="muted">ร้านยังไม่ได้ระบุเวลาทำการ</p>;
  return (
    <dl className="hours">
      {DAYS.map(([key, label]) => {
        const slots = hours[key];
        return (
          <div key={key} className={key === today ? 'today' : ''}>
            <dt>{label}{key === today ? ' (วันนี้)' : ''}</dt>
            <dd className="num">{slots?.length ? slots.map((s) => `${s.open}–${s.close}`).join(', ') : 'ไม่ระบุ'}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export default function StoreInfo({ pharmacy, route, onClose, onChoose, chosen }) {
  const panel = useRef(null);
  const [ratings, loading] = useQueryData(
    query(collection(db, 'pharmacyRatings'), where('pharmacyId', '==', pharmacy.id), where('hidden', '==', false), limit(20)), [pharmacy.id],
  );
  const reviews = useMemo(() => [...ratings].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)), [ratings]);
  const zones = useMemo(() => [...(pharmacy.deliveryZones ?? [])].sort((a, b) => a.radiusKm - b.radiusKm), [pharmacy.deliveryZones]);

  useEffect(() => {
    const back = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [onClose]);

  const rated = pharmacy.ratingCount > 0;
  return (
    <div className="info-backdrop" onClick={onClose}>
      <section className="info-panel" role="dialog" aria-modal="true" aria-labelledby="info-title" tabIndex={-1} ref={panel} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grab" aria-hidden />
        <header className="info-head">
          <div>
            <h2 id="info-title">{pharmacy.name}</h2>
            <div className="info-rating">
              {rated ? (
                <>
                  <Stars value={pharmacy.ratingAvg} />
                  <strong className="num">{Number(pharmacy.ratingAvg).toFixed(1)}</strong>
                  <span className="muted">({pharmacy.ratingCount} รีวิว)</span>
                </>
              ) : <span className="muted">ยังไม่มีรีวิว</span>}
            </div>
          </div>
          <button type="button" className="round-btn info-close" onClick={onClose} aria-label="ปิด"><Icon name="close" size={22} /></button>
        </header>

        <div className="info-scroll">
          <div className="info-facts">
            {route ? <span><Icon name="clock" size={18} /><strong className="num">{route.minutes} นาที</strong> · <span className="num">{route.km.toFixed(1)} กม.</span></span> : <span />}
            <MockBadge />
          </div>

          <h3>ข้อมูลร้าน</h3>
          <ul className="info-list">
            <li><Icon name="store" size={20} /><span>{pharmacy.address}</span></li>
            {pharmacy.phone ? <li><Icon name="phone" size={20} /><a href={`tel:${pharmacy.phone.replace(/[^\d+]/g, '')}`} className="num">{pharmacy.phone}</a></li> : null}
          </ul>
          {pharmacy.services?.length ? (
            <div className="info-chips">{pharmacy.services.map((s) => <Badge key={s} tone="good">{SERVICES[s] ?? s}</Badge>)}</div>
          ) : null}

          <h3>เวลาทำการ</h3>
          <Hours hours={pharmacy.openingHours} />

          {zones.length ? (
            <>
              <h3>ค่าจัดส่ง</h3>
              <ul className="info-list">
                {zones.map((z) => (
                  <li key={z.radiusKm}><Icon name="truck" size={20} /><span>ไม่เกิน <strong className="num">{z.radiusKm} กม.</strong> · <span className="num">{baht(z.fee)}</span></span></li>
                ))}
              </ul>
            </>
          ) : null}

          <h3>รีวิวจากผู้ใช้</h3>
          {loading ? <Loading /> : reviews.length ? (
            <ul className="reviews">
              {reviews.map((r) => (
                <li key={r.id}>
                  <div className="between"><Stars value={r.rating} size={16} /><span className="muted small">{timeAgo(r.createdAt)}</span></div>
                  <p>{r.comment || 'ให้คะแนนโดยไม่เขียนความเห็น'}</p>
                </li>
              ))}
            </ul>
          ) : <Empty icon="shield" title="ยังไม่มีรีวิว">รีวิวจะแสดงหลังมีผู้ใช้รับสินค้าและให้คะแนนร้านนี้</Empty>}
          <p className="muted small">คะแนนและรีวิวมาจากผู้ที่รับสินค้าจากร้านนี้จริงเท่านั้น รีวิวที่ติดป้ายตัวอย่างสร้างไว้เพื่อสาธิต</p>
        </div>

        <div className="sheet-cta">
          <Button size="lg" block onClick={onChoose}>{chosen ? 'ปิด' : 'เลือกร้านนี้'}</Button>
        </div>
      </section>
    </div>
  );
}
