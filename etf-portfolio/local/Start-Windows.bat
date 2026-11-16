@echo off
title ETF Portfolio (local test)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-server.ps1"
if errorlevel 1 pause
