# 05 — Output, Filtering & Exit Codes

Mirrors `gh`'s output contract: readable for humans, stable for machines.

## Render modes

| Mode | Trigger | Behaviour |
|---|---|---|
| **Table** | default on TTY | Aligned columns, color, header row. Curated columns per noun (not every API field). |
| **Plain** | default when piped/non-TTY | TSV-ish, no color, no header decoration; stable for `cut`/`awk`. |
| **JSON** | `--json` | Raw structured output. `--json` with no arg = full object(s); `--json id,description,amount` = projection. |
| **jq** | `--jq <expr>` | Pipe JSON through an embedded jq engine; output is jq's result. Implies JSON source. |
| **Template** | `--template <tmpl>` | Go-template-style rendering over the JSON (gh-compatible helpers: `tablerow`, `timeago`, `truncate`, `color`). |

- `--json`/`--jq`/`--template` are mutually exclusive with table prettifying; they always emit
  machine output regardless of TTY.
- Default render mode is overridable via `settings.output` (`03`).

## Curated columns

Each `06/*` command spec lists its **table columns** explicitly (a human-meaningful subset).
Example (`transaction list`): date, type, description, amount (signed, currency), source →
destination, category. Full fidelity is always available via `--json`.

## List filtering & pagination (shared by all `list` verbs)

| Flag | Meaning |
|---|---|
| `--limit <n>` | page size (maps API `limit`) |
| `--page <n>` | page number (maps API `page`) |
| `--all` | auto-follow all pages (client-side, `01`) |
| `--start <date>` / `--end <date>` | date range (maps API `start`/`end`; ISO `YYYY-MM-DD`) |
| `--type <t>` | resource-specific type filter (e.g. transaction/account type) |
| `--query <q>` | free-text query where the endpoint supports it |

Date inputs also accept relative forms (`today`, `-7d`, `this-month`) resolved client-side to ISO.

## Color & pager

- Color: `auto` (TTY only) | `always` | `never`; `--no-color` and `NO_COLOR` force off.
- Pager: long table/text output goes through `$PAGER` when `pager=auto` and on a TTY; `--no-pager`
  or `pager=never` disables. JSON/jq/template output never paged.

## Errors

- Human message to **stderr**; nothing parseable to stdout on failure.
- API 422 validation errors expand the envelope `errors{field:[msgs]}` into a readable list.
- 401/403 → auth hint (`firefly auth login` / token scope note).
- `--verbose` adds the failing request line (token redacted).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | generic error / unexpected failure |
| 2 | usage error (bad flags/args) |
| 3 | not found (404) |
| 4 | authentication/authorization error (401/403, missing creds) |
| 5 | validation error (422) |
| 6 | conflict / precondition (409/412) |
| 7 | server error (5xx after retries) |
| 8 | cancelled (user aborted prompt / SIGINT) |

`--quiet` suppresses success chatter but never error output. On success of a mutation, print a
one-line confirmation (id + short description) unless `--quiet`, matching `gh`.
