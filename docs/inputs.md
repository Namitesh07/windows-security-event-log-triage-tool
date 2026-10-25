# Supported inputs and local EVTX conversion

The browser accepts **.csv, .xml, .json, .jsonl, and .ndjson**. The extension selects the adapter; formats are not guessed. Each adapter feeds the same normalization, detection, evidence, and export workflow. Files and event content are never uploaded.

## Limits and encoding

| Limit | Value |
| --- | --- |
| Hosted HTTP(S) mode with workers | 25 MB combined; up to 20 files |
| Direct-file / no-worker fallback | 2 MB combined; up to 20 files |
| Source records, including skipped IDs and duplicates | 100,000 combined |
| Distinct normalized fields in XML/JSON adapters | 512 across the file |
| XML/JSON nesting | 48 levels |
| Optional rule-profile file | 64 KB |

Use UTF-8, with or without a BOM, or UTF-16LE/BE with a BOM. Legacy ANSI encodings are not inferred. The helper below writes UTF-8. Files are processed in memory, not as an unbounded stream; reduce the collection window if an export is too large. A failed/cancelled load preserves the current case.

ISO timestamps support up to seven fractional digits. Calculations truncate fractions to milliseconds; original timestamp text remains visible. Offset timestamps and timezone-free local wall times are separate correlation bases. Missing, ambiguous, or date-only times remain evidence but cannot establish timed sequences.

## CSV

A header row must contain a recognised Event ID name, such as Event ID, EventID, or event_id. Common timestamp, computer, message, and structured EventData field names are recognised. Structured target/actor/process fields take precedence over English message extraction.

Quoted commas, doubled quotes, and multiline fields are supported. Invalid quoting or inconsistent row width produces a row-specific error. Original header order, duplicate header names, and values remain available in the inspector and JSON report. See the [five built-in demos](../samples/README.md).

## Windows Event XML

Supported shape:

~~~xml
<Events>
  <Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
    <System>
      <Provider Name="Microsoft-Windows-Security-Auditing"/>
      <EventID>4625</EventID>
      <TimeCreated SystemTime="2026-10-22T10:00:00.1234567Z"/>
      <Computer>LAB-WS01</Computer>
    </System>
    <EventData>
      <Data Name="TargetUserName">avery</Data>
      <Data Name="TargetDomainName">LAB</Data>
      <Data Name="IpAddress">192.0.2.40</Data>
    </EventData>
  </Event>
</Events>
~~~

A single Event root is also accepted. Events may use the standard Windows event namespace (including a declared prefix) or no namespace. System/EventID is required. System metadata, named EventData/Data values, UserData leaf values, and RenderingInfo/Message are extracted. Unknown structure is retained in the original record but is not automatically interpreted. Unnamed Data entries receive UnnamedData1, UnnamedData2, and so on.

This is a bounded parser for the documented Windows shape, not a general XML/XSD validator. Duplicate or reserved data names, ambiguous System elements, unsupported declarations, mismatched tags, and undeclared element prefixes are rejected. Standard/numeric XML character references and CDATA are supported. DTDs, custom entities, external entity resolution, includes, and processing instructions other than an initial XML declaration are unsupported; no resource is fetched.

Each event retains its original XML substring, 1-based record number, and starting source line. Extracted XML text uses normalized line endings; the original substring retains the source representation.

## JSON

Use one object, an array of event objects, or an object containing an **events** array. Each event can contain familiar CSV-style names or selected Get-WinEvent properties:

~~~json
{
  "Id": 4625,
  "TimeCreated": "2026-10-22T10:00:00Z",
  "MachineName": "LAB-WS01",
  "ProviderName": "Microsoft-Windows-Security-Auditing",
  "Message": "A fictional failed logon.",
  "EventData": {
    "TargetUserName": "avery",
    "TargetDomainName": "LAB",
    "IpAddress": "192.0.2.40"
  },
  "RecordId": "9007199254740993"
}
~~~

Recognised metadata aliases include Event ID/EventId/Id, Date and Time/TimeCreated/Timestamp/SystemTime/Date, Computer/MachineName/ComputerName/HostName, Source/ProviderName/Provider, and Message/Description. EventData and UserData objects flatten into named fields. Top-level structured fields are accepted too. Other values remain as strings or serialized JSON for review; arbitrary nested vendor schemas are not inferred. A PowerShell Properties array has no field-name mapping by itself: export named EventData fields or use XML instead.

