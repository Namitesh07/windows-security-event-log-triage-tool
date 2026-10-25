# Reports, case notes, and larger files

## Review the report

- Event sorting supports source record order, oldest/newest time, highest review priority, Event ID, account, and source. Unparsed timestamps remain last in either time direction; equal times keep input order.
- Findings can be sorted by priority, newest activity (last dated evidence), oldest activity (first dated evidence), or title. Priority is independent of the analyst's review status.
- Events use 25, 50, 100, or 250 rows per page; findings use 20 per page; the timeline uses 100. First/last event controls reach the ends without stepping through every page.
- Search matches source/adapter field values and the event label. Source IP filtering is an exact match. Filters combine with the active finding's evidence.
- **Clear filters in this evidence** preserves the finding scope. **Show all events / clear filters** removes both scope and filters. Sorting and paging do not change detection results.
- Inspectors load original fields when opened. Individual displayed values above 20,000 characters are shortened, but exports keep their full content.

## Case and finding notes

Enter a case title, analyst name, collection timezone, and general notes under **Case context and analyst notes**. Each finding accepts a review status and a free-text note:

- Unreviewed
- Investigating
- Expected activity
- Escalate

Review statuses are analyst labels, not new detections or changes to scoring. Collection timezone is a note about collection context; it does not change parsing. Timezone-free timestamps still use the browser timezone recorded in JSON.

Notes remain in memory for the current dataset across filters, paging, sorting, and setting changes. A finding's identity is its rule plus supporting event IDs. If a settings change replaces or removes that finding, its existing annotation is retained separately and included in an **Entire dataset** JSON snapshot. Notes are not automatically reassigned to a new finding with different evidence.

Loading another event file, demo, or saved case replaces the current case. Unsaved notes trigger a confirmation before replacement and a browser navigation warning where supported. Failed/cancelled loads preserve the old case. Rule-profile changes retain notes; annotations for removed findings remain in full saves/JSON reports. No localStorage, IndexedDB, cookies, or autosave is used. Choose Save entire case or download an entire-dataset JSON report before leaving, and verify the browser saved it. See [case reopening](cases.md).

Limits: case title 200 characters; analyst and timezone 120 each; case notes 10,000; each finding note 4,000. These limits affect analyst input only, not source evidence.

## Export scope

| Scope | Events | Findings and annotations |
| --- | --- | --- |
| Entire dataset | Every loaded event in the chosen event sort order | Every current finding; JSON also retains annotations from earlier analyses of this dataset |
| Current evidence and filters | All matching events across all pages | Only findings whose complete supporting evidence is selected, with their annotations |

Case context is included in either scope. JSON coverage and parsing diagnostics remain dataset-wide and are labelled accordingly; exported counts and filters identify the selected subset. Changing page size or page number never limits an export. Filtering out one supporting event omits that whole finding rather than presenting partial evidence as a complete detection.

## Export formats

| Format | Included information |
| --- | --- |
| JSON report | Schema/tool/rule versions; export and analysis times; source filename/size/format/available modification time; case context; effective settings and exact rule profile; timezone context; scope/diagnostics/coverage; resolved rule catalog with enabled state/weights; findings linked by event UID; annotations; normalized events and source/adapter fields |
| Findings CSV | Existing versions/times/source/scope, case context, settings, IDs, priority/points, review notes, evidence/matched values/contributions/explanations; appended Source locations (JSON) and Rule profile (JSON) |
| Events CSV | Existing versions/source/scope, event references, timestamps, priority/level, identity/host/source, message, original fields, case/settings; appended Input format, Source record, Source line, and Rule profile (JSON) |

CSV uses UTF-8 with a BOM, CRLF row separators, quoted cells, and doubled embedded quotes. Cells starting with spreadsheet formula characters (`=`, `+`, `-`, `@`), including after whitespace/control prefixes, or starting with a tab/newline are prefixed with an apostrophe. This changes the exported cell representation. Do not strip that protection when opening untrusted data in a spreadsheet. Spreadsheet handling can vary; use JSON when original values must be preserved exactly. Original CSV column order, duplicate header names, and source strings are retained as an array of header/value pairs in JSON.

