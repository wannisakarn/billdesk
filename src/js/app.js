/* ============================================================
 *  app.js — ตัวโปรแกรมหลัก (Vanilla JS, ไม่มี framework)
 *  หมายเหตุ: CSP ห้าม inline script/onclick จึงใช้ event delegation
 * ============================================================ */
(function () {
  'use strict';
  const { esc, money, num, r2, todayISO, addDaysISO, dateTH, calcTotals, lineAmount, nextDocNo, uid } = U;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const desktop = window.desktop || null;

  // ---------------- ค่าเริ่มต้น ----------------
  const DEFAULT_SETTINGS = {
    companyName: '', companyBranch: 'สำนักงานใหญ่', companyAddress: '', companyTaxId: '',
    companyPhone: '', companyEmail: '', companyWebsite: '', logo: '',
    prefixQT: 'QT', prefixDO: 'DO', prefixRC: 'RC',
    useBENumber: false,          // ใช้ปี พ.ศ. ในเลขที่เอกสาร
    numberReset: 'month',        // month | year
    numberDigits: 4,
    useBEDate: false,            // แสดงวันที่เป็น พ.ศ.
    defaultVatMode: 'none',      // none | exclude | include
    vatRate: 7,
    defaultWht: 0,
    quoteValidDays: 30,
    creditDays: 30,
    salesperson: '',
    receiptTitle: 'ใบเสร็จรับเงิน', receiptTitleEn: 'RECEIPT',
    notesQT: 'ราคานี้ยืนราคา 30 วัน นับจากวันที่เสนอราคา',
    notesDO: '',
    notesRC: '',
    bankInfo: '',
    bankAccounts: [],            // [{id, bank, accName, accNo}] บัญชีสำหรับโอนชำระเงิน
    payChannels: {               // ช่องทางชำระ "ช่องทางอื่นๆ" แยกตามประเภท
      EDC: [], POS: [], GATEWAY: [],
      ECOM: ['Line Shopping', 'Line Shop', 'LAZADA', 'shopee']
    },
    defaultBankId: '',           // บัญชีหลัก (เลือกไว้อัตโนมัติในใบเสนอราคาใหม่)
    labelAppPath: 'D:\\work with claude\\Ass Ecom Manager\\Shipping Label App',   // โปรแกรมใบปะหน้า
    idCardImg: '',               // สำเนาบัตรประชาชน (data URL) แนบท้ายใบเสร็จ
    idSignImg: '',               // รูปลายเซ็น (ไม่บังคับ)
    idSignerName: '',
    idAttachDefault: true,
    idConfirmText: 'ขอยืนยันการรับเงินจำนวน {amount} บาท ({amountText}) จาก {customer} ตามใบเสร็จรับเงินเลขที่ {docNo} ลงวันที่ {date}',
    idWatermark: 'ใช้ยืนยันการรับเงินตามใบเสร็จเลขที่ {docNo} เท่านั้น',
    payPageNote: 'กรุณาโอนชำระตามยอดข้างต้น และส่งหลักฐานการโอนกลับมาเพื่อยืนยันการชำระเงิน',
    printCopies: 'both',         // both | original | copy | none
    minRows: 8,
    accent: '#1f2a44',
    footerText: ''
  };

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    docs: [], customers: [], products: [],
    view: 'list',
    filter: { type: 'ALL', q: '', from: '', to: '', status: '' },
    ed: null,           // เอกสารที่กำลังแก้ไข
    previewId: null
  };

  // ============================================================
  //  Helpers: toast / modal
  // ============================================================
  let toastTimer;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
  }

  // buttons: [{label, value, cls}] -> Promise<value>
  function modal(title, bodyHtml, buttons) {
    return new Promise(resolve => {
      $('#modalTitle').textContent = title;
      $('#modalBody').innerHTML = bodyHtml;
      const act = $('#modalActions');
      act.innerHTML = '';
      (buttons || [{ label: 'ตกลง', value: true, cls: 'primary' }]).forEach(b => {
        const el = document.createElement('button');
        el.className = 'btn ' + (b.cls || '');
        el.textContent = b.label;
        el.addEventListener('click', () => {
          const v = typeof b.value === 'function' ? b.value() : b.value;
          if (v === undefined) return;            // validation ไม่ผ่าน -> ไม่ปิด
          $('#modal').hidden = true;
          resolve(v);
        });
        act.appendChild(el);
      });
      $('#modal').hidden = false;
      const first = $('#modalBody input, #modalBody select, #modalBody textarea');
      if (first) first.focus();
    });
  }
  const confirmBox = (title, html, okLabel, danger) =>
    modal(title, html, [{ label: 'ยกเลิก', value: false }, { label: okLabel || 'ยืนยัน', value: true, cls: danger ? 'danger' : 'primary' }]);

  function statusClass(st) {
    if (['อนุมัติ', 'ดำเนินการแล้ว', 'ส่งแล้ว', 'ชำระแล้ว'].includes(st)) return 'ok';
    if (['ไม่อนุมัติ', 'ยกเลิก'].includes(st)) return 'bad';
    return 'wait';
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ============================================================
  //  Data
  // ============================================================
  async function loadAll() {
    const rows = await DB.getAll('settings');
    const s = { ...DEFAULT_SETTINGS };
    rows.forEach(r => { s[r.key] = r.value; });
    state.settings = s;
    state.docs = await DB.getAll('documents');
    state.customers = await DB.getAll('customers');
    state.products = await DB.getAll('products');
  }

  async function saveSettings(obj) {
    for (const k of Object.keys(obj)) {
      await DB.setSetting(k, obj[k]);
      state.settings[k] = obj[k];
    }
  }

  // สำรองข้อมูลอัตโนมัติ (เฉพาะเวอร์ชัน Desktop) — หน่วงเวลาเพื่อรวมหลายการบันทึก
  let autoBackupTimer;
  function scheduleAutoBackup() {
    if (!desktop) return;
    clearTimeout(autoBackupTimer);
    autoBackupTimer = setTimeout(async () => {
      try {
        const data = await DB.exportAll();
        await desktop.autoBackup(JSON.stringify(data));
        await DB.setSetting('lastAutoBackup', new Date().toISOString());
      } catch (e) { console.error('auto backup failed', e); }
      updateBackupHint();
    }, 2500);
  }

  async function updateBackupHint() {
    const el = $('#backupHint');
    const last = await DB.getSetting('lastManualBackup', null);
    const lastAuto = await DB.getSetting('lastAutoBackup', null);
    const days = last ? Math.floor((Date.now() - new Date(last)) / 86400000) : null;
    let txt = '';
    if (desktop && lastAuto) txt += `สำรองอัตโนมัติล่าสุด: ${new Date(lastAuto).toLocaleString('th-TH')}<br>`;
    if (days === null) txt += '⚠️ ยังไม่เคย Export ไฟล์สำรองข้อมูล';
    else txt += `Export ล่าสุด: ${days === 0 ? 'วันนี้' : days + ' วันที่แล้ว'}`;
    el.innerHTML = txt;
    el.classList.toggle('warn', days === null || days > 7);
  }

  // ============================================================
  //  Navigation
  // ============================================================
  function show(view) {
    state.view = view;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    const newType = view === 'editor' && state.ed && !state.ed._existing ? state.ed.type : null;
    $$('.nav-btn').forEach(b => b.classList.toggle('active',
      b.dataset.nav === view || (newType && b.dataset.new === newType) || (view === 'preview' && b.dataset.nav === 'list')));
    window.scrollTo(0, 0);
    if (view === 'list') renderList();
    if (view === 'customers') renderCustomers();
    if (view === 'products') renderProducts();
    if (view === 'settings') renderSettings();
    if (view === 'backup') renderBackup();
  }

  // ============================================================
  //  LIST VIEW
  // ============================================================
  function filteredDocs() {
    const f = state.filter;
    const q = f.q.trim().toLowerCase();
    return state.docs.filter(d => {
      if (f.type !== 'ALL' && d.type !== f.type) return false;
      if (f.status && d.status !== f.status) return false;
      if (f.from && d.date < f.from) return false;
      if (f.to && d.date > f.to) return false;
      if (q) {
        const hay = [d.docNo, d.refNo, d.project, d.customer && d.customer.name, d.customer && d.customer.taxId,
          ...(d.items || []).map(i => i.desc + ' ' + (i.code || ''))].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.docNo || '').localeCompare(a.docNo || ''));
  }

  function renderList() {
    const f = state.filter;
    const ym = todayISO().slice(0, 7);
    const monthDocs = state.docs.filter(d => (d.date || '').startsWith(ym));
    const sumOf = (arr) => arr.reduce((s, d) => s + calcTotals(d).grand, 0);
    const byType = (t) => monthDocs.filter(d => d.type === t && d.status !== 'ยกเลิก' && d.status !== 'ไม่อนุมัติ');
    const pendingQT = state.docs.filter(d => d.type === 'QT' && d.status === 'รออนุมัติ');

    const list = filteredDocs();
    const statuses = f.type === 'ALL' ? [...new Set(Object.values(TYPES).flatMap(t => t.statuses))] : TYPES[f.type].statuses;

    $('#view-list').innerHTML = `
      <div class="page-head">
        <div><h1>เอกสารทั้งหมด</h1><div class="sub">ข้อมูลทั้งหมดเก็บอยู่ในเครื่องนี้เท่านั้น</div></div>
        <div class="toolbar">
          <button class="btn" data-act="export-csv">⬇ Export รายงาน (CSV)</button>
          <button class="btn primary" data-act="new" data-type="QT">＋ ใบเสนอราคา</button>
          <button class="btn primary" data-act="new" data-type="DO">＋ ใบส่งของ</button>
          <button class="btn primary" data-act="new" data-type="RC">＋ ใบเสร็จ</button>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="k">ใบเสนอราคาเดือนนี้</div><div class="v">${money(sumOf(byType('QT')))}</div><div class="s">${byType('QT').length} ฉบับ</div></div>
        <div class="stat"><div class="k">ใบส่งของเดือนนี้</div><div class="v">${money(sumOf(byType('DO')))}</div><div class="s">${byType('DO').length} ฉบับ</div></div>
        <div class="stat"><div class="k">รับเงินเดือนนี้ (ใบเสร็จ)</div><div class="v">${money(sumOf(byType('RC')))}</div><div class="s">${byType('RC').length} ฉบับ</div></div>
        <div class="stat"><div class="k">ใบเสนอราคารออนุมัติ</div><div class="v">${pendingQT.length}</div><div class="s">มูลค่า ${money(sumOf(pendingQT))}</div></div>
      </div>
      <div class="filters">
        <div class="tabs">
          ${[['ALL', 'ทั้งหมด'], ['QT', 'ใบเสนอราคา'], ['DO', 'ใบส่งของ'], ['RC', 'ใบเสร็จ']].map(([k, l]) =>
            `<button data-act="ftype" data-type="${k}" class="${f.type === k ? 'active' : ''}">${l}</button>`).join('')}
        </div>
        <input type="search" id="fq" placeholder="ค้นหาเลขที่ / ลูกค้า / โครงการ / สินค้า" value="${esc(f.q)}">
        <label class="hint">จาก <input type="date" id="ffrom" value="${f.from}"></label>
        <label class="hint">ถึง <input type="date" id="fto" value="${f.to}"></label>
        <select id="fstatus"><option value="">ทุกสถานะ</option>${statuses.map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        ${(f.q || f.from || f.to || f.status) ? '<button class="btn sm" data-act="fclear">ล้างตัวกรอง</button>' : ''}
      </div>
      <div class="table-wrap">
        ${list.length ? `
        <table class="list">
          <thead><tr>
            <th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th><th>โครงการ</th>
            <th class="r">ยอดรวมสุทธิ</th><th>สถานะ</th><th class="r">จัดการ</th>
          </tr></thead>
          <tbody>
          ${list.map(d => {
            const t = calcTotals(d);
            const targets = d.type === 'QT' ? [['DO', 'ใบส่งของ'], ['RC', 'ใบเสร็จรับเงิน']] : d.type === 'DO' ? [['RC', 'ใบเสร็จรับเงิน']] : [];
            const conv = targets.length
              ? `<select class="conv-sel" data-convert="${d.id}" title="สร้างเอกสารใหม่จากฉบับนี้"><option value="">แปลงเป็น…</option>${targets.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>`
              : '';
            return `<tr>
              <td style="white-space:nowrap"><span class="badge ${d.type}">${esc(TYPES[d.type].name)}</span><br>
                <a href="#" data-act="preview" data-id="${d.id}"><b>${esc(d.docNo)}</b></a>
                ${d.refNo ? `<div class="hint">อ้างอิง ${esc(d.refNo)}</div>` : ''}</td>
              <td>${dateTH(d.date, state.settings.useBEDate)}</td>
              <td class="wrap-cust">${esc(d.customer && d.customer.name)}</td>
              <td class="wrap-proj hint">${esc(d.project)}</td>
              <td class="r">${money(t.grand)}</td>
              <td><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></td>
              <td class="r" style="white-space:nowrap">
                <button class="btn sm" data-act="preview" data-id="${d.id}">🖨 พิมพ์</button>
                <button class="btn sm" data-act="edit" data-id="${d.id}">แก้ไข</button>
                ${conv}
                <button class="btn sm" data-act="dup" data-id="${d.id}" title="ทำสำเนาเป็นเอกสารใหม่">⧉</button>
                <button class="btn sm danger" data-act="del" data-id="${d.id}" title="ลบ">🗑</button>
              </td>
            </tr>`;
          }).join('')}
          </tbody>
          <tfoot><tr><th colspan="4">รวม ${list.length} รายการ</th><th class="r">${money(sumOf(list))}</th><th colspan="2"></th></tr></tfoot>
        </table>` : `<div class="empty">ยังไม่มีเอกสาร${state.docs.length ? 'ที่ตรงกับเงื่อนไข' : ' — เริ่มจากตั้งค่า "ข้อมูลบริษัท" แล้วกด "＋ ใบเสนอราคา"'}</div>`}
      </div>`;

    const fq = $('#fq');
    fq.addEventListener('input', () => { state.filter.q = fq.value; renderListKeepFocus(); });
    $('#ffrom').addEventListener('change', e => { state.filter.from = e.target.value; renderList(); });
    $('#fto').addEventListener('change', e => { state.filter.to = e.target.value; renderList(); });
    $('#fstatus').addEventListener('change', e => { state.filter.status = e.target.value; renderList(); });
  }
  function renderListKeepFocus() {
    const pos = $('#fq').selectionStart;
    renderList();
    const fq = $('#fq'); fq.focus(); fq.setSelectionRange(pos, pos);
  }

  function exportCSV() {
    const list = filteredDocs();
    const head = ['ลำดับ', 'เลขที่เอกสาร', 'ประเภท', 'วันที่', 'ครบกำหนด', 'ชื่อลูกค้า', 'สาขา', 'เลขผู้เสียภาษี', 'โครงการ', 'มูลค่า', 'ภาษีมูลค่าเพิ่ม', 'ยอดรวมสุทธิ', 'หัก ณ ที่จ่าย', 'ยอดชำระ', 'อ้างอิง', 'สถานะ'];
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = list.map((d, i) => {
      const t = calcTotals(d);
      const c = d.customer || {};
      return [i + 1, d.docNo, TYPES[d.type].name, d.date, d.dueDate, c.name, c.branch, c.taxId, d.project, t.base.toFixed(2), t.vat.toFixed(2), t.grand.toFixed(2), t.wht.toFixed(2), t.netPay.toFixed(2), d.refNo, d.status].map(q).join(',');
    });
    download(`BillDesk-report-${todayISO()}.csv`, '﻿' + [head.map(q).join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
  }

  // ============================================================
  //  EDITOR
  // ============================================================
  function allDocNos(exceptId) {
    return state.docs.filter(d => d.id !== exceptId).map(d => d.docNo);
  }
  function genDocNo(type, date, exceptId) {
    const s = state.settings;
    return nextDocNo(s['prefix' + type] || type, date, allDocNos(exceptId), {
      useBE: s.useBENumber, reset: s.numberReset, digits: +s.numberDigits || 4
    });
  }
  function defaultDue(type, date) {
    const s = state.settings;
    if (type === 'QT') return addDaysISO(date, +s.quoteValidDays || 0);
    if (type === 'DO') return addDaysISO(date, +s.creditDays || 0);
    return '';
  }
  function blankItem() { return { id: uid(), code: '', desc: '', qty: 1, unit: '', price: 0, discount: 0, discType: 'amt' }; }

  // ---------- บัญชีธนาคารสำหรับโอนชำระเงิน ----------
  function bankList() { return (state.settings.bankAccounts || []).filter(a => a.bank || a.accNo); }
  function defaultBank() {
    const list = bankList();
    return list.find(a => a.id === state.settings.defaultBankId) || list[0] || null;
  }
  function acctSnap(a) { return { id: a.id, bank: a.bank || '', accName: a.accName || '', accNo: a.accNo || '' }; }
  function defaultBankText() {
    const a = defaultBank();
    return a ? [a.bank, a.accNo].filter(Boolean).join(' ') + (a.accName ? ' (' + a.accName + ')' : '') : '';
  }

  // ---------- ช่องทางอื่นๆ (EDC / POS / Payment Gateway / E-Commerce) ----------
  const OTHER_METHOD = 'ช่องทางอื่นๆ';
  const OTHER_TYPES = [
    ['EDC', 'เครื่องรูดบัตรเครดิต (EDC)'],
    ['POS', 'เครื่องบันทึกเงินสด (POS)'],
    ['GATEWAY', 'ช่องทางรับชำระออนไลน์ (Online Payment Gateway)'],
    ['ECOM', 'ร้านค้าออนไลน์ (Online shop/E-Commerce)']
  ];
  const otherTypeLabel = k => (OTHER_TYPES.find(t => t[0] === k) || [])[1] || '';
  function payChannels(type) {
    const all = state.settings.payChannels || {};
    return Array.isArray(all[type]) ? all[type] : [];
  }
  function channelOptionsHtml(type, sel) {
    if (!type) return '<option value="">— เลือกประเภทก่อน —</option>';
    const list = payChannels(type).slice();
    if (sel && !list.includes(sel)) list.push(sel);
    return '<option value="">เลือกช่องทางชำระ</option>'
      + list.map(c => `<option value="${esc(c)}" ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('')
      + '<option value="__add__">＋ เพิ่มช่องทางชำระ</option>';
  }
  async function addPayChannel(type) {
    const name = await modal('เพิ่มช่องทางชำระ',
      `<div class="hint" style="margin-bottom:8px">ประเภท: ${esc(otherTypeLabel(type))}</div>
       <label class="f"><span>ชื่อช่องทางชำระ</span><input type="text" id="newChName" placeholder="เช่น TikTok Shop, KBank EDC"></label>`,
      [{ label: 'ยกเลิก', value: '' },
       { label: 'เพิ่ม', cls: 'primary', value: () => { const v = $('#newChName').value.trim(); if (!v) { toast('กรุณากรอกชื่อช่องทาง', true); return undefined; } return v; } }]);
    if (!name) return '';
    const all = { EDC: [], POS: [], GATEWAY: [], ECOM: [], ...(state.settings.payChannels || {}) };
    all[type] = (all[type] || []).slice();
    if (!all[type].includes(name)) all[type].push(name);
    await saveSettings({ payChannels: all });
    scheduleAutoBackup();
    toast('เพิ่มช่องทาง "' + name + '" แล้ว');
    return name;
  }

  function newDoc(type, base) {
    const s = state.settings;
    const date = todayISO();
    const d = {
      id: uid(), type, date,
      docNo: genDocNo(type, date),
      dueDate: defaultDue(type, date),
      refNo: '', project: '', salesperson: s.salesperson || '',
      status: TYPES[type].statuses[type === 'RC' ? 0 : 0],
      customer: { name: '', branch: 'สำนักงานใหญ่', address: '', taxId: '', phone: '', contact: '' },
      items: [blankItem()],
      discount: 0, vatMode: s.defaultVatMode, vatRate: +s.vatRate || 7, whtRate: +s.defaultWht || 0,
      notes: s['notes' + type] || '',
      payment: type === 'RC' ? { method: 'โอนเงิน', bank: defaultBankText() || s.bankInfo || '', accountId: defaultBank() ? defaultBank().id : '', ref: '', date } : null,
      ship: type === 'DO' ? { diff: false, name: '', phone: '', address: '' } : undefined,
      _autoNo: true
    };
    if (type === 'RC') d.attachIdCard = !!(s.idAttachDefault && s.idCardImg);
    if (type === 'QT') {
      const def = defaultBank();
      d.payAccounts = def ? [acctSnap(def)] : [];
      d.attachPayPage = !!def;
    }
    if (base) {
      Object.assign(d, {
        customer: { ...base.customer },
        items: base.items.map(i => ({ ...i, id: uid() })),
        discount: base.discount, vatMode: base.vatMode, vatRate: base.vatRate, whtRate: base.whtRate,
        project: base.project, salesperson: base.salesperson || d.salesperson
      });
      if (type === 'RC' && base.type === 'RC' && base.attachIdCard != null) d.attachIdCard = !!base.attachIdCard && !!state.settings.idCardImg;
      if (type === 'QT' && base.type === 'QT' && base.payAccounts) {
        d.payAccounts = base.payAccounts.map(x => ({ ...x }));
        d.attachPayPage = !!base.attachPayPage;
      }
    }
    return d;
  }

  function openEditor(doc, existing) {
    state.ed = JSON.parse(JSON.stringify(doc));
    state.ed._existing = !!existing;
    renderEditor();
    show('editor');
  }

  function custOptions() {
    return state.customers.map(c => `<option value="${esc(c.name)}">`).join('');
  }
  function prodOptions() {
    return state.products.map(p => `<option value="${esc(p.code || p.name)}">${esc(p.code ? p.name : '')}</option>`).join('');
  }

  function renderEditor() {
    const d = state.ed;
    const t = TYPES[d.type];
    const s = state.settings;
    const title = typeTitle(d.type, s).th;
    const c = d.customer;
    const p = d.payment || {};

    $('#view-editor').innerHTML = `
      <div class="page-head">
        <div>
          <h1>${d._existing ? 'แก้ไข' : 'สร้าง'}${esc(title)} <span class="badge ${d.type}">${esc(d.docNo)}</span></h1>
          <div class="sub">${d._convertFrom ? 'สร้างจากเอกสาร ' + esc(d.refNo) + ' · ' : ''}กรอกข้อมูลแล้วกด "บันทึก" ระบบคำนวณยอดให้อัตโนมัติ</div>
        </div>
        <div class="toolbar">
          <button class="btn" data-act="cancel-edit">ยกเลิก</button>
          <button class="btn" data-act="save" data-then="stay">💾 บันทึก</button>
          <button class="btn primary" data-act="save" data-then="preview">💾 บันทึก &amp; พิมพ์ / PDF</button>
        </div>
      </div>

      <div class="card">
        <h2>ข้อมูลเอกสาร</h2>
        <div class="grid g4">
          <label class="f"><span>เลขที่เอกสาร <b>*</b></span><input type="text" data-bind="docNo" value="${esc(d.docNo)}"></label>
          <label class="f"><span>วันที่ออกเอกสาร <b>*</b></span><input type="date" data-bind="date" value="${d.date}"></label>
          <label class="f"><span>${t.dueLabel}</span><input type="date" data-bind="dueDate" value="${d.dueDate || ''}"></label>
          <label class="f"><span>สถานะ</span><select data-bind="status">${t.statuses.map(x => `<option ${d.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label class="f"><span>เลขที่อ้างอิง (เช่น PO / ใบเสนอราคา)</span><input type="text" data-bind="refNo" value="${esc(d.refNo)}"></label>
          <label class="f span2"><span>ชื่อโครงการ / งาน</span><input type="text" data-bind="project" value="${esc(d.project)}"></label>
          <label class="f"><span>ผู้ขาย / พนักงานขาย</span><input type="text" data-bind="salesperson" value="${esc(d.salesperson)}"></label>
        </div>
      </div>

      <div class="card" id="custCard">
        <h2>ข้อมูลลูกค้า <small>— พิมพ์ชื่อเพื่อเลือกลูกค้าเดิม ระบบจะเติมข้อมูลให้</small></h2>
        <datalist id="custList">${custOptions()}</datalist>
        <div class="grid g4">
          <label class="f span2"><span>ชื่อลูกค้า / บริษัท <b>*</b></span><input type="text" list="custList" data-bind="customer.name" id="custName" value="${esc(c.name)}" autocomplete="off"></label>
          <label class="f"><span>สำนักงานใหญ่ / สาขา</span><input type="text" list="branchList" data-bind="customer.branch" value="${esc(c.branch)}">
            <datalist id="branchList"><option value="สำนักงานใหญ่"><option value="สาขาที่ 00001"></datalist></label>
          <label class="f"><span>เลขประจำตัวผู้เสียภาษี (13 หลัก)</span><input type="text" maxlength="13" data-bind="customer.taxId" value="${esc(c.taxId)}"></label>
          <label class="f span2"><span>ที่อยู่</span><textarea rows="2" data-bind="customer.address">${esc(c.address)}</textarea></label>
          <label class="f"><span>ผู้ติดต่อ</span><input type="text" data-bind="customer.contact" value="${esc(c.contact)}"></label>
          <label class="f"><span>โทรศัพท์</span><input type="text" data-bind="customer.phone" value="${esc(c.phone)}"></label>
        </div>
      </div>

      <div class="card">
        <h2>รายการสินค้า / บริการ <small>— บรรทัดแรกของรายละเอียด = ชื่อรายการ, บรรทัดถัดไป = รายละเอียดย่อย (Shift+Enter)</small></h2>
        <datalist id="prodList">${prodOptions()}</datalist>
        <table class="items">
          <thead><tr>
            <th class="w-no">#</th><th class="w-code">รหัส</th><th>รายละเอียด</th><th class="w-qty">จำนวน</th><th class="w-unit">หน่วย</th>
            <th class="w-price">ราคา/หน่วย</th><th class="w-disc">ส่วนลด</th><th class="w-amt" style="text-align:right">จำนวนเงิน</th><th class="w-act"></th>
          </tr></thead>
          <tbody id="itemRows"></tbody>
        </table>
        <div class="toolbar" style="margin-top:8px">
          <button class="btn" data-act="add-item">＋ เพิ่มรายการ</button>
          ${state.products.length ? `<select id="addProduct"><option value="">＋ เพิ่มจากสินค้าที่บันทึกไว้…</option>${state.products.map(p => `<option value="${p.id}">${esc((p.code ? p.code + ' · ' : '') + p.name)} — ${money(p.price)}</option>`).join('')}</select>` : ''}
        </div>
      </div>

      <div class="totals-box">
        <div class="card">
          <h2>หมายเหตุ / เงื่อนไข</h2>
          <textarea rows="5" data-bind="notes">${esc(d.notes)}</textarea>
          ${d.type === 'RC' ? `
          <h2 style="margin-top:14px">การชำระเงิน</h2>
          <div class="grid g4">
            <label class="f"><span>ชำระโดย</span><select data-bind="payment.method">${['', 'เงินสด', 'โอนเงิน', 'เช็ค', 'บัตรเครดิต', OTHER_METHOD].map(m => `<option value="${m}" ${p.method === m ? 'selected' : ''}>${m || '— ไม่ระบุ —'}</option>`).join('')}</select></label>
            <div class="other-pay span4" id="rcOther" ${p.method === OTHER_METHOD ? '' : 'hidden'}>
              <label class="f"><span>ประเภท</span><select id="rcOtherType">
                <option value="">เลือกประเภท</option>
                ${OTHER_TYPES.map(([k, l]) => `<option value="${k}" ${p.otherType === k ? 'selected' : ''}>${l}</option>`).join('')}
              </select></label>
              <label class="f"><span>ช่องทางชำระ</span><select id="rcChannel">${channelOptionsHtml(p.otherType, p.channel)}</select></label>
            </div>
            <label class="f"><span>บัญชีที่ลูกค้าโอนเข้า</span><select id="rcAccSel">
              <option value="">— ไม่ระบุ / พิมพ์เอง —</option>
              ${bankList().map(a => `<option value="${esc(a.id)}" ${p.accountId === a.id ? 'selected' : ''}>${esc(a.bank)} · ${esc(a.accNo)}</option>`).join('')}
            </select></label>
            <label class="f"><span>ธนาคาร / บัญชี (แสดงบนใบเสร็จ)</span><input type="text" data-bind="payment.bank" id="rcBank" value="${esc(p.bank)}"></label>
            <label class="f"><span>เลขที่ (เช็ค/บัญชี/อ้างอิง)</span><input type="text" data-bind="payment.ref" value="${esc(p.ref)}"></label>
            <label class="f"><span>วันที่ชำระ</span><input type="date" data-bind="payment.date" value="${p.date || ''}"></label>
          </div>` : ''}
          ${d.type === 'RC' ? `
          <h2 style="margin-top:14px">สำเนาบัตรประชาชน <small>— แนบเป็นหน้าเพิ่มเติมตอนพิมพ์ / PDF</small></h2>
          ${state.settings.idCardImg
            ? `<label class="pay-toggle"><input type="checkbox" data-idcard ${d.attachIdCard ? 'checked' : ''}> แนบหน้า "สำเนาบัตรประชาชน + ยืนยันการรับเงิน" ไปกับใบเสร็จนี้</label>`
            : `<div class="hint">ยังไม่ได้อัปโหลดสำเนาบัตรประชาชน — เพิ่มได้ที่เมนู <a href="#" data-nav="settings">ข้อมูลบริษัท &amp; ตั้งค่า</a></div>`}` : ''}
          ${d.type === 'QT' ? payAcctSection(d) : ''}
          ${d.type === 'DO' ? shipSection(d) : ''}
        </div>
        <div class="card">
          <h2>สรุปยอด</h2>
          <table class="totals" id="totalsTable"></table>
          <div class="bahttext" id="bahtText"></div>
        </div>
      </div>`;

    renderItemRows();
    renderTotals();
  }

  function payAcctSection(d) {
    const sel = d.payAccounts || [];
    const ids = sel.map(a => a.id);
    // บัญชีจากหน้าตั้งค่า + บัญชีที่เคยเลือกไว้ในเอกสารนี้แต่ถูกลบจากตั้งค่าไปแล้ว
    const list = bankList().map(acctSnap).concat(sel.filter(a => !bankList().some(b => b.id === a.id)));
    const rows = list.length ? list.map(a => `
        <label class="pay-acc">
          <input type="checkbox" data-payacc="${esc(a.id)}" ${ids.includes(a.id) ? 'checked' : ''} ${d.attachPayPage ? '' : 'disabled'}>
          <span><b>${esc(a.bank)}</b> · ${esc(a.accNo)}<br><small>${esc(a.accName)}</small></span>
        </label>`).join('')
      : `<div class="hint">ยังไม่มีบัญชีธนาคาร — เพิ่มได้ที่เมนู <a href="#" data-nav="settings">ข้อมูลบริษัท &amp; ตั้งค่า</a></div>`;
    return `
          <h2 style="margin-top:14px">วิธีการชำระเงิน <small>— แนบเป็นหน้าเพิ่มเติมตอนพิมพ์ / PDF</small></h2>
          <label class="pay-toggle"><input type="checkbox" data-paypage ${d.attachPayPage ? 'checked' : ''} ${list.length ? '' : 'disabled'}> แนบหน้า "วิธีการชำระเงิน" ไปกับใบเสนอราคานี้</label>
          <div class="pay-accs" id="payAccs">${rows}</div>`;
  }

  function shipSection(d) {
    const sh = d.ship || {};
    return `
          <h2 style="margin-top:14px">ที่อยู่จัดส่ง / ใบปะหน้า</h2>
          <label class="pay-toggle"><input type="checkbox" data-shipdiff ${sh.diff ? 'checked' : ''}> ที่อยู่จัดส่งสินค้า ไม่ตรงกับที่อยู่ลูกค้า</label>
          <div class="grid g4" id="shipFields" style="${sh.diff ? '' : 'display:none'}">
            <label class="f span2"><span>ชื่อผู้รับ</span><input type="text" data-bind="ship.name" value="${esc(sh.name)}"></label>
            <label class="f span2"><span>เบอร์โทรผู้รับ</span><input type="text" data-bind="ship.phone" value="${esc(sh.phone)}"></label>
            <label class="f span4" style="grid-column:1/-1"><span>ที่อยู่จัดส่ง (บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์)</span><textarea rows="2" data-bind="ship.address">${esc(sh.address)}</textarea></label>
          </div>
          <div class="toolbar" style="margin-top:8px">
            <button class="btn" data-act="send-label">📦 ส่งข้อมูลไปทำใบปะหน้า</button>
            <span class="hint">เปิดโปรแกรม Shipping Label พร้อมกรอกชื่อ เบอร์ ที่อยู่ ให้อัตโนมัติ</span>
          </div>`;
  }

  // ข้อมูลสำหรับใบปะหน้า (ส่งไปโปรแกรม Shipping Label App)
  function labelPayload(d) {
    const sh = d.ship || {}, c = d.customer || {};
    const diff = !!sh.diff;
    const items = (d.items || []).filter(i => (i.desc || '').trim());
    const product = items.map(i => (i.desc || '').split('\n')[0].trim() + (num(i.qty) && num(i.qty) !== 1 ? ' x' + U.qtyFmt(i.qty) : '')).join(', ');
    return {
      billdesk: 1,
      docNo: d.docNo,
      name: diff ? (sh.name || c.name || '') : (c.name || ''),
      phone: diff ? (sh.phone || '') : (c.phone || ''),
      address: diff ? (sh.address || '') : (c.address || ''),
      product,
      price: calcTotals(d).grand,
      note: 'ใบส่งของ ' + (d.docNo || '') + (c.name && diff ? ' / ' + c.name : '')
    };
  }
  function labelText(p) {
    return `${p.name}\n${p.phone} ${p.address}`.replace(/\s+\n/g, '\n');
  }
  async function sendToLabelApp(d) {
    const p = labelPayload(d);
    if (!p.name || !p.address) return toast('กรุณาระบุชื่อผู้รับ และที่อยู่จัดส่ง (หรือที่อยู่ลูกค้า) ก่อน', true);
    const json = JSON.stringify(p);
    if (desktop && desktop.openLabelApp) {
      const r = await desktop.openLabelApp(state.settings.labelAppPath, json);
      if (r.ok) return toast('เปิดโปรแกรมใบปะหน้าแล้ว — ตรวจสอบข้อมูล แล้วกด "บันทึก & ปริ้นใบปะหน้า"');
      return toast((r.error || 'เปิดโปรแกรมใบปะหน้าไม่ได้') + ' — คัดลอกข้อมูลไว้แล้ว ให้กด Ctrl+V ในช่อง "ป้อนอัตโนมัติ" ของโปรแกรมใบปะหน้า', true);
    }
    try { await navigator.clipboard.writeText(json); toast('คัดลอกข้อมูลใบปะหน้าแล้ว — เปิดโปรแกรม Shipping Label แล้วกด Ctrl+V ในช่อง "ป้อนอัตโนมัติ"'); }
    catch (_) { modal('ข้อมูลใบปะหน้า', `<p class="hint">คัดลอกข้อความนี้ไปวางในช่อง "ป้อนอัตโนมัติ" ของโปรแกรม Shipping Label</p><textarea rows="6" style="width:100%" readonly>${esc(json)}</textarea>`, [{ label: 'ปิด', value: true }]); }
  }

  function renderItemRows() {
    const d = state.ed;
    $('#itemRows').innerHTML = d.items.map((it, i) => `
      <tr data-i="${i}">
        <td class="w-no">${i + 1}</td>
        <td><input type="text" list="prodList" data-f="code" value="${esc(it.code)}" autocomplete="off"></td>
        <td><textarea data-f="desc" rows="1">${esc(it.desc)}</textarea></td>
        <td><input type="number" step="any" class="num" data-f="qty" value="${it.qty}"></td>
        <td><input type="text" data-f="unit" value="${esc(it.unit)}"></td>
        <td><input type="number" step="any" class="num" data-f="price" value="${it.price}"></td>
        <td><div class="disc-wrap">
          <input type="number" step="any" min="0" class="num" data-f="discount" value="${it.discount || ''}">
          <select data-f="discType" title="ประเภทส่วนลด">
            <option value="amt" ${it.discType !== 'pct' ? 'selected' : ''}>บาท</option>
            <option value="pct" ${it.discType === 'pct' ? 'selected' : ''}>%</option>
          </select>
        </div></td>
        <td class="amt" data-amt="${i}">${money(lineAmount(it))}</td>
        <td class="w-act">
          <button class="btn icon sm" data-act="item-up" data-i="${i}" title="เลื่อนขึ้น">↑</button>
          <button class="btn icon sm" data-act="item-down" data-i="${i}" title="เลื่อนลง">↓</button>
          <button class="btn icon sm danger" data-act="item-del" data-i="${i}" title="ลบแถว">✕</button>
        </td>
      </tr>`).join('');
    $$('#itemRows textarea').forEach(autoGrow);
  }

  function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(36, ta.scrollHeight + 2) + 'px'; }

  function renderTotals() {
    const d = state.ed;
    const t = calcTotals(d);
    const whtOpts = [0, 1, 2, 3, 5];
    const isCustomWht = !whtOpts.includes(num(d.whtRate));
    $('#totalsTable').innerHTML = `
      <tr><td>รวมเป็นเงิน</td><td>${money(t.subtotal)}</td></tr>
      <tr><td>ส่วนลดท้ายบิล (บาท) <input type="number" step="any" class="num" style="width:110px" data-bind="discount" value="${d.discount || ''}"></td><td>${t.discount ? '-' + money(t.discount) : '0.00'}</td></tr>
      <tr><td>ภาษีมูลค่าเพิ่ม
        <select data-bind="vatMode">
          <option value="none" ${d.vatMode === 'none' ? 'selected' : ''}>ไม่มี VAT</option>
          <option value="exclude" ${d.vatMode === 'exclude' ? 'selected' : ''}>บวก VAT เพิ่ม</option>
          <option value="include" ${d.vatMode === 'include' ? 'selected' : ''}>ราคารวม VAT แล้ว</option>
        </select>
        ${d.vatMode !== 'none' ? `<input type="number" step="any" class="num" style="width:56px" data-bind="vatRate" value="${d.vatRate}">%` : ''}
      </td><td>${money(t.vat)}</td></tr>
      ${d.vatMode === 'include' ? `<tr><td class="hint">มูลค่าก่อนภาษี</td><td class="hint">${money(t.base)}</td></tr>` : ''}
      <tr class="grand"><td>จำนวนเงินรวมทั้งสิ้น</td><td>${money(t.grand)}</td></tr>
      <tr><td>หัก ณ ที่จ่าย
        <select id="whtSel">
          ${whtOpts.map(w => `<option value="${w}" ${!isCustomWht && num(d.whtRate) === w ? 'selected' : ''}>${w ? w + '%' : 'ไม่หัก'}</option>`).join('')}
          <option value="custom" ${isCustomWht ? 'selected' : ''}>ระบุเอง…</option>
        </select>
        ${isCustomWht ? `<input type="number" step="any" class="num" style="width:60px" data-bind="whtRate" value="${d.whtRate}">%` : ''}
      </td><td>${t.wht ? '-' + money(t.wht) : '0.00'}</td></tr>
      ${t.wht ? `<tr class="net"><td>ยอดชำระสุทธิ</td><td>${money(t.netPay)}</td></tr>` : ''}`;
    $('#bahtText').textContent = '(' + U.bahtText(t.wht ? t.netPay : t.grand) + ')';
    $('#whtSel').addEventListener('change', e => {
      d.whtRate = e.target.value === 'custom' ? 4 : +e.target.value;
      renderTotals();
    });
  }

  // อัปเดตค่าใน state.ed ตาม path เช่น "customer.name"
  function setPath(obj, path, val) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]]) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }

  function onEditorInput(e) {
    const el = e.target;
    const d = state.ed;
    if (!d) return;
    if (el.hasAttribute('data-idcard')) {
      if (e.type === 'change') d.attachIdCard = el.checked;
      return;
    }
    if (el.hasAttribute('data-shipdiff')) {
      if (e.type !== 'change') return;
      d.ship = d.ship || {};
      d.ship.diff = el.checked;
      $('#shipFields').style.display = el.checked ? '' : 'none';
      return;
    }
    if (el.id === 'rcOtherType') {
      if (e.type !== 'change') return;
      d.payment = d.payment || {};
      d.payment.otherType = el.value;
      if (!payChannels(el.value).includes(d.payment.channel)) d.payment.channel = '';
      $('#rcChannel').innerHTML = channelOptionsHtml(el.value, d.payment.channel);
      return;
    }
    if (el.id === 'rcChannel') {
      if (e.type !== 'change') return;
      d.payment = d.payment || {};
      if (el.value === '__add__') {
        const type = d.payment.otherType;
        el.value = d.payment.channel || '';
        addPayChannel(type).then(name => {
          if (name) d.payment.channel = name;
          const sel = $('#rcChannel');
          if (sel) sel.innerHTML = channelOptionsHtml(type, d.payment.channel);
        });
        return;
      }
      d.payment.channel = el.value;
      return;
    }
    if (el.id === 'rcAccSel') {
      if (e.type !== 'change') return;
      const a = bankList().find(x => x.id === el.value);
      d.payment = d.payment || {};
      d.payment.accountId = a ? a.id : '';
      if (a) {
        d.payment.bank = [a.bank, a.accNo].filter(Boolean).join(' ') + (a.accName ? ' (' + a.accName + ')' : '');
        $('#rcBank').value = d.payment.bank;
        if (!d.payment.method) { d.payment.method = 'โอนเงิน'; const m = $('[data-bind="payment.method"]'); if (m) m.value = 'โอนเงิน'; }
      }
      return;
    }
    if (el.hasAttribute('data-paypage')) {
      if (e.type !== 'change') return;
      d.attachPayPage = el.checked;
      if (d.attachPayPage && !(d.payAccounts || []).length) { const def = defaultBank(); d.payAccounts = def ? [acctSnap(def)] : []; }
      $$('[data-payacc]').forEach(cb => { cb.disabled = !el.checked; cb.checked = (d.payAccounts || []).some(a => a.id === cb.dataset.payacc); });
      return;
    }
    if (el.dataset.payacc) {
      if (e.type !== 'change') return;
      const all = bankList().map(acctSnap).concat((d.payAccounts || []).filter(a => !bankList().some(b => b.id === a.id)));
      const checked = $$('[data-payacc]').filter(cb => cb.checked).map(cb => cb.dataset.payacc);
      d.payAccounts = all.filter(a => checked.includes(a.id));
      return;
    }
    if (el.dataset.bind) {
      const key = el.dataset.bind;
      const isNum = ['discount', 'vatRate', 'whtRate'].includes(key);
      setPath(d, key, isNum ? num(el.value) : el.value);
      if (key === 'docNo') d._autoNo = false;
      if (key === 'date' && e.type === 'change') {
        if (d._autoNo && !d._existing) d.docNo = genDocNo(d.type, d.date, d.id);
        if (!d._existing) d.dueDate = defaultDue(d.type, d.date);
        const no = $('[data-bind="docNo"]'); if (no) no.value = d.docNo;
        const due = $('[data-bind="dueDate"]'); if (due) due.value = d.dueDate;
      }
      if (key === 'customer.name' && e.type === 'change') fillCustomer(el.value);
      if (['discount', 'vatRate', 'whtRate'].includes(key) && e.type === 'input') {
        // อัปเดตเฉพาะตัวเลข ไม่ re-render (กัน focus หลุด)
        refreshTotalsKeepFocus(el);
      }
      if (key === 'vatMode') renderTotals();
      if (key === 'payment.method') { const o = $('#rcOther'); if (o) o.hidden = el.value !== OTHER_METHOD; }
      return;
    }
    if (el.dataset.f) {
      const tr = el.closest('tr[data-i]');
      const i = +tr.dataset.i;
      const it = d.items[i];
      const f = el.dataset.f;
      it[f] = ['qty', 'price', 'discount'].includes(f) ? num(el.value) : el.value;
      if (f === 'desc') autoGrow(el);
      if (f === 'code' && e.type === 'change') fillProduct(i, el.value);
      $(`[data-amt="${i}"]`).textContent = money(lineAmount(it));
      renderTotals();
    }
  }

  function refreshTotalsKeepFocus(el) {
    const key = el.dataset.bind;
    const pos = el.selectionStart;
    renderTotals();
    const n = $(`#totalsTable [data-bind="${key}"]`);
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { /* number input */ } }
  }

  function fillCustomer(name) {
    const c = state.customers.find(x => x.name === name);
    if (!c) return;
    const d = state.ed;
    d.customer = { name: c.name, branch: c.branch || '', address: c.address || '', taxId: c.taxId || '', phone: c.phone || '', contact: c.contact || '' };
    ['branch', 'address', 'taxId', 'phone', 'contact'].forEach(k => {
      const el = $(`[data-bind="customer.${k}"]`); if (el) el.value = d.customer[k];
    });
    toast('เติมข้อมูลลูกค้าเดิมแล้ว');
  }

  function fillProduct(i, codeOrName) {
    const p = state.products.find(x => x.code === codeOrName) || state.products.find(x => x.name === codeOrName);
    if (!p) return;
    const it = state.ed.items[i];
    Object.assign(it, { code: p.code || '', desc: it.desc || p.name, unit: p.unit || it.unit, price: p.price });
    renderItemRows(); renderTotals();
  }

  function editorAction(act, btn) {
    const d = state.ed;
    const i = +btn.dataset.i;
    if (act === 'add-item') { d.items.push(blankItem()); renderItemRows(); renderTotals(); $$('#itemRows textarea').pop().focus(); }
    if (act === 'item-del') { d.items.splice(i, 1); if (!d.items.length) d.items.push(blankItem()); renderItemRows(); renderTotals(); }
    if (act === 'item-up' && i > 0) { [d.items[i - 1], d.items[i]] = [d.items[i], d.items[i - 1]]; renderItemRows(); }
    if (act === 'item-down' && i < d.items.length - 1) { [d.items[i + 1], d.items[i]] = [d.items[i], d.items[i + 1]]; renderItemRows(); }
  }

  async function saveDoc(then) {
    const d = state.ed;
    d.docNo = (d.docNo || '').trim();
    if (!d.docNo) return toast('กรุณาระบุเลขที่เอกสาร', true);
    if (!d.date) return toast('กรุณาระบุวันที่', true);
    if (!d.customer.name.trim()) { $('#custName').focus(); return toast('กรุณาระบุชื่อลูกค้า', true); }
    d.items = d.items.filter(it => (it.desc || '').trim() || (it.code || '').trim() || num(it.price));
    if (!d.items.length) { d.items.push(blankItem()); renderItemRows(); return toast('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ', true); }
    if (state.docs.some(x => x.id !== d.id && x.docNo === d.docNo)) {
      // เลขซ้ำ (เช่นเปิด 2 ฟอร์มพร้อมกัน) -> เสนอเลขใหม่
      const fresh = genDocNo(d.type, d.date, d.id);
      const ok = await confirmBox('เลขที่เอกสารซ้ำ', `เลขที่ <b>${esc(d.docNo)}</b> มีอยู่แล้ว<br>ต้องการใช้เลขใหม่ <b>${esc(fresh)}</b> แทนหรือไม่?`, 'ใช้เลขใหม่');
      if (!ok) return;
      d.docNo = fresh;
    }

    const now = new Date().toISOString();
    const rec = JSON.parse(JSON.stringify(d));
    const convertFrom = rec._convertFrom;
    delete rec._existing; delete rec._autoNo; delete rec._convertFrom; delete rec._saved;
    rec.totals = calcTotals(rec);                   // เก็บยอดไว้เพื่อรายงาน/ค้นหา
    rec.createdAt = rec.createdAt || now;
    rec.updatedAt = now;
    await DB.put('documents', rec);

    // จำลูกค้า / สินค้า อัตโนมัติ
    await upsertCustomer(rec.customer);
    for (const it of rec.items) await upsertProduct(it);

    // แปลงจากใบเสนอราคา -> ปรับสถานะใบเสนอราคาเป็น "ดำเนินการแล้ว"
    if (convertFrom) {
      const src = state.docs.find(x => x.id === convertFrom);
      if (src && src.type === 'QT' && src.status !== 'ดำเนินการแล้ว') {
        src.status = 'ดำเนินการแล้ว'; src.updatedAt = now;
        await DB.put('documents', src);
      }
    }

    state.docs = await DB.getAll('documents');
    state.ed._existing = true; state.ed._autoNo = false; delete state.ed._convertFrom;
    scheduleAutoBackup();
    toast('บันทึกแล้ว: ' + rec.docNo);
    if (then === 'preview') openPreview(rec.id);
    else renderEditor();
  }

  async function upsertCustomer(c) {
    if (!c || !c.name.trim()) return;
    const ex = state.customers.find(x => x.name.trim() === c.name.trim());
    const rec = { ...(ex || { id: uid() }), ...c, updatedAt: new Date().toISOString() };
    await DB.put('customers', rec);
    state.customers = await DB.getAll('customers');
  }
  async function upsertProduct(it) {
    const name = (it.desc || '').split('\n')[0].trim();
    if (!name && !it.code) return;
    const ex = state.products.find(p => (it.code && p.code === it.code) || (!it.code && !p.code && p.name === name));
    const rec = { ...(ex || { id: uid() }), code: it.code || '', name: name || (ex && ex.name) || it.code, unit: it.unit || '', price: num(it.price) };
    await DB.put('products', rec);
    state.products = await DB.getAll('products');
  }

  // ============================================================
  //  DOC ACTIONS: preview / convert / duplicate / delete
  // ============================================================
  function copiesFor(mode) {
    return { both: ['ต้นฉบับ', 'สำเนา'], original: ['ต้นฉบับ'], copy: ['สำเนา'], none: [''] }[mode] || [''];
  }

  function openPreview(id, copyMode) {
    const d = state.docs.find(x => x.id === id);
    if (!d) return;
    state.previewId = id;
    const mode = copyMode || state.settings.printCopies;
    $('#view-preview').innerHTML = `
      <div class="preview-bar no-print">
        <div class="page-head" style="margin-bottom:0">
          <div><h1>${esc(typeTitle(d.type, state.settings).th)} ${esc(d.docNo)}</h1>
            <div class="sub">${esc(d.customer.name)} · ยอดรวม ${money(calcTotals(d).grand)} บาท</div></div>
          <div class="toolbar">
            <button class="btn" data-act="back-list">← กลับ</button>
            <button class="btn" data-act="edit" data-id="${d.id}">✎ แก้ไข</button>
            <select id="copyMode">
              <option value="both" ${mode === 'both' ? 'selected' : ''}>ต้นฉบับ + สำเนา (2 หน้า)</option>
              <option value="original" ${mode === 'original' ? 'selected' : ''}>ต้นฉบับ</option>
              <option value="copy" ${mode === 'copy' ? 'selected' : ''}>สำเนา</option>
              <option value="none" ${mode === 'none' ? 'selected' : ''}>ไม่แสดงป้าย</option>
            </select>
            <button class="btn" data-act="print">🖨 พิมพ์</button>
            ${d.type === 'DO' ? `<button class="btn" data-act="send-label-doc" data-id="${d.id}">📦 ใบปะหน้า</button>` : ''}
            <button class="btn primary" data-act="pdf">📄 บันทึกเป็น PDF</button>
          </div>
        </div>
      </div>
      <div class="preview-stage" id="printArea">${renderDocument(d, state.settings, copiesFor(mode))}</div>`;
    $('#copyMode').addEventListener('change', e => openPreview(id, e.target.value));
    show('preview');
  }

  async function savePDF() {
    const d = state.docs.find(x => x.id === state.previewId);
    const name = `${d.docNo}_${(d.customer.name || '').trim()}`;
    if (desktop) {
      const r = await desktop.savePDF(name);
      if (r.ok) toast('บันทึก PDF แล้ว: ' + r.filePath);
    } else {
      // เวอร์ชันเว็บ/PWA: ใช้หน้าต่างพิมพ์ แล้วเลือก "Save as PDF / บันทึกเป็น PDF"
      const old = document.title;
      document.title = name;
      toast('เลือกเครื่องพิมพ์เป็น "Save as PDF" (บันทึกเป็น PDF)');
      setTimeout(() => { window.print(); document.title = old; }, 300);
    }
  }

  function convertDoc(id, toType) {
    const src = state.docs.find(x => x.id === id);
    if (!src) return;
    const d = newDoc(toType, src);
    d.refNo = src.docNo;
    d.refDocId = src.id;
    d._convertFrom = src.id;
    openEditor(d, false);
    toast(`คัดลอกข้อมูลจาก ${src.docNo} แล้ว ตรวจสอบและกดบันทึก`);
  }

  function duplicateDoc(id) {
    const src = state.docs.find(x => x.id === id);
    const d = newDoc(src.type, src);
    d.notes = src.notes;
    openEditor(d, false);
  }

  async function deleteDoc(id) {
    const d = state.docs.find(x => x.id === id);
    const ok = await confirmBox('ลบเอกสาร', `ต้องการลบ <b>${esc(d.docNo)}</b> (${esc(d.customer.name)}) ใช่หรือไม่?<br><span class="hint">การลบไม่สามารถย้อนกลับได้ (ยกเว้นกู้จากไฟล์สำรอง)</span>`, 'ลบ', true);
    if (!ok) return;
    await DB.del('documents', id);
    state.docs = await DB.getAll('documents');
    scheduleAutoBackup();
    toast('ลบแล้ว');
    renderList();
  }

  // ============================================================
  //  CUSTOMERS / PRODUCTS (ข้อมูลหลัก)
  // ============================================================
  function renderCustomers() {
    const list = [...state.customers].sort((a, b) => a.name.localeCompare(b.name, 'th'));
    $('#view-customers').innerHTML = `
      <div class="page-head"><div><h1>ลูกค้า</h1><div class="sub">ลูกค้าจะถูกบันทึกอัตโนมัติเมื่อออกเอกสาร</div></div>
        <div class="toolbar"><button class="btn primary" data-act="cust-edit">＋ เพิ่มลูกค้า</button></div></div>
      <div class="table-wrap">${list.length ? `<table class="list"><thead><tr><th>ชื่อ</th><th>สาขา</th><th>เลขผู้เสียภาษี</th><th>ที่อยู่</th><th>โทร</th><th class="r">เอกสาร</th><th></th></tr></thead><tbody>
        ${list.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.branch)}</td><td>${esc(c.taxId)}</td><td class="hint">${esc((c.address || '').slice(0, 70))}</td><td>${esc(c.phone)}</td>
          <td class="r">${state.docs.filter(d => d.customer.name === c.name).length}</td>
          <td class="r" style="white-space:nowrap"><button class="btn sm" data-act="cust-edit" data-id="${c.id}">แก้ไข</button> <button class="btn sm danger" data-act="cust-del" data-id="${c.id}">ลบ</button></td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">ยังไม่มีลูกค้า</div>'}</div>`;
  }

  async function editCustomer(id) {
    const c = state.customers.find(x => x.id === id) || { id: uid(), name: '', branch: 'สำนักงานใหญ่', taxId: '', address: '', phone: '', contact: '' };
    const res = await modal(id ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า', `
      <div class="grid g2">
        <label class="f span2"><span>ชื่อ <b>*</b></span><input type="text" id="m_name" value="${esc(c.name)}"></label>
        <label class="f"><span>สำนักงานใหญ่/สาขา</span><input type="text" id="m_branch" value="${esc(c.branch)}"></label>
        <label class="f"><span>เลขผู้เสียภาษี</span><input type="text" id="m_taxId" maxlength="13" value="${esc(c.taxId)}"></label>
        <label class="f span2"><span>ที่อยู่</span><textarea id="m_address" rows="3">${esc(c.address)}</textarea></label>
        <label class="f"><span>ผู้ติดต่อ</span><input type="text" id="m_contact" value="${esc(c.contact)}"></label>
        <label class="f"><span>โทร</span><input type="text" id="m_phone" value="${esc(c.phone)}"></label>
      </div>`, [{ label: 'ยกเลิก', value: null }, {
      label: 'บันทึก', cls: 'primary', value: () => {
        const v = {}; ['name', 'branch', 'taxId', 'address', 'contact', 'phone'].forEach(k => { v[k] = $('#m_' + k).value.trim(); });
        if (!v.name) { toast('กรุณาระบุชื่อ', true); return undefined; }
        return v;
      }
    }]);
    if (!res) return;
    await DB.put('customers', { ...c, ...res, updatedAt: new Date().toISOString() });
    state.customers = await DB.getAll('customers');
    scheduleAutoBackup();
    renderCustomers();
  }

  function renderProducts() {
    const list = [...state.products].sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, 'th'));
    $('#view-products').innerHTML = `
      <div class="page-head"><div><h1>สินค้า / บริการ</h1><div class="sub">บันทึกอัตโนมัติจากรายการในเอกสาร ใช้เติมรายการได้รวดเร็ว</div></div>
        <div class="toolbar"><button class="btn primary" data-act="prod-edit">＋ เพิ่มสินค้า</button></div></div>
      <div class="table-wrap">${list.length ? `<table class="list"><thead><tr><th>รหัส</th><th>ชื่อสินค้า/บริการ</th><th>หน่วย</th><th class="r">ราคา/หน่วย</th><th></th></tr></thead><tbody>
        ${list.map(p => `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.unit)}</td><td class="r">${money(p.price)}</td>
          <td class="r" style="white-space:nowrap"><button class="btn sm" data-act="prod-edit" data-id="${p.id}">แก้ไข</button> <button class="btn sm danger" data-act="prod-del" data-id="${p.id}">ลบ</button></td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">ยังไม่มีสินค้า</div>'}</div>`;
  }

  async function editProduct(id) {
    const p = state.products.find(x => x.id === id) || { id: uid(), code: '', name: '', unit: '', price: 0 };
    const res = await modal(id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า', `
      <div class="grid g2">
        <label class="f"><span>รหัส</span><input type="text" id="m_code" value="${esc(p.code)}"></label>
        <label class="f"><span>หน่วย</span><input type="text" id="m_unit" value="${esc(p.unit)}"></label>
        <label class="f span2"><span>ชื่อ <b>*</b></span><input type="text" id="m_name" value="${esc(p.name)}"></label>
        <label class="f"><span>ราคา/หน่วย</span><input type="number" step="any" class="num" id="m_price" value="${p.price}"></label>
      </div>`, [{ label: 'ยกเลิก', value: null }, {
      label: 'บันทึก', cls: 'primary', value: () => {
        const v = { code: $('#m_code').value.trim(), unit: $('#m_unit').value.trim(), name: $('#m_name').value.trim(), price: num($('#m_price').value) };
        if (!v.name) { toast('กรุณาระบุชื่อ', true); return undefined; }
        return v;
      }
    }]);
    if (!res) return;
    await DB.put('products', { ...p, ...res });
    state.products = await DB.getAll('products');
    scheduleAutoBackup();
    renderProducts();
  }

  // ============================================================
  //  SETTINGS
  // ============================================================
  function renderSettings() {
    const s = state.settings;
    const inp = (k, label, extra) => `<label class="f ${extra && extra.cls || ''}"><span>${label}</span><input type="${extra && extra.type || 'text'}" data-set="${k}" value="${esc(s[k])}" ${extra && extra.attr || ''}></label>`;
    const sel = (k, label, opts) => `<label class="f"><span>${label}</span><select data-set="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(s[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const ta = (k, label, cls) => `<label class="f ${cls || ''}"><span>${label}</span><textarea data-set="${k}" rows="3">${esc(s[k])}</textarea></label>`;

    $('#view-settings').innerHTML = `
      <div class="page-head"><div><h1>ข้อมูลบริษัท &amp; ตั้งค่า</h1><div class="sub">ข้อมูลนี้จะแสดงบนหัวเอกสารทุกฉบับ</div></div>
        <div class="toolbar"><button class="btn primary" data-act="save-settings">💾 บันทึกการตั้งค่า</button></div></div>

      <div class="card"><h2>ข้อมูลบริษัท / ผู้ขาย</h2>
        <div style="display:flex;gap:18px;align-items:flex-start">
          <div>
            <div class="logo-preview" id="logoPrev">${s.logo ? `<img src="${s.logo}">` : '<span class="hint">ไม่มีโลโก้</span>'}</div>
            <div class="toolbar" style="margin-top:6px">
              <label class="btn sm">เลือกโลโก้<input type="file" id="logoFile" accept="image/*" hidden></label>
              ${s.logo ? '<button class="btn sm danger" data-act="logo-clear">ลบ</button>' : ''}
            </div>
          </div>
          <div class="grid g3" style="flex:1">
            ${inp('companyName', 'ชื่อบริษัท / ชื่อผู้ขาย', { cls: 'span2' })}
            ${inp('companyBranch', 'สำนักงานใหญ่ / สาขา')}
            ${ta('companyAddress', 'ที่อยู่', 'span2')}
            ${inp('companyTaxId', 'เลขประจำตัวผู้เสียภาษี (13 หลัก)', { attr: 'maxlength="13"' })}
            ${inp('companyPhone', 'โทรศัพท์')}
            ${inp('companyEmail', 'อีเมล')}
            ${inp('companyWebsite', 'เว็บไซต์')}
            ${inp('salesperson', 'ชื่อผู้ขาย (ค่าเริ่มต้น)')}
          </div>
        </div>
      </div>

      <div class="card"><h2>บัญชีสำหรับโอนชำระเงิน <small>— เพิ่มได้หลายบัญชี เลือก "บัญชีหลัก" ไว้ 1 รายการ (ใช้เป็นค่าเริ่มต้นในใบเสนอราคาและใบเสร็จ)</small></h2>
        <datalist id="bankNames">${THAI_BANKS.map(b => `<option value="${b}">`).join('')}</datalist>
        <table class="items bank-table">
          <thead><tr><th style="width:70px;text-align:center">บัญชีหลัก</th><th>ธนาคาร</th><th>ชื่อบัญชี</th><th style="width:200px">เลขที่บัญชี</th><th style="width:44px"></th></tr></thead>
          <tbody id="bankRows">${bankRowsHtml()}</tbody>
        </table>
        <div class="toolbar" style="margin-top:8px"><button class="btn" data-act="bank-add">＋ เพิ่มบัญชี</button></div>
        <div class="grid g3" style="margin-top:10px">
          <label class="f span3"><span>ข้อความในหน้าวิธีการชำระเงิน</span><textarea data-set="payPageNote" rows="2">${esc(s.payPageNote)}</textarea></label>
        </div>
        <p class="hint">อย่าลืมกด "💾 บันทึกการตั้งค่า" ด้านบนหลังแก้ไขบัญชี</p>
      </div>

      <div class="card"><h2>ช่องทางอื่นๆ <small>— รายการ "ช่องทางชำระ" ในใบเสร็จ แยกตามประเภท (1 บรรทัด = 1 ช่องทาง)</small></h2>
        <div class="grid g4">
          ${OTHER_TYPES.map(([k, l]) => `<label class="f"><span>${l}</span><textarea data-paych="${k}" rows="5">${esc(payChannels(k).join('\n'))}</textarea></label>`).join('')}
        </div>
        <p class="hint">เพิ่มช่องทางใหม่ระหว่างออกใบเสร็จได้ด้วย "＋ เพิ่มช่องทางชำระ" — แก้ไขแล้วอย่าลืมกด "💾 บันทึกการตั้งค่า"</p>
      </div>

      <div class="card"><h2>สำเนาบัตรประชาชน <small>— แนบท้ายใบเสร็จรับเงิน พร้อมข้อความยืนยันการรับเงินและลายเซ็น</small></h2>
        <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
          <div>
            <div class="img-preview idcard" id="prev-idCardImg">${s.idCardImg ? `<img src="${s.idCardImg}">` : '<span class="hint">ยังไม่มีรูปบัตร</span>'}</div>
            <div class="toolbar" style="margin-top:6px">
              <label class="btn sm">เลือกรูปบัตรประชาชน<input type="file" data-imgfile="idCardImg" accept="image/*" hidden></label>
              ${s.idCardImg ? '<button class="btn sm danger" data-act="img-clear" data-key="idCardImg">ลบ</button>' : ''}
            </div>
          </div>
          <div>
            <div class="img-preview sign" id="prev-idSignImg">${s.idSignImg ? `<img src="${s.idSignImg}">` : '<span class="hint">ลายเซ็น (ไม่บังคับ)</span>'}</div>
            <div class="toolbar" style="margin-top:6px">
              <label class="btn sm">เลือกรูปลายเซ็น<input type="file" data-imgfile="idSignImg" accept="image/*" hidden></label>
              ${s.idSignImg ? '<button class="btn sm danger" data-act="img-clear" data-key="idSignImg">ลบ</button>' : ''}
            </div>
            <div class="hint" style="max-width:220px;margin-top:4px">ถ้าไม่ใส่รูปลายเซ็น จะเว้นเส้นไว้ให้เซ็นด้วยปากกาหลังพิมพ์</div>
          </div>
          <div class="grid g2" style="flex:1;min-width:320px">
            ${inp('idSignerName', 'ชื่อผู้ลงนาม (เว้นว่าง = ใช้ชื่อบริษัท/ผู้ขาย)')}
            ${sel('idAttachDefault', 'แนบกับใบเสร็จใหม่อัตโนมัติ', [[true, 'แนบทุกครั้ง'], [false, 'ไม่แนบ (เลือกเองในแต่ละใบ)']])}
            <label class="f span2"><span>ข้อความยืนยันการรับเงิน</span><textarea data-set="idConfirmText" rows="3">${esc(s.idConfirmText)}</textarea></label>
            <label class="f span2"><span>ข้อความคาดทับบนสำเนาบัตร (กันนำไปใช้ผิดวัตถุประสงค์)</span><input type="text" data-set="idWatermark" value="${esc(s.idWatermark)}"></label>
          </div>
        </div>
        <p class="hint">ใช้คำแทนได้: {amount} = จำนวนเงิน, {amountText} = จำนวนเงินตัวอักษร, {customer} = ชื่อลูกค้า, {docNo} = เลขที่ใบเสร็จ, {date} = วันที่ · รูปบัตรเก็บไว้ในเครื่องนี้เท่านั้น</p>
      </div>

      <div class="card"><h2>โปรแกรมใบปะหน้า <small>— ใช้กับปุ่ม "📦 ส่งข้อมูลไปทำใบปะหน้า" ในใบส่งของ</small></h2>
        <div class="grid g3">
          ${inp('labelAppPath', 'โฟลเดอร์โปรแกรม Shipping Label App (ที่มีไฟล์ index.html)', { cls: 'span3' })}
        </div>
      </div>

      <div class="card"><h2>เลขที่เอกสาร <small>— รูปแบบ: คำนำหน้า + ปี + เดือน + เลขรัน เช่น QT2026100001</small></h2>
        <div class="grid g4">
          ${inp('prefixQT', 'คำนำหน้า ใบเสนอราคา')}
          ${inp('prefixDO', 'คำนำหน้า ใบส่งของ')}
          ${inp('prefixRC', 'คำนำหน้า ใบเสร็จรับเงิน')}
          ${sel('numberDigits', 'จำนวนหลักเลขรัน', [[3, '3 หลัก (001)'], [4, '4 หลัก (0001)'], [5, '5 หลัก (00001)']])}
          ${sel('useBENumber', 'ปีในเลขที่เอกสาร', [[false, 'ค.ศ. (2026)'], [true, 'พ.ศ. (2569)']])}
          ${sel('numberReset', 'เริ่มเลขรันใหม่', [['month', 'ทุกเดือน (YYYYMM####)'], ['year', 'ทุกปี (YYYY####)']])}
          ${sel('useBEDate', 'แสดงวันที่บนเอกสาร', [[false, 'ค.ศ. 06/10/2026'], [true, 'พ.ศ. 06/10/2569']])}
        </div>
      </div>

      <div class="card"><h2>ภาษี &amp; ค่าเริ่มต้น</h2>
        <div class="grid g4">
          ${sel('defaultVatMode', 'VAT ค่าเริ่มต้น', [['none', 'ไม่มี VAT (ไม่ได้จด VAT)'], ['exclude', 'บวก VAT เพิ่ม'], ['include', 'ราคารวม VAT แล้ว']])}
          ${inp('vatRate', 'อัตรา VAT (%)', { type: 'number' })}
          ${sel('defaultWht', 'หัก ณ ที่จ่าย ค่าเริ่มต้น', [[0, 'ไม่หัก'], [1, '1% (ค่าขนส่ง)'], [2, '2% (ค่าโฆษณา)'], [3, '3% (ค่าบริการ/จ้างทำของ)'], [5, '5% (ค่าเช่า)']])}
          ${inp('quoteValidDays', 'ยืนราคา (วัน)', { type: 'number' })}
          ${inp('creditDays', 'เครดิต ใบส่งของ (วัน)', { type: 'number' })}
          ${inp('receiptTitle', 'ชื่อหัวใบเสร็จ', { cls: 'span2' })}
          ${inp('receiptTitleEn', 'ชื่อหัวใบเสร็จ (อังกฤษ)')}
        </div>
        <p class="hint">ถ้าจดทะเบียน VAT แล้ว สามารถเปลี่ยนชื่อหัวใบเสร็จเป็น "ใบเสร็จรับเงิน/ใบกำกับภาษี" (TAX INVOICE / RECEIPT) ได้</p>
      </div>

      <div class="card"><h2>หมายเหตุเริ่มต้น &amp; การพิมพ์</h2>
        <div class="grid g3">
          ${ta('notesQT', 'หมายเหตุ ใบเสนอราคา')}
          ${ta('notesDO', 'หมายเหตุ ใบส่งของ')}
          ${ta('notesRC', 'หมายเหตุ ใบเสร็จ')}
          ${sel('printCopies', 'พิมพ์ค่าเริ่มต้น', [['both', 'ต้นฉบับ + สำเนา'], ['original', 'ต้นฉบับ'], ['copy', 'สำเนา'], ['none', 'ไม่แสดงป้าย']])}
          ${inp('minRows', 'จำนวนแถวขั้นต่ำในตาราง', { type: 'number' })}
          ${inp('accent', 'สีหลักของเอกสาร', { type: 'color' })}
          ${inp('footerText', 'ข้อความท้ายเอกสาร', { cls: 'span3' })}
        </div>
      </div>`;

    $('#logoFile').addEventListener('change', onLogoFile);
    $$('[data-imgfile]').forEach(el => el.addEventListener('change', onSettingImage));
  }

  const THAI_BANKS = ['ธนาคารกสิกรไทย', 'ธนาคารไทยพาณิชย์', 'ธนาคารกรุงเทพ', 'ธนาคารกรุงไทย', 'ธนาคารกรุงศรีอยุธยา', 'ธนาคารทหารไทยธนชาต (ttb)',
    'ธนาคารออมสิน', 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)', 'ธนาคารอาคารสงเคราะห์', 'ธนาคารยูโอบี', 'ธนาคารซีไอเอ็มบี ไทย',
    'ธนาคารเกียรตินาคินภัทร', 'ธนาคารแลนด์ แอนด์ เฮ้าส์', 'ธนาคารอิสลามแห่งประเทศไทย', 'พร้อมเพย์ (PromptPay)'];

  function bankRowsHtml(list, defId) {
    const s = state.settings;
    list = list || (s.bankAccounts && s.bankAccounts.length ? s.bankAccounts : [{ id: uid(), bank: '', accName: s.companyName || '', accNo: '' }]);
    defId = defId != null ? defId : s.defaultBankId;
    if (!list.some(a => a.id === defId) && list[0]) defId = list[0].id;
    return list.map(a => `
      <tr data-bank="${esc(a.id)}">
        <td style="text-align:center;padding-top:11px"><input type="radio" name="bankDefault" value="${esc(a.id)}" ${a.id === defId ? 'checked' : ''} title="ตั้งเป็นบัญชีหลัก"></td>
        <td><input type="text" list="bankNames" data-bk="bank" value="${esc(a.bank)}" placeholder="เช่น ธนาคารกสิกรไทย"></td>
        <td><input type="text" data-bk="accName" value="${esc(a.accName)}" placeholder="ชื่อบัญชี"></td>
        <td><input type="text" data-bk="accNo" value="${esc(a.accNo)}" placeholder="xxx-x-xxxxx-x"></td>
        <td><button class="btn icon sm danger" data-act="bank-del" title="ลบบัญชี">✕</button></td>
      </tr>`).join('');
  }
  function readBankRows() {
    return $$('#bankRows tr[data-bank]').map(tr => ({
      id: tr.dataset.bank,
      bank: tr.querySelector('[data-bk="bank"]').value.trim(),
      accName: tr.querySelector('[data-bk="accName"]').value.trim(),
      accNo: tr.querySelector('[data-bk="accNo"]').value.trim()
    }));
  }
  function readBankDefault() { const r = $('#bankRows input[name="bankDefault"]:checked'); return r ? r.value : ''; }
  function bankRowsAction(act, btn) {
    let list = readBankRows(); let def = readBankDefault();
    if (act === 'bank-add') list.push({ id: uid(), bank: '', accName: state.settings.companyName || '', accNo: '' });
    if (act === 'bank-del') {
      const id = btn.closest('tr').dataset.bank;
      list = list.filter(a => a.id !== id);
      if (!list.length) list.push({ id: uid(), bank: '', accName: '', accNo: '' });
      if (def === id) def = list[0].id;
    }
    $('#bankRows').innerHTML = bankRowsHtml(list, def);
  }

  async function saveSettingsForm() {
    const obj = {};
    if ($('#bankRows')) {
      obj.bankAccounts = readBankRows().filter(a => a.bank || a.accNo);
      const def = readBankDefault();
      obj.defaultBankId = obj.bankAccounts.some(a => a.id === def) ? def : (obj.bankAccounts[0] ? obj.bankAccounts[0].id : '');
    }
    if ($('[data-paych]')) {
      obj.payChannels = {};
      $$('[data-paych]').forEach(el => {
        obj.payChannels[el.dataset.paych] = [...new Set(el.value.split('\n').map(x => x.trim()).filter(Boolean))];
      });
    }
    $$('[data-set]').forEach(el => {
      let v = el.value;
      if (v === 'true') v = true; else if (v === 'false') v = false;
      else if (el.type === 'number' || ['numberDigits', 'defaultWht'].includes(el.dataset.set)) v = num(v);
      obj[el.dataset.set] = v;
    });
    await saveSettings(obj);
    scheduleAutoBackup();
    toast('บันทึกการตั้งค่าแล้ว');
  }

  // ย่อรูปโลโก้ให้ไม่เกิน 600px แล้วเก็บเป็น data URL (ไม่ต้องพึ่งไฟล์ภายนอก)
  function onLogoFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const max = 600;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        const data = cv.toDataURL('image/png');
        await saveSettings({ logo: data });
        // อัปเดตเฉพาะรูปตัวอย่าง (ไม่ render ฟอร์มใหม่ เพื่อไม่ให้ข้อมูลที่พิมพ์ค้างไว้หาย)
        $('#logoPrev').innerHTML = `<img src="${data}">`;
        toast('อัปโหลดโลโก้แล้ว');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  }

  // รูปสำเนาบัตร / ลายเซ็น — ย่อขนาดแล้วเก็บเป็น data URL
  function onSettingImage(e) {
    const key = e.target.dataset.imgfile;
    const f = e.target.files[0];
    if (!f) return;
    const isSign = key === 'idSignImg';
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const max = isSign ? 800 : 1400;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        const ctx = cv.getContext('2d');
        if (!isSign) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        const data = isSign ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.88);
        await saveSettings({ [key]: data });
        if (key === 'idCardImg' && state.settings.idAttachDefault == null) await saveSettings({ idAttachDefault: true });
        $('#prev-' + key).innerHTML = `<img src="${data}">`;
        scheduleAutoBackup();
        toast(isSign ? 'อัปโหลดลายเซ็นแล้ว' : 'อัปโหลดสำเนาบัตรประชาชนแล้ว');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  }

  // ============================================================
  //  BACKUP / RESTORE
  // ============================================================
  async function renderBackup() {
    const info = desktop ? await desktop.info() : null;
    const last = await DB.getSetting('lastManualBackup', null);
    $('#view-backup').innerHTML = `
      <div class="page-head"><div><h1>สำรอง / กู้คืนข้อมูล</h1><div class="sub">ข้อมูลทั้งหมด ${state.docs.length} เอกสาร · ${state.customers.length} ลูกค้า · ${state.products.length} สินค้า</div></div></div>
      <div class="card"><h2>1) Export ข้อมูลทั้งหมด (JSON)</h2>
        <p>ดาวน์โหลดไฟล์ <code>.json</code> ที่มีข้อมูลทั้งหมด (ตั้งค่า, โลโก้, ลูกค้า, สินค้า, เอกสาร) แนะนำให้เก็บไว้ใน USB / Google Drive / OneDrive สัปดาห์ละครั้ง</p>
        <button class="btn primary" data-act="backup-export">⬇ Export ไฟล์สำรองข้อมูล</button>
        <span class="hint" style="margin-left:10px">ครั้งล่าสุด: ${last ? new Date(last).toLocaleString('th-TH') : 'ยังไม่เคย'}</span>
      </div>
      <div class="card"><h2>2) Import / กู้คืนข้อมูล</h2>
        <p>เลือกไฟล์ <code>.json</code> ที่เคย Export ไว้</p>
        <div class="toolbar">
          <label class="check"><input type="radio" name="impMode" value="merge" checked> รวมกับข้อมูลเดิม (รายการที่ซ้ำจะถูกแทนที่)</label>
          <label class="check"><input type="radio" name="impMode" value="replace"> ล้างข้อมูลเดิมทั้งหมด แล้วกู้คืนจากไฟล์</label>
        </div>
        <label class="btn" style="margin-top:10px">📂 เลือกไฟล์สำรองข้อมูล…<input type="file" id="importFile" accept=".json,application/json" hidden></label>
      </div>
      ${info ? `<div class="card"><h2>3) สำรองอัตโนมัติ (เวอร์ชัน Desktop)</h2>
        <p>โปรแกรมบันทึกไฟล์สำรองให้อัตโนมัติทุกครั้งที่มีการแก้ไข (วันละ 1 ไฟล์ เก็บย้อนหลัง 30 วัน) ไว้ที่:<br><code>${esc(info.backupPath)}</code></p>
        <button class="btn" data-act="open-backup-folder">📁 เปิดโฟลเดอร์สำรองอัตโนมัติ</button>
        <p class="hint" style="margin-top:10px">ฐานข้อมูลหลักอยู่ที่: <code>${esc(info.dataPath)}</code> · เวอร์ชัน ${esc(info.version)}</p>
      </div>` : `<div class="card"><h2>3) หมายเหตุ (เวอร์ชันเว็บ / PWA)</h2><p class="hint">ข้อมูลเก็บใน IndexedDB ของเบราว์เซอร์ หากล้างประวัติ/คุกกี้ของเบราว์เซอร์ ข้อมูลอาจหาย — กรุณา Export ไฟล์สำรองเป็นประจำ</p></div>`}`;
    $('#importFile').addEventListener('change', onImportFile);
  }

  async function exportBackup() {
    const data = await DB.exportAll();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    download(`BillDesk-backup-${stamp}.json`, JSON.stringify(data, null, 1));
    await DB.setSetting('lastManualBackup', new Date().toISOString());
    updateBackupHint();
    renderBackup();
    toast('Export ไฟล์สำรองข้อมูลแล้ว');
  }

  function onImportFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const mode = ($('input[name=impMode]:checked') || {}).value || 'merge';
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const n = (data.documents || []).length;
        const ok = await confirmBox('ยืนยันการกู้คืน', `ไฟล์นี้มี <b>${n}</b> เอกสาร, ${(data.customers || []).length} ลูกค้า<br>สร้างเมื่อ ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('th-TH') : '-'}<br><br>โหมด: <b>${mode === 'replace' ? 'ล้างข้อมูลเดิมแล้วกู้คืน' : 'รวมกับข้อมูลเดิม'}</b>`, 'กู้คืน', mode === 'replace');
        if (!ok) { e.target.value = ''; return; }
        await DB.importAll(data, mode);
        await loadAll();
        scheduleAutoBackup();
        toast('กู้คืนข้อมูลสำเร็จ');
        show('list');
      } catch (err) {
        toast('ไม่สามารถอ่านไฟล์: ' + err.message, true);
      }
      e.target.value = '';
    };
    reader.readAsText(f, 'utf-8');
  }

  // ============================================================
  //  GLOBAL EVENTS
  // ============================================================
  document.addEventListener('click', async (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { show(nav.dataset.nav); return; }
    const nw = e.target.closest('[data-new]');
    if (nw) { openEditor(newDoc(nw.dataset.new), false); return; }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (btn.tagName === 'A') e.preventDefault();

    switch (act) {
      case 'new': openEditor(newDoc(btn.dataset.type), false); break;
      case 'ftype': state.filter.type = btn.dataset.type; state.filter.status = ''; renderList(); break;
      case 'fclear': state.filter = { ...state.filter, q: '', from: '', to: '', status: '' }; renderList(); break;
      case 'export-csv': exportCSV(); break;
      case 'preview': openPreview(id); break;
      case 'edit': openEditor(state.docs.find(x => x.id === id), true); break;
      case 'convert': convertDoc(id, btn.dataset.to); break;
      case 'dup': duplicateDoc(id); break;
      case 'del': deleteDoc(id); break;
      case 'save': saveDoc(btn.dataset.then); break;
      case 'cancel-edit': show('list'); break;
      case 'back-list': show('list'); break;
      case 'print': window.print(); break;
      case 'pdf': savePDF(); break;
      case 'add-item': case 'item-del': case 'item-up': case 'item-down': editorAction(act, btn); break;
      case 'cust-edit': editCustomer(id); break;
      case 'cust-del':
        if (await confirmBox('ลบลูกค้า', 'ลบลูกค้ารายนี้? (เอกสารเดิมไม่ถูกลบ)', 'ลบ', true)) {
          await DB.del('customers', id); state.customers = await DB.getAll('customers'); renderCustomers();
        } break;
      case 'prod-edit': editProduct(id); break;
      case 'prod-del':
        if (await confirmBox('ลบสินค้า', 'ลบสินค้านี้ออกจากรายการ?', 'ลบ', true)) {
          await DB.del('products', id); state.products = await DB.getAll('products'); renderProducts();
        } break;
      case 'save-settings': saveSettingsForm(); break;
      case 'bank-add': case 'bank-del': bankRowsAction(act, btn); break;
      case 'send-label': if (state.ed) sendToLabelApp(state.ed); break;
      case 'send-label-doc': { const dd = state.docs.find(x => x.id === id); if (dd) sendToLabelApp(dd); } break;
      case 'img-clear': await saveSettings({ [btn.dataset.key]: '' }); renderSettings(); break;
      case 'logo-clear': await saveSettings({ logo: '' }); renderSettings(); break;
      case 'backup-export': exportBackup(); break;
      case 'open-backup-folder': desktop && desktop.openBackupFolder(); break;
    }
  });

  // input ในหน้าแก้ไขเอกสาร
  const editorView = () => $('#view-editor');
  document.addEventListener('input', e => { if (editorView().contains(e.target)) onEditorInput(e); });
  document.addEventListener('change', e => {
    if (e.target.dataset.convert) { if (e.target.value) convertDoc(e.target.dataset.convert, e.target.value); return; }
    if (!editorView().contains(e.target)) return;
    if (e.target.id === 'addProduct') {
      const p = state.products.find(x => x.id === e.target.value);
      if (p) {
        const d = state.ed;
        const last = d.items[d.items.length - 1];
        const row = { id: uid(), code: p.code, desc: p.name, qty: 1, unit: p.unit, price: p.price, discount: 0, discType: 'amt' };
        if (last && !last.desc && !last.code && !num(last.price)) d.items[d.items.length - 1] = row; else d.items.push(row);
        renderItemRows(); renderTotals();
      }
      e.target.value = '';
      return;
    }
    onEditorInput(e);
  });

  // คีย์ลัด: Ctrl+S = บันทึก, Ctrl+P = พิมพ์ (ในหน้าพรีวิว)
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.view === 'editor') { e.preventDefault(); saveDoc('stay'); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && state.view !== 'preview') { e.preventDefault(); }
  });

  // ============================================================
  //  START
  // ============================================================
  async function start() {
    try {
      await DB.open();
      await loadAll();
    } catch (err) {
      document.body.innerHTML = '<div class="empty">ไม่สามารถเปิดฐานข้อมูลในเครื่องได้: ' + esc(err.message) + '</div>';
      return;
    }
    show(state.settings.companyName ? 'list' : 'settings');
    if (!state.settings.companyName) toast('เริ่มต้นใช้งาน: กรอกข้อมูลบริษัทของคุณก่อน');
    updateBackupHint();
    scheduleAutoBackup();

    // PWA: ลงทะเบียน Service Worker เฉพาะเมื่อเปิดผ่าน http(s) (ไม่ใช่ Electron/file://)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed', err));
    }
  }
  start();
})();
