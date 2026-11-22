"""远程诊断：查看 POS80 目标机桥日志最近活动与报错（只读，不改动）。"""
import io
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
pwd = io.open(r"C:/Users/dnlct/.ssh/sshadmin.txt", encoding="utf-8").read().strip()
ssh.connect("100.85.92.120", port=22, username="SSHadmin", password=pwd, timeout=15)
print("✅ 已连接目标机\n")


def run(cmd: str) -> str:
    _, out, _ = ssh.exec_command(cmd, timeout=20)
    return out.read().decode("utf-8", "ignore").strip()


def tail_remote(path: str, n: int = 40) -> str:
    """用 PowerShell -Tail 取远程文件尾部；命令不含嵌套引号，避免转义破坏。"""
    cmd = f"powershell -NoProfile -Command Get-Content -Path {path} -Tail {n}"
    return run(cmd)


print("=== Python 进程 ===")
print(run("tasklist | findstr /i python") or "(无)")

print("\n=== print.log 最后 30 行 ===")
print(tail_remote("C:/hookfishpond-bridge/print.log", 30) or "(空)")

print("\n=== bridge.log 最后 40 行 ===")
print(tail_remote("C:/hookfishpond-bridge/bridge.log", 40) or "(空)")

print("\n=== config.json（widthDots / gdiLeftShiftMm / authToken 是否配置）===")
cfg = tail_remote("C:/hookfishpond-bridge/config.json", 60)
# 脱敏：不打印 authToken 明文
for line in cfg.splitlines():
    if "authToken" in line and ":" in line:
        line = line.split(":")[0] + ': "****"'
    print(line)

ssh.close()
print("\n=== 诊断结束 ===")
