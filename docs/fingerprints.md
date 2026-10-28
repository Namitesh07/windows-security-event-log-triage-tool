# Source-file SHA-256 fingerprints

After importing event exports, open **Source files and duplicate handling**. Each file shows its SHA-256 digest when the original bytes and browser Web Crypto are available. Processing stays local; no hash lookup service is contacted.

## What is hashed

The digest covers the complete original byte sequence, before text decoding or normalization. That includes UTF-8/UTF-16 encoding markers, original line endings, whitespace, headers, and rows skipped during parsing. Two exports can produce equivalent normalized events yet have different file fingerprints. Record-level duplicate handling remains separate and conservative.

Each source entry records algorithm **SHA-256**, lowercase hex digest, original byte length, basis **original-file-bytes**, and verification state **computed-at-import**. JSON/saved cases preserve this metadata, and CSV exports append source fingerprint JSON. The byte buffer is temporary; it is not stored in the case or uploaded.

For a manual comparison on Windows:

~~~powershell
Get-FileHash -LiteralPath 'C:\Evidence\events.csv' -Algorithm SHA256
~~~

Compare hex values without regard to letter case. A matching digest establishes byte agreement with that recorded value; it does not establish who created the file, whether the record is trustworthy, or a signed chain of custody.

## Reopened cases and unavailable hashes

Saved cases retain accepted evidence, not the complete original export bytes. Reopening validates hash metadata and changes its verification state to **recorded-in-case**. The UI, JSON, CSV, and printable report distinguish this from a fresh computation. A hash copied into a case can itself be edited; reopening does not certify it.

Older cases, built-in fictional demos, and text-only adapters may lack original bytes. Web Crypto may be unavailable in an unsupported/insecure browser context. In these situations importing still works within existing limits, and fingerprint metadata is explicitly unavailable. No digest of reconstructed text is substituted. Use the hosted HTTPS app or a supported local browser context and re-import the original file when a computed fingerprint is needed.

Fingerprints are provenance aids, not evidence-authenticity verdicts. See [collections](collections.md), [cases](cases.md), and [reports](reports.md).
