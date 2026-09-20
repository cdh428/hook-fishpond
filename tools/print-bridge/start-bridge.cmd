@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ============================================
echo   Hook Fishpond  -  Print Bridge
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] python not found in PATH.
  echo         Install Python 3.10+ and make sure "Add to PATH" is checked.
  echo.
  pause
  exit /b 1
)

echo Checking dependencies...
python -c "import win32print, win32file, PIL" >nul 2>nul
if errorlevel 1 (
  echo Installing pywin32 and pillow ...
  python -m pip install --quiet pywin32 pillow
  if errorlevel 1 (
    echo [ERROR] pip install failed. Run manually:  pip install pywin32 pillow
    pause
    exit /b 1
  )
)

echo.
echo Available print targets:
echo.
python bridge.py --list
echo.
echo Starting bridge on http://127.0.0.1:17777
echo Keep this window open while printing. Press Ctrl+C to stop.
echo.

python bridge.py
pause
