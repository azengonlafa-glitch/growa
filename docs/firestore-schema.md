# growa — Firestore Schema

ใช้คู่กับ [`firestore.rules`](../firestore.rules) และ [`firestore.indexes.json`](../firestore.indexes.json)

## หลักการออกแบบ

1. **แยกข้อมูลสุขภาพออกจากข้อมูลบัญชี**
   - ข้อมูลยา ตารางยา บันทึกการรับประทาน และประวัติแพ้ยา เก็บไว้ใต้ `patients/{patientId}` ซึ่งเป็น "โปรไฟล์ผู้ป่วย" (ต่อยอดจาก HomeCare Meds)
   - ส่วน `users/{uid}` เก็บเฉพาะข้อมูลบัญชี
2. **หนึ่งบัญชีดูแลได้หลายโปรไฟล์** ผู้ใช้ทุกคนมีโปรไฟล์ของตัวเอง 1 โปรไฟล์ (`isSelf: true`) และสร้างโปรไฟล์ให้สมาชิกที่ไม่มีบัญชีได้ เช่น คุณแม่ที่ไม่ใช้สมาร์ตโฟน
3. **สิทธิ์ผู้ดูแลกำหนดรายโปรไฟล์และรายสิทธิ์** เก็บใน `patients/{pid}/caregivers/{uid}` สิทธิ์จะเริ่มใช้ได้ก็ต่อเมื่อทั้งสองฝ่ายยินยอม (ดูหัวข้อ "สิทธิ์ผู้ดูแล")
4. **งานที่ต้องเชื่อถือได้ทำผ่าน Cloud Functions เท่านั้น** client เขียน collection ต่อไปนี้ตรง ๆ ไม่ได้ (rules ตั้งเป็น `false`) งานเหล่านี้ใช้ Admin SDK ซึ่งข้าม rules:
   - `orders` (ราคา ยอดรวม สถานะ)
   - `pharmacistReviews`
   - `triageSessions`
   - `auditLogs`
   - `notifications`
   - การตั้ง `verificationStatus` ของร้าน
5. **ประเภทยามาจากฐานข้อมูลกลาง** ร้านไม่สามารถตั้ง `requiresPharmacistReview` เองได้ ค่านี้มาจาก `catalog/{drugId}` ที่ admin ดูแล ร้านจึงลดระดับยาเพื่อเลี่ยงการประเมินไม่ได้
6. **ผู้ดูแลแพลตฟอร์มไม่เห็นข้อมูลสุขภาพ** ใน rules ไม่มีทางให้ admin อ่าน `patients/**` หรือ `triageSessions` เลย

## บทบาทและวิธีตรวจสอบ

| บทบาท | วิธีระบุใน rules |
|---|---|
| ผู้ใช้ทั่วไป | `request.auth != null` |
| เจ้าของโปรไฟล์ผู้ป่วย | `patients/{pid}.ownerUid == request.auth.uid` |
| ผู้ดูแลในครอบครัว | `patients/{pid}/caregivers/{uid}` มี `status == 'active'` และ `permissions.<สิทธิ์> == true` |
| พนักงานร้าน | `pharmacies/{phId}/staff/{uid}` มี `active == true` |
| เภสัชกร | staff ที่มี `role == 'pharmacist'` และ `licenseVerified == true` (ตั้งโดย admin เท่านั้น) |
| ผู้ดูแลแพลตฟอร์ม | custom claim `admin == true` |
| ผู้ตรวจสอบ audit log | custom claim `auditor == true` |

> Custom claims ตั้งได้จากเซิร์ฟเวอร์เท่านั้น (`admin.auth().setCustomUserClaims`) ผู้ใช้ตั้งเองไม่ได้

---

## Collections

### `users/{uid}` — ข้อมูลบัญชี

| Field | Type | หมายเหตุ |
|---|---|---|
| displayName | string | |
| email | string | |
| phone | string? | |
| addresses | array<{label, line1, district, province, postcode, geo}> | ที่อยู่จัดส่ง |
| emergencyContact | {name, phone, relation}? | กรอกหรือไม่ก็ได้ |
| notificationPrefs | {doseReminders, refillAlerts, orderUpdates, quietHours} | |
| selfPatientId | string | id ของโปรไฟล์ผู้ป่วยของตัวเอง |
| onboardedAt | timestamp? | ตั้งค่าเมื่อกรอกข้อมูลครั้งแรกเสร็จหรือกดข้าม ถ้ายังไม่มีค่า แอปจะเปิดหน้ากรอกข้อมูลครั้งแรกก่อนเข้าใช้งาน |
| createdAt | timestamp | |

