// General goods in the chosen pharmacy (shampoo, vitamins, supplements, health gear), laid out
// like a normal shopping app: search, category chips, product grid, cart bar at the bottom.
import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { go, useQueryData } from '../lib/hooks.js';
import { baht } from '../lib/format.js';
import { Badge, Button, Empty, Icon, Loading, MockBadge } from '../components/ui.jsx';
import FlowPage, { Redirect } from './FlowPage.jsx';
import { StockLine, toLine } from './ResultStep.jsx';
import { STEPS_GOODS, useFlow } from './state.jsx';

export const CATEGORIES = [
  ['all', 'ทั้งหมด', 'store', 'peach'],
  ['hairskin', 'ผมและผิว', 'user', 'peach'],
  ['vitamin', 'วิตามิน', 'pill', 'honey'],
  ['supplement', 'อาหารเสริม', 'shield', 'sage'],
  ['oral', 'ช่องปาก', 'check', 'rose'],
  ['gear', 'อุปกรณ์สุขภาพ', 'list', 'honey'],
];
const category = (id) => CATEGORIES.find(([c]) => c === id) ?? CATEGORIES[0];

const SORTS = [['recommended', 'แนะนำ'], ['low', 'ราคาต่ำ → สูง'], ['high', 'ราคาสูง → ต่ำ']];

// No product photos in the sample data, so each card gets a tinted tile with its category icon.
function Thumb({ product }) {
  const [, , icon, tone] = category(product.category);
  return <div className={`thumb tile-${tone}`} aria-hidden><Icon name={icon} size={40} stroke={1.8} /></div>;
}

function ProductCard({ product, qty, onQty }) {
  const out = product.stockStatus === 'out_of_stock' || product.deliverable === false;
  return (
    <article className="product">
      <Thumb product={product} />
      <h3 className="product-name">{product.name}</h3>
      <span className="muted small">{product.packSize}</span>
      <div className="product-price num">{baht(product.price)}</div>
      <StockLine product={product} compact />
      {out ? <Badge tone="bad">สินค้าหมด</Badge> : qty ? (
        <div className="qty" role="group" aria-label={`จำนวน ${product.name}`}>
          <button type="button" onClick={() => onQty(qty - 1)} aria-label={`ลด ${product.name}`}>−</button>
          <span aria-live="polite">{qty}</span>
          <button type="button" onClick={() => onQty(qty + 1)} aria-label={`เพิ่ม ${product.name}`}>+</button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => onQty(1)} aria-label={`ใส่ ${product.name} ลงตะกร้า`}>
          <Icon name="plus" size={18} stroke={2.6} />ใส่ตะกร้า
        </Button>
      )}
    </article>
  );
}

export default function ShopStep() {
  const flow = useFlow();
  const { pharmacy } = flow;
  const [products, loading] = useQueryData(
    pharmacy ? query(collection(db, 'pharmacies', pharmacy.id, 'products'), where('active', '==', true)) : null, [pharmacy?.id],
  );
  const [text, setText] = useState('');
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState('recommended');

  const goods = useMemo(() => products.filter((p) => p.drugClass === 'general'), [products]);
  const shown = useMemo(() => {
    const q = text.replace(/\s+/g, '').toLowerCase();
    const rows = goods.filter((p) => (cat === 'all' || p.category === cat) && (!q || p.name.replace(/\s+/g, '').toLowerCase().includes(q)));
    if (sort === 'low') rows.sort((a, b) => a.price - b.price);
    if (sort === 'high') rows.sort((a, b) => b.price - a.price);
    return rows;
  }, [goods, text, cat, sort]);

  if (!pharmacy) return <Redirect to="" />;

  const qtyOf = (id) => flow.cart.find((l) => l.productId === id)?.qty ?? 0;
  const setQty = (product, qty) => {
    const q = Math.max(0, Math.min(10, qty));
    flow.update((p) => ({
      cart: q === 0 ? p.cart.filter((l) => l.productId !== product.id)
        : p.cart.some((l) => l.productId === product.id) ? p.cart.map((l) => (l.productId === product.id ? { ...l, qty: q } : l))
          : [...p.cart, toLine(product, q)],
    }));
  };
  const count = flow.cart.reduce((n, l) => n + l.qty, 0);
  const total = flow.cart.reduce((s, l) => s + l.price * l.qty, 0);

  return (
    <FlowPage
      step={3}
      steps={STEPS_GOODS}
      wide
      title="ของทั่วไปในร้านยา"
      onBack={() => go('choose')}
      footer={count ? (
        <Button size="lg" block onClick={() => go('checkout')}>
          <span className="cart-label"><Icon name="store" size={22} />ตะกร้า {count} ชิ้น · {baht(total)}</span>
          <span>ไปชำระ ›</span>
        </Button>
      ) : null}
    >
      <div className="between"><span className="muted small">{pharmacy.name}</span><MockBadge /></div>
      <input type="search" name="shop-search" autoComplete="off" placeholder="ค้นหาสินค้า เช่น แชมพู วิตามิน…" aria-label="ค้นหาสินค้า" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="chips" role="group" aria-label="หมวดสินค้า">
        {CATEGORIES.map(([id, label, icon]) => (
          <button key={id} type="button" className={`chip${cat === id ? ' on' : ''}`} aria-pressed={cat === id} onClick={() => setCat(id)}>
            <Icon name={icon} size={18} />{label}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="เรียงสินค้า">
        {SORTS.map(([id, label]) => (
          <button key={id} type="button" className={`chip chip-text${sort === id ? ' on' : ''}`} aria-pressed={sort === id} onClick={() => setSort(id)}>{label}</button>
        ))}
      </div>

      {loading ? <Loading /> : shown.length ? (
        <div className="product-grid">
          {shown.map((p) => <ProductCard key={p.id} product={p} qty={qtyOf(p.id)} onQty={(q) => setQty(p, q)} />)}
        </div>
      ) : (
        <Empty icon="store" title={goods.length ? 'ไม่พบสินค้าที่ค้นหา' : 'ร้านนี้ยังไม่มีสินค้าทั่วไป'}>
          {goods.length ? 'ลองเปลี่ยนคำค้นหรือหมวดสินค้า' : 'ลองเลือกร้านอื่น'}
        </Empty>
      )}
      <p className="muted small">สินค้า ราคา และสต็อกเป็นข้อมูลจำลอง ร้านจะยืนยันสต็อกจริงก่อนให้ชำระเงิน</p>
    </FlowPage>
  );
}
