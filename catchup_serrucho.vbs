' Lanzador oculto de la recuperacion de mensajes pendientes (Agente "Perucho").
' Ejecuta catchup_serrucho.ps1 SIN crear ninguna ventana (modo 0).
'
' Lo invoca boot_serrucho.ps1 (que ya corre oculto). Antes el catchup se lanzaba
' con Start-Process powershell.exe -WindowStyle Hidden, lo que igual parpadeaba
' una ventana al arrancar; pasar por WScript.Shell.Run con modo 0 lo evita.
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Proyect\whatsapp-agent\catchup_serrucho.ps1""", 0, False
Set sh = Nothing
