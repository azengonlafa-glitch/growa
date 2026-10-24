# growa — ขึ้นเว็บจริงบน Vercel

ไม่ต้องใช้บัตร: Firebase แผน **Spark** (Auth + Firestore) และ Vercel แผน **Hobby** ฟรีทั้งคู่

## ภาพรวม

```
เบราว์เซอร์ ──► Vercel (หน้าเว็บ React + /api/call/* + cron รายวัน)
   │                         │
   └── Firebase Auth/Firestore ◄─┘   (Security Rules คุมสิทธิ์)
```

- หน้าเว็บอ่านเขียน Firestore ตรง ๆ ผ่าน Security Rules
- งานที่ต้องเชื่อถือได้ (สร้างคำสั่งซื้อ อนุมัติโดยเภสัชกร ชำระเงินจำลอง ฯลฯ) รันที่ `/api/call/<ชื่อฟังก์ชัน>` ซึ่งใช้โค้ดชุดเดียวกับ Cloud Functions ใน [functions/](../functions)
- ไม่มี Firestore trigger บน Vercel จึงเปลี่ยนเป็นฟังก์ชันที่หน้าเว็บเรียกต่อท้ายการเขียนเอง (`afterDoseLog`, `afterMedicationWrite`, `afterCaregiverChange`, `afterRating`) ทุกตัวเรียกซ้ำได้โดยไม่แจ้งเตือนซ้ำ
- งานรายวัน (คำนวณยาคงเหลือ 06:00 น. เวลาไทย) ใช้ Vercel Cron

## ข้อจำกัดของแผนฟรี

| เรื่อง | ผล |
|---|---|
| Vercel Cron แผน Hobby รันได้วันละ 1 ครั้ง | งานรายวันทำงานตามปกติ แต่แจ้งเตือน "ยังไม่ได้บันทึกยา" (ทุก 30 นาที) **ไม่ทำงาน** ในเวอร์ชันออนไลน์ ต้องใช้บน emulator หรืออัปเกรดแผน |
| Cloud Storage ใช้บนแผน Spark ไม่ได้ (ตั้งแต่ ก.พ. 2026) | อัปโหลดเอกสารใบอนุญาตร้านและรูปสินค้าไม่ทำงานออนไลน์ หน้าเว็บ MVP ยังไม่มีหน้าอัปโหลดอยู่แล้ว |
| การชำระเงินเป็นแบบจำลอง | ปุ่ม "ชำระ" ไม่ตัดเงินจริง |
| ไม่มี Google API key / Anthropic key | ค้นร้านจากข้อมูล อย. และใช้ชุดคำถามประเมินอาการ ทุกอย่างยังทำงานครบ |

## ขั้นตอน

### 1) สร้างโปรเจกต์ Firebase (ฟรี ไม่ต้องผูกบัตร)

1. เข้า [console.firebase.google.com](https://console.firebase.google.com) → Add project
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**
3. **Build → Firestore Database → Create database** เลือก region `asia-southeast1` และ **Production mode**
4. **Project settings → Your apps → เพิ่ม Web app (`</>`)** แล้วคัดลอกค่า `apiKey`, `authDomain`, `projectId`, `appId`
5. **Project settings → Service accounts → Generate new private key** จะได้ไฟล์ JSON เก็บไว้เป็นความลับ ห้าม commit

### 2) ส่ง Security Rules และ indexes ขึ้น Firebase

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <PROJECT_ID>
```

> อย่า deploy `functions` หรือ `storage` เพราะต้องใช้แผนเสียเงิน (ส่วนนี้ใช้ Vercel แทนแล้ว)

### 3) ใส่ข้อมูลร้านและฐานข้อมูลยา

```bash
set FIREBASE_SERVICE_ACCOUNT_FILE=C:\path\to\service-account.json
node scripts/seed-production.mjs --yes
```

สคริปต์ใส่ฐานข้อมูลยา ร้านพาร์ทเนอร์จำลอง 2 ร้าน และร้านยามีใบอนุญาต 3,260 ร้านจาก อย. โดย **ไม่สร้างบัญชีผู้ใช้ใดเลย**

### 4) ตั้งค่า Vercel

1. [vercel.com/new](https://vercel.com/new) → Import repo `azengonlafa-glitch/growa` (เลือก branch `main`)
2. Framework Preset เลือก **Other** (`vercel.json` ตั้ง build ไว้ให้แล้ว) ไม่ต้องแก้ Build Command
3. **Environment Variables** (ดูรายการใน [.env.example](../.env.example)):

| ตัวแปร | ค่า |
|---|---|
| `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_APP_ID` | จากขั้นที่ 1.4 |
| `FIREBASE_SERVICE_ACCOUNT` | เนื้อหาไฟล์ JSON ทั้งก้อน (วางบรรทัดเดียว) |
| `CRON_SECRET` | สตริงสุ่มยาว ๆ |
| `GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY` | ไม่บังคับ |

4. กด Deploy

### 5) อนุญาตโดเมนของ Vercel ให้ล็อกอินได้

Firebase console → **Authentication → Settings → Authorized domains → Add domain** ใส่โดเมน `xxx.vercel.app` ที่ได้

### 6) ตั้งผู้ดูแลและเภสัชกรสำหรับเดโม

สมัครสมาชิกในเว็บออนไลน์ก่อน แล้วรัน:

```bash
node scripts/seed-production.mjs --yes --admin-email you@example.com --pharmacist-email friend@example.com
```

คนที่ได้รับ `--pharmacist-email` จะเป็นเภสัชกรที่ยืนยันใบอนุญาตแล้วของร้านจำลอง `demoRx1` (ล็อกเอาต์แล้วเข้าใหม่เพื่อเห็นเมนู "ร้านของฉัน")

## ตรวจว่าใช้งานได้

1. เปิดเว็บ → สมัครสมาชิก → ระบบพาไปหน้าโปรไฟล์สุขภาพ
2. หน้า "ร้านยา" เห็นรายชื่อร้านจาก อย.
3. ร้านพาร์ทเนอร์ → ใส่ตะกร้า → ส่งคำขอสั่งซื้อ (ถ้าขึ้น error ให้ดู **Vercel → Logs**)

## รันทดสอบก่อนขึ้นเว็บ

```bash
npm test
```

เทสต์ครอบคลุม Security Rules, Storage rules, ฟังก์ชันทั้งหมด และตัว `/api/call` ของ Vercel (ใช้ token จริงจาก Auth emulator)
