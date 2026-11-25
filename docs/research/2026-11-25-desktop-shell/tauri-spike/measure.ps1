param(
    [Parameter(Mandatory)] [ValidateSet('tauri', 'wails', 'electron')] [string] $Shell,
    [Parameter(Mandatory)] [string] $Executable,
    [ValidateRange(1, 100)] [int] $Runs = 3,
    [ValidateRange(0, 3600)] [int] $IdleSeconds = 60,
    [ValidateSet('startup', 'transfer', 'chunked', 'online', 'download', 'backup')] [string] $Case = 'startup',
    [string] $ScratchParent = [IO.Path]::GetTempPath(),
    [switch] $SeparateProfile
)

$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath $Executable).Path
$session = (Get-Process -Id $PID).SessionId
$root = Join-Path (Resolve-Path -LiteralPath $ScratchParent).Path ('pixeldoll-' + $Shell + '-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $root | Out-Null
$env:PIXELDOLL_SPIKE_ROOT = $root
$env:PIXELDOLL_SPIKE_CASE = $Case
$env:PIXELDOLL_SPIKE_PROFILE = if ($SeparateProfile -and $Shell -eq 'tauri') {
    Join-Path ([IO.Path]::GetTempPath()) ('pixeldoll-profile-' + [guid]::NewGuid())
} else { $null }
$eventFile = Join-Path $root 'events.jsonl'
$samples = [System.Collections.Generic.List[object]]::new()

function Read-Events {
    if (Test-Path -LiteralPath $eventFile) {
        $stream = [IO.File]::Open($eventFile, 'Open', 'Read', 'ReadWrite')
        $reader = [IO.StreamReader]::new($stream)
        try {
            $lines = $reader.ReadToEnd() -split "`n"
        } finally {
            $reader.Dispose()
        }
        $lines | Select-Object -SkipLast 1 | ForEach-Object { $_ | ConvertFrom-Json }
    }
}

function Read-TreeMemory ([int] $ProcessId) {
    $tree = [System.Collections.Generic.HashSet[int]]::new()
    $null = $tree.Add($ProcessId)
    $processes = Get-CimInstance Win32_Process -Filter "SessionId=$session" -Property ProcessId,ParentProcessId
    do {
        $changed = $false
        foreach ($entry in $processes) {
            if ($tree.Contains($entry.ParentProcessId) -and $tree.Add($entry.ProcessId)) {
                $changed = $true
            }
        }
    } while ($changed)
    $live = Get-Process -Id ([int[]] $tree) -ErrorAction SilentlyContinue
    [pscustomobject]@{
        processCount = $live.Count
        privateMiB = [math]::Round(($live | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB, 1)
        workingSetMiB = [math]::Round(($live | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1)
    }
}

for ($i = 0; $i -lt $Runs; $i++) {
    if (Test-Path -LiteralPath $eventFile) {
        Move-Item -LiteralPath $eventFile -Destination (Join-Path $root "run-$i.jsonl")
    }
    $launch = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $process = if ($Shell -eq 'electron') {
        $entrypoint = Join-Path $PSScriptRoot 'electron-baseline.mjs'
        Start-Process -FilePath $exe -ArgumentList ('"' + $entrypoint + '"') -Environment @{ ELECTRON_RUN_AS_NODE = $null } -PassThru
    } else {
        Start-Process -FilePath $exe -PassThru
    }
    try {
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        do {
            if ($process.HasExited) { throw "Shell exited before startup completed: $($process.ExitCode)" }
            if ([DateTime]::UtcNow -gt $deadline) { throw "Shell startup timed out. Results: $root" }
            $events = @(Read-Events)
            $fatal = $events | Where-Object { $_.event.name -eq 'fatal' } | Select-Object -First 1
            if ($fatal) { throw "Studio probe failed: $($fatal.event.error). Results: $root" }
            $started = $events | Where-Object { $_.event.name -eq 'studio-ready' } | Select-Object -First 1
            if (!$started) { Start-Sleep -Milliseconds 50 }
        } until ($started)
        $peak = $null
        if ($i -eq $Runs - 1 -and $Shell -eq 'tauri' -and $Case -ne 'startup') {
            do {
                if ($process.HasExited -or [DateTime]::UtcNow -gt $deadline) {
                    throw "The transfer probe did not finish. Results: $root"
                }
                $memory = Read-TreeMemory $process.Id
                if (!$peak -or $memory.privateMiB -gt $peak.privateMiB) { $peak = $memory }
                $events = @(Read-Events)
                if (!($events | Where-Object { $_.event.name -eq 'finished' })) {
                    Start-Sleep -Milliseconds 40
                }
            } until ($events | Where-Object { $_.event.name -eq 'finished' })
        } elseif ($Shell -eq 'tauri') {
            do {
                if ($process.HasExited -or [DateTime]::UtcNow -gt $deadline) {
                    throw "The transfer probe did not finish. Results: $root"
                }
                Start-Sleep -Milliseconds 100
                $events = @(Read-Events)
            } until ($events | Where-Object { $_.event.name -eq 'finished' })
        }
        $idle = $null
        if ($i -eq $Runs - 1) {
            Start-Sleep -Seconds $IdleSeconds
            $idle = Read-TreeMemory $process.Id
        }
        $samples.Add([pscustomobject]@{
            launchToPaintMs = $started.event.epochMs - $launch
            pageToPaintMs = [math]::Round($started.event.pageMs, 1)
            nativeToPaintMs = $started.nativeMs
            events = @(Read-Events)
            sampledTransferPeak = $peak
            idle = $idle
        })
        $failures = @($samples[$i].events | Where-Object { $_.event.PSObject.Properties['error'] })
        if ($failures.Count) {
            $details = ($failures | ForEach-Object { "$($_.event.name): $($_.event.error)" }) -join ', '
            throw "Studio probe failed: $details. Results: $root"
        }
    } finally {
        if (!$process.HasExited) {
            $process.Refresh()
            if (!$process.CloseMainWindow() -or !$process.WaitForExit(5000)) {
                $process.Kill()
                $process.WaitForExit()
            }
        }
    }
}

$result = [pscustomobject]@{
    shell = $Shell
    case = $Case
    data = $root
    executableSha256 = (Get-FileHash -LiteralPath $exe).Hash
    samples = $samples
}
$result | ConvertTo-Json -Depth 12
