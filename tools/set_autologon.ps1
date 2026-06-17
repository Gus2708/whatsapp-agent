# Activa el inicio de sesion automatico de OFICINA (cuenta SIN contrasena).
# Cuenta sin password => no se guarda ningun secreto: DefaultPassword queda vacio.
# Se ejecuta ELEVADO (admin) porque escribe en HKLM.
$ErrorActionPreference = "Stop"
$k = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
try {
    Set-ItemProperty -Path $k -Name AutoAdminLogon   -Value "1"               -Type String
    Set-ItemProperty -Path $k -Name DefaultUserName   -Value "OFICINA"         -Type String
    Set-ItemProperty -Path $k -Name DefaultDomainName -Value "DESKTOP-U9B6562" -Type String
    Set-ItemProperty -Path $k -Name DefaultPassword   -Value ""               -Type String
    # Asegurar que NO quede como auto-login de una sola vez
    Remove-ItemProperty -Path $k -Name AutoLogonCount -ErrorAction SilentlyContinue

    $v = Get-ItemProperty $k
    $out = "OK|{0}|{1}|{2}" -f $v.AutoAdminLogon, $v.DefaultUserName, $v.DefaultDomainName
} catch {
    $out = "ERROR|$($_.Exception.Message)"
}
$out | Out-File "C:\Proyect\whatsapp-agent\tools\autologon_result.txt" -Encoding utf8
