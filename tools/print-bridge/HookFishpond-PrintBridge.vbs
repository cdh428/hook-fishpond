' ============================================================
'  Hook Fishpond - Print Bridge 开机自启（隐藏窗口）
' ============================================================

Option Explicit

Dim shell, fso, bridgeDir, pythonExe, cmd, wmi, procs, p, running
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

bridgeDir = "C:\Users\dnlct\WorkBuddy\hook-fishpond\tools\print-bridge"
pythonExe = "C:\Users\dnlct\AppData\Local\Programs\Python\Python312\python.exe"

If Not fso.FileExists(bridgeDir & "\bridge.py") Then
    WScript.Quit 0
End If

running = False
On Error Resume Next
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set procs = wmi.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name='python.exe'")
If Err.Number = 0 Then
    For Each p In procs
        If Not IsNull(p.CommandLine) Then
            If InStr(LCase(p.CommandLine), "bridge.py") > 0 Then
                running = True
            End If
        End If
    Next
End If
On Error GoTo 0

If running Then
    WScript.Quit 0
End If

cmd = "cmd /c cd /d """ & bridgeDir & """ && """ & pythonExe & """ bridge.py >> bridge.log 2>&1"
shell.CurrentDirectory = bridgeDir
shell.Run cmd, 0, False
