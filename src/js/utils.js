/* ============================================================
 *  utils.js — ฟังก์ชันคำนวณ/จัดรูปแบบ (ไม่มี dependency)
 *  ใช้ได้ทั้งในเบราว์เซอร์ (window.U) และ Node (สำหรับทดสอบ)
 * ============================================================ */
(function (root) {
  'use strict';

  // ปัดเศษ 2 ตำแหน่งแบบปัดครึ่งขึ้น (กัน floating error เช่น 1.005)
  function r2(n) {
    n = Number(n) || 0;
    return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
  }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const n = parseFloat(String(v || '').replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  }

  function money(n) {
    return r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function qtyFmt(n) {
    n = num(n);
    return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
  }

  // ---------------- ตัวเลข -> ข้อความภาษาไทย (BAHTTEXT) ----------------
  const TH_NUM = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const TH_POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

  // อ่านเลขจำนวนเต็มไม่เกิน 6 หลัก
  function readGroup(s) {
    let out = '';
    const len = s.length;
    for (let i = 0; i < len; i++) {
      const d = +s[i];
      const pos = len - i - 1;
      if (d === 0) continue;
      if (pos === 0 && d === 1 && s.slice(0, -1).replace(/0/g, '') !== '') {
        out += 'เอ็ด';
      } else if (pos === 1 && d === 1) {
        out += 'สิบ';
      } else if (pos === 1 && d === 2) {
        out += 'ยี่สิบ';
      } else {
        out += TH_NUM[d] + TH_POS[pos];
      }
    }
    return out;
  }

  function readInt(str) {
    str = str.replace(/^0+/, '');
    if (!str) return '';
    let out = '';
    const groups = [];
    while (str.length > 6) { groups.unshift(str.slice(-6)); str = str.slice(0, -6); }
    groups.unshift(str);
    groups.forEach((g, idx) => {
      const isLast = idx === groups.length - 1;
      // กลุ่มล้าน: "เอ็ด" ใช้เมื่อมีเลขหน้าในกลุ่มเดียวกัน หรือมีล้านนำหน้า
      let txt = readGroup(g);
      if (idx > 0 && g.replace(/^0+/, '') === '1') txt = 'เอ็ด';
      out += txt;
      if (!isLast) out += 'ล้าน';
    });
    return out;
  }

  function bahtText(amount) {
    amount = r2(amount);
    if (amount === 0) return 'ศูนย์บาทถ้วน';
    const neg = amount < 0;
    const [i, f] = Math.abs(amount).toFixed(2).split('.');
    let txt = '';
    const baht = readInt(i);
    if (baht) txt += baht + 'บาท';
    if (f === '00') txt += 'ถ้วน';
    else txt += readInt(f) + 'สตางค์';
    return (neg ? 'ลบ' : '') + txt;
  }

  // ---------------- วันที่ ----------------
  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function addDaysISO(iso, days) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + Number(days || 0));
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  // useBE = true -> ปี พ.ศ.
  function dateTH(iso, useBE) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${useBE ? (+y + 543) : y}`;
  }
  const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  function dateLongTH(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
  }

  // ---------------- คำนวณยอดเอกสาร ----------------
  // vatMode: 'none' | 'exclude' (บวก VAT เพิ่ม) | 'include' (ราคารวม VAT แล้ว)
  // discType: 'amt' (บาท, ค่าเริ่มต้น) | 'pct' (% ของ จำนวน×ราคา)
  function lineDiscount(it) {
    const d = num(it.discount);
    if (!d) return 0;
    return it.discType === 'pct' ? r2(num(it.qty) * num(it.price) * d / 100) : r2(d);
  }
  function lineAmount(it) {
    return r2(num(it.qty) * num(it.price) - lineDiscount(it));
  }

  function calcTotals(doc) {
    const items = doc.items || [];
    const subtotal = r2(items.reduce((s, it) => s + lineAmount(it), 0));
    const discount = r2(num(doc.discount));
    const afterDiscount = r2(subtotal - discount);
    const rate = num(doc.vatRate == null ? 7 : doc.vatRate);
    let base, vat, grand;
    if (doc.vatMode === 'exclude') {
      base = afterDiscount; vat = r2(base * rate / 100); grand = r2(base + vat);
    } else if (doc.vatMode === 'include') {
      grand = afterDiscount; base = r2(grand * 100 / (100 + rate)); vat = r2(grand - base);
    } else {
      base = afterDiscount; vat = 0; grand = afterDiscount;
    }
    const whtRate = num(doc.whtRate);
    const wht = whtRate > 0 ? r2(base * whtRate / 100) : 0;
    const netPay = r2(grand - wht);
    return { subtotal, discount, afterDiscount, base, vatRate: rate, vat, grand, whtRate, wht, netPay };
  }

  // ---------------- เลขที่เอกสาร ----------------
  // รูปแบบ: PREFIX + ปี + เดือน + เลขรัน   เช่น QT2026100001  (รีเซ็ตทุกเดือน)
  function periodKey(iso, useBE, mode) {
    const [y, m] = (iso || todayISO()).split('-');
    const yy = useBE ? String(+y + 543) : y;
    if (mode === 'year') return yy;
    return yy + m;
  }
  function nextDocNo(prefix, iso, existingNos, opts) {
    opts = opts || {};
    const digits = opts.digits || 4;
    const head = prefix + periodKey(iso, opts.useBE, opts.reset);
    let max = 0;
    (existingNos || []).forEach(no => {
      if (no && no.startsWith(head)) {
        const n = parseInt(no.slice(head.length), 10);
        if (isFinite(n) && n > max) max = n;
      }
    });
    return head + String(max + 1).padStart(digits, '0');
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

  const U = { r2, num, money, qtyFmt, bahtText, todayISO, addDaysISO, dateTH, dateLongTH, lineDiscount, lineAmount, calcTotals, nextDocNo, periodKey, uid, esc, nl2br };
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
  else root.U = U;
})(typeof window !== 'undefined' ? window : globalThis);
