import { go } from '../lib/hooks.js';
import { Icon, MockBadge } from '../components/ui.jsx';
import { Splash } from '../components/Flair.jsx';
import FlowPage, { Redirect } from './FlowPage.jsx';
import { useFlow } from './state.jsx';

export default function ChooseStep() {
  const flow = useFlow();
  const { pharmacy } = flow;
  if (!pharmacy) return <Redirect to="" />;

  const choose = (kind) => {
    flow.update({ kind, triage: null, consult: null, cart: [] });
    go(kind === 'drug' ? 'triage' : 'shop');
  };

  return (
    <FlowPage wide step={2} title="วันนี้ต้องการอะไร" onBack={() => go('')} hero={<Splash title="ให้ growa ช่วยอะไรดี" sub="เลือกทางที่ตรงกับวันนี้ เราพาไปทีละขั้น" />}>
      <div className="card stack" style={{ gap: 4 }}>
        <div className="between">
          <span className="muted small">ร้านที่เลือก</span>
          <a href="#/" className="small">เปลี่ยนร้าน</a>
        </div>
        <strong>{pharmacy.name}</strong>
        <span className="muted small">{pharmacy.address}</span>
        {pharmacy.sample ? <div><MockBadge /></div> : null}
      </div>

      <div className="choice-grid">
        <button type="button" className="choice choice-drug" onClick={() => choose('drug')}>
          <span className="tile-icon"><Icon name="pill" size={32} /></span>
          <span className="choice-title">สั่งสินค้าประเภทยา</span>
          <span className="muted">ตอบคำถามอาการสั้น ๆ แล้วระบบจะแนะนำทางที่เหมาะสม ยาบางชนิดเภสัชกรของร้านต้องตรวจก่อน</span>
        </button>
        <button type="button" className="choice choice-goods" onClick={() => choose('goods')}>
          <span className="tile-icon"><Icon name="store" size={32} /></span>
          <span className="choice-title">ของทั่วไปในร้านยา</span>
          <span className="muted">แชมพู วิตามิน อาหารเสริม และของใช้เพื่อสุขภาพ เลือกใส่ตะกร้าได้เลย</span>
        </button>
      </div>
    </FlowPage>
  );
}
