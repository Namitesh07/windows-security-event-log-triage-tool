# Windows PowerShell 5.1+ smoke checks. Event API records are mocked, not real EVTX.
$ErrorActionPreference = 'Stop'
$converter = Join-Path $PSScriptRoot '../tools/Export-TriageEvents.ps1'
$tokens = $null
$parseErrors = $null
[void][Management.Automation.Language.Parser]::ParseFile($converter, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw ($parseErrors | Out-String) }
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('triage-helper-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($testDirectory)
$sourceFile = Join-Path $testDirectory 'events[1].evtx'
$destinationFile = Join-Path $testDirectory 'triage.xml'
[IO.File]::WriteAllBytes($sourceFile, [byte[]]@())
$mockState = @{
    ExpectedSource = [Management.Automation.WildcardPattern]::Escape((Get-Item -LiteralPath $sourceFile).FullName)
    FailConversion = $false
    FailureInjected = $false
    Calls = 0
}
# Capture the test state explicitly: the converter runs in a separate script scope.
$mockGetWinEvent = {
    param([string]$Path, [switch]$Oldest, [int]$MaxEvents)
    if ($Path -ne $mockState.ExpectedSource) { throw ('Unexpected event path. Expected {0}; got {1}.' -f $mockState.ExpectedSource, $Path) }
    if (-not $Oldest -or $MaxEvents -ne 2) { throw ('Unexpected collection order or limit: Oldest={0}, MaxEvents={1}.' -f $Oldest, $MaxEvents) }
    $mockState.Calls++
    $record = [pscustomobject]@{}
    $record | Add-Member -MemberType ScriptMethod -Name ToXml -Value { '<Event><System><EventID>4625</EventID></System></Event>' }
    $record | Add-Member -MemberType ScriptMethod -Name Dispose -Value { }
    $record
    if ($mockState.FailConversion) { $mockState.FailureInjected = $true; throw 'Simulated event API failure.' }
}.GetNewClosure()
Set-Item -Path Function:Get-WinEvent -Value $mockGetWinEvent
function Assert-Fails([scriptblock]$Action, [string]$Message) {
    $failed = $false
    try { & $Action | Out-Null } catch { $failed = $true }
    if (-not $failed) { throw $Message }
}
try {
    & $converter -EvtxPath $sourceFile -OutputPath $destinationFile -MaxEvents 2 | Out-Null
    $xml = [xml][IO.File]::ReadAllText($destinationFile)
    if ($xml.Events.Event.System.EventID -ne '4625') { throw 'Conversion did not produce the expected Events document.' }
    Assert-Fails { & $converter -EvtxPath $sourceFile -OutputPath $destinationFile -MaxEvents 2 } 'Existing output was overwritten without Force.'
    [IO.File]::WriteAllText($destinationFile, 'old output')
    & $converter -EvtxPath $sourceFile -OutputPath $destinationFile -MaxEvents 2 -Force | Out-Null
    if (-not [IO.File]::ReadAllText($destinationFile).Contains('<Events>')) { throw 'Force did not replace existing output.' }
    $previous = [IO.File]::ReadAllText($destinationFile)
    $mockState.FailConversion = $true
    Assert-Fails { & $converter -EvtxPath $sourceFile -OutputPath $destinationFile -MaxEvents 2 -Force } 'Failed conversion unexpectedly succeeded.'
    if (-not $mockState.FailureInjected) { throw 'The failure-cleanup test did not reach its simulated event API failure.' }
    if ([IO.File]::ReadAllText($destinationFile) -ne $previous) { throw 'Failed conversion changed the previous output.' }
    if (@(Get-ChildItem -LiteralPath $testDirectory -Filter '*.partial.*').Count -ne 0) { throw 'Temporary partial output was not cleaned up.' }
    Assert-Fails { & $converter -EvtxPath $sourceFile -OutputPath $destinationFile -MaxEvents 100001 } 'MaxEvents bound was ignored.'
    if ($mockState.Calls -ne 3) { throw 'Unexpected event API call count; overwrite or argument safeguards were not respected.' }
    Write-Output 'Windows helper checks passed: syntax, output, literal path, overwrite, replacement, bounds, and failure cleanup.'
}
finally {
    Remove-Item -LiteralPath $testDirectory -Recurse -Force
}
