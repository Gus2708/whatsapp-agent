# Keeps E:\wsl-dumps from filling the disk.
# - Keeps only the 2 newest crash dumps.
# - If the drive has less than 30 GB free, removes all dumps.
$dir = 'E:\wsl-dumps'
if (-not (Test-Path $dir)) { exit 0 }
$dumps = Get-ChildItem $dir -File -Filter *.dmp | Sort-Object LastWriteTime -Descending
$freeGB = (Get-PSDrive E).Free / 1GB
if ($freeGB -lt 30) { $dumps | Remove-Item -Force -ErrorAction SilentlyContinue }
else { $dumps | Select-Object -Skip 2 | Remove-Item -Force -ErrorAction SilentlyContinue }
