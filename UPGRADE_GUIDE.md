# Apply the upgrades 11–14 source package

This is the complete updated project source, prepared from main commit `89ecb4e28bfeef3b84e8e2322c05616d7328f7e1` (v1.2.0). It contains no Git history, credentials, or installed dependencies. No commit, release, tag, or deployment was made by the assistant.

1. Extract the ZIP. Open the `windows-security-event-log-triage-tool` folder inside it.
2. Copy that folder's contents into your existing repository checkout. Keep your checkout's `.git` directory and any unrelated local work. Review overlaps if your checkout has changed since the base commit.
3. From your checkout, run `npm test` using Node.js 18 or later. No npm install is required.
4. Open `index.html` to check demos and small CSV files. For background processing, serve the folder over HTTP(S), for example `python3 -m http.server 8000 --bind 127.0.0.1`, then open `http://127.0.0.1:8000`.
5. Check sorting, evidence scope, notes, JSON/CSV downloads, keyboard navigation, and the layout on your target devices. Include the new `report.js`, `task-runner.js`, and `worker.js` files when uploading; all app files must stay together.
6. Review `git status` and `git diff`, then commit and push the changes yourself. Use `RELEASE_NOTES.md` for the proposed v1.3.0 release title and body.

## Files changed or added

- Updated: `index.html`, `script.js`, `styles.css`, `package.json`, `README.md`, `CHANGELOG.md`, `tests/ui.test.cjs`.
- Added: `report.js`, `task-runner.js`, `worker.js`, `docs/reports.md`, `tests/reports.test.cjs`, `tests/worker.test.cjs`, `RELEASE_NOTES.md`, and this guide.
- The parser/detection module, previous detection tests, detection guide, and five sample CSV files remain unchanged.

Suggested commit message: `Add report exports, case notes, and review controls`.
