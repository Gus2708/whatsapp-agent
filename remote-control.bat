@echo off
REM ============================================================
REM  Remote Control de Claude Code para WhatsApp Sales Agent
REM  Doble clic aqui -> muestra URL + QR para conectarte
REM  desde el telefono (app de Claude o claude.ai/code).
REM  La sesion corre en ESTA PC; el telefono es solo la ventana.
REM ============================================================
cd /d "%~dp0"
echo.
echo  Iniciando Remote Control para "WhatsApp Sales Agent"...
echo  - Pulsa BARRA ESPACIADORA para mostrar/ocultar el codigo QR.
echo  - Escanea el QR con la camara del telefono.
echo  - O abre la app de Claude  ^>  pestania "Code"  ^>  busca la sesion por nombre.
echo  - Para salir: Ctrl+C.
echo.
claude remote-control --name "WhatsApp Sales Agent"
pause
