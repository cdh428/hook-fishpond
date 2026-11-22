"""查目标机 Tailscale 的 MagicDNS 名称、IP，并尝试在目标机本机测试 serve。"""
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


print("=== 1. tailscale status（找本机 MagicDNS 名 / IP）===")
# status 可能因权限报错，用 ip 也能看出 tailscale 接口
print(run("tailscale status")[:600] or "(无)")

print("\n=== 2. tailscale ip ===")
print(run("tailscale ip") or "(无)")

print("\n=== 3. tailscale whoami / 本机 DNS 名 ===")
print(run("tailscale whoami") or "(无)")

print("\n=== 4. 检查 McIntosh 是否登录（explorer 进程）===")
print(run("tasklist | findstr /i explorer") or "(无 explorer → 未登录桌面)")

print("\n=== 5. 目标机本机测试 serve（127.0.0.1 能否到 443）===")
print(run(r"powershell -NoProfile -Command \"try { (Invoke-WebRequest -Uri https://127.0.0.1/health -SkipCertificateCheck -TimeoutSec 5).Content } catch { $_.Exception.Message }\"")[:300])

ssh.close()
print("\n=== 完成 ===")