สิทธิ์: อ่านและเขียนได้เฉพาะเจ้าของ ลบบัญชีผ่าน function `deleteAccount` (ลบข้อมูลที่เกี่ยวข้องแบบ cascade)

### `users/{uid}/notifications/{notifId}`

| Field | Type |
|---|---|
| type | `dose_due` \| `dose_unlogged` \| `dose_missed` \| `refill_due` \| `order_status` \| `review_pending` \| `caregiver_change` |
| title, body | string |
| patientId, orderId | string? |
| createdAt | timestamp |
| readAt | timestamp? |

สร้างโดย function เท่านั้น ผู้รับแก้ได้แค่ `readAt` และลบได้

---

### `patients/{patientId}` — โปรไฟล์ผู้ป่วย

| Field | Type | หมายเหตุ |
|---|---|---|
| ownerUid | string | เจ้าของข้อมูลหรือผู้มีอำนาจตามกฎหมาย เปลี่ยนไม่ได้ |
| isSelf | bool | `true` = โปรไฟล์ของ ownerUid เอง |
| displayName | string | ชื่อหรือชื่อเรียก |
| birthYear | number? | |
| linkedUid | string? | กรณีสมาชิกมีบัญชีของตัวเอง |
| archived | bool | ใช้ soft delete |
| createdAt | timestamp | |

### `patients/{pid}/health/profile` — ข้อมูลอ่อนไหว (เอกสารเดียว)

| Field | Type |
|---|---|
| allergies | array<{substance, reaction, severity}> |
| conditions | array<string> |
| notes | string |
| about | map (≤20 คีย์): birthDate (`YYYY-MM-DD`, ค.ศ.), sex, occupation, heightCm, weightKg, bloodType, pregnancy, smoking, alcohol, exercise |
| history | map (≤20 คีย์): otherAllergies[], noAllergies, noConditions, currentMeds[] (ข้อความ), supplements, surgeries, familyHistory[] |
| consent | {healthDataAt: timestamp, shareWithPharmacist: bool} |
| updatedAt, updatedBy | timestamp, string |

อ่านได้: เจ้าของ และผู้ดูแลที่มีสิทธิ์ `viewHealth` / เขียนได้: เจ้าของเท่านั้น

### `patients/{pid}/medications/{medId}`

| Field | Type | ใครเขียน |
|---|---|---|
| name, form, strength | string | client |
| catalogId | string? | client |
| dosePerIntake | number (>0) | client |
| unit | string (`tablet`, `ml`, ...) | client |
| times | array<`morning` \| `noon` \| `evening` \| `bedtime` \| `HH:mm`> | client |
| mealRelation | `before` \| `after` \| `with` \| `none` | client |
| asNeeded | bool | client (ยาใช้ตามอาการจะไม่นับในการประมาณยาคงเหลือ) |
| startDate, endDate | timestamp? | client |
| stockOnHand | number (>=0) | client (นับจริงล่าสุด) |
| stockCountedAt | timestamp | client (`== request.time`) |
| refillThresholdDays | number | client |
| sourcePharmacyId | string? | client |
| active | bool | client |
| verified | {by: uid, at: timestamp, source: `label` \| `pharmacist` \| `prescription`}? | function |
| estimatedRemaining | number | **function** |
| estimatedRunOutDate | timestamp | **function** |
| refillAlertedAt | timestamp? | **function** (กันแจ้งเตือนซ้ำ รีเซ็ตเมื่อ stockOnHand เปลี่ยน) |
| lastCalculatedAt | timestamp | **function** |
| updatedAt, updatedBy | timestamp, uid | client (บังคับให้เป็นค่าจริง) |

### `patients/{pid}/doseLogs/{logId}` — บันทึกการรับประทาน (แก้ไขย้อนหลังไม่ได้)

| Field | Type | หมายเหตุ |
|---|---|---|
| medicationId | string | |
| scheduledFor | timestamp | มื้อที่ตั้งไว้ |
| status | `taken` \| `skipped` \| `missed` | `missed` = **ยืนยัน**ว่าไม่ได้รับประทาน |
| loggedBy | uid | ต้องเท่ากับผู้เขียน |
| loggedAt | timestamp | `== request.time` |
| correctsLogId | string? | ใช้เมื่อต้องการแก้ log เดิม (เขียน log ใหม่แทนการแก้ของเดิม) |