Use ISO timestamp strings where possible. Microsoft /Date(epochMilliseconds±offset)/ values are converted to a UTC ISO timestamp for analysis; the original JSON value is retained. Numeric Event IDs are supported. Large integer identifiers must be strings: unsafe integer numbers, non-finite numeric results, duplicate JSON keys (including escaped equivalents), conflicting metadata aliases, and normalized field-name collisions are rejected instead of silently changing evidence.

Original JSON record contains a serialized copy of the parsed object. Property strings are preserved, but whitespace, escape spelling, and number formatting are not a byte-for-byte copy of the file. JSON records have 1-based record numbers; source line is null because object positions are not tracked. To reopen saved cases or full triage reports, use the separate [Reopen a saved case](cases.md) control.

## JSON Lines / NDJSON

Each nonblank line must contain one event object. Do not wrap the file in an array. Both extensions use the same parser:

~~~json
{"Id":4625,"TimeCreated":"2026-10-22T10:00:00Z","MachineName":"LAB-WS01","TargetUserName":"avery","IpAddress":"192.0.2.40"}
{"Id":4624,"TimeCreated":"2026-10-22T10:01:00Z","MachineName":"LAB-WS01","TargetUserName":"avery","IpAddress":"192.0.2.40"}
~~~

Blank lines are ignored without changing later source line numbers. Malformed input identifies the physical line. Record numbers count nonblank records. Each record retains a serialized original object as with JSON.

## Convert EVTX locally on Windows

Raw .evtx files are binary and cannot be imported directly. Renaming one to a text extension does not convert it; the reader also rejects the EVTX file signature.

Run the bundled [Export-TriageEvents.ps1](../tools/Export-TriageEvents.ps1) in Windows PowerShell 5.1 or later, from your extracted project folder:

~~~powershell
.\tools\Export-TriageEvents.ps1 -EvtxPath 'C:\Logs\Security.evtx' -OutputPath 'C:\Logs\triage.xml' -MaxEvents 10000
~~~

Choose an existing output directory and a new .xml filename. The helper reads the selected local EVTX file using Get-WinEvent, writes the oldest records first, and wraps each record's ToXml() output in Events. MaxEvents defaults to 10,000 and is bounded at 100,000; a count limit can truncate the collection, so record that choice in case notes. Reduce it further if the resulting XML exceeds the browser's file-size limit.

Existing output is refused unless you explicitly supply -Force. The helper writes a temporary partial file and promotes it after successful conversion, cleaning up its own temporary output on failure. It does not collect live channels, upload data, or change Windows auditing settings. Follow your machine's existing PowerShell execution policy.

Open the resulting XML with the browser file chooser. Conversion needs access to the selected file and Windows event-log APIs. Automated Windows checks include both mocked records and a genuine EVTX fixture exported from a private fictional log; see [testing](testing.md). Validate against representative authorised collections for your own environment.

## Source references

The evidence table and exports distinguish CSV rows, XML start lines, JSON record numbers, and JSON Lines physical lines. UIDs identify records only within the loaded dataset. They are not Windows EventRecordIDs, hashes, or proof of record authenticity. See [reports](reports.md) for the appended provenance columns.

Microsoft references: [Windows Event schema](https://learn.microsoft.com/en-us/windows/win32/wes/eventschema-schema), [EventType](https://learn.microsoft.com/en-us/windows/win32/wes/eventschema-eventtype-complextype), and [Get-WinEvent](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-winevent).

## Multiple-file collections (v1.6.0)

Select or drop up to 20 supported event exports in one operation, in any mixture of supported formats. The limits are 25 MB combined in worker mode, 2 MB combined in fallback mode, and 100,000 source records including skipped Event IDs and duplicates. Decoded text is also bounded to 25 MB combined. Each file must contain at least one accepted event. A bad file rejects the whole selection and names the file; the previous case remains available. A new selection starts a replacement case rather than appending silently.

Each file retains its own field layout, original record/line numbers, and diagnostics. Records get globally unique case-local UIDs and a source-file ID. Duplicate checking uses Windows record identity plus source-field equality across files; original records are never discarded. See [collections](collections.md).
