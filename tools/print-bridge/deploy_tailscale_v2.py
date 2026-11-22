"""重新上传改进后的 tailscale-serve-startup.bat 到 McIntosh Startup 文件夹。"""
import io
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
pwd = io.open(r"C:/Users/dnlct/.ssh/sshadmin.txt", encoding="utf-8").read().strip()
ssh.connect("100.85.92.120", port=22, username="SSHadmin", password=pwd, timeout=15)
print("✅ 已连接目标机\n")


def run(cmd: str, timeout: int = 30) -> str:
    _, out, err = ssh.exec_command(cmd, timeout=timeout)
    o = out.read().decode("utf-8", "ignore").strip()
    e = err.read().decode("utf-8", "ignore").strip()
    return (o + "\n" + e).strip()


STARTUP_DIR = r"C:\Users\McIntosh\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"

# 新 .bat 内容：加延迟 + 重试
BAT_CONTENT = '''@echo off
REM Hook Fishpond - Tailscale HTTPS serve (auto-start)
REM 让其他电脑能通过 https://desktop-h9c31c4.tailf74d0b.ts.net 访问打印桥

REM 等 Tailscale 服务就绪（开机时服务启动需要时间）
timeout /t 15 /nobreak >nul

REM 重试最多 6 次（共约 90 秒）
set /a tries=0
:retry
"C:\\Program Files\\Tailscale\\tailscale.exe" serve --bg --https=443 http://127.0.0.1:17777 && goto :done
set /a tries+=1
if %tries% geq 6 goto :done
timeout /t 10 /nobreak >nul
goto :retry

:done
exit /b 0
'''

# 1. 上传到 C:\hookfishpond-bridge\（源文件）
sftp = ssh.open_sftp()
with sftp.open(r"C:/hookfishpond-bridge/tailscale-serve-startup.bat", "w") as f:
    f.write(BAT_CONTENT)
print("✅ 源文件: C:/hookfishpond-bridge/tailscale-serve-startup.bat")

# 2. 复制到 Startup
print("\n=== 复制到 Startup ===")
print(run(f'copy /Y "C:\\hookfishpond-bridge\\tailscale-serve-startup.bat" "{STARTUP_DIR}\\tailscale-serve.bat"'))

# 3. 验证
print("\n=== 验证 ===")
print(run(f'if exist "{STARTUP_DIR}\\tailscale-serve.bat" (echo OK) else (echo FAIL)'))

ssh.close()
print("\n=== 完成 ===")
print("下次 McIntosh 登录 POS80 桌面时，.bat 会自动运行（带重试），")
print("确保 Tailscale 服务就绪后再配置 serve。")
print("域名: https://desktop-h9c31c4.tailf74d0b.ts.net")