> **"ยังไม่ได้บันทึก" คือกรณีที่ไม่มี log สำหรับมื้อนั้น** ระบบไม่สร้าง log ปลอมขึ้นมาแทน function `checkUnloggedDoses` จะส่งแจ้งเตือนว่า "ยังไม่ทราบ" ซึ่งต่างจาก `missed`

### `patients/{pid}/caregivers/{caregiverUid}` — สิทธิ์ผู้ดูแล

| Field | Type |
|---|---|
| caregiverUid | string (เท่ากับ doc id; ใช้ใน collection group query) |
| caregiverName | string |
| patientDisplayName | string (สำเนาไว้แสดงในหน้ารายการของผู้ดูแล) |
| status | `invited` \| `requested` \| `active` \| `declined` \| `revoked` |
| permissions | {viewMeds, viewHealth, logDoses, editMeds, requestRefill, viewOrders}: bool |
| grantedBy | uid |
| createdAt, updatedAt | timestamp |

**สิทธิ์ผู้ดูแลต้องได้รับความยินยอมจากทั้งสองฝ่าย**

- ถ้าเจ้าของเชิญ (function `inviteCaregiver`) → สถานะเป็น `invited` → **ผู้ดูแล**กดยอมรับ → `active`
- ถ้าผู้ดูแลขอสิทธิ์ (function `requestCaregiverAccess`) → สถานะเป็น `requested` → **เจ้าของ**อนุมัติ → `active`
- เจ้าของปรับ `permissions` หรือ `revoked` ได้ตลอดเวลา ผู้ดูแลถอนตัวเองได้ (`revoked`)

---

### `catalog/{drugId}` — ฐานข้อมูลยากลาง (admin)

| Field | Type |
|---|---|
| genericName, brandNames | string, array<string> |
| form, strength | string |
| drugClass | `general` \| `household` \| `pharmacist_only` \| `dangerous` \| `controlled` \| `prescription` |
| requiresPharmacistReview | bool |
| deliverable | bool (ยาบางประเภทจัดส่งไม่ได้) |
| warnings | array<string> |
| updatedAt | timestamp |

### `pharmacies/{pharmacyId}` — ข้อมูลสาธารณะของร้าน

| Field | Type | ใครเขียน |
|---|---|---|
| name, address, phone | string | owner/manager |
| geo | {lat, lng} | owner/manager |
| geohash | string | owner/manager (ใช้ค้นหาตามระยะ) |
| openingHours | map<day, [{open, close}]> | owner/manager |
| deliveryZones | array<{radiusKm, fee}> (วัดระยะจาก `geo` ของร้าน ใช้โซนที่เล็กที่สุดที่ครอบคลุม) | owner/manager |
| services | array<string> | owner/manager |
| licenseNo | string | function (ตอนสมัคร) |
| googlePlaceId | string? | function (ตอนสมัคร) — ใช้จับคู่กับผลค้นหาจาก Google Places |
| fdaDirectoryId | string? | function (ตอนสมัคร) — ร้านในข้อมูล อย. ที่เลขใบอนุญาตตรงกัน |
| verificationStatus | `pending` \| `needs_changes` \| `approved` \| `rejected` \| `suspended` | **admin / function** |
| ownerUid | string | function |
| ratingAvg, ratingCount | number | **function** |
| updatedAt | timestamp | owner/manager |

ผู้ใช้ทั่วไปเห็นเฉพาะร้านที่ `approved` **ทุก query ฝั่งผู้ใช้จึงต้องมี `where('verificationStatus','==','approved')`** ไม่อย่างนั้น rules จะปฏิเสธทั้ง query

### `pharmacyDirectory/{newcode}` — ร้านยาที่มีใบอนุญาตจากข้อมูลเปิด อย. (อ่านได้ทุกคน เขียนไม่ได้)

