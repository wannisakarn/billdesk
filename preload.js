// เปิดเฉพาะฟังก์ชันที่จำเป็นให้หน้าเว็บเรียกใช้ (contextIsolation)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  savePDF: (name) => ipcRenderer.invoke('pdf:save', name),
  print: () => ipcRenderer.invoke('print'),
  autoBackup: (json) => ipcRenderer.invoke('backup:auto', json),
  openBackupFolder: () => ipcRenderer.invoke('backup:openFolder'),
  info: () => ipcRenderer.invoke('app:info')
});
