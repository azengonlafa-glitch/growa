// Demo data for the hackathon. Everything here is SAMPLE data:
// - catalog drug classes are illustrative and must be checked against the
//   Thai FDA (อย.) classification before any real use;
// - pharmacies and prices are fictional (Google Places provides real store
//   names/reviews live via searchPharmacies, but not stock or prices).
import { existsSync, readFileSync } from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';

const DIRECTORY_FILE = 'data/pharmacy-directory-bangkok.json';

// Real licensed pharmacies from FDA open data (built by import-fda-directory.mjs).
export async function seedDirectory(db) {
  if (!existsSync(DIRECTORY_FILE)) return 0;
  const { pharmacies, source, locationSource } = JSON.parse(readFileSync(DIRECTORY_FILE, 'utf8'));
  for (let i = 0; i < pharmacies.length; i += 450) {
    const batch = db.batch();
    for (const { id, ...p } of pharmacies.slice(i, i + 450)) {
      batch.set(db.doc(`pharmacyDirectory/${id}`), { ...p, source, locationSource });
    }
    await batch.commit();
  }
  return pharmacies.length;
}

// drugClass: household = ยาสามัญประจำบ้าน, dangerous = ยาอันตราย (pharmacist),
// controlled = ยาควบคุมพิเศษ (not sold online), general = non-drug product.
export const CATALOG = {
  para500: { genericName: 'Paracetamol', form: 'tablet', strength: '500 mg', drugClass: 'household', requiresPharmacistReview: false, deliverable: true },
  ors: { genericName: 'Oral rehydration salts', form: 'powder', strength: '1 ซอง', drugClass: 'household', requiresPharmacistReview: false, deliverable: true },
  cpm4: { genericName: 'Chlorpheniramine', form: 'tablet', strength: '4 mg', drugClass: 'household', requiresPharmacistReview: false, deliverable: true },
  antacid: { genericName: 'Aluminium hydroxide + Magnesium hydroxide', form: 'suspension', strength: '240 ml', drugClass: 'household', requiresPharmacistReview: false, deliverable: true },
  calamine: { genericName: 'Calamine lotion', form: 'lotion', strength: '60 ml', drugClass: 'household', requiresPharmacistReview: false, deliverable: true },
  vitc500: { genericName: 'Vitamin C', form: 'tablet', strength: '500 mg', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  shampooAntiDandruff: { genericName: 'แชมพูขจัดรังแค', form: 'shampoo', strength: '200 มล.', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  shampooGentle: { genericName: 'แชมพูสูตรอ่อนโยน', form: 'shampoo', strength: '300 มล.', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  conditioner: { genericName: 'ครีมนวดผม', form: 'conditioner', strength: '250 มล.', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  sunscreen: { genericName: 'ครีมกันแดด SPF50', form: 'cream', strength: '50 มล.', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  moisturizer: { genericName: 'โลชั่นบำรุงผิว', form: 'lotion', strength: '250 มล.', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  lipBalm: { genericName: 'ลิปบาล์มบำรุงริมฝีปาก', form: 'balm', strength: '4 ก.', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  toothpaste: { genericName: 'ยาสีฟันฟลูออไรด์', form: 'toothpaste', strength: '160 ก.', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  handGel: { genericName: 'เจลล้างมือแอลกอฮอล์', form: 'gel', strength: '100 มล.', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  multivit: { genericName: 'วิตามินรวม', form: 'tablet', strength: '60 เม็ด', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  calciumD: { genericName: 'แคลเซียมพลัสวิตามินดี', form: 'tablet', strength: '30 เม็ด', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  fishOil: { genericName: 'น้ำมันปลา', form: 'capsule', strength: '30 แคปซูล', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  probiotic: { genericName: 'โพรไบโอติก', form: 'powder', strength: '10 ซอง', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  collagen: { genericName: 'คอลลาเจนผง', form: 'powder', strength: '14 ซอง', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  faceMask: { genericName: 'หน้ากากอนามัย', form: 'mask', strength: '50 ชิ้น', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  thermometer: { genericName: 'ปรอทวัดไข้ดิจิทัล', form: 'device', strength: '1 เครื่อง', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  bandage: { genericName: 'พลาสเตอร์ปิดแผล', form: 'bandage', strength: '100 ชิ้น', drugClass: 'general', requiresPharmacistReview: false, deliverable: true },
  loratadine10: { genericName: 'Loratadine', form: 'tablet', strength: '10 mg', drugClass: 'dangerous', requiresPharmacistReview: true, deliverable: true },
  cetirizine10: { genericName: 'Cetirizine', form: 'tablet', strength: '10 mg', drugClass: 'dangerous', requiresPharmacistReview: true, deliverable: true },
  ibuprofen400: { genericName: 'Ibuprofen', form: 'tablet', strength: '400 mg', drugClass: 'dangerous', requiresPharmacistReview: true, deliverable: true },
  omeprazole20: { genericName: 'Omeprazole', form: 'capsule', strength: '20 mg', drugClass: 'dangerous', requiresPharmacistReview: true, deliverable: true },
  amlodipine5: { genericName: 'Amlodipine', form: 'tablet', strength: '5 mg', drugClass: 'dangerous', requiresPharmacistReview: true, deliverable: true },
  metformin500: { genericName: 'Metformin', form: 'tablet', strength: '500 mg', drugClass: 'dangerous', requiresPharmacistReview: true, deliverable: true },
  simvastatin20: { genericName: 'Simvastatin', form: 'tablet', strength: '20 mg', drugClass: 'dangerous', requiresPharmacistReview: true, deliverable: true },
  diazepam5: { genericName: 'Diazepam', form: 'tablet', strength: '5 mg', drugClass: 'controlled', requiresPharmacistReview: true, deliverable: false },
};

const week = (open, close, days) => Object.fromEntries(days.map((d) => [d, [{ open, close }]]));

// Fictional partner stores near Victory Monument, Bangkok.
export const PHARMACIES = {
  demoRx1: {
    name: 'ร้านยา growa สาขาอนุสาวรีย์ (ข้อมูลจำลอง)',
    address: 'ถนนพหลโยธิน แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพฯ (ข้อมูลจำลอง)',
    phone: '02-000-0001',
    licenseNo: 'DEMO-0001',
    geo: { lat: 13.7650, lng: 100.5381 },
    googlePlaceId: null,
    deliveryZones: [{ radiusKm: 3, fee: 30 }, { radiusKm: 8, fee: 60 }],
    openingHours: { ...week('08:00', '21:00', ['mon', 'tue', 'wed', 'thu', 'fri']), sat: [{ open: '09:00', close: '18:00' }] },
    services: ['delivery', 'telepharmacy', 'refill'],
  },
  demoRx2: {
    name: 'ร้านยาสุขภาพดี สาขาอารีย์ (ข้อมูลจำลอง)',
    address: 'ซอยอารีย์ เขตพญาไท กรุงเทพฯ (ข้อมูลจำลอง)',
    phone: '02-000-0002',
    licenseNo: 'DEMO-0002',
    geo: { lat: 13.7796, lng: 100.5446 },
    googlePlaceId: null,
    deliveryZones: [{ radiusKm: 5, fee: 40 }],
    openingHours: { ...week('09:00', '20:00', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']), sun: [{ open: '10:00', close: '16:00' }] },
    services: ['delivery', 'telepharmacy'],
  },
};

// [catalogId, display name, pack size, units per pack, price THB, shop category (general goods only)]
const PRODUCTS = [
  ['para500', 'พาราเซตามอล 500 มก.', 'แผง 10 เม็ด', 10, 15],
  ['ors', 'ผงเกลือแร่ ORS', 'กล่อง 10 ซอง', 10, 45],
  ['cpm4', 'คลอร์เฟนิรามีน 4 มก.', 'แผง 10 เม็ด', 10, 10],
  ['antacid', 'ยาลดกรดชนิดน้ำ', 'ขวด 240 มล.', 1, 65],
  ['vitc500', 'วิตามินซี 500 มก.', 'ขวด 30 เม็ด', 30, 120, 'vitamin'],
  ['loratadine10', 'ลอราทาดีน 10 มก.', 'แผง 10 เม็ด', 10, 60],
  ['ibuprofen400', 'ไอบูโพรเฟน 400 มก.', 'แผง 10 เม็ด', 10, 35],
  ['omeprazole20', 'โอเมพราโซล 20 มก.', 'แผง 10 แคปซูล', 10, 80],
  ['amlodipine5', 'แอมโลดิปีน 5 มก.', 'กล่อง 30 เม็ด', 30, 150],
  ['metformin500', 'เมทฟอร์มิน 500 มก.', 'กล่อง 50 เม็ด', 50, 120],
  ['diazepam5', 'ไดอะซีแพม 5 มก.', 'แผง 10 เม็ด', 10, 50],
  // General goods (drugClass "general"): [catalogId, name, pack, units, price, category]
  ['shampooAntiDandruff', 'แชมพูขจัดรังแค 200 มล.', 'ขวด 200 มล.', 1, 129, 'hairskin'],
  ['shampooGentle', 'แชมพูสูตรอ่อนโยน 300 มล.', 'ขวด 300 มล.', 1, 99, 'hairskin'],
  ['conditioner', 'ครีมนวดผม 250 มล.', 'ขวด 250 มล.', 1, 109, 'hairskin'],
  ['sunscreen', 'ครีมกันแดด SPF50 50 มล.', 'หลอด 50 มล.', 1, 259, 'hairskin'],
  ['moisturizer', 'โลชั่นบำรุงผิว 250 มล.', 'ขวด 250 มล.', 1, 179, 'hairskin'],
  ['lipBalm', 'ลิปบาล์มบำรุงริมฝีปาก', 'แท่ง 4 ก.', 1, 59, 'hairskin'],
  ['toothpaste', 'ยาสีฟันฟลูออไรด์ 160 ก.', 'หลอด 160 ก.', 1, 69, 'oral'],
  ['handGel', 'เจลล้างมือแอลกอฮอล์ 100 มล.', 'ขวด 100 มล.', 1, 49, 'gear'],
  ['multivit', 'วิตามินรวม 60 เม็ด', 'ขวด 60 เม็ด', 60, 350, 'vitamin'],
  ['calciumD', 'แคลเซียมพลัสวิตามินดี 30 เม็ด', 'ขวด 30 เม็ด', 30, 280, 'vitamin'],
  ['fishOil', 'น้ำมันปลา 30 แคปซูล', 'ขวด 30 แคปซูล', 30, 320, 'supplement'],
  ['probiotic', 'โพรไบโอติก 10 ซอง', 'กล่อง 10 ซอง', 10, 399, 'supplement'],
  ['collagen', 'คอลลาเจนผง 14 ซอง', 'กล่อง 14 ซอง', 14, 590, 'supplement'],
  ['faceMask', 'หน้ากากอนามัย 50 ชิ้น', 'กล่อง 50 ชิ้น', 50, 79, 'gear'],
  ['thermometer', 'ปรอทวัดไข้ดิจิทัล', 'เครื่อง', 1, 199, 'gear'],
  ['bandage', 'พลาสเตอร์ปิดแผล 100 ชิ้น', 'กล่อง 100 ชิ้น', 100, 59, 'gear'],
];

export async function seedCatalogAndPharmacies(db) {
  const batch = db.batch();
  for (const [id, drug] of Object.entries(CATALOG)) {
    batch.set(db.doc(`catalog/${id}`), {
      ...drug, brandNames: [], warnings: [], sample: true, updatedAt: FieldValue.serverTimestamp(),
    });
  }
  for (const [id, ph] of Object.entries(PHARMACIES)) {
    batch.set(db.doc(`pharmacies/${id}`), {
      ...ph, verificationStatus: 'approved', ownerUid: null, ratingAvg: null, ratingCount: 0,
      sample: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    for (const [catalogId, name, packSize, unitsPerPack, price, category] of PRODUCTS) {
      const drug = CATALOG[catalogId];
      batch.set(db.doc(`pharmacies/${id}/products/${catalogId}`), {
        catalogId, name, packSize, unitsPerPack, price, currency: 'THB',
        ...(category ? { category } : {}),
        stockStatus: 'in_stock', stockQty: 50, stockSource: 'manual', active: true,
        stockUpdatedAt: FieldValue.serverTimestamp(),
        drugClass: drug.drugClass,
        requiresPharmacistReview: drug.requiresPharmacistReview,
        deliverable: drug.deliverable,
      });
    }
  }
  await batch.commit();
}