| Field | Type |
|---|---|
| name, licenseNo, licenseType (`ขย.1`), licenseStatus, licenseExpiryYear | string / number |
| licenseKey | เลขใบอนุญาตที่ตัดช่องว่างและจุดออก ใช้ค้นหา |
| pharmacistHours | string? — เวลาปฏิบัติการของเภสัชกรตามใบอนุญาต |
| subdistrict, district, province, zipcode | string |
| geo | {lat, lng} — จุดกึ่งกลางของแขวงหรือเขต **ไม่ใช่ตำแหน่งร้าน** |
| geoPrecision | `subdistrict` \| `district` |
| geohash5 | string — ค้นหาร้านใกล้เคียงด้วย `where('geohash5','in', cells)` |
| source, locationSource | ข้อความระบุแหล่งข้อมูล |

สร้างด้วย `npm run import:fda` และใส่ลงฐานข้อมูลด้วย `npm run seed`

### `pharmacies/{phId}/private/verification` — เอกสารสมัคร

| Field | Type |
|---|---|
| documents | array<{type, storagePath, uploadedAt}> |
| submittedAt | timestamp |
| reviewerNotes | string (admin) |
| requiredChanges | array<string> (admin) |
| reviewedBy, reviewedAt | uid, timestamp (admin) |

owner แก้ได้แค่ `documents` และ `submittedAt` และต้องอยู่ในสถานะ `pending` หรือ `needs_changes` เท่านั้น เมื่อส่งใหม่ function `resubmitPharmacy` จะเปลี่ยนสถานะกลับเป็น `pending` (ตรงกับ loop "แจ้งข้อมูลที่ต้องแก้ไข" ในแผนภาพที่ 5)

### `pharmacies/{phId}/staff/{uid}`

| Field | Type |
|---|---|
| role | `owner` \| `manager` \| `pharmacist` \| `staff` |
| displayName | string |
| licenseNo | string? (เภสัชกร) |
| licenseVerified | bool (**admin เท่านั้น**) |
| active | bool |

เขียนผ่าน function `inviteStaff` / `updateStaff` เท่านั้น เพื่อไม่ให้ร้านแต่งตั้งเภสัชกรเอง

### `pharmacies/{phId}/products/{productId}`

| Field | Type | ใครเขียน |
|---|---|---|
| catalogId | string | staff |
| name, packSize, description | string | staff |
| price | number (>=0) | staff |
| currency | `THB` | staff |
| stockStatus | `in_stock` \| `low` \| `out_of_stock` \| `unknown` | staff |
| stockQty | number? | staff |
| stockUpdatedAt | timestamp | staff (`== request.time`) |
| stockSource | `manual` \| `pos_sync` | staff (`manual` = ไม่ใช่เรียลไทม์ ให้ UI บอกผู้ใช้) |
| unitsPerPack | int? | staff (ใช้เติมจำนวนยาคงเหลือเมื่อได้รับยาที่สั่งเติม) |
| active | bool | staff |
| drugClass, requiresPharmacistReview, deliverable | — | **function** (copy จาก catalog) |

---

### `orders/{orderId}` — คำสั่งซื้อและคำขอเติมยา (เขียนผ่าน function เท่านั้น)

| Field | Type |
|---|---|
| source | `shop` \| `refill` \| `triage` |
| placedBy | uid (ผู้ทำรายการ ซึ่งอาจเป็นผู้ดูแล) |
| patientId | string (ผู้รับยา) |
| pharmacyId | string |
| items | array<{productId, catalogId, name, qty, unitPrice, requiresPharmacistReview, medicationId?}> |
| subtotal, deliveryFee, total | number (คำนวณฝั่งเซิร์ฟเวอร์) |
| deliveryAddress | snapshot ของที่อยู่ |
| needsPharmacistReview | bool |
| reviewId | string? (มาจาก triage หรือการประเมินในคำสั่งซื้อนี้) |
| status | ดู state machine ด้านล่าง |
| paymentStatus | `none` \| `pending` \| `paid` \| `failed` \| `refunded` |
| paymentMethod | `promptpay` \| `card` \| `banking` ช่องทางที่ผู้ซื้อเลือกตอนชำระ (function เขียนตอน `payOrder`) |
| cancelReason, rejectReason | string? |
| createdAt, updatedAt | timestamp |

**สถานะคำสั่งซื้อ (state machine)**

```
requested ──► pharmacy_checking ──► out_of_stock ──► cancelled
                    │
                    ├─► awaiting_pharmacist ──► need_more_info ─┐
                    │         ▲                                 │
                    │         └─────────────────────────────────┘
                    │         ├─► rejected                (ไม่เก็บเงิน)
                    │         ▼
                    └─► awaiting_payment ──► payment_failed ──► awaiting_payment / cancelled
                              │
                              ▼
                            paid ──► preparing ──► shipping ──► delivered
                                                      │
                                                      └─► delivery_issue ──► shipping / refunded
```

