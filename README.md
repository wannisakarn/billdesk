# BillDesk — โปรแกรมออกใบเสนอราคา / ใบส่งของ / ใบเสร็จรับเงิน (Offline 100%)

![Electron](https://img.shields.io/badge/Electron-33-47848F) ![License: MIT](https://img.shields.io/badge/License-MIT-green) ![Offline](https://img.shields.io/badge/100%25-Offline-blue)

> **ผู้ใช้ทั่วไป:** ดาวน์โหลด `BillDesk-Setup.exe` จากหน้า [Releases](../../releases) แล้วดับเบิลคลิกติดตั้งได้เลย ไม่ต้องลงโปรแกรมอื่น

โปรแกรมเดสก์ท็อปสำหรับออกเอกสารการค้า ทำงานโดยไม่ต้องต่ออินเทอร์เน็ต ข้อมูลทั้งหมดเก็บใน **IndexedDB บนเครื่องของคุณเท่านั้น**

- ใบเสนอราคา (QT) · ใบส่งของ (DO) · ใบเสร็จรับเงิน (RC)
- คำนวณยอด, ส่วนลดรายบรรทัด/ท้ายบิล, VAT 7% (บวกเพิ่ม/รวมใน/ไม่มี), หัก ณ ที่จ่าย 1/2/3/5% หรือระบุเอง
- ตัวเลขเป็นตัวอักษรภาษาไทย (BAHTTEXT) อัตโนมัติ
- เลขที่เอกสารรันอัตโนมัติ `QT2026100001` (ตั้งค่า คำนำหน้า / ค.ศ.-พ.ศ. / รีเซ็ตรายเดือน-รายปี ได้)
- แปลง ใบเสนอราคา → ใบส่งของ / ใบเสร็จ (สถานะใบเสนอราคาเปลี่ยนเป็น "ดำเนินการแล้ว" ให้อัตโนมัติ)
- ค้นหา / กรองตามประเภท วันที่ สถานะ · Export รายงาน CSV (เปิดใน Excel ได้)
- พิมพ์ / บันทึก PDF ขนาด A4 พร้อม ต้นฉบับ + สำเนา
- สำรองข้อมูล: Export/Import JSON + สำรองอัตโนมัติรายวันที่ `Documents\BillDesk Backups`

## ภาพตัวอย่าง

| เอกสาร A4 | หน้าสร้างเอกสาร | รายการเอกสาร |
|---|---|---|
| ![ใบเสนอราคา](docs/quotation.png) | ![ฟอร์ม](docs/editor.png) | ![รายการ](docs/list.png) |

---

## 1. โครงสร้างโปรเจกต์

```
billdesk/
├── package.json            # ตั้งค่า Electron + electron-builder (สร้าง .exe / ไอคอน Desktop)
├── main.js                 # Electron main process: หน้าต่าง, บล็อกอินเทอร์เน็ต, PDF, Auto-backup
├── preload.js              # สะพานเชื่อม (contextBridge) ให้หน้าเว็บเรียก savePDF / autoBackup
├── build-windows.bat       # ดับเบิลคลิกเพื่อ build บน Windows
├── build/
│   ├── icon.ico            # ไอคอนโปรแกรม Windows
│   └── icon.png            # ไอคอน 1024px (mac/linux/หน้าต่าง)
└── src/                    # ตัวแอป (HTML/CSS/JS ล้วน ใช้เป็น PWA ได้ด้วย)
    ├── index.html
    ├── manifest.webmanifest  # PWA manifest
    ├── sw.js                 # Service Worker (PWA cache-first)
    ├── css/
    │   ├── fonts.css         # ฟอนต์ Sarabun ฝังในเครื่อง
    │   ├── app.css           # หน้าจอโปรแกรม
    │   ├── document.css      # หน้าตาเอกสาร A4 (หน่วย mm)
    │   └── print.css         # @page A4 + กฎการตัดหน้า (โหลดเฉพาะตอนพิมพ์)
    ├── js/
    │   ├── utils.js          # คำนวณ VAT/WHT, BAHTTEXT, วันที่, เลขที่เอกสาร
    │   ├── db.js             # IndexedDB wrapper + backup/restore
    │   ├── render-doc.js     # สร้าง HTML เอกสาร
    │   └── app.js            # หน้าจอทั้งหมด (รายการ, ฟอร์ม, ตั้งค่า, สำรองข้อมูล)
    ├── fonts/                # Sarabun .woff2 (SIL OFL)
    └── icons/                # ไอคอน PWA 192/512
```

---

## 2. ติดตั้งและสร้างไอคอนบน Desktop (Windows) — ทีละขั้นตอน

### ขั้นที่ 1: ติดตั้ง Node.js (ครั้งเดียว)
1. เข้า https://nodejs.org → ดาวน์โหลดเวอร์ชัน **LTS** (Windows Installer .msi)
2. ติดตั้งแบบ Next ไปเรื่อย ๆ (ติ๊ก "Add to PATH" ไว้ตามค่าเริ่มต้น)
3. เปิด **Command Prompt** ใหม่ พิมพ์ตรวจสอบ:
   ```
   node -v
   npm -v
   ```
   ถ้าขึ้นเลขเวอร์ชัน (เช่น v22.x) แปลว่าพร้อม

### ขั้นที่ 2: ทดลองเปิดโปรแกรม (ไม่ต้อง build)
```
git clone https://github.com/<your-username>/billdesk.git
cd billdesk
npm install
npm start
```
> `npm install` ต้องต่ออินเทอร์เน็ต **ครั้งเดียว** เพื่อดาวน์โหลด Electron หลังจากนั้นโปรแกรมทำงานออฟไลน์ทั้งหมด

### ขั้นที่ 3: สร้างไฟล์ติดตั้ง .exe
วิธีง่าย: **ดับเบิลคลิก `build-windows.bat`**
หรือพิมพ์เอง:
```
npm run dist
```
รอ 1–3 นาที จะได้ไฟล์ในโฟลเดอร์ `dist\`
| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `BillDesk-Setup.exe` | ตัวติดตั้งแบบคลิกเดียว — **สร้างไอคอนบน Desktop + Start Menu อัตโนมัติ** |
| `BillDesk-Portable-1.0.0.exe` | ไม่ต้องติดตั้ง ดับเบิลคลิกใช้ได้เลย (ใส่ USB ได้) |

### ขั้นที่ 4: ติดตั้ง
ดับเบิลคลิก `BillDesk-Setup.exe` → โปรแกรมติดตั้งและเปิดขึ้นเอง พร้อมไอคอน **BillDesk** บน Desktop
> Windows SmartScreen อาจเตือน "Unknown publisher" เพราะไม่ได้ซื้อ Code-signing certificate → กด **More info → Run anyway**

### ขั้นที่ 5: เริ่มใช้งาน
1. เมนู **ข้อมูลบริษัท & ตั้งค่า** → กรอกชื่อ ที่อยู่ เลขผู้เสียภาษี อัปโหลดโลโก้ → บันทึก
2. ถ้าไม่ได้จด VAT ให้เลือก "ไม่มี VAT" เป็นค่าเริ่มต้น
3. กด **＋ ใบเสนอราคา** → กรอก → **บันทึก & พิมพ์ / PDF**

### (ทางเลือก) ใช้แบบ PWA ผ่านเบราว์เซอร์
โฟลเดอร์ `src/` เป็นเว็บแอปสมบูรณ์ เปิดผ่านเซิร์ฟเวอร์ในเครื่อง เช่น
```
cd src
npx http-server -p 8080        # หรือ  python -m http.server 8080
```
เปิด Chrome/Edge ที่ `http://localhost:8080` → ไอคอน "ติดตั้งแอป" ที่แถบที่อยู่ → ได้ทางลัดบน Desktop
⚠️ แบบ PWA ข้อมูลอยู่ในเบราว์เซอร์ ถ้าล้างข้อมูลเบราว์เซอร์จะหาย และต้องรันเซิร์ฟเวอร์ทุกครั้ง — **แนะนำ Electron มากกว่า**

---

## 3. ข้อมูลอยู่ที่ไหน / สำรองอย่างไร

| รายการ | ตำแหน่ง |
|---|---|
| ฐานข้อมูลหลัก (IndexedDB) | `%APPDATA%\BillDesk\IndexedDB\` |
| สำรองอัตโนมัติ (วันละไฟล์ เก็บ 30 วัน) | `Documents\BillDesk Backups\` |
| Export ด้วยตนเอง | เมนู สำรอง/กู้คืนข้อมูล → Export (.json) |

- ถอนการติดตั้งโปรแกรม **ไม่ลบข้อมูล** (`deleteAppDataOnUninstall: false`)
- ย้ายเครื่องใหม่: Export JSON จากเครื่องเก่า → ติดตั้งเครื่องใหม่ → Import
- ⚠️ อย่าเปลี่ยน `productName` / `name` ใน package.json หลังใช้งานจริง เพราะโฟลเดอร์ข้อมูลอ้างอิงจากชื่อนี้

## 4. ความปลอดภัย / Offline
- `main.js` ยกเลิกทุก request `http/https/ws` ด้วย `session.webRequest` และปฏิเสธ permission ทุกชนิด
- `index.html` มี Content-Security-Policy `default-src 'self'` ห้ามโหลดสคริปต์/ฟอนต์/รูปจากภายนอก
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — หน้าเว็บเข้าถึงไฟล์ระบบไม่ได้ ยกเว้นฟังก์ชันที่ preload เปิดให้
- ไม่มี CDN: ฟอนต์ Sarabun และ CSS ฝังอยู่ในโปรแกรมทั้งหมด

## 5. ปรับแต่งเพิ่มเติม
- เปลี่ยนไอคอน: แทนที่ `build/icon.ico` (256×256 ขึ้นไป) และ `build/icon.png`
- เปลี่ยนชื่อโปรแกรมที่แสดง: `productName` ใน package.json
- เปลี่ยนเป็น "ใบเสร็จรับเงิน/ใบกำกับภาษี": ตั้งค่า → ชื่อหัวใบเสร็จ

## 6. การเผยแพร่ไฟล์ติดตั้งบน GitHub
ไฟล์ `.exe` มีขนาดประมาณ 80 MB จึงไม่ควร commit ลงใน repo (ใส่ไว้ใน `.gitignore` แล้ว) ให้แนบไฟล์ผ่าน **Releases** แทน:
1. ในหน้า repo กด **Releases → Draft a new release**
2. ตั้ง Tag เช่น `v1.0.0`
3. ลากไฟล์ `dist/BillDesk-Setup.exe` (และ `BillDesk-Portable-1.0.0.exe` ถ้ามี) มาวางในช่อง Attach binaries
4. กด **Publish release**

## License
MIT — ดูไฟล์ [LICENSE](LICENSE) · ฟอนต์ Sarabun ใช้สัญญาอนุญาต SIL Open Font License 1.1
