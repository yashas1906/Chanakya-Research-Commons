@echo off
setlocal
cd /d "%~dp0"

echo ======================================================================
echo    Chanakya Research Commons (CRC) -- Application Setup and Runner
echo ======================================================================

rem Check if virtual environment python exists
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" start.py %*
) else (
    python start.py %*
)

if errorlevel 1 (
    echo.
    echo An error occurred while running the startup program.
    pause
)
