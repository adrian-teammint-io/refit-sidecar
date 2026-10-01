---
name: ui-verify
description: Visually verify the Refit Sidecar drawer (mock app.refit.ai page) or toolbar popup by screenshotting them in headless Chrome with stubbed chrome APIs. Use after UI or style changes, or to reproduce a render bug without loading the extension or the native host.
---

# UI verify

- `stub.js` fakes `chrome.runtime` / `chrome.storage.local` / `chrome.storage.session` with six sample failed syncs, a host state and terminal output. It also forces the drawer's closed shadow root open so the mock can click into it.
- `mock.html` is a fake app.refit.ai page that loads `stub.js` then `content.js`, opens the drawer, and shows errors as `<pre id="e">`.
- `shoot.sh` serves a copy of the build output on `localhost:8766` (the popup's assets use absolute paths, so `file://` won't do) and screenshots both surfaces.

```bash
npm run build --prefix ~/personal-projects/refit-sidecar
bash .claude/skills/ui-verify/shoot.sh                  # drawer + popup, all modes
bash .claude/skills/ui-verify/shoot.sh popup output     # one surface, chosen modes
H=600 bash .claude/skills/ui-verify/shoot.sh popup many # popup height check (Chrome caps popups at 600px)
```

Modes: `results` (default), `output` (a run in progress), `never` (not run yet), `zero` (no failures), `error` (last run failed, banner over the last good rows), `missing` / `forbidden` (host setup state), `settings`, `many` (30 rows, truncated). Add `-light` for Claude Paper light, e.g. `results-light`. Drawer-only hash flag: `#results&expand` expands the second reason.

Then open the PNGs with the Read tool.

- `--virtual-time-budget=8000` is set; a capture can still land mid-transition now and then (drawer looks faded with the launcher visible). Re-run that mode before debugging.
- Hooks: commands that mention build/output folder names are blocked unless they start with `npm run build`, so build and shoot in separate commands. No heredocs in Bash (a hook reads them as commit messages); write files with the editor.
- This doesn't exercise the native host or the real app.refit.ai DOM. For the host, `pnpm test` drives `host/host.mjs` end to end; for the real thing, load the extension unpacked.
