"""
部署 GDI 左偏移（往左移 5mm）并测试打印。

流程：
1. 上传新 bridge.py（支持 gdiLeftShiftMm）
2. 更新目标机 config.json 加 "gdiLeftShiftMm": 5
3. taskkill 旧进程 → 重启桥
4. 等 8 秒 → 验证 /health
5. 发 80mm 测试单验证左边距
"""
import io, os, json, time, paramiko, urllib.request

TARGET = "100.85.92.120"
USER = "SSHadmin"
PWD = io.open(r"C:/Users/dnlct/.ssh/sshadmin.txt", encoding="utf-8").read().strip()
REMOTE_DIR = "C:/hookfishpond-bridge"
PYTHON = r"C:\Python315\python.exe"

# 本地文件
LOCAL_DIR = r"C:/Users/dnlct/WorkBuddy/hook-fishpond/tools/print-bridge"
LOCAL_BRIDGE = os.path.join(LOCAL_DIR, "bridge.py")
LOCAL_CONFIG = os.path.join(LOCAL_DIR, "_deploy_config.json")

# GDI 左偏移（mm，正数=往左移）
SHIFT_MM = 5

# 1. 连接
print(f"[1/5] 连接 {USER}@{TARGET}...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(TARGET, port=22, username=USER, password=PWD, timeout=15)
print("  ✅ 连接成功")

# 2. 上传新 bridge.py
print(f"\n[2/5] 上传 bridge.py...")
sftp = ssh.open_sftp()
sftp.put(LOCAL_BRIDGE, f"{REMOTE_DIR}\\bridge.py")
print(f"  ✅ bridge.py 已上传（{os.path.getsize(LOCAL_BRIDGE)//1024} KB）")

# 3. 更新 config.json 加 gdiLeftShiftMm
print(f"\n[3/5] 更新 config.json 加 gdiLeftShiftMm={SHIFT_MM}...")
# 读目标机当前 config.json
with sftp.open(f"{REMOTE_DIR}\\config.json", "r") as f:
    cfg = json.loads(f.read().decode("utf-8"))
cfg["gdiLeftShiftMm"] = SHIFT_MM
# 写回
with sftp.open(f"{REMOTE_DIR}\\config.json", "w") as f:
    f.write(json.dumps(cfg, ensure_ascii=False, indent=2))
print(f"  ✅ gdiLeftShiftMm 已设为 {SHIFT_MM}（widthDots={cfg.get('widthDots')}）")
sftp.close()

# 4. 重启桥
print(f"\n[4/5] 重启桥进程...")
ssh.exec_command("taskkill /f /im python.exe")
time.sleep(2)

# 启动 bootstrap（脱离父进程）
start_cmd = f"{PYTHON} {REMOTE_DIR}\\_deploy_bootstrap.py"
stdin, stdout, stderr = ssh.exec_command(start_cmd, timeout=10)
pid_out = stdout.read().decode("utf-8", "ignore").strip()
err = stderr.read().decode("utf-8", "ignore").strip()
if pid_out:
    print(f"  ✅ 新桥 pid: {pid_out}")
if err:
    print(f"  ⚠️ {err}")
ssh.close()

# 5. 等待 + 测试打印
print(f"\n[5/5] 等待 10 秒让桥完全加载...")
time.sleep(10)

# 验证 health
print(f"\n=== 验证桥状态 ===")
try:
    with urllib.request.urlopen(f"http://{TARGET}:17777/health", timeout=10) as r:
        data = json.loads(r.read())
        print(f"  ✅ 桥在线：widthDots={data.get('widthDots')}，targets={len(data.get('targets',[]))}")
except Exception as e:
    print(f"  ❌ 桥不在线：{e}")
    print(f"  建议：手动 RDP 到目标机查看 C:/hookfishpond-bridge/bridge.log 最后 30 行")
    exit(1)

# 发测试单
print(f"\n=== 发送 80mm 测试单（验证左边距偏移 5mm）===")
import subprocess, sys
result = subprocess.run(
    [sys.executable, os.path.join(LOCAL_DIR, "test_print_80.py")],
    capture_output=True,
    text=True,
    timeout=130,
)
print(f"  {result.stdout.strip()}")
if result.returncode != 0:
    print(f"  ⚠️ 测试打印失败：{result.stderr.strip()}")
