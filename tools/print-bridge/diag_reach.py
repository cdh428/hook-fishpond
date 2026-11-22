"""远程诊断：读目标机桥日志末尾，判断用户浏览器的打印请求是否到达桥。"""
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


def tail(path: str, n: int) -> str:
    cmd = f"powershell -NoProfile -Command Get-Content -Path {path} -Tail {n}"
    return run(cmd)


print("=== bridge.log 最后 25 行（看最近的 /print 到达情况）===")
print(tail("C:/hookfishpond-bridge/bridge.log", 25) or "(空)")

print("\n=== print.log 最后 12 行 ===")
print(tail("C:/hookfishpond-bridge/print.log", 12) or "(空)")

ssh.close()
print("\n=== 诊断结束 ===")
