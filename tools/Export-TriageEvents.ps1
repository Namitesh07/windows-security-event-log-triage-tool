# Convert a local EVTX file to the Windows Event XML accepted by this app.
# Reads only the selected file. No uploads or network access.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvtxPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [ValidateRange(1, 100000)][int]$MaxEvents = 10000,
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
$source = Get-Item -LiteralPath $EvtxPath
if ($source.PSIsContainer -or $source.Extension -ine '.evtx') { throw 'EvtxPath must be a local .evtx file.' }
$destination = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
if ([IO.Path]::GetExtension($destination) -ine '.xml') { throw 'OutputPath must end in .xml.' }
if (-not [IO.Directory]::Exists([IO.Path]::GetDirectoryName($destination))) { throw 'The output directory must already exist.' }
if ([IO.File]::Exists($destination) -and -not $Force) { throw 'Output already exists. Choose another path or explicitly use -Force.' }
$temporary = $destination + '.partial.' + [Guid]::NewGuid().ToString('N')
$writer = $null
$stream = $null
$count = 0
try {
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $writer = [IO.StreamWriter]::new($stream, [Text.UTF8Encoding]::new($false))
    $writer.WriteLine('<?xml version="1.0" encoding="utf-8"?>')
    $writer.WriteLine('<Events>')
    $literalPattern = [Management.Automation.WildcardPattern]::Escape($source.FullName)
    Get-WinEvent -Path $literalPattern -Oldest -MaxEvents $MaxEvents | ForEach-Object {
        $record = $_
        try { $writer.WriteLine($record.ToXml()); $count++ }
        finally { $record.Dispose() }
    }
    $writer.WriteLine('</Events>')
    $writer.Dispose()
    $writer = $null
    if ($Force -and [IO.File]::Exists($destination)) { [IO.File]::Copy($temporary, $destination, $true) }
    else { [IO.File]::Move($temporary, $destination) }
    Write-Output ('Exported {0} event(s) to {1}. The browser limit is 25 MB / 100,000 events; use a smaller MaxEvents if needed.' -f $count, $destination)
}
finally {
    if ($null -ne $writer) { $writer.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
    if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
}
