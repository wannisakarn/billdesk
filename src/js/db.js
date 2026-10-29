/* ============================================================
 *  db.js — IndexedDB wrapper (เก็บข้อมูลในเครื่องเท่านั้น)
 *  Stores: settings | customers | products | documents
 * ============================================================ */
(function (root) {
  'use strict';
  const DB_NAME = 'billdesk';
  const DB_VERSION = 1;
  const STORES = ['settings', 'customers', 'products', 'documents'];
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('customers')) {
          const s = db.createObjectStore('customers', { keyPath: 'id' });
          s.createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('products')) {
          const s = db.createObjectStore('products', { keyPath: 'id' });
          s.createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('documents')) {
          const s = db.createObjectStore('documents', { keyPath: 'id' });
          s.createIndex('type', 'type');
          s.createIndex('docNo', 'docNo');
          s.createIndex('date', 'date');
        }
      };
      req.onsuccess = () => {
        _db = req.result;
        // ขอให้เบราว์เซอร์ไม่ลบข้อมูลอัตโนมัติ (กรณีใช้แบบ PWA)
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        resolve(_db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      Promise.resolve(fn(s)).then(r => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  function reqP(req) {
    return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  }

  const DB = {
    open,
    getAll: (store) => tx(store, 'readonly', s => reqP(s.getAll())),
    get: (store, key) => tx(store, 'readonly', s => reqP(s.get(key))),
    put: (store, obj) => tx(store, 'readwrite', s => reqP(s.put(obj))),
    del: (store, key) => tx(store, 'readwrite', s => reqP(s.delete(key))),
    clear: (store) => tx(store, 'readwrite', s => reqP(s.clear())),
    bulkPut: (store, arr) => tx(store, 'readwrite', s => { arr.forEach(o => s.put(o)); }),

    // settings เก็บเป็น key/value
    getSetting: async (key, def) => {
      const r = await DB.get('settings', key);
      return r ? r.value : def;
    },
    setSetting: (key, value) => DB.put('settings', { key, value }),

    // ---------- Backup / Restore ----------
    exportAll: async () => {
      const out = { app: 'BillDesk', schema: DB_VERSION, exportedAt: new Date().toISOString() };
      for (const s of STORES) out[s] = await DB.getAll(s);
      return out;
    },
    // mode: 'replace' = ล้างข้อมูลเดิมก่อน | 'merge' = รวม (id ซ้ำจะถูกทับ)
    importAll: async (data, mode) => {
      if (!data || data.app !== 'BillDesk') throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองข้อมูลของ BillDesk');
      for (const s of STORES) {
        if (!Array.isArray(data[s])) continue;
        if (mode === 'replace') await DB.clear(s);
        await DB.bulkPut(s, data[s]);
      }
    }
  };

  root.DB = DB;
})(window);
