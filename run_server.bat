@echo off
title Linux Tutor Flask Server
echo ===================================================
echo 🐧 Starting Linux Tutor Backend Server...
echo ===================================================
cd /d "%~dp0"
call venv\Scripts\activate.bat
python app.py
pause