- `awaiting_payment` เกิดได้หลังร้านยืนยันสต็อก **และ**ผ่านด่านเภสัชกรแล้วเท่านั้น ระบบจึงไม่เก็บเงินก่อนรู้ว่าจ่ายยาได้
- ทุกการเปลี่ยนสถานะเขียน `orders/{orderId}/events/{eventId}` = {from, to, by, at, note} และ `auditLogs`

### `pharmacistReviews/{reviewId}`

| Field | Type |
|---|---|
| orderId, triageId | string? (มีอย่างน้อยหนึ่งค่า) |
| pharmacyId | string |
| patientId | string |
| requestedBy | uid |
| pharmacistUid | uid |
| decision | `pending` \| `approved` \| `rejected` \| `refer_doctor` \| `need_more_info` \| `emergency` |
| reviewCatalogIds | array<string> (ยาในคำสั่งซื้อที่ต้องประเมิน) |
| approvedCatalogIds | array<string> (ยาที่อนุมัติ ใช้ตรวจสอบตอนสร้างคำสั่งซื้อ) |
| thread | array<{by, role: `pharmacist` \| `user`, text, at}> (คำถามและคำตอบระหว่างประเมิน) |
| notes | string |
| validUntil | timestamp (หลังจากนี้ต้องประเมินใหม่) |
| createdAt, decidedAt | timestamp |

### `triageSessions/{sessionId}` และ `/messages/{msgId}`

| Field | Type |
|---|---|
| userUid | uid |
| patientId | string |
| consentAt | timestamp |
| redFlag | bool |
| route | `in_progress` \| `info` \| `pharmacist` \| `emergency` (`pharmacist` เมื่อผู้ใช้ยินยอมส่งต่อแล้วเท่านั้น) |
| recommendedRoute | เส้นทางที่ AI แนะนำล่าสุด |
| userTurns | int (เกิน 12 ข้อความ ระบบส่งต่อเภสัชกร) |
| pharmacistDecision | string? |
| mode | `guided` (ชุดคำถาม) หรือไม่มี field นี้ (แชต AI) |
| guided | {facts, path: [{nodeId, choices}], current} — สถานะของชุดคำถาม |
| result | ผลลัพธ์ของชุดคำถาม: {outcomeId, title, route, advice, warn, notes} |
| summary | {symptoms, duration, severity, allergies, currentMeds, questionsForPharmacist} |
| sharedWithPharmacyId | string? (มีค่าเมื่อผู้ใช้ยินยอมให้ส่งต่อ) |
| reviewId | string? |
| createdAt, updatedAt | timestamp |

messages: {role: `user` \| `assistant` \| `pharmacist`, text, seq, createdAt} — เรียงด้วย `seq` ส่งข้อความผ่าน callable `triageSendMessage` เพื่อให้ AI service ตรวจสัญญาณอันตรายฝั่งเซิร์ฟเวอร์ทุกครั้ง

### `pharmacyRatings/{orderId}` — รีวิวร้าน (1 คำสั่งซื้อ = 1 รีวิว)

| Field | Type |
|---|---|
| userUid | uid |
| pharmacyId | string |
| rating | int 1–5 |
| comment | string (≤ 1000) |
| hidden | bool (function/admin ใช้ซ่อนรีวิวไม่เหมาะสม) |
| createdAt | timestamp |

rules ตรวจว่าผู้รีวิวเป็นคนสั่งซื้อจริง และคำสั่งซื้อนั้นมีสถานะ `delivered` แล้ว เพื่อป้องกันรีวิวปลอม

### `auditLogs/{logId}`

{actorUid, actorRole, action, targetPath, before?, after?, reason?, at} เขียนโดย function เท่านั้น อ่านได้เฉพาะผู้ที่มี claim `auditor`

---

## Cloud Functions

โค้ดอยู่ใน [functions/src](../functions/src) ใช้ region `asia-southeast1` วิธีรันและข้อควรระวังอยู่ใน [backend.md](backend.md)

