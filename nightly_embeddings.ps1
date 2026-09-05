# ============================================================================
#  EJECUCION NOCTURNA DE EMBEDDINGS - WHATSAPP SALES AGENT
# ----------------------------------------------------------------------------
#  Ejecuta 'node rag.js embeddings' en segundo plano de manera desatendida,
#  asegurando que todo producto nuevo o modificado en el catalogo cuente con
#  su vector en pgvector (Supabase).
# ============================================================================

$ProjectDir = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$LogFile    = Join-Path $ProjectDir "nightly_embeddings.log"

function Write-NightlyLog($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

# Rotacion de log si supera 5 MB
try {
    if (Test-Path $LogFile) {
        $fileSize = (Get-Item $LogFile).Length
        if ($fileSize -gt 5MB) {
            $backupLog = Join-Path $ProjectDir "nightly_embeddings.old.log"
            Move-Item -Path $LogFile -Destination $backupLog -Force
        }
    }
} catch {}

Write-NightlyLog "=== Inicio de embeddings nocturno ==="

try {
    Set-Location $ProjectDir

    # Encontrar ejecutable de Node
    $nodeCmd = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $nodeCmd) { $nodeCmd = "node" }

    Write-NightlyLog "Ejecutando: $nodeCmd rag.js embeddings ..."

    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $nodeCmd
    $processInfo.Arguments = "rag.js embeddings"
    $processInfo.WorkingDirectory = $ProjectDir
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo
    $process.Start() | Out-Null

    $stdOut = $process.StandardOutput.ReadToEnd()
    $stdErr = $process.StandardError.ReadToEnd()
    $process.WaitForExit(900000)

    $exitCode = $process.ExitCode

    if ($stdOut) {
        $cleanOut = $stdOut -replace '\x1b\[[0-9;]*m', ''
        $lines = $cleanOut -split "`r?`n"
        foreach ($l in $lines) {
            $trimmed = $l.Trim()
            if ($trimmed) { Write-NightlyLog "  [OUT] $trimmed" }
        }
    }

    if ($stdErr) {
        $cleanErr = $stdErr -replace '\x1b\[[0-9;]*m', ''
        $linesErr = $cleanErr -split "`r?`n"
        foreach ($l in $linesErr) {
            $trimmedErr = $l.Trim()
            if ($trimmedErr) { Write-NightlyLog "  [ERR] $trimmedErr" }
        }
    }

    if ($exitCode -eq 0) {
        Write-NightlyLog "Embeddings nocturno completado con EXITO (ExitCode 0)."
    } else {
        Write-NightlyLog "Embeddings nocturno finalizo con CODIGO DE ADVERTENCIA/ERROR: $exitCode."
    }
} catch {
    Write-NightlyLog "ERROR CRITICO ejecutando embeddings nocturno: $($_.Exception.Message)"
}

Write-NightlyLog "=== Fin de embeddings nocturno ==="
