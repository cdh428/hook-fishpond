"""
从目标机本机测试 Tailscale serve 和 HTTPS 域名。
绕开 SSHadmin 权限限制，用 PowerShell 本机测试。
"""
import io
import base64
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
pwd = io.open(r"C:/Users/dnlct/.ssh/sshadmin.txt", encoding="utf-8").read().strip()
ssh.connect("100.85.92.120", port=22, username="SSHadmin", password=pwd, timeout=15)
print("✅ 已连接目标机\n")

# PowerShell 脚本：测试 127.0.0.1:443 和 Tailscale 域名
ps_script = '''
$ErrorActionPreference = "SilentlyContinue"

Write-Output "=== 1. tailscale serve status (以当前用户) ==="
& "C:\\Program Files\\Tailscale\\tailscale.exe" serve status
Write-Output ""

Write-Output "=== 2. 测试 https://desktop-h9c31c4.tailf74d0b.ts.net/health (本机) ==="
try {
    $r = Invoke-WebRequest -Uri "https://desktop-h9c31c4.tailf74d0b.ts.net/health" -SkipCertificateCheck -TimeoutSec 10
    Write-Output "状态: $($r.StatusCode)"
    Write-Output "内容: $($r.Content)"
} catch {
    Write-Output "失败: $($_.Exception.Message)"
}
Write-Output ""

Write-Output "=== 3. 测试 https://localhost:443/health (localhost 豁免) ==="
try {
    $r = Invoke-WebRequest -Uri "https://localhost:443/health" -SkipCertificateCheck -TimeoutSec 10
    Write-Output "状态: $($r.StatusCode)"
    Write-Output "内容: $($r.Content)"
} catch {
    Write-Output "失败: $($_.Exception.Message)"
}
'''

enc = base64.b64encode(ps_script.encode("utf-16-le")).decode("ascii")
cmd = f"powershell -NoProfile -EncodedCommand {enc}"
_, out, err = ssh.exec_command(cmd, timeout=60)
print(out.read().decode("utf-8", "ignore").strip())
e = err.read().decode("utf-8", "ignore").strip()
if e:
    print("STDERR:", e[:500])

ssh.close()
print("\n=== 完成 ===")