| ไฟล์ | Function | หน้าที่ |
|---|---|---|
| pharmacy.js | `registerPharmacy`, `resubmitPharmacy` | สมัครร้าน (สถานะ pending) และส่งเอกสารใหม่ |
| | `reviewPharmacy` (admin) | approved / needs_changes / rejected / suspended |
| | `inviteStaff`, `updateStaff` | owner/manager จัดการพนักงาน |
| | `verifyPharmacistLicense` (admin) | ยืนยันใบอนุญาตเภสัชกร |
| | `syncProductClass` (trigger) | บังคับประเภทยาตาม catalog |
| orders.js | `createOrder`, `createRefillRequest` | ตรวจสิทธิ์ ราคา พื้นที่จัดส่ง ประเภทยา |
| | `pharmacyRespondOrder` | ร้านยืนยันสต็อก แล้วส่งเข้าคิวเภสัชกรหรือรอชำระเงิน |
| | `submitPharmacistReview`, `answerPharmacistQuestion` | เภสัชกรตัดสินใจหรือถามเพิ่ม และผู้ใช้ตอบ |
| | `payOrder` (**จำลอง**), `cancelOrder` | ชำระเงิน (มี `simulateFailure` สำหรับเดโม) และยกเลิกก่อนชำระ |
| | `updateDelivery`, `confirmReceived` | สถานะจัดส่ง และเติมยาคงเหลือเมื่อได้รับยา |
| care.js | `inviteCaregiver`, `requestCaregiverAccess` | เชิญหรือขอสิทธิ์ (อีกฝ่ายต้องยืนยันผ่าน rules) |
| | `onCaregiverChange` (trigger) | แจ้งทั้งสองฝ่ายเมื่อสถานะเปลี่ยน |
| | `onMedicationWrite`, `onDoseLogCreated` (trigger) | คำนวณยาคงเหลือ แจ้งยาใกล้หมด และแจ้งเมื่อยืนยันว่าพลาดมื้อ |
| | `dailyStockRecalc` (06:00), `checkUnloggedDoses` (ทุก 30 นาที) | คำนวณซ้ำรายวัน และแจ้งเตือน "ยังไม่ได้บันทึก" |
| account.js | `deleteAccount`, `onRatingWrite` | ลบบัญชีแบบ cascade และคำนวณคะแนนร้าน |
| places.js | `searchPharmacies`, `getPharmacyPlaceDetails` | ดึงข้อมูลจาก Google Places แบบสด ถ้าไม่มี key จะค้นจากข้อมูล อย. แทน |
| directory.js | `searchPharmacyDirectory` | ค้นร้านยาที่มีใบอนุญาตจากข้อมูล อย. ใกล้ตำแหน่งผู้ใช้ (ไม่ต้องมี key) |
| guided-triage.js | `guidedTriageStart`, `guidedTriageAnswer`, `guidedTriageBack` | ชุดคำถามประเมินอาการทีละข้อ (ไม่ใช้ AI) |
| triage.js | `triageStart`, `triageSendMessage`, `triageShareWithPharmacy` | แชตคัดกรองอาการด้วย Claude โดยตรวจสัญญาณอันตรายด้วยกฎก่อนทุกครั้ง |

## Cloud Storage

ดู [storage.rules](../storage.rules)

| Path | ใครอัปโหลด | ใครอ่าน |
|---|---|---|
| `pharmacies/{phId}/verification/{file}` | owner ขณะสถานะ pending / needs_changes (PDF/รูป ≤10 MB, เขียนทับไม่ได้) | owner, manager, admin |
| `pharmacies/{phId}/products/{productId}/{file}` | staff (รูป ≤5 MB) | ทุกคน เมื่อร้าน approved |
| `patients/{pid}/documents/{file}` | เจ้าของ, ผู้ดูแลที่มี `editMeds` | เจ้าของ, ผู้ดูแลที่มี `viewMeds` (admin อ่านไม่ได้) |

## สิ่งที่ยังต้องทำก่อนใช้งานจริง

- **ระบบชำระเงินจริง** แทน `payOrder` ที่เป็นแบบจำลอง เช่น ใช้ webhook ของผู้ให้บริการรับชำระเงิน
- **App Check** เพื่อลดการเรียก callable จาก client ปลอม
- **Signed URL** ให้เภสัชกรเปิดดูรูปฉลากยาหรือใบสั่งยาของผู้ป่วย
- **Retention policy** สำหรับ `triageSessions` และ `auditLogs` ตาม PDPA
- **ให้เภสัชกรและแพทย์ตรวจทาน** รายการสัญญาณอันตรายและ system prompt ของ AI
