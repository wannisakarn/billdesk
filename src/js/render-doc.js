/* ============================================================
 *  render-doc.js — สร้าง HTML ของเอกสาร A4 (ใช้ทั้งพรีวิว/พิมพ์/PDF)
 * ============================================================ */
(function (root) {
  'use strict';
  const { esc, nl2br, money, qtyFmt, dateTH, bahtText, calcTotals, lineAmount, num } = root.U;

  const TYPES = {
    QT: {
      code: 'QT', name: 'ใบเสนอราคา', en: 'QUOTATION',
      dueLabel: 'ยืนราคาถึง', partyLabel: 'เรียน / ลูกค้า',
      statuses: ['รออนุมัติ', 'อนุมัติ', 'ไม่อนุมัติ', 'ดำเนินการแล้ว'],
      sign: [['ผู้อนุมัติสั่งซื้อ', 'customer'], ['ผู้เสนอราคา', 'seller']]
    },
    DO: {
      code: 'DO', name: 'ใบส่งของ', en: 'DELIVERY ORDER',
      dueLabel: 'กำหนดชำระ', partyLabel: 'ลูกค้า / ผู้รับสินค้า',
      statuses: ['รอส่ง', 'ส่งแล้ว', 'ยกเลิก'],
      sign: [['ผู้รับสินค้า', 'customer'], ['ผู้ส่งสินค้า', 'seller']]
    },
    RC: {
      code: 'RC', name: 'ใบเสร็จรับเงิน', en: 'RECEIPT',
      dueLabel: 'ครบกำหนด', partyLabel: 'ลูกค้า',
      statuses: ['ชำระแล้ว', 'ยกเลิก'],
      sign: [['ผู้จ่ายเงิน', 'customer'], ['ผู้รับเงิน', 'seller']]
    }
  };

  function typeTitle(type, s) {
    if (type === 'RC') return { th: s.receiptTitle || 'ใบเสร็จรับเงิน', en: s.receiptTitleEn || 'RECEIPT' };
    return { th: TYPES[type].name, en: TYPES[type].en };
  }

  function partyName(name, branch) {
    if (!name) return '';
    return branch ? `${name} (${branch})` : name;
  }

  // บรรทัดแรก = ชื่อรายการ, บรรทัดถัดไป = รายละเอียดย่อย (ตัวเล็ก)
  function descHtml(desc) {
    const lines = String(desc || '').split('\n');
    const rest = lines.slice(1).join('\n').trim();
    return esc(lines[0]) + (rest ? `<div class="desc-sub">${esc(rest)}</div>` : '');
  }

  function renderSheet(doc, s, copyLabel) {
    const t = TYPES[doc.type];
    const title = typeTitle(doc.type, s);
    const tot = calcTotals(doc);
    const be = !!s.useBEDate;
    const c = doc.customer || {};
    const items = doc.items || [];
    const showCode = items.some(i => i.code);
    const showDisc = items.some(i => num(i.discount) > 0);

    // ---------- Header ----------
    const sellerLines = [
      s.companyAddress ? nl2br(s.companyAddress) : '',
      s.companyTaxId ? `เลขประจำตัวผู้เสียภาษี ${esc(s.companyTaxId)}${s.companyBranch ? ' (' + esc(s.companyBranch) + ')' : ''}` : '',
      [s.companyPhone ? 'โทร ' + esc(s.companyPhone) : '', s.companyEmail ? esc(s.companyEmail) : ''].filter(Boolean).join(' · '),
      s.companyWebsite ? esc(s.companyWebsite) : ''
    ].filter(Boolean).join('<br>');

    const meta = [
      ['เลขที่', esc(doc.docNo)],
      ['วันที่', dateTH(doc.date, be)],
      doc.dueDate ? [t.dueLabel, dateTH(doc.dueDate, be)] : null,
      doc.refNo ? ['อ้างอิง', esc(doc.refNo)] : null,
      doc.salesperson ? ['ผู้ขาย', esc(doc.salesperson)] : null
    ].filter(Boolean).map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');

    // ---------- Items ----------
    let rows = items.map((it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        ${showCode ? `<td>${esc(it.code)}</td>` : ''}
        <td>${descHtml(it.desc)}</td>
        <td class="n">${qtyFmt(it.qty)}</td>
        <td class="c">${esc(it.unit)}</td>
        <td class="n">${money(it.price)}</td>
        ${showDisc ? `<td class="n">${num(it.discount) ? (it.discType === 'pct' ? qtyFmt(it.discount) + '%' : money(it.discount)) : ''}</td>` : ''}
        <td class="n">${money(lineAmount(it))}</td>
      </tr>`).join('');
    // แถวว่างเติมให้ตารางดูเต็ม (เฉพาะเอกสารสั้น)
    const filler = Math.max(0, (s.minRows || 8) - items.length);
    const cols = 6 + (showCode ? 1 : 0) + (showDisc ? 1 : 0);
    for (let i = 0; i < filler; i++) rows += `<tr class="filler">${'<td></td>'.repeat(cols)}</tr>`;

    // ---------- Totals ----------
    const trs = [];
    trs.push(['รวมเป็นเงิน', money(tot.subtotal)]);
    if (tot.discount) { trs.push(['หักส่วนลด', money(tot.discount)]); trs.push(['ยอดหลังหักส่วนลด', money(tot.afterDiscount)]); }
    if (doc.vatMode === 'exclude') {
      trs.push([`ภาษีมูลค่าเพิ่ม ${tot.vatRate}%`, money(tot.vat)]);
    } else if (doc.vatMode === 'include') {
      trs.push(['มูลค่าก่อนภาษี', money(tot.base)]);
      trs.push([`ภาษีมูลค่าเพิ่ม ${tot.vatRate}%`, money(tot.vat)]);
    }
    let totHtml = trs.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
    totHtml += `<tr class="grand"><td>จำนวนเงินรวมทั้งสิ้น</td><td>${money(tot.grand)}</td></tr>`;
    if (tot.wht) {
      totHtml += `<tr><td>หัก ณ ที่จ่าย ${tot.whtRate}%</td><td>${money(tot.wht)}</td></tr>`;
      totHtml += `<tr class="net"><td>ยอดชำระสุทธิ</td><td>${money(tot.netPay)}</td></tr>`;
    }

    // ---------- Payment box (receipt) ----------
    let pay = '';
    if (doc.type === 'RC') {
      const p = doc.payment || {};
      const box = (m) => `<span class="box">${p.method === m ? '✓' : ''}</span>${m}`;
      const OTHER_T = { EDC: 'เครื่องรูดบัตรเครดิต (EDC)', POS: 'เครื่องบันทึกเงินสด (POS)', GATEWAY: 'Online Payment Gateway', ECOM: 'ร้านค้าออนไลน์' };
      const isOther = p.method === 'ช่องทางอื่นๆ';
      const otherTxt = isOther ? [OTHER_T[p.otherType], p.channel].filter(Boolean).join(' · ') : '';
      pay = `
      <div class="d-pay">
        <div class="opts"><b>ชำระโดย</b> ${box('เงินสด')} ${box('โอนเงิน')} ${box('เช็ค')} ${box('บัตรเครดิต')} <span>${box('ช่องทางอื่นๆ')}${otherTxt ? ` <span class="fill">${esc(otherTxt)}</span>` : ''}</span></div>
        <div class="line">
          ${isOther ? '' : `<span>ธนาคาร <span class="fill">${esc(p.bank)}</span></span>`}
          <span>เลขที่ <span class="fill">${esc(p.ref)}</span></span>
          <span>วันที่ <span class="fill">${dateTH(p.date, be)}</span></span>
          <span>จำนวนเงิน <span class="fill">${p.method ? money(tot.wht ? tot.netPay : tot.grand) : ''}</span></span>
        </div>
        <div class="muted" style="margin-top:1.5mm">การชำระเงินด้วยเช็คจะสมบูรณ์เมื่อเรียกเก็บเงินได้ครบถ้วนแล้ว</div>
      </div>`;
    }

    // ---------- Signatures ----------
    const sign = t.sign.map(([label, who]) => `
      <div class="sg">
        <div class="for">ในนาม ${esc(who === 'seller' ? s.companyName : (c.name || '..............................................'))}</div>
        <div class="ln"><div>${label}</div><div class="date">วันที่</div></div>
      </div>`).join('');

    const notes = doc.notes || '';
    const logo = s.logo ? `<div class="d-logo"><img src="${s.logo}" alt=""></div>` : '';

    return `
    <div class="sheet" style="--accent:${esc(s.accent || '#1f2a44')}">
      <div class="d-head">
        <div class="d-seller">
          ${logo}
          <div>
            <div class="d-seller-name">${esc(s.companyName || 'ชื่อบริษัท (ตั้งค่าในเมนูข้อมูลบริษัท)')}</div>
            <div class="muted">${sellerLines}</div>
          </div>
        </div>
        <div class="d-title-box">
          <div class="d-title">${esc(title.th)}</div>
          <div class="d-title-en">${esc(title.en)}</div>
          ${copyLabel ? `<div class="d-copy">${esc(copyLabel)}</div>` : ''}
          <table class="d-meta">${meta}</table>
        </div>
      </div>

      <div class="d-cust">
        <div class="c-main">
          <div class="d-label">${t.partyLabel}</div>
          <div class="d-cust-name">${esc(partyName(c.name, c.branch))}</div>
          <div>${nl2br(c.address)}</div>
          ${c.taxId ? `<div>เลขประจำตัวผู้เสียภาษี ${esc(c.taxId)}</div>` : ''}
        </div>
        <div class="c-side">
          ${c.contact ? `<div><span class="d-label">ผู้ติดต่อ</span><br>${esc(c.contact)}</div>` : ''}
          ${c.phone ? `<div><span class="d-label">โทร</span> ${esc(c.phone)}</div>` : ''}
          ${doc.project ? `<div style="margin-top:1mm"><span class="d-label">โครงการ / งาน</span><br>${esc(doc.project)}</div>` : ''}
          ${doc.type === 'DO' && doc.ship && doc.ship.diff ? `<div style="margin-top:1mm"><span class="d-label">สถานที่จัดส่ง</span><br><b>${esc(doc.ship.name)}</b>${doc.ship.phone ? ' โทร ' + esc(doc.ship.phone) : ''}<br>${nl2br(doc.ship.address)}</div>` : ''}
        </div>
      </div>

      <table class="d-items">
        <thead><tr>
          <th class="no c">#</th>
          ${showCode ? '<th class="code">รหัส</th>' : ''}
          <th>รายละเอียด</th>
          <th class="qty n">จำนวน</th>
          <th class="unit c">หน่วย</th>
          <th class="price n">ราคา/หน่วย</th>
          ${showDisc ? '<th class="disc n">ส่วนลด</th>' : ''}
          <th class="amt n">จำนวนเงิน</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="d-sum">
        <div class="s-left">
          <div class="d-baht">(${bahtText(tot.wht ? tot.netPay : tot.grand)})</div>
          ${tot.wht ? `<div class="muted" style="font-size:9pt;margin-top:1mm;text-align:center">ยอดรวมทั้งสิ้น ${money(tot.grand)} บาท หักภาษี ณ ที่จ่าย ${money(tot.wht)} บาท</div>` : ''}
          ${notes ? `<div class="d-notes"><b>หมายเหตุ</b><br>${esc(notes)}</div>` : ''}
        </div>
        <div class="s-right"><table class="d-tot">${totHtml}</table></div>
      </div>
      ${pay}
      <div class="d-spacer"></div>
      <div class="d-sign">${sign}</div>
      ${s.footerText ? `<div class="d-foot">${esc(s.footerText)}</div>` : ''}
    </div>`;
  }

  // ---------- หน้าแนบ: วิธีการชำระเงิน (ใบเสนอราคา) ----------
  function renderPaymentSheet(doc, s) {
    const tot = calcTotals(doc);
    const be = !!s.useBEDate;
    const c = doc.customer || {};
    const accs = (doc.payAccounts || []).filter(a => a.bank || a.accNo || a.accName);
    const logo = s.logo ? `<div class="d-logo"><img src="${s.logo}" alt=""></div>` : '';
    const amount = tot.wht ? tot.netPay : tot.grand;
    const contact = [s.companyPhone ? 'โทร ' + esc(s.companyPhone) : '', s.companyEmail ? 'อีเมล ' + esc(s.companyEmail) : ''].filter(Boolean).join(' · ');
    const cards = accs.map((a, i) => `
        <div class="p-acc">
          <div class="p-no">${i + 1}</div>
          <table>
            <tr><td>ธนาคาร</td><td><b>${esc(a.bank)}</b></td></tr>
            <tr><td>ชื่อบัญชี</td><td>${esc(a.accName)}</td></tr>
            <tr><td>เลขที่บัญชี</td><td class="p-accno">${esc(a.accNo)}</td></tr>
          </table>
        </div>`).join('');
    return `
    <div class="sheet pay-sheet" style="--accent:${esc(s.accent || '#1f2a44')}">
      <div class="d-head">
        <div class="d-seller">
          ${logo}
          <div>
            <div class="d-seller-name">${esc(s.companyName || '')}</div>
            <div class="muted">${contact}</div>
          </div>
        </div>
        <div class="d-title-box">
          <div class="d-title">วิธีการชำระเงิน</div>
          <div class="d-title-en">PAYMENT METHOD</div>
          <table class="d-meta">
            <tr><td>อ้างอิง</td><td>${esc(doc.docNo)}</td></tr>
            <tr><td>วันที่</td><td>${dateTH(doc.date, be)}</td></tr>
          </table>
        </div>
      </div>

      <div class="p-sum">
        <div><span class="d-label">ลูกค้า</span><br><b>${esc(partyName(c.name, c.branch))}</b></div>
        <div class="p-amt"><span class="d-label">ยอดที่ต้องชำระ</span><br><b>${money(amount)}</b> บาท<div class="muted">(${bahtText(amount)})</div></div>
      </div>

      <div class="p-head">โอนเงินเข้าบัญชีธนาคาร</div>
      <div class="p-accs">${cards}</div>

      ${s.payPageNote ? `<div class="d-notes p-note"><b>หมายเหตุ</b><br>${esc(s.payPageNote)}</div>` : ''}
      ${contact ? `<div class="p-contact">สอบถาม / ส่งหลักฐานการโอน: ${contact}</div>` : ''}
      <div class="d-spacer"></div>
      ${s.footerText ? `<div class="d-foot">${esc(s.footerText)}</div>` : ''}
    </div>`;
  }

  // ---------- หน้าแนบ: สำเนาบัตรประชาชน + ยืนยันการรับเงิน (ใบเสร็จ) ----------
  function fillTpl(tpl, v) {
    return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  }
  function renderIdCardSheet(doc, s) {
    const tot = calcTotals(doc);
    const be = !!s.useBEDate;
    const c = doc.customer || {};
    const amount = tot.wht ? tot.netPay : tot.grand;
    const signer = s.idSignerName || s.companyName || '';
    const v = {
      amount: money(amount), amountText: bahtText(amount),
      customer: partyName(c.name, c.branch) || '-', docNo: doc.docNo || '',
      date: dateTH(doc.date, be), signer
    };
    // escape ก่อน แล้วไฮไลต์จำนวนเงิน / ชื่อลูกค้า
    const confirm = esc(fillTpl(s.idConfirmText || 'ขอยืนยันการรับเงินจำนวน {amount} บาท จาก {customer}', v));
    const wm = esc(fillTpl(s.idWatermark || '', v));
    return `
    <div class="sheet id-sheet" style="--accent:${esc(s.accent || '#1f2a44')}">
      <div class="d-head">
        <div class="d-seller"><div>
          <div class="d-seller-name">${esc(s.companyName || '')}</div>
          <div class="muted">เอกสารแนบใบเสร็จรับเงินเลขที่ ${esc(doc.docNo)}</div>
        </div></div>
        <div class="d-title-box">
          <div class="d-title">สำเนาบัตรประชาชน</div>
          <div class="d-title-en">COPY OF ID CARD</div>
          <table class="d-meta">
            <tr><td>อ้างอิง</td><td>${esc(doc.docNo)}</td></tr>
            <tr><td>วันที่</td><td>${dateTH(doc.date, be)}</td></tr>
          </table>
        </div>
      </div>

      <div class="id-card-box">
        <div class="id-card">
          <img src="${s.idCardImg}" alt="">
          ${wm ? `<div class="id-wm"><span>${wm}</span></div>` : ''}
        </div>
        <div class="id-certify">รับรองสำเนาถูกต้อง</div>
      </div>

      <div class="id-confirm">${confirm}</div>

      <div class="id-sign">
        <div class="id-sign-img">${s.idSignImg ? `<img src="${s.idSignImg}" alt="">` : ''}</div>
        <div class="id-sign-line">ลงชื่อ ..............................................................</div>
        <div class="id-sign-name">( ${esc(signer)} )</div>
        <div class="id-sign-role">ผู้รับเงิน</div>
        <div class="id-sign-date">วันที่ ${dateTH(doc.date, be)}</div>
      </div>
      <div class="d-spacer"></div>
      ${s.footerText ? `<div class="d-foot">${esc(s.footerText)}</div>` : ''}
    </div>`;
  }

  // copies: ['ต้นฉบับ','สำเนา'] หรือ [''] (ไม่แสดงป้าย)
  function renderDocument(doc, settings, copies) {
    let html = (copies && copies.length ? copies : ['']).map(cp => renderSheet(doc, settings, cp)).join('');
    if (doc.type === 'QT' && doc.attachPayPage && (doc.payAccounts || []).length) html += renderPaymentSheet(doc, settings);
    if (doc.type === 'RC' && doc.attachIdCard && settings.idCardImg) html += renderIdCardSheet(doc, settings);
    return html;
  }

  root.TYPES = TYPES;
  root.typeTitle = typeTitle;
  root.renderDocument = renderDocument;
})(window);
