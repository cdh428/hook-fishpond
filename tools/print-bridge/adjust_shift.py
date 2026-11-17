"""
微调 GDI 左偏移：把目标机 config.json 的 gdiLeftShiftMm 改成指定值，重启桥，再测试打印。

用法：
  python adjust_shift.py <新偏移mm>
例如：
  python adjust_shift.py 10
"""
import io, json, time, sys, paramiko, urllib.request

TARGET = "100.85.92.120"
USER = "SSHadmin"
PWD = io.open(r"C:/Users/dnlct/.ssh/sshadmin.txt", encoding="utf-8").read().strip()
REMOTE_DIR = "C:/hookfishpond-bridge"
PYTHON = r"C:\Python315\python.exe"

# 目标偏移（mm，正数=往左移）
NEW_SHIFT = int(sys.argv[1]) if len(sys.argv) >= 2 else 10

print(f"[1/4] 连接 {USER}@{TARGET}...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TARGET, port=22, username=USER, password=PWD, timeout=15)
print("  ✅ 连接成功")

print(f"\n[2/4] 更新 config.json：gdiLeftShiftMm -> {NEW_SHIFT}mm...")
sftp = ssh.open_sftp()
with sftp.open(f"{REMOTE_DIR}\\config.json", "r") as f:
    cfg = json.loads(f.read().decode("utf-8"))
old = cfg.get("gdiLeftShiftMm", 0)
cfg["gdiLeftShiftMm"] = NEW_SHIFT
with sftp.open(f"{REMOTE_DIR}\\config.json", "w") as f:
    f.write(json.dumps(cfg, ensure_ascii=False, indent=2))
print(f"  ✅ gdiLeftShiftMm: {old} -> {NEW_SHIFT} mm")
sftp.close()

print(f"\n[3/4] 重启桥...")
ssh.exec_command("taskkill /f /im python.exe")
time.sleep(2)
start_cmd = f"{PYTHON} {REMOTE_DIR}\\_deploy_bootstrap.py"
stdin, stdout, stderr = ssh.exec_command(start_cmd, timeout=10)
pid_out = stdout.read().decode("utf-8", "ignore").strip()
if pid_out:
    print(f"  ✅ 新桥启动：{pid_out}")
ssh.close()

print(f"\n[4/4] 等 12 秒让桥完全加载...")
time.sleep(12)

# 验证 health
print(f"\n=== 验证桥 ===")
for i in range(1, 4):
    try:
        with urllib.request.urlopen(f"http://{TARGET}:17777/health", timeout=12) as r:
            d = json.loads(r.read())
            print(f"  ✅ 桥在线：widthDots={d.get('widthDots')} targets={len(d.get('targets',[]))}")
            break
    except Exception as e:
        print(f"  第 {i} 次探测超时，再等 5 秒...")
        time.sleep(5)
else:
    print(f"  ❌ 桥未上线，请 RDP 查看目标机 bridge.log")
    sys.exit(1)

# 发测试单
print(f"\n=== 发测试单验证往左偏移 {NEW_SHIFT}mm ===")
import subprocess, os
LOCAL = r"C:/Users/dnlct/WorkBuddy/hook-fishpond/tools/print-bridge/test_print_80.py"
r = subprocess.run([sys.executable, LOCAL], capture_output=True, text=True, timeout=130)
print(f"  {r.stdout.strip()}")
if r.returncode != 0:
    print(f"  ⚠️ 测试失败：{r.stderr.strip()}")
