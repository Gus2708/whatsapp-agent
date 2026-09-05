# Backward compatibility wrapper -> forwards to catchup.ps1
$target = Join-Path $PSScriptRoot "catchup.ps1"
if (Test-Path $target) {
    & $target @args
} else {
    Write-Error "catchup.ps1 not found in $PSScriptRoot"
}
