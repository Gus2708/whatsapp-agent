' Lanzador oculto del arranque del Agente de IA "Perucho".
' Ejecuta boot_serrucho.ps1 sin mostrar ninguna ventana (modo 0).
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Proyect\whatsapp-agent\boot_serrucho.ps1""", 0, False
Set sh = Nothing
