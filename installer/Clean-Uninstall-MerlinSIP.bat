@echo off
:: Batch script to cleanly remove all previous Merlin SIP installations
echo ========================================================
echo   Merlin SIP Complete Uninstaller and Cleanup Tool
echo ========================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Administrator privileges required.
    echo Please right-click this script and select 'Run as administrator'.
    echo.
    pause
    exit /b 1
)

echo Closing any running Merlin SIP processes...
taskkill /f /im MerlinSIP.exe >nul 2>&1

echo.
echo Searching for installed Merlin SIP packages...
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object { $_.DisplayName -like '*Merlin*' } | Select-Object -ExpandProperty PSChildName"') do (
    echo Removing product %%i ...
    start /wait msiexec.exe /x %%i /qn /norestart
)

echo.
echo Cleaning up application directory...
if exist "C:\Program Files\CK Media Services\Merlin SIP" (
    rmdir /s /q "C:\Program Files\CK Media Services\Merlin SIP"
)

echo.
echo ========================================================
echo   Cleanup completed successfully!
echo   You can now run MerlinSIP-1.3.6-x64-faststart.msi
echo ========================================================
echo.
pause