JSON schema version is `1.2`, tool version is `1.6.0`, and rule version remains `2026-10-22`. Default detection conditions and points are unchanged. The normalized `ruleProfile` and resolved `ruleCatalog` capture tuning, including disabled rules. Full reports from v1.4.0+ can be reopened through Reopen a saved case; scoped reports are refused. Saved-case files wrap a full report in envelope schema `1.1`. When available, `caseOrigin` records the reopened filename, save/reopen times, original tool/rule versions, and saved browser timezone. UIDs are dataset-local and are not integrity proofs. See [cases](cases.md) for validation and re-analysis behaviour.

### Source locations and compatibility

- Each event has `inputFormat`, `sourceRecord` (1-based original record position, including skipped Event IDs), and `sourceLine`. CSV uses the original row-start line; XML uses the Event start line; JSON Lines uses its physical line including preceding blanks. JSON sourceLine is null and its record number identifies the object.
- Legacy CSV row/rows columns apply only to CSV; they are blank for XML/JSON/JSONL. Use the appended source-location fields for those formats. Internal legacy lineNumber values are not physical JSON lines.
- CSV keeps original header/value pairs. XML adapters retain `Original Event XML`; JSON adapters retain a serialized `Original JSON record`, preserving property strings but not original whitespace/escape spelling. Extracted XML text normalizes line endings. See [inputs](inputs.md).
- The legacy events CSV header `Original CSV fields (JSON)` is retained for compatibility; for other formats it contains source/adapter fields, including the preserved original record. New fields are appended rather than inserted into the older column positions.
- Formula-prefix protection applies to every CSV cell, including serialized source/profile content. Use the JSON report for unaltered evidence strings.

## Background processing and accessibility

When served over HTTP(S), the app uses a local dedicated Web Worker for parsing, normalization, analysis, and export. The worker loads only the bundled scripts. Processing stages appear in a concise status area; **Cancel operation** terminates the active worker. Older operations cannot overwrite a more recent selection. Report controls are unavailable while a task is active, so a displayed snapshot cannot be edited during replacement.

The new event-input limit is 20 files, 25 MB combined, and 100,000 source records including skipped and duplicate records. If workers cannot start, or index.html is opened with file://, the app uses a fallback limited to 2 MB combined and yields before processing. That fallback performs the bounded operation on the main thread and may briefly pause rendering. For larger files, serve the folder locally or use GitHub Pages. Worker processing reduces UI blocking; it is not streaming ingestion and can still use substantial memory. Export size may exceed source size because it includes normalized fields, original XML/JSON, profiles, and provenance. For very large or repetitive evidence, export a narrower collection time range.

All controls have visible labels or accessible names. The file chooser has a visible focus outline, the table region can be focused and scrolled with the keyboard, result headings receive focus after navigation, and short status messages announce changes without making the entire report a live region. Responsive layouts preserve the native evidence table in a labelled horizontal scroll area. Reduced-motion and forced-colors preferences are supported. Automated flow tests are not a substitute for manual screen-reader and device testing.

## References

- [OWASP CSV injection guidance](https://owasp.org/www-community/attacks/CSV_Injection)
- [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [W3C: Tables and keyboard scrolling](https://design-system.w3.org/styles/tables.html)

## Collection provenance, duplicate links, and rule coverage

The source.files manifest lists every original filename, source ID, format, size, and available modification/load time. Events include sourceId/sourceName plus their original record/line; Windows EventRecordID and channel are normalized where present. Confirmed overlaps have duplicateOf pointing to the first retained occurrence in an earlier source. All originals remain in full JSON/events CSV, but duplicate records do not generate findings or inflate snapshot counts. Scoped exports can contain a duplicate whose canonical reference lies outside that export; they are not reopenable cases.

JSON adds ruleCoverage with a ruleCoverageScope label. UI exports include coverage and diagnostics for the entire collection even when evidence filters narrow the exported records. Each rule records state, field eligibility counts, missing fields with example UIDs, missing companion events, emitted findings, warnings, required fields, logging context, and effective window settings. The duplicates object explicitly counts only exported events.

Events CSV appends Source file ID, Source filename, Duplicate of, and Included in analysis. Findings CSV source-location JSON includes source file references; a Rule coverage (JSON) column describes the associated rule. Coverage is descriptive metadata, not a verdict or audit-completeness guarantee. See [collections](collections.md) and [coverage](coverage.md).
