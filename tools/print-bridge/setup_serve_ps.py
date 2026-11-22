"""用 PowerShell Register-ScheduledTask 以 McIntosh 身份运行 tailscale serve（S4U 免密）。"""
import io
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
pwd = io.open(r"C:/Users/dnlct/.ssh/sshadmin.txt", encoding="utf-8").read().strip()
ssh.connect("100.85.92.120", port=22, username="SSHadmin", password=pwd, timeout=15)
print("✅ 已连接目标机\n")

TS = r"C:\Program Files\Tailscale\tailscale.exe"

# PowerShell 脚本：注册 S4U 任务（无需密码，以 McIntosh 身份在交互会话运行）
ps_script = f'''
$ErrorActionPreference = "Stop"
$action  = New-ScheduledTaskAction -Execute "{TS}" -Argument "serve --bg --https=443 http://127.0.0.1:17777"
$principal = New-ScheduledTaskPrincipal -UserId "DESKTOP-H9C31C4\\McIntosh" -LogonType Interactive
$task    = New-ScheduledTask -Action $action -Principal $principal
Register-ScheduledTask -TaskName "HFTSServe" -InputObject $task -Force | Out-Null
Write-Output "REGISTERED"
Start-ScheduledTask -TaskName "HFTSServe"
Start-Sleep -Seconds 3
Write-Output "=== serve status ==="
& "{TS}" serve status
Unregister-ScheduledTask -TaskName "HFTSServe" -Confirm:$false
Write-Output "CLEANED"
'''

import base64
enc = base64.b64encode(ps_script.encode("utf-16-le")).decode("ascii")
cmd = f"powershell -NoProfile -EncodedCommand {enc}"

_, out, err = ssh.exec_command(cmd, timeout=60)
print(out.read().decode("utf-8", "ignore").strip())
e = err.read().decode("utf-8", "ignore").strip()
if e:
    print("STDERR:", e)

ssh.close()
print("\n=== 完成 ===")
