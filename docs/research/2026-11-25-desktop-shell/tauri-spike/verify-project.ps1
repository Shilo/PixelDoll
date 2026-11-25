param(
    [Parameter(Mandatory)] [string] $Executable,
    [Parameter(Mandatory)] [string] $Godot
)

$ErrorActionPreference = 'Stop'
$godotExe = (Resolve-Path -LiteralPath $Godot).Path
$run = & (Join-Path $PSScriptRoot 'measure.ps1') -Shell tauri -Executable $Executable -Case publish -Runs 1 -IdleSeconds 0 |
    ConvertFrom-Json
$evidence = $run.samples[0].events.event | Where-Object name -eq 'studio-publish'
if (!$evidence.result.conflictRefused -or $evidence.result.identicalWritten -ne 0 -or $evidence.result.updated -ne 1) {
    throw "Tauri publication did not pass. Results: $($run.data)"
}
$evidence.result | ConvertTo-Json -Compress
$game = Join-Path $run.data 'game'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'verify-project.gd') -Destination $game
& $godotExe --headless --path $game --editor --import --quiet
if ($LASTEXITCODE) { throw "Godot import failed: $LASTEXITCODE" }
& $godotExe --headless --path $game --script res://verify-project.gd
if ($LASTEXITCODE) { throw "Godot playback failed: $LASTEXITCODE" }
Write-Output "Project retained for inspection: $game"
