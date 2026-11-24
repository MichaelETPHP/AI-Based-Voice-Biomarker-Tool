# Polls /api/health every 2 s until the model is loaded, then opens the app in the default browser.
param([int]$Port = 8000, [int]$TimeoutSec = 120)
$url = "http://127.0.0.1:$Port/api/health"
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-RestMethod -Uri $url -TimeoutSec 2
        if ($r.model_loaded) {
            Start-Process "http://localhost:$Port"
            Write-Host ''
            Write-Host "Model ready. Opened http://localhost:$Port - Press Ctrl+C to stop."
            exit 0
        }
        if ($r.status -eq 'error') {
            Write-Host "[ERROR] Model failed to load: $($r.error)"
            exit 1
        }
    } catch { }
}
Write-Host "[ERROR] The model did not become ready within $TimeoutSec seconds - see the log above."
exit 1
