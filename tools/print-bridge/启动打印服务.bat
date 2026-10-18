@echo off
chcp 65001 >nul
title Hook Fishpond - 专用打印机服务一键启动器
echo ========================================================
echo   Hook Fishpond - 专用打印机工作站 (USB + Tailscale)
echo ========================================================
echo.

:: 1. 检查防火墙并自动放行 17777 端口
netsh advfirewall firewall show rule name="PrintBridge-TCP" >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] 正在设置 Windows 防火墙放行 17777 端口...
    netsh advfirewall firewall add rule name="PrintBridge-TCP" dir=in action=allow protocol=TCP localport=17777 >nul 2>&1
    if %errorlevel% equ 0 (
        echo [+] 防火墙 17777 端口放行成功！
    ) else (
        echo [!] 请以管理员身份运行本脚本以放行防火墙。
    )
) else (
    echo [+] 防火墙 17777 端口已放行。
)
echo.

:: 2. 检查 Python 环境
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python，请先安装 Python 3.10+。
    pause
    exit /b 1
)

:: 3. 运行打印机自检测试
echo [*] 正在对 USB POS80 打印机进行自检出纸测试...
python bridge.py --selftest --printer POS80
echo.

:: 4. 启动打印服务并监听所有网卡 (包括 Tailscale 100.x.x.x)
echo [*] 正在启动打印桥接服务...
echo [*] 服务端口: 17777
echo [*] 支持局域网与 Tailscale 远程跨网调用
echo.
python bridge.py --host 0.0.0.0 --printer POS80

pause
