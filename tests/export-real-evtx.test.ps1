# Integration check for Windows PowerShell 5.1+. Creates only its own fictional log.
$ErrorActionPreference = 'Stop'
$testId = [Guid]::NewGuid().ToString('N')
$logName = 'FT' + $testId.Substring(0, 20)
$sourceName = 'FieldnotesTest-' + $testId
$directory = Join-Path ([IO.Path]::GetTempPath()) ('triage-real-evtx-' + $testId)
$evtx = Join-Path $directory 'events[1].evtx'
$xmlFile = Join-Path $directory 'converted.xml'
$createdLog = $false
try {
    [void][IO.Directory]::CreateDirectory($directory)
    [Diagnostics.EventLog]::CreateEventSource($sourceName, $logName)
    $createdLog = $true
    foreach ($eventId in @(4625, 4625, 4624)) {
        [Diagnostics.EventLog]::WriteEntry($sourceName, 'Fictional Fieldnotes conversion fixture; no operational log data.', [Diagnostics.EventLogEntryType]::Information, $eventId)
    }
    & wevtutil.exe epl $logName $evtx
    if ($LASTEXITCODE -ne 0 -or -not [IO.File]::Exists($evtx)) { throw 'Could not export the private fixture log as EVTX.' }
    $signature = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($evtx), 0, 4)
    if ($signature -ne 'ElfF') { throw 'The fixture is not a real binary EVTX file.' }
    $originalHash = (Get-FileHash -LiteralPath $evtx -Algorithm SHA256).Hash
    $converter = Join-Path $PSScriptRoot '../tools/Export-TriageEvents.ps1'
    & $converter -EvtxPath $evtx -OutputPath $xmlFile -MaxEvents 2 | Out-Null
    $limited = [xml][IO.File]::ReadAllText($xmlFile)
    $limitedEvents = $limited.SelectNodes("//*[local-name()='Event']")
    if ($limitedEvents.Count -ne 2 -or $limitedEvents[0].SelectSingleNode("./*[local-name()='System']/*[local-name()='EventID']").InnerText -ne '4625' -or $limitedEvents[1].SelectSingleNode("./*[local-name()='System']/*[local-name()='EventID']").InnerText -ne '4625') { throw 'Oldest-first selection or MaxEvents did not preserve the expected records.' }
    & $converter -EvtxPath $evtx -OutputPath $xmlFile -MaxEvents 10 -Force | Out-Null
    if ((Get-FileHash -LiteralPath $evtx -Algorithm SHA256).Hash -ne $originalHash) { throw 'The converter modified its source EVTX.' }
    & node (Join-Path $PSScriptRoot 'verify-evtx.cjs') $xmlFile
    if ($LASTEXITCODE -ne 0) { throw 'Converted EVTX did not pass the browser adapter checks.' }
    Write-Output 'Real EVTX integration passed: private fictional log, binary export, literal filename, oldest-first limit, replacement, source integrity, and XML adapter.'
}
finally {
    if ($createdLog -and [Diagnostics.EventLog]::Exists($logName)) { [Diagnostics.EventLog]::Delete($logName) }
    if ($createdLog -and [Diagnostics.EventLog]::SourceExists($sourceName)) { [Diagnostics.EventLog]::DeleteEventSource($sourceName) }
    if ([IO.Directory]::Exists($directory)) { Remove-Item -LiteralPath $directory -Recurse -Force }
}
