"""远程诊断脚本 —— 只查目标机桥日志和进程状态，不改动任何东西。"""
import io, paramiko, time

TARGET = "100.85.92.120"
USER = "SSHadmin"
PWD = io.open(r"C:/Users/dnlct/.ssh/sshadmin.txt", encoding="utf-8").read().strip()
DIR = r"C:/hookfishpond-bridge"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TARGET, port=22, username=USER, password=PWD, timeout=15)
print("✅ 已连接目标机\n")

# 1. Python 进程
print("=== Python 进程（tasklist）===")
_, o, _ = ssh.exec_command("tasklist | findstr /i python", timeout=10)
print(o.read().decode("utf-8", "ignore").strip() or "(无)")

# 2. 桥日志最后 40 行（用 PowerShell Get-Content -Tail）
print("\n=== bridge.log 最后 40 行 ===")
cmd = f'powershell -Command "if (Test-Path \'{DIR}\\bridge.log\') {{ Get-Content \'{DIR}\\bridge.log\' -Tail 40 }} else {{ Write-Output \'(无 bridge.log)\' }}"'
_, o, _ = ssh.exec_command(cmd, timeout=15)
print(o.read().decode("utf-8", "ignore").strip())

# 3. print.log 最后 20 行
print("\n=== print.log 最后 20 行 ===")
cmd = f'powershell -Command "if (Test-Path \'{DIR}\\print.log\') {{ Get-Content \'{DIR}\\print.log\' -Tail 20 }} else {{ Write-Output \'(无 print.log)\' }}"'
_, o, _ = ssh.exec_command(cmd, timeout=15)
print(o.read().decode("utf-8", "ignore").strip())

# 4. 目录清单
print("\n=== 目录清单 ===")
cmd = f'powershell -Command "Get-ChildItem \'{DIR}\' | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize"'
_, o, _ = ssh.exec_command(cmd, timeout=15)
print(o.read().decode("utf-8", "ignore").strip())

# 5. config.json 内容（检查 widthDots）
print("=== config.json ===")
cmd = f'powershell -Command "if (Test-Path \'{DIR}\\config.json\') {{ Get-Content \'{DIR}\\config.json\' }}"'
_, o, _ = ssh.exec_command(cmd, timeout=15)
print(o.read().decode("utf-8", "ignore").strip() or "(无 config.json)")

ssh.close()
print("\n=== 诊断结束 ===")
