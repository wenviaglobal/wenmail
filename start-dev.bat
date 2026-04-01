@echo off
echo ============================================
echo   MailPlatform - Starting Dev Servers
echo ============================================
echo.

:: Kill any existing processes on our ports
echo Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul

:: Set backend environment variables
set DATABASE_URL=postgresql://postgres:admin@localhost:5432/emailplatform
set JWT_SECRET=dev-secret-key-change-in-production-must-be-at-least-32-chars
set REDIS_URL=redis://localhost:6379
set NODE_ENV=development
set PORT=3000
set HOST=0.0.0.0
set PLATFORM_DOMAIN=mail.yourplatform.com

:: Start backend in a new window
echo Starting Backend (port 3000)...
start "MailPlatform - Backend" cmd /k "cd /d e:\Email server\backend && set DATABASE_URL=%DATABASE_URL% && set JWT_SECRET=%JWT_SECRET% && set REDIS_URL=%REDIS_URL% && set NODE_ENV=%NODE_ENV% && set PORT=%PORT% && set HOST=%HOST% && set PLATFORM_DOMAIN=%PLATFORM_DOMAIN% && npx tsx watch src/server.ts"

:: Wait a moment for backend to start
timeout /t 4 /nobreak >nul

:: Start frontend in a new window
echo Starting Frontend (port 5173)...
start "MailPlatform - Frontend" cmd /k "cd /d e:\Email server\frontend && npx vite --host"

:: Wait for frontend
timeout /t 3 /nobreak >nul

echo.
echo ============================================
echo   Both servers starting!
echo.
echo   Admin:          http://localhost:5173
echo   Client Portal:  http://localhost:5173/portal/login
echo   API Health:     http://localhost:3000/api/health
echo.
echo   Admin Login:    admin@mailplatform.com / admin123456
echo   Client Login:   user@democompany.com / client123456
echo.
echo   Close the CMD windows to stop servers.
echo ============================================
pause
