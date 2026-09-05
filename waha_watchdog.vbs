' Hidden launcher for WAHA Watchdog script
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & currentDir & "\waha_watchdog.ps1""", 0, False
Set sh = Nothing
Set fso = Nothing
