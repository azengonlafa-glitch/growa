export const baht = (n) => `฿${Number(n ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

const toDate = (t) => (t?.toDate ? t.toDate() : t instanceof Date ? t : t ? new Date(t) : null);

export function dateTime(t) {
  const d = toDate(t);
  return d ? d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function shortDate(t) {
  const d = toDate(t);
  return d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '—';
}

export function timeAgo(t) {
  const d = toDate(t);
  if (!d) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  if (min < 1440) return `${Math.round(min / 60)} ชั่วโมงที่แล้ว`;
  return shortDate(d);
}

// tone: neutral | info | warn | good | bad
export const ORDER_STATUS = {
  pharmacy_checking: ['รอร้านยืนยันสินค้า', 'info'],
  out_of_stock: ['สินค้าไม่พร้อม', 'bad'],
  awaiting_pharmacist: ['รอเภสัชกรประเมิน', 'warn'],
  need_more_info: ['เภสัชกรขอข้อมูลเพิ่ม', 'warn'],
  awaiting_payment: ['รอชำระเงิน', 'info'],
  payment_failed: ['ชำระเงินไม่สำเร็จ', 'bad'],
  paid: ['ชำระเงินแล้ว', 'good'],
  preparing: ['กำลังจัดเตรียมยา', 'info'],
  shipping: ['กำลังจัดส่ง', 'info'],
  delivery_issue: ['การจัดส่งมีปัญหา', 'bad'],
  delivered: ['ได้รับยาแล้ว', 'good'],
  cancelled: ['ยกเลิกแล้ว', 'neutral'],
  rejected: ['เภสัชกรไม่อนุมัติ', 'bad'],
  refunded: ['คืนเงินแล้ว', 'neutral'],
};

export const ROUTE_INFO = {
  self_care: ['ดูแลตัวเองเบื้องต้นได้', 'good'],
  pharmacist: ['ควรปรึกษาเภสัชกร', 'info'],
  doctor: ['ควรพบแพทย์', 'warn'],
  urgent: ['ควรพบแพทย์ภายในวันนี้', 'bad'],
  emergency: ['ฉุกเฉิน', 'bad'],
};

export const DRUG_CLASS = {
  household: 'ยาสามัญประจำบ้าน',
  dangerous: 'ยาอันตราย · ต้องผ่านเภสัชกร',
  controlled: 'ยาควบคุมพิเศษ · สั่งออนไลน์ไม่ได้',
  prescription: 'ต้องมีใบสั่งแพทย์',
  general: 'ผลิตภัณฑ์ทั่วไป',
  unknown: 'รอตรวจสอบประเภทยา',
};
