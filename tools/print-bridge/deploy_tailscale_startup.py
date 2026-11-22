"""
上传 Tailscale serve 启动脚本到 POS80 机：
  1. 上传 .bat 到 C:\\hookfishpond-bridge\\
  2. 放到 McIntosh 的 Startup 文件夹（开机自动执行）
  3. 立即跑一次测试，验证 serve 配置是否生效
"""
import io
import paramiko
from pathlib import Path

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
pwd = io.open(r"C:/Users/dnlct/.ssh/sshadmin.txt", encoding="utf-8").read().strip()
ssh.connect("100.85.92.120", port=22, username="SSHadmin", password=pwd, timeout=15)
print("✅ 已连接目标机\n")

TS = r"C:\Program Files\Tailscale\tailscale.exe"


def run(cmd: str, timeout: int = 30) -> str:
    _, out, err = ssh.exec_command(cmd, timeout=timeout)
    o = out.read().decode("utf-8", "ignore").strip()
    e = err.read().decode("utf-8", "ignore").strip()
    return (o + "\n" + e).strip()


# 1. 上传 .bat 到 C:\hookfishpond-bridge\
bat_content = f'''@echo off
REM Hook Fishpond - 打印桥 Tailscale HTTPS 反代
REM 确保其他电脑能通过 Tailscale 域名访问打印桥
"C:\\Program Files\\Tailscale\\tailscale.exe" serve --bg --https=443 http://127.0.0.1:17777
'''
sftp = ssh.open_sftp()
bat_path = r"C:/hookfishpond-bridge/tailscale-serve-startup.bat"
with sftp.open(bat_path, "w") as f:
    f.write(bat_content)
print(f"✅ 上传 .bat: {bat_path}")

# 2. 找 McIntosh 的 Startup 文件夹，创建快捷方式
ps_create_shortcut = f'''
$ErrorActionPreference = "Stop"
$startupDir = [Environment]::GetFolderPath("Startup")
$batSource = "{bat_path}"
$linkPath = Join-Path $startupDir "HookFishpond-TailscaleServe.lnk"
$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut($linkPath)
$shortcut.TargetPath = $batSource
$shortcut.Description = "Hook Fishpond Tailscale Serve"
$shortcut.Save()
Write-Output "SHORTCUT_CREATED: $linkPath"
'''
import base64
enc = base64.b64encode(ps_create_shortcut.encode("utf-16-le")).decode("ascii")
result = run(f"powershell -NoProfile -EncodedCommand {enc}", timeout=30)
print(f"✅ 快捷方式: {result}")

# 3. 立即测试：用计划任务 S4U 跑 .bat
print("\n=== 立即测试：通过计划任务以 McIntosh 身份运行 .bat ===")
ps_run_bat = f'''
$ErrorActionPreference = "SilentlyContinue"
$batPath = "{bat_path}"
$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$batPath`""
$principal = New-ScheduledTaskPrincipal -UserId "DESKTOP-H9C31C4\\McIntosh" -LogonType Interactive
$task    = New-ScheduledTask -Action $action -Principal $principal
Register-ScheduledTask -TaskName "HFTestServe" -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName "HFTestServe"
Start-Sleep -Seconds 5
Unregister-ScheduledTask -TaskName "HFTestServe" -Confirm:$false
Write-Output "RAN_BAT"
'''
enc2 = base64.b64encode(ps_run_bat.encode("utf-16-le")).decode("ascii")
result2 = run(f"powershell -NoProfile -EncodedCommand {enc2}", timeout=30)
print(result2)

# 4. 验证 serve 配置
print("\n=== 验证 serve 配置 ===")
verify = run(f'powershell -NoProfile -Command "& \'{TS}\' serve status"')
print(verify or "(无输出，可能 serve 未运行)")

ssh.close()
print("\n=== 部署完成 ===")
print("POS80 机重启后会自动配置 serve；其他电脑访问 https://desktop-h9c31c4.tailf74d0b.ts.net 即可打印")
