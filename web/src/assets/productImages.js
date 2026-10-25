import bandage from './products/bandage.jpg';
import calciumD from './products/calciumD.jpg';
import collagen from './products/collagen.jpg';
import conditioner from './products/conditioner.jpg';
import faceMask from './products/faceMask.jpg';
import fishOil from './products/fishOil.jpg';
import handGel from './products/handGel.jpg';
import lipBalm from './products/lipBalm.jpg';
import moisturizer from './products/moisturizer.jpg';
import multivit from './products/multivit.jpg';
import probiotic from './products/probiotic.jpg';
import shampooAntiDandruff from './products/shampooAntiDandruff.jpg';
import shampooGentle from './products/shampooGentle.jpg';
import sunscreen from './products/sunscreen.jpg';
import thermometer from './products/thermometer.jpg';
import toothpaste from './products/toothpaste.jpg';
import vitc500 from './products/vitc500.jpg';

export const PRODUCT_PHOTOS = {
  bandage,
  calciumD,
  collagen,
  conditioner,
  faceMask,
  fishOil,
  handGel,
  lipBalm,
  moisturizer,
  multivit,
  probiotic,
  shampooAntiDandruff,
  shampooGentle,
  sunscreen,
  thermometer,
  toothpaste,
  vitc500,
};

const LOWER_MAP = Object.fromEntries(
  Object.entries(PRODUCT_PHOTOS).map(([k, v]) => [k.toLowerCase(), v])
);

const KEYWORDS = [
  { match: ['พลาสเตอร์', 'ปิดแผล', 'bandage'], photo: bandage },
  { match: ['แคลเซียม', 'calcium'], photo: calciumD },
  { match: ['คอลลาเจน', 'collagen'], photo: collagen },
  { match: ['ครีมนวด', 'conditioner'], photo: conditioner },
  { match: ['หน้ากาก', 'facemask', 'mask'], photo: faceMask },
  { match: ['น้ำมันปลา', 'fishoil', 'fish oil'], photo: fishOil },
  { match: ['เจลล้างมือ', 'แอลกอฮอล์', 'handgel', 'hand gel'], photo: handGel },
  { match: ['ลิปบาล์ม', 'ลิป', 'lipbalm', 'lip balm'], photo: lipBalm },
  { match: ['บำรุงผิว', 'โลชั่น', 'moisturizer', 'lotion'], photo: moisturizer },
  { match: ['วิตามินรวม', 'multivit'], photo: multivit },
  { match: ['โพรไบโอติก', 'โพรไบ', 'probiotic'], photo: probiotic },
  { match: ['รังแค', 'ขจัดรังแค', 'dandruff'], photo: shampooAntiDandruff },
  { match: ['อ่อนโยน', 'สูตรอ่อนโยน', 'gentle'], photo: shampooGentle },
  { match: ['กันแดด', 'ครีมกันแดด', 'sunscreen'], photo: sunscreen },
  { match: ['ปรอท', 'วัดไข้', 'thermometer'], photo: thermometer },
  { match: ['ยาสีฟัน', 'ฟลูออไรด์', 'toothpaste'], photo: toothpaste },
  { match: ['วิตามินซี', 'vit c', 'vitc'], photo: vitc500 },
];

export function findProductPhoto(catalogId, label) {
  if (catalogId) {
    if (PRODUCT_PHOTOS[catalogId]) return PRODUCT_PHOTOS[catalogId];
    const low = String(catalogId).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (LOWER_MAP[low]) return LOWER_MAP[low];
    for (const [k, v] of Object.entries(LOWER_MAP)) {
      if (low.includes(k) || k.includes(low)) return v;
    }
  }

  const text = `${catalogId || ''} ${label || ''}`.toLowerCase();
  for (const { match, photo } of KEYWORDS) {
    if (match.some((m) => text.includes(m.toLowerCase()))) {
      return photo;
    }
  }

  return null;
}
