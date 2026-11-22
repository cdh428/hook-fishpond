@echo off
REM Hook Fishpond - 打印桥 Tailscale HTTPS 反代（开机自启）
REM 目的：让其他电脑能通过 Tailscale HTTPS 域名访问打印桥
REM 域名: https://desktop-h9c31c4.tailf74d0b.ts.net

REM 开机时 Tailscale 服务可能还没就绪，先等 10 秒
timeout /t 10 /nobreak >nul

REM 最多重试 6 次（共约 1 分钟），每次失败等 10 秒
set /a tries=0
:retry
"C:\Program Files\Tailscale\tailscale.exe" serve --bg --https=443 http://127.0.0.1:17777 && goto :done
set /a tries+=1
if %tries% geq 6 goto :done
timeout /t 10 /nobreak >nul
goto :retry

:done
exit /b 0
