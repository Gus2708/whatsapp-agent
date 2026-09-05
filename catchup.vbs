' Hidden launcher for message catchup script
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & currentDir & "\catchup.ps1""", 0, False
Set sh = Nothing
Set fso = Nothing
