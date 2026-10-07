@echo off
chcp 65001 >nul
title BillDesk - Build for Windows
cd /d "%~dp0"

echo ==========================================
echo   BillDesk : ติดตั้งและสร้างไฟล์ .exe
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo [X] ไม่พบ Node.js กรุณาติดตั้งจาก https://nodejs.org (เลือก LTS) แล้วรันไฟล์นี้ใหม่
  pause
  exit /b 1
)

echo [1/2] ติดตั้ง dependencies (ต้องต่ออินเทอร์เน็ตเฉพาะขั้นตอนนี้)...
call npm install
if errorlevel 1 ( echo [X] npm install ไม่สำเร็จ & pause & exit /b 1 )

echo [2/2] สร้างตัวติดตั้ง (Setup) และเวอร์ชัน Portable...
call npm run dist
if errorlevel 1 ( echo [X] Build ไม่สำเร็จ & pause & exit /b 1 )

echo.
echo เสร็จแล้ว! ไฟล์อยู่ในโฟลเดอร์ dist
echo  - BillDesk-Setup.exe          = ตัวติดตั้ง (สร้างไอคอนบน Desktop ให้อัตโนมัติ)
echo  - BillDesk-Portable-1.0.0.exe = เปิดใช้ได้ทันทีไม่ต้องติดตั้ง
start "" "%~dp0dist"
pause
