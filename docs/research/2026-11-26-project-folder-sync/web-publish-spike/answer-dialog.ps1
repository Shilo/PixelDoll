# Answers the browser's genuine native folder dialog and permission prompts through Windows
# UI Automation, so the grant is real rather than intercepted by a test driver.
#   -Folder <path>        fill the folder picker and press Select Folder
#   -Button <name>        then press a browser prompt button whose name matches (regex)
#   -List                 print every button visible in browser windows and exit
param([string] $Folder, [string] $Button, [switch] $List, [int] $TimeoutSeconds = 20,
      [string] $Process = 'msedge')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [Windows.Automation.AutomationElement]
$T = [Windows.Automation.TreeScope]
$root = $A::RootElement
$pids = @(Get-Process $Process -ErrorAction SilentlyContinue | ForEach-Object Id)

function Windows-Of-Browser {
    $root.FindAll($T::Children, [Windows.Automation.Condition]::TrueCondition) |
        Where-Object { $pids -contains $_.Current.ProcessId }
}
function Buttons {
    $cond = New-Object Windows.Automation.PropertyCondition($A::ControlTypeProperty, [Windows.Automation.ControlType]::Button)
    foreach ($w in Windows-Of-Browser) { $w.FindAll($T::Descendants, $cond) }
}
function Invoke-El($el) {
    $el.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
}
function Wait-For([scriptblock] $find, [string] $what) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $found = & $find
        if ($found) { return $found }
        Start-Sleep -Milliseconds 250
        $script:pids = @(Get-Process $Process -ErrorAction SilentlyContinue | ForEach-Object Id)
    }
    throw "Timed out waiting for $what"
}

if ($List) {
    Buttons | ForEach-Object { "{0} | {1}" -f $_.Current.Name, $_.Current.AutomationId }
    Windows-Of-Browser | ForEach-Object { "window: {0} | {1}" -f $_.Current.Name, $_.Current.ClassName }
    exit
}

if ($Folder) {
    $dialog = Wait-For {
        foreach ($w in Windows-Of-Browser) {
            if ($w.Current.ClassName -eq '#32770') { return $w }
            $d = $w.FindFirst($T::Descendants, (New-Object Windows.Automation.PropertyCondition($A::ClassNameProperty, '#32770')))
            if ($d) { return $d }
        }
    } 'folder dialog'
    "dialog: $($dialog.Current.Name)"
    # The Win32 "Folder:" box (id 1152) has no UIA value pattern and the dialog may not be
    # foreground, so set its text and press Select Folder with window messages.
    Add-Type -Namespace W -Name U -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
'@
    $byId = { param($id) $dialog.FindFirst($T::Children, (New-Object Windows.Automation.PropertyCondition($A::AutomationIdProperty, $id))) }
    $edit = Wait-For { & $byId '1152' } 'folder name box'
    [void][W.U]::SendMessage([IntPtr]$edit.Current.NativeWindowHandle, 0x000C, [IntPtr]::Zero, $Folder)  # WM_SETTEXT
    $ok = & $byId '1'
    [void][W.U]::SendMessage([IntPtr]$ok.Current.NativeWindowHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)  # BM_CLICK
    Start-Sleep -Milliseconds 700
    # A typed path can navigate into the folder first; a second click then selects it.
    try {
        if ($ok.Current.NativeWindowHandle) {
            [void][W.U]::SendMessage([IntPtr]$ok.Current.NativeWindowHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)
        }
    } catch { "dialog closed after first click" }
    "selected: $Folder"
}

if ($Button) {
    $hit = Wait-For { Buttons | Where-Object { $_.Current.Name -match $Button } | Select-Object -First 1 } "button /$Button/"
    "pressing: $($hit.Current.Name)"
    Invoke-El $hit
}
