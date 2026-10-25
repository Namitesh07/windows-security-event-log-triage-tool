# Investigate several event exports together

Select multiple files in the event chooser or drop them together. CSV, Windows Event XML, JSON, and JSON Lines can be combined in one collection. Then select **Analyse events**. A new selection replaces the current case; it does not append to it.

## Limits and failed imports

- Up to **20 files**, **25 MB combined**, and **100,000 source records** including skipped IDs and duplicates.
- Decoded text is also limited to 25 MB combined. Direct-file/no-worker fallback uses **2 MB combined**.
- Each file must have at least one accepted event and match a supported input shape.
- A malformed, unsupported, or over-limit file rejects the entire batch and identifies the file. The previously loaded evidence and notes remain available.
- Cancel operation stops the current load. Old pending operations cannot replace a newer case.
- Raw EVTX needs [local XML conversion](../tools/Export-TriageEvents.ps1) first.

## Follow evidence back to its source

The **Source files and duplicate handling** panel lists filenames, source IDs, formats, accepted counts, duplicates, and skipped Event IDs. Records keep their original file-local record/line numbers. Global event UIDs identify them uniquely within the case, even when two files have the same filename or line number.

Use **Source file** and **Duplicate records** filters to inspect an individual export or overlap. Inspect a row to see its filename, source ID, Windows record number/channel, duplicate reference, and original fields. The activity timeline and finding evidence retain file references too. Snapshot and Event ID metric counts use records included in analysis; Total records includes every accepted original.

## Conservative duplicate handling

The app marks a record as a confirmed overlap only when it appears in a different source file and all these match:

1. Reporting host, channel, provider, Windows EventRecordID, Event ID, and usable timestamp with a time of day.
2. Original source header/value pairs, compared without column order or empty padding fields. Values are otherwise compared exactly. Preserved Original Event XML / Original JSON record fields also participate, so differently formatted exports may remain separate.

An overlapping occurrence refers to the first retained event through **duplicateOf**. The duplicate remains visible and exportable but is excluded from rules, correlations, coverage counts, snapshots, and unique Event ID metrics. Occurrence multiplicity within each file is preserved; repeated entries in one file are not silently collapsed.

Records with missing identity, different timestamps, changed content, or differently shaped exports remain included. There is no fuzzy matching, account/message-only merging, authenticity check, or source-file fingerprinting. Unconfirmed overlaps can still affect thresholds; review collection boundaries and the original evidence. Mixing timestamp bases does not bypass existing correlation restrictions.

## Try the overlapping practice exports

Select [overlap-first.csv](../samples/collections/overlap-first.csv) and [overlap-second.csv](../samples/collections/overlap-second.csv) together. All data is fictional and uses a reserved example IP address.

- Seven original records are retained; one is a confirmed duplicate, leaving six records included in analysis.
- Five distinct failed logons followed by one matching success emit **AUTH_SUCCESS_AFTER_FAILURES**. Neither source alone meets the default five-failure threshold.
- Filter to source-2 and Confirmed duplicates only to inspect its shared record.
- Save entire case and reopen it to verify all seven originals, both source files, and the duplicate reference survive.

## Save and export

Full JSON reports and saved cases preserve every accepted original, file metadata, source diagnostics, notes, settings, and profiles. Reopening recalculates duplicate links, findings, and [per-rule coverage](coverage.md) from validated fields. Events CSV includes file references and duplicate flags; findings CSV includes canonical evidence locations. Source and event IDs are local references, not integrity proofs. See [reports](reports.md) and [cases](cases.md).
