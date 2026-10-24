# Apply upgrades 19–20: validation and saved cases

This complete **v1.5.0** source package is based on main commit **5499dd6f61fedc6ae2fbc75cde4abc7b49b35d45**. It preserves the corrected root layout, current theme, stacked education panels, and uppercase creator credit. No commit, push, tag, release, or deployment was made for this package.

## Upload the contents into the repository root

1. Extract the ZIP into an empty folder. You should immediately see **index.html**, **styles.css**, **package.json**, and folders such as docs, scripts, tests, tools, and .github.
2. Open that extraction folder and copy/select **its contents**. Do not upload the extraction folder as an additional project directory.
3. Put the files in your existing repository root, beside the current README.md and index.html, replacing overlapping files after reviewing local work.
4. Include **.github/workflows/**, **.gitattributes**, and **.gitignore**. Confirm that the two workflow YAML files appear under the repository's root .github/workflows directory.
5. Keep your repository's Git history and unrelated work. Do not upload node_modules, browser binaries, test-results, playwright-report, or dist.
6. Review your changes and commit them yourself when ready.

Suggested upload description: **Add saved-case reopening and browser/Windows validation**.

## Validate

With Node.js 22+:

~~~bash
npm run check
npm test
npm run package
~~~

For actual browser checks:

~~~bash
npm ci --ignore-scripts
npx playwright install --with-deps chromium firefox
npm run test:browser
~~~

Windows PowerShell checks are documented in [docs/testing.md](docs/testing.md); the real-EVTX integration test requires Windows administrator rights to create its own temporary fictional event log.

Serve the project locally and confirm Save entire case → Reopen a saved case restores notes, settings, profiles, and evidence. Test failed/cancelled input, downloads, keyboard use, and mobile layout. The live demo reflects your repository deployment, not this uncommitted ZIP.

## What changed

- **Upgrade 19:** Real-browser test projects for desktop Chromium, desktop Firefox, and mobile Chromium; checks for file uploads, downloads, cancellation, notes, case reopening, markup safety, focus, and layout. Windows integration creates a genuine EVTX fixture and validates converter output through the shared XML adapter. CI/release jobs include these checks.
- **Upgrade 20:** Local full-case saving and reopening, compatible entire-dataset JSON reports from v1.4.0+, strict validation, current-engine re-analysis, retained annotations, and version/timezone provenance.
- **Packaging:** Flat ZIP source layout, pinned browser test dependency/lockfile, updated documentation and changelog. No runtime dependency or server-side analysis was added.

Saved cases use envelope schema 1.0; JSON reports remain schema 1.1 with tool version 1.5.0 and unchanged rule catalog version 2026-10-22. Default rules/scores are unchanged. Case reopening supports 50 MB with workers and 2 MB in fallback mode. See [docs/cases.md](docs/cases.md).

Use [CHANGELOG.md](CHANGELOG.md) and the repository's [Releases page](https://github.com/Namitesh07/windows-security-event-log-triage-tool/releases) for release information.
