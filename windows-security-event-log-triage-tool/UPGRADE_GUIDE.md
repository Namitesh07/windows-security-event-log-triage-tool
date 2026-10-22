# Apply upgrades 15–18: formats, rules, practice cases, and checks

This complete v1.4.0 source package was prepared from main commit **0ddc7bdf4b4966983c3302d4cd3b75b21ade6af9** (v1.3.1). It preserves the violet theme, wide layout, and full-width Field Guide followed by Quick Reference. No Git history, credentials, installed dependencies, commit, tag, release, or deployment is included.

## Apply the files

1. Extract the ZIP and open its windows-security-event-log-triage-tool folder.
2. Copy that folder's contents into your repository checkout. Keep your checkout's Git history and unrelated local work. Review overlaps if main has changed since the base commit.
3. Include .github/workflows/, .gitattributes, and .gitignore when copying; some file managers hide these entries.
4. With Node.js 22 or later, run **npm run check**, **npm test**, and **npm run package**. No npm install is required.
5. Serve the folder locally, for example **python3 -m http.server 8000 --bind 127.0.0.1**, and open http://127.0.0.1:8000. Check demos, XML/JSON/JSONL imports, profile changes, source inspectors, notes, exports, keyboard navigation, and your target devices.
6. Review git status and git diff, then commit/push the files yourself when ready. Existing GitHub Pages settings remain yours to manage.

Suggested commit description: **Add multi-format event imports, versioned rule profiles, practice cases, and CI checks**.

## What ships

| Upgrade | Main additions |
| --- | --- |
| 15 — Input formats | inputs.js; Windows Event XML, JSON, JSONL/NDJSON; encoding/source-location handling; local PowerShell EVTX-to-XML converter; input guide |
| 16 — Versioned rules | Canonical rules/catalog.json, generated browser asset, validated profiles, visible rule catalog, profile export/provenance |
| 17 — Learning material | Seven curated cases, manifest, optional sample profile, fixture exercises, input/rule/development documentation |
| 18 — Checks and packaging | Node 22/24 CI, Windows helper checks, tag/version validation, reproducible source ZIP with per-file checksums, regression coverage |

[Development documentation](docs/development.md) lists the runtime script order. Upload all new runtime files together; replacing only index.html and script.js will break loading.

## Compatibility and validation

- CSV, the five existing demo buttons, and default detection scores remain supported. Profiles are optional.
- Direct-file mode remains limited to 2 MB; worker mode supports 25 MB. Both enforce 100,000 accepted events. XML/JSON adapters also bound field counts and nesting.
- Raw EVTX requires local Windows conversion; the browser does not parse its binary format. Windows automated checks mock records, so validate conversion against your authorised real EVTX collection.
- Report schema is **1.1**, tool version **1.4.0**, and rules version **2026-10-22**. New CSV provenance columns are appended; legacy CSV-row columns are blank for other formats. See [reports](docs/reports.md).
- Packaging produces dist/windows-security-event-log-triage-tool-v1.4.0.zip and its .sha256 file. SHA256SUMS.txt inside the archive covers each source file.
- GitHub Actions starts after you add the workflows to your repository. Tagged v* release validation requires a tag matching package.json; a successful run retains an archive artifact without creating a release or deploying the site.

Use [CHANGELOG.md](CHANGELOG.md) and the repository's [Releases page](https://github.com/Namitesh07/windows-security-event-log-triage-tool/releases) for release information.
