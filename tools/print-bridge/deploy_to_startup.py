"""
把 tailscale-serve-startup.bat 直接放到 McIntosh 的 Startup 文件夹。
Startup 固定路径：C:\\Users\\McIntosh\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup
explorer 在 McIntosh 登录桌面时会自动运行它，那是真正的交互会话，Tailscale daemon 才接受。
"""
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


# Startup 文件夹固定路径（不用 GetFolderPath，因为 SSHadmin 上下文会返回空）
STARTUP_DIR = r"C:\Users\McIntosh\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"

# 1. 确认目录存在
print("=== 1. 检查 Startup 目录 ===")
check = run(f'if exist "{STARTUP_DIR}" (echo EXISTS) else (echo MISSING)')
print(check)

if "MISSING" in check:
    print("⚠️ 目录不存在，创建...")
    run(f'mkdir "{STARTUP_DIR}"')

# 2. 复制 .bat 到 Startup
print("\n=== 2. 复制 .bat 到 Startup ===")
bat_source = r"C:\hookfishpond-bridge\tailscale-serve-startup.bat"
copy_result = run(f'copy /Y "{bat_source}" "{STARTUP_DIR}\\tailscale-serve.bat"')
print(copy_result)

# 3. 验证
print("\n=== 3. 验证文件存在 ===")
verify = run(f'if exist "{STARTUP_DIR}\\tailscale-serve.bat" (echo ✅ OK) else (echo ❌ FAIL)')
print(verify)

# 4. 显示 .bat 内容确认
print("\n=== 4. 确认 .bat 内容 ===")
content = run(f'type "{STARTUP_DIR}\\tailscale-serve.bat"')
print(content)

ssh.close()
print("\n=== 完成 ===")
print("下次 McIntosh 登录 POS80 桌面时，explorer 会自动运行这个 .bat，")
print("在真正的交互会话里配置 Tailscale serve。")
