import { go } from '../lib/hooks.js';
import { Icon, MockBadge } from '../components/ui.jsx';
import FlowPage from './FlowPage.jsx';
import { useFlow } from './state.jsx';
import { Mat } from './Mat.jsx';
import './choose.css';

function Note({ cls, icon, title, desc, onPick }) {
  return (
    <li>
      <button type="button" className={`pick-row ${cls}`} onClick={onPick}>
        <span className="note-corner" aria-hidden />
        <span className="pick-row-icon" aria-hidden><Icon name={icon} size={28} /></span>
        <span className="pick-row-title">{title}
          <svg className="note-ring" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden><ellipse cx="100" cy="30" rx="94" ry="25" pathLength="1" /></svg>
        </span>
        <span className="pick-row-desc">{desc}</span>
        <span className="pick-row-go" aria-hidden><Icon name="chevron" size={22} stroke={2.6} /></span>
      </button>
    </li>
  );
}

export default function ChooseStep() {
  const flow = useFlow();
  const { pharmacy } = flow;

  const choose = (kind) => {
    flow.update({ kind, triage: null, consult: null, cart: [] });
    go(kind === 'drug' ? 'triage' : 'shop');
  };

  return (
    <div className="mat-page">
      <Mat />
      <FlowPage step={1} title="วันนี้ต้องการอะไร" onBack={() => go('')}>
        {pharmacy ? (
        <div className="pick-store">
          <span className="pick-store-icon" aria-hidden><Icon name="store" size={22} /></span>
          <div className="pick-store-text">
            <strong>{pharmacy.name}</strong>
            <span>{pharmacy.address}</span>
            {pharmacy.sample ? <span><MockBadge /></span> : null}
          </div>
          <a href="#/pharmacies">เปลี่ยนสาขา</a>
        </div>
        ) : <p className="pick-note">เลือกสิ่งที่ต้องการก่อน แล้วค่อยเลือกสาขาร้านยาตอนสั่ง</p>}

        <ul className="pick-list">
          <Note cls="note-a" icon="pill" title="ซื้อยา" desc="ตอบคำถามอาการสั้น ๆ ก่อน ยาบางชนิดต้องให้เภสัชกรตรวจ" onPick={() => choose('drug')} />
          <Note cls="note-b" icon="bag" title="ซื้อของใช้ทั่วไป" desc="แชมพู วิตามิน อาหารเสริม ใส่ตะกร้าได้เลย" onPick={() => choose('goods')} />
        </ul>

        <p className="pick-note">ไม่แน่ใจว่าควรใช้ยาอะไร เลือก "ซื้อยา" แล้วคุยกับผู้ช่วยได้ หากมีอาการฉุกเฉินโทร <a href="tel:1669">1669</a></p>
      </FlowPage>
    </div>
  );
}
