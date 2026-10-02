---
name: ui-verify
description: Visually verify the Refit Sidecar drawer (mock app.refit.ai page) or toolbar popup by screenshotting them in headless Chrome with stubbed chrome APIs. Use after UI or style changes, or to reproduce a render bug without loading the extension or the native host.
---

# UI verify

- `stub.js` fakes `chrome.runtime` / `chrome.storage.local` / `chrome.storage.session` with six sample failed syncs, browse pages (projects, one project's connections, connections, fitting rooms), two pins, a host state and terminal output. It also forces the drawer's closed shadow root open so the mock can click into it, and turns CSS transitions and animations off inside it.
- `mock.html` is a fake app.refit.ai page that loads `stub.js` then `content.js`, opens the drawer, and shows errors as `<pre id="e">`.
- `shoot.sh` serves a copy of the build output on `localhost:8766` (the popup's assets use absolute paths, so `file://` won't do) and screenshots both surfaces.

```bash
npm run build --prefix ~/personal-projects/refit-sidecar
bash .claude/skills/ui-verify/shoot.sh                  # drawer + popup, all modes
bash .claude/skills/ui-verify/shoot.sh popup output     # one surface, chosen modes
H=600 bash .claude/skills/ui-verify/shoot.sh popup many # popup height check (Chrome caps popups at 600px)
```

Mode names are `<data>[-nav=<view>][-q=<search>][-light]`, e.g. `results-nav=projects-q=skin` or `results-nav=project-light`.
- Data: `results` (default), `output` (a run in progress), `never` (nothing fetched yet), `zero` (no failures), `error` (last run failed, banner over the last good rows), `loading` (projects being fetched, skeleton), `offline` (relay installed, `pnpm server` not running), `missing` / `forbidden` (host setup state), `settings`, `many` (30 rows in every list with `hasMore`, so "Load 30 more" shows; failed syncs truncated).
- Drawer nav (mock.html clicks the Home rows, in order Projects, Connections, Fitting rooms, Failed syncs): `home` (default), `projects`, `project` (opens the first unpinned project, which has cached connections), `connections`, `fitting`, `failed`. `-q=` types into the view's search; the stub never answers, so rows stay dimmed as stale. `-sort=service` groups the project's connections by service.
- Extra hash flags (pass the mode with `&`, e.g. `'many-nav=fitting&bottom'`): `expand` expands the second reason, `bottom` scrolls to the end (load more), `wide` sets a saved drawer width of 720, `legacy` stores pages in the pre-batching shape (no `query` / `hasMore`) to check old storage still renders, `tab=IN_PROGRESS` / `tab=FRAGMENTED` opens that Sync requests tab (with `nav=failed`), `reloading` shows the Connections search being fetched again over its page (Cancel in the status line), `click=A,B` clicks buttons by text prefix or aria-label in order (spaces as %20), e.g. `results-nav=failed&click=Select,Select%20all,Delete` for the delete confirm, `results-nav=projects&click=New%20project`, `answer` makes a `project-members` run come back with three stub members (one owner), e.g. `results-nav=projects&click=Duplicate%20Sample%20Brand%20KR&answer` for a filled Duplicate.
- Popup modes use the data part only (`output`, `settings` click through).

Then open the PNGs with the Read tool.

- `--virtual-time-budget=8000` is set (override with `B=`). Headless Chrome reports `prefers-reduced-motion: reduce` and doesn't reliably advance CSS transitions under virtual time; that froze the drawer faded or off-screen, and is why the stub disables motion. Motion itself is not covered by these shots.
- Hooks: commands that mention build/output folder names are blocked unless they start with `npm run build`, so build and shoot in separate commands. No heredocs in Bash (a hook reads them as commit messages); write files with the editor.
- This doesn't exercise the native host or the real app.refit.ai DOM. For the host, `pnpm test` drives the relay and server end to end; for the real thing, load the extension unpacked.
