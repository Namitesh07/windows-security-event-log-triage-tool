# Reports, case notes, and larger files

## Review the report

- Event sorting supports CSV row order, oldest/newest time, highest review priority, Event ID, account, and source. Unparsed timestamps remain last in either time direction; equal times keep CSV order.
- Findings can be sorted by priority, newest activity (last dated evidence), oldest activity (first dated evidence), or title. Priority is independent of the analyst's review status.
- Events use 25, 50, 100, or 250 rows per page; findings use 20 per page; the timeline uses 100. First/last event controls reach the ends without stepping through every page.
- Search matches original CSV values and the event label. Source IP filtering is an exact match. Filters combine with the active finding's evidence.
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

Loading another CSV or demo starts a new case. Unsaved notes trigger a confirmation before replacement and a browser navigation warning where supported. A failed or cancelled load preserves the old case. No localStorage, IndexedDB, cookies, or autosave is used. Download an entire-dataset JSON report before leaving; verify that the browser saved the file. Browser navigation warnings and download initiation are not a guarantee of storage.

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
| JSON report | Schema/tool/rule versions; export and analysis times; source filename, byte size and available modification time; case context; effective analysis settings; browser timezone and interpretation; scope; diagnostics/coverage; rule catalog and score contributions; findings linked by event UID; review annotations; all normalized events and original CSV fields |
| Findings CSV | Versions/times/source/scope, case context and notes, effective settings, rule/finding IDs, priority and points, review status/note, supporting UIDs/CSV rows, matched values, contributions, explanations and next steps |
| Events CSV | Versions/source/scope, event UIDs/CSV rows, original and parsed timestamps, timezone basis/status, review priority and Windows level, identity/host/source, message, original columns as JSON, case title and effective settings |

CSV uses UTF-8 with a BOM, CRLF row separators, quoted cells, and doubled embedded quotes. Cells starting with spreadsheet formula characters (`=`, `+`, `-`, `@`), including after whitespace/control prefixes, or starting with a tab/newline are prefixed with an apostrophe. This changes the exported cell representation. Do not strip that protection when opening untrusted data in a spreadsheet. Spreadsheet handling can vary; use JSON when original values must be preserved exactly. Original CSV column order, duplicate header names, and source strings are retained as an array of header/value pairs in JSON.

JSON schema version is `1.0`, tool version is `1.3.0`, and rule version is `2026-10-15` (detection rules are unchanged from v1.2.0). UIDs are local to the loaded dataset; source filename and timestamps are descriptive metadata, not a file hash or integrity proof. JSON is a report snapshot; there is no import/resume feature in this upgrade.

## Background processing and accessibility

When served over HTTP(S), the app uses a local dedicated Web Worker for parsing, normalization, analysis, and export. The worker loads only the bundled scripts. Processing stages appear in a concise status area; **Cancel operation** terminates the active worker. Older operations cannot overwrite a more recent selection. Report controls are unavailable while a task is active, so a displayed snapshot cannot be edited during replacement.

The input limit is 25 MB. If workers cannot start, or index.html is opened with file://, the app uses a fallback limited to 2 MB and yields before processing. That fallback performs the bounded operation on the main thread and may briefly pause rendering. For larger files, serve the folder locally or use GitHub Pages. Worker processing reduces UI blocking; it is not streaming ingestion and can still use substantial memory. Export size may exceed source size because it includes normalized fields and provenance. For very large or repetitive evidence, export a narrower collection time range.

All controls have visible labels or accessible names. The file chooser has a visible focus outline, the table region can be focused and scrolled with the keyboard, result headings receive focus after navigation, and short status messages announce changes without making the entire report a live region. Responsive layouts preserve the native evidence table in a labelled horizontal scroll area. Reduced-motion and forced-colors preferences are supported. Automated flow tests are not a substitute for manual screen-reader and device testing.

## References

- [OWASP CSV injection guidance](https://owasp.org/www-community/attacks/CSV_Injection)
- [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [W3C: Tables and keyboard scrolling](https://design-system.w3.org/styles/tables.html)
