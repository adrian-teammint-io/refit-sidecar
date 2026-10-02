---
name: add-command
description: Refit Sidecar's command catalog and the steps to add or change a host command: SQL file, commands.json allowlist entry, PARAMS binding, WRITES guard, parser, readResult / writeResult branch and UI. Use when adding a command, editing host/sql/*.sql, commands.json, protocol.mjs params, a parser in projects.ts / failed-syncs.ts / flow.ts, or the worker's readResult / writeResult.
---

# Commands

## Catalog

- `projects q status sort offset`: projects with connection count, FAIL count and last sync; sort `active` (active first, default) / `name` / `recent`
- `project-connections project_id q sort offset`: one project's connections, each with its newest sync_request; sort `status` (failing first) / `service` / `name`
- `connections q offset`: connections across every project, matched on name, service or id
- `fitting-rooms q offset`: fitting rooms (pipelines), newest edit first, matched on name, project name or id
- `fitting-room-connections room q sort offset`: the connections one fitting room reads (any `transaction.payload.from[]` entry with `type: 'connection'`, the link refit-gql checks in `src/db/__init__.py` before deleting a connection), same columns and sorts as `project-connections`
- `fitting-room-flow room`: every node (`transaction`) of one fitting room in one fetch (no batches, row limit 500): name, type (organize / join / union / aggregate / export), `inputs` (its `payload.from` as JSON text, each `{type, id, name}`: an upstream node or a connection, the edges refit-app-2's canvas draws in `components/diagram/Diagram.tsx`), its output count and newest `sync_request_fitdata` status
- `failed-syncs sync_status`: every `sync_request` with status `sync_status` (`FAIL` default / `IN_PROGRESS` / `FRAGMENTED`, newest 500), each with `recovered_*`: the newest later SUCCESS on the same connection covering its end_date (fish `refit-sync_success_after_fail` rule, one hash-joined pass)
- `project-members project`: a project's members from `refit_user_project_relation` + `refit_user` (email, name, role, added, `owner` = 1 for the project's `create_by`), admins first
- `user-search project q`: up to 10 existing `refit_user`s whose email or name contains q (at least 2 characters), with their role in this project if they're already a member
- `delete-syncs ids`: **write.** Deletes 1-100 sync_requests by id, only those still `FAIL`, `RETURNING id` (the drawer version of fish `refit-sync_delete`).
- `add-project-user user project role`: **write.** Inserts `refit_user_project_relation (user_id, project_id, role)` with role `viewer` / `editor` / `admin`, the same row refit-app-2's admin ProjectMembersModal inserts. `ON CONFLICT DO NOTHING RETURNING`: an existing member is never changed (the app's own mutation would update their role). Only existing users; there's no invite or email.
- `create-project name user status plan end members`: **write.** One `WITH … INSERT` statement, like refit-gql `add_project` (the welcome page's `createProject`): a `project` row (`name`, `create_by` = owner, `status` ACTIVE / PAUSED / NEED_PAYMENT, `plan` BASIC / DEMO / ENTERPRISE (no TRIAL), `end_date`), then one `INSERT … SELECT FROM p, (VALUES (owner, 'admin'), (uuid, role)…)` for the owner as admin plus each `uuid:role` member (`DO NOTHING` on duplicates). `RETURNING project_id, user_id`: one row per member added, so the toast's member count is the row count. Unlike the app it doesn't add refit-gql's 3 `REFIT_ADMIN` users; you pick members instead. Nothing else happens on create in Refit either (no triggers, billing or default rows).

The five browse commands return batches of 30 (`BATCH` in `src/projects.ts`; the SQL asks for `LIMIT 31` and the extra row only means "there is more"). Each takes about 1s. UI and conventions are copied from `~/personal-projects/claude-sidecar`.

## Adding a command

1. Add an entry to `host/commands.json` (edits apply on the next run; no reinstall needed). For a query: a `sql/*.sql` file run by `tabularis-query.mjs`, with `"{env}"` as its connection arg and an `env` param (`prod|stag`, default `prod`); host.test.mjs checks every entry has both.
   - Tabularis has no bind parameters. SQL files use unquoted typed placeholders, filled by `bindParams()` (`PARAMS` in protocol.mjs): `:project_id` / `:user_id` / `:fitting_room_id` (strict UUID), `:ids` (1-100 UUIDs), `:members` (0-50 `uuid:role`), `:offset` (int), `:status` / `:sync_status` / `:sort` / `:role` / `:project_status` / `:plan` (enums), `:end_date` (real `YYYY-MM-DD`), `:name` (hex text, not blank), `:q` (hex of UTF-8 text, emitted as `convert_from(decode('…','hex'),'UTF8')`). Every placeholder needs a value and every value must be used. `tabularis-query.mjs` takes them as `--name value` pairs after the row limit. Declare each param in commands.json with a matching `pattern` too, so the server rejects bad input before spawning.
   - A new kind of value gets a new validator in `PARAMS`. Never splice free text into SQL.
   - Match search text with `strpos(lower(col), lower(:q)) > 0` (no LIKE wildcards to escape).
   - **Tabularis read-only mode is ON** for refit-prod and blocks whatever it thinks is a write. It flags `replace(` in larger queries, so never use `replace()` or backslash string literals in SQL files. Leading `--` comments are fine (`stripLeadingComments()`).
   - Batch queries: `LIMIT 31 OFFSET :offset`. `sync_request` has no index on `connection_id`, so aggregate it in one pass (DISTINCT ON / GROUP BY) instead of a per-row subquery.
   - **Never test a query against prod without asking Hoàn.** Verify with captured samples in `src/samples/`, `pnpm test` and `ui-verify`.
2. Add its name to `Command` in `src/api.ts`.
3. Parse: write a pure parser with `parseTable()` (`src/table.ts`, which looks columns up by name, turns `""` into null for nullable columns, and checks numbers) plus a `*.test.ts` against captured output in `src/samples/`. Store the result in a `readResult()` branch in `src/host.ts` through `save()` (which keys it by the run's env), under its own key, and add that key to `DATA_KEYS` in `src/table.ts` and the `Data` type in `shared/store.ts`. A write gets a `writeResult()` branch instead (runs only after `runOk`; read its RETURNING rows with `writeRows()`), returns a `summary` for the toast and, when it changes a list, a `then` follow-up run. Add it to `WRITES` in `src/host.ts` too. Send `env: ENV` with the run (browse views get it from `useBrowse`).
4. UI: follow Adding a view in the `drawer-views` skill, then add a fixture and nav mode to `.claude/skills/ui-verify/stub.js` and screenshot.

## How a command flows (touch these in order for a new one)

1. `host/sql/<name>.sql` (placeholders like `:project_id`) → 2. `host/commands.json` entry (`"{env}"` connection arg, params with patterns) → 3. new value types in `PARAMS`; a write also in `WRITES` (`protocol.mjs`), **ask Hoàn first** → 4. `Command` in `src/api.ts` → 5. parser + types in `src/projects.ts` (or `failed-syncs.ts`, `flow.ts`) → 6. a `readResult` (or `writeResult`) branch in `src/host.ts`, the key in `DATA_KEYS` (`table.ts`) and `Data` (`shared/store.ts`) → 7. UI: call `exec(command, { env: ENV, ... })` (browse views via `useBrowse`) and render from `useStore()` data passed down from `App.tsx`.

- Links into Refit are built only in `src/links.ts` (UUID-checked).
- Connection link: `https://app.refit.ai/{project_id}/datasources/{service|file}/{connection_id}` (refit-app-2 route `/_auth/$projectId/datasources/service/$datasourceId`, where datasourceId = `connection.id`).
