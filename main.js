// ============================================================
//  BillDesk — Electron main process
//  ทำงานออฟไลน์ 100%: บล็อกการเชื่อมต่อ http/https ทั้งหมด
// ============================================================
const { app, BrowserWindow, ipcMain, dialog, shell, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// ป้องกันเปิดโปรแกรมซ้อนกันหลายหน้าต่าง (กันข้อมูลชนกัน)
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    title: 'BillDesk',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#f4f5f7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });

  // ห้ามเปิดหน้าต่างใหม่ / ห้ามนำทางออกนอกแอป
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
}

// เมนูภาษาไทยแบบย่อ
function buildMenu() {
  const template = [
    {
      label: 'ไฟล์',
      submenu: [
        { label: 'เปิดโฟลเดอร์สำรองข้อมูลอัตโนมัติ', click: () => shell.openPath(backupDir()) },
        { type: 'separator' },
        { role: 'quit', label: 'ออกจากโปรแกรม' }
      ]
    },
    {
      label: 'แก้ไข',
      submenu: [
        { role: 'undo', label: 'เลิกทำ' }, { role: 'redo', label: 'ทำซ้ำ' }, { type: 'separator' },
        { role: 'cut', label: 'ตัด' }, { role: 'copy', label: 'คัดลอก' }, { role: 'paste', label: 'วาง' },
        { role: 'selectAll', label: 'เลือกทั้งหมด' }
      ]
    },
    {
      label: 'มุมมอง',
      submenu: [
        { role: 'reload', label: 'โหลดใหม่' },
        { role: 'zoomIn', label: 'ขยาย' }, { role: 'zoomOut', label: 'ย่อ' }, { role: 'resetZoom', label: 'ขนาดปกติ' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'เต็มจอ' },
        { role: 'toggleDevTools', label: 'เครื่องมือนักพัฒนา' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function backupDir() {
  const dir = path.join(app.getPath('documents'), 'BillDesk Backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

app.whenReady().then(() => {
  // ---- ความปลอดภัย: ปฏิเสธทุก request ที่ไม่ใช่ไฟล์ในเครื่อง ----
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, cb) => cb({ cancel: true })
  );
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false));

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ============================================================
//  IPC
// ============================================================

// บันทึกหน้าเอกสารปัจจุบันเป็น PDF (ใช้ @page ใน print.css)
ipcMain.handle('pdf:save', async (event, suggestedName) => {
  const wc = event.sender;
  const safe = String(suggestedName || 'document').replace(/[\\/:*?"<>|]/g, '_');
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(wc), {
    title: 'บันทึกเป็น PDF',
    defaultPath: path.join(app.getPath('documents'), safe + '.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  const data = await wc.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    pageSize: 'A4',
    margins: { marginType: 'none' }
  });
  fs.writeFileSync(filePath, data);
  shell.openPath(filePath);
  return { ok: true, filePath };
});

// สั่งพิมพ์ (เปิดหน้าต่างเลือกเครื่องพิมพ์ของระบบ)
ipcMain.handle('print', async (event) => {
  return new Promise((resolve) => {
    event.sender.print({ silent: false, printBackground: true }, (success, reason) => resolve({ ok: success, reason }));
  });
});

// สำรองข้อมูลอัตโนมัติ: เก็บไว้ที่ Documents/BillDesk Backups เก็บล่าสุด 30 ไฟล์
ipcMain.handle('backup:auto', async (event, json) => {
  const dir = backupDir();
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10);
  const file = path.join(dir, `billdesk-auto-${stamp}.json`);
  fs.writeFileSync(file, json, 'utf8');
  const files = fs.readdirSync(dir).filter(f => f.startsWith('billdesk-auto-')).sort();
  while (files.length > 30) {
    try { fs.unlinkSync(path.join(dir, files.shift())); } catch (_) { /* ignore */ }
  }
  return { ok: true, file };
});

ipcMain.handle('backup:openFolder', async () => {
  await shell.openPath(backupDir());
  return { ok: true };
});

ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  dataPath: app.getPath('userData'),
  backupPath: backupDir()
}));
