@echo off
title Microstock Studio Launcher
cd /d "%~dp0"

echo [1/3] Closing any previous instances...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

echo [2/3] Starting desktop service...
call npm run electron:dev
