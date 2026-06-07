@echo off
REM ============================================================
REM  Remote Control de Claude Code para el agente Perucho
REM  Doble clic aqui -> muestra URL + QR para conectarte
REM  desde el telefono (app de Claude o claude.ai/code).
REM  La sesion corre en ESTA PC; el telefono es solo la ventana.
REM ============================================================
cd /d "C:\Proyect\whatsapp-agent"
echo.
echo  Iniciando Remote Control para "Perucho - El Serrucho"...
echo  - Pulsa BARRA ESPACIADORA para mostrar/ocultar el codigo QR.
echo  - Escanea el QR con la camara del telefono.
echo  - O abre la app de Claude  ^>  pestania "Code"  ^>  busca la sesion por nombre.
echo  - Para salir: Ctrl+C.
echo.
claude remote-control --name "Perucho - El Serrucho"
pause
