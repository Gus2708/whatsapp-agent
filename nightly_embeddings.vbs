' Lanzador oculto de generacion de embeddings nocturno (Agente "Perucho" - El Serrucho).
' Ejecuta nightly_embeddings.ps1 SIN crear ninguna ventana (modo 0).
'
' Por que existe: el Programador de tareas, al ejecutar powershell.exe
' directamente, crea la ventana de consola y solo despues la oculta, lo que
' produce un destello visible. Pasar por WScript.Shell.Run con modo 0 evita
' por completo ese parpadeo.
'
' La tarea programada "Serrucho Embeddings Nocturno" invoca este .vbs con wscript.exe.
Set sh = CreateObject("WScript.Shell")
sh.Run "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Proyect\whatsapp-agent\nightly_embeddings.ps1""", 0, True
Set sh = Nothing
