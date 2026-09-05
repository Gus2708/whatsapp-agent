# Backward compatibility wrapper -> forwards to boot.ps1
$target = Join-Path $PSScriptRoot "boot.ps1"
if (Test-Path $target) {
    & $target @args
} else {
    Write-Error "boot.ps1 not found in $PSScriptRoot"
}
