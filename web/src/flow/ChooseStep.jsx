import { go } from '../lib/hooks.js';
import { Icon, MockBadge } from '../components/ui.jsx';
import FlowPage, { Redirect } from './FlowPage.jsx';
import { useFlow } from './state.jsx';
import './choose.css';

export default function ChooseStep() {
  const flow = useFlow();
  const { pharmacy } = flow;
  if (!pharmacy) return <Redirect to="" />;

  const choose = (kind) => {
    flow.update({ kind, triage: null, consult: null, cart: [] });
    go(kind === 'drug' ? 'triage' : 'shop');
  };

  return (
    <FlowPage step={2} title="วันนี้ต้องการอะไร" onBack={() => go('')}>
      <div className="pick-store">
        <span className="pick-store-icon" aria-hidden><Icon name="store" size={22} /></span>
        <div className="pick-store-text">
          <strong>{pharmacy.name}</strong>
          <span>{pharmacy.address}</span>
          {pharmacy.sample ? <span><MockBadge /></span> : null}
        </div>
        <a href="#/">เปลี่ยนร้าน</a>
      </div>

      <ul className="pick-list">
        <li>
          <button type="button" className="pick-row" onClick={() => choose('drug')}>
            <span className="pick-row-icon" aria-hidden><Icon name="pill" size={26} /></span>
            <span className="pick-row-body">
              <span className="pick-row-title">ซื้อยา</span>
              <span className="pick-row-desc">ตอบคำถามอาการสั้น ๆ ก่อน ยาบางชนิดต้องให้เภสัชกรตรวจ</span>
            </span>
            <span className="pick-row-go" aria-hidden><Icon name="chevron" size={20} /></span>
          </button>
        </li>
        <li>
          <button type="button" className="pick-row" onClick={() => choose('goods')}>
            <span className="pick-row-icon" aria-hidden><Icon name="bag" size={26} /></span>
            <span className="pick-row-body">
              <span className="pick-row-title">ซื้อของใช้ทั่วไป</span>
              <span className="pick-row-desc">แชมพู วิตามิน อาหารเสริม ใส่ตะกร้าได้เลย</span>
            </span>
            <span className="pick-row-go" aria-hidden><Icon name="chevron" size={20} /></span>
          </button>
        </li>
      </ul>

      <p className="pick-note">ไม่แน่ใจว่าควรใช้ยาอะไร เลือก "ซื้อยา" แล้วคุยกับผู้ช่วยได้ หากมีอาการฉุกเฉินโทร <a href="tel:1669">1669</a></p>
    </FlowPage>
  );
}
