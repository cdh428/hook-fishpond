' ============================================================
'  Hook Fishpond 打印/播报桥 - 隐藏启动器（幂等）
'  已在运行则直接退出，不会抢端口
'  双击本文件 或 由开机脚本调用 都可以
' ============================================================
Dim http, alive
alive = False

On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.open "GET", "http://127.0.0.1:17777/health", False
http.send
If Err.Number = 0 Then
  If http.status = 200 Then alive = True
End If
Err.Clear
On Error GoTo 0

If alive Then
  ' 已在跑：什么都不做，静默退出
  WScript.Quit 0
End If

Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\print-bridge"
sh.Run """C:\Python315\python.exe"" bridge.py --host 0.0.0.0 --printer POS80", 0, False
WScript.Quit 0
