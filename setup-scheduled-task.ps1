# Run this script once (as Administrator) to register the every-30-minute import task.
# Usage: Right-click PowerShell -> "Run as administrator", then run this script.

$taskName   = "DailyFlash-HotelEmailImport"
$scriptDir  = "D:\a\DailyFlash\backend"
$scriptPath = "D:\a\DailyFlash\backend\src\fetchEmailReport.js"
$logDir     = "D:\a\DailyFlash\logs"
$logFile    = "$logDir\hotel-import.log"
$nodeExe    = (Get-Command node -ErrorAction Stop).Source

# Ensure log directory exists
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Build the action: node fetchEmailReport.js >> log
$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$nodeExe`" `"$scriptPath`" >> `"$logFile`" 2>&1" `
    -WorkingDirectory $scriptDir

# Trigger: every 30 minutes, starting now, running indefinitely
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 30)

# Settings: 20 min timeout (prevents overlap if a run stalls), skip if already running
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
    -MultipleInstances IgnoreNew

# Register (or overwrite) the task under the current user
Register-ScheduledTask `
    -TaskName    $taskName `
    -Action      $action `
    -Trigger     $trigger `
    -Settings    $settings `
    -Description "Fetch CP DailyFlash email and sheet data every 30 minutes" `
    -RunLevel    Highest `
    -Force | Out-Null

Write-Host ""
Write-Host "Task '$taskName' registered successfully." -ForegroundColor Green
Write-Host "  Runs: every 30 minutes"
Write-Host "  Log:  $logFile"
Write-Host ""
Write-Host "To run it right now for testing:"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "To remove the task later:"
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
