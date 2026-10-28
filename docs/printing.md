# Printable investigation reports

After analysis, choose the export scope and select **Download printable report**. Open the downloaded HTML file in your browser, then use **Print / Save as PDF** (Ctrl+P on Windows/Linux, Cmd+P on macOS). A4 print styles provide repeating table headers, wrapped evidence values, and a plain light layout.

The HTML is self-contained: no scripts, remote images/fonts, analytics, popups, or automatic print command. Report text is escaped, and a restrictive Content Security Policy blocks active/remote content. Official ATT&CK links are the only external destinations supplied by the renderer; they open only when selected.

## Included

- Case title, analyst, collection-timezone note, complete case notes, and current finding review statuses/notes.
- Tool/catalog versions, generation/analysis times, browser timestamp interpretation, effective settings/profile, scope/filters, and available reopen provenance.
- Source-file manifest and SHA-256 metadata with computed/recorded/unavailable status. Source metadata covers the entire loaded collection even in a filtered evidence export.
- Complete in-scope findings with matched values, score contributions, benign context, investigation steps, supporting source references, and ATT&CK learning context.
- Retained inactive annotations for entire-dataset reports, per-rule coverage/gaps, a supporting activity timeline, and an event-context/reference appendix.

The same scope rules as JSON/CSV apply. Entire dataset spans all UI pages. Current evidence and filters includes every matching record across pages, and a finding appears only when every supporting event is in scope. Coverage remains labelled as entire-dataset coverage when supplied by the UI. Duplicates remain in the event appendix with their canonical reference; they do not inflate findings.

## Bounds and preservation

The printable report is a review document, not a portable case or complete raw-evidence export. Use **Save entire case** or JSON for original field arrays and future reopening.

To keep output manageable, it shows up to **500 findings**, **2,000 event references/timeline entries**, and **500 inactive annotations**. Top/section notices state when these limits apply and identify original counts. Context field values longer than **4,000 characters** have a visible shortening marker. Case notes and finding notes retain their existing 10,000/4,000-character limits. Printable HTML over **20 MB** is refused with guidance to narrow the evidence scope or use JSON.

Downloading a printable report does not mark unsaved case notes as safely saved; only an entire-dataset JSON snapshot/case can preserve the full investigation. Page counts and PDF options depend on the browser/printer. Handle the HTML/PDF as sensitively as the source logs: it contains evidence context and analyst notes.

No fingerprint or ATT&CK reference is an authenticity or compromise verdict. See [fingerprints](fingerprints.md), [ATT&CK](attack.md), and [report scopes](reports.md).
