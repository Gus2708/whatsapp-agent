' Lanzador oculto del watchdog de WAHA (Agente "Perucho" - El Serrucho).
' Ejecuta waha_watchdog.ps1 SIN crear ninguna ventana (modo 0).
'
' Por que existe: el Programador de tareas, al ejecutar powershell.exe
' directamente, crea la ventana de consola y solo despues la oculta, lo que
' produce un parpadeo visible cada vez que corre la tarea (cada 3 min). Pasar
' por WScript.Shell.Run con modo 0 evita por completo ese parpadeo.
'
' La tarea programada "WAHA Watchdog Serrucho" invoca este .vbs con wscript.exe.
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Proyect\whatsapp-agent\waha_watchdog.ps1""", 0, False
Set sh = Nothing
