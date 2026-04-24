@echo off
REM autobuild — one-click launcher for Windows
REM Starts the orchestrator (port 4001) and the dashboard (port 4000)
REM concurrently, then opens the dashboard in the default browser.

setlocal
cd /d "%~dp0"

echo.
echo  ============================================================
echo   autobuild  -  starting orchestrator + dashboard
echo  ============================================================
echo   orchestrator: http://localhost:4001
echo   dashboard:    http://localhost:4000
echo.
echo   close this window to stop both processes.
echo  ============================================================
echo.

REM Verify dependencies are installed; if not, run setup first
if not exist "node_modules\concurrently" (
  echo  [setup] installing root dependencies...
  call npm install
)
if not exist "dashboard\node_modules\next" (
  echo  [setup] installing dashboard dependencies...
  call npm --prefix dashboard install
)

REM Open the dashboard in the default browser after a short delay,
REM so the Next.js dev server has a moment to bind the port.
start "" /b cmd /c "timeout /t 6 /nobreak > nul && start http://localhost:4000"

REM Run both processes via the npm "start" script (uses concurrently).
REM Ctrl+C in this window stops them both cleanly.
call npm start

endlocal
