# Meta & System Commands

Commands that aren't a Firefly resource noun. `auth`, `config`, `instance`, and `api` are
specced in cross-cutting docs (`02`, `03`, `07`); this file covers the rest.

## `data` — bulk, export, destructive ops
| Command | Purpose | API |
|---|---|---|
| `data export <kind>` | the deliberate "pull everything once, analyze locally" tool (`--format csv\|json\|ndjson`, `--output`, `--start --end`) | `GET /data/export/{kind}` (csv) or `GET /{kind}` paged (json/ndjson) — kind ∈ `accounts bills budgets categories piggy-banks recurring rules tags transactions` |
| `data bulk` | bulk-update transactions by **field equality** (`--where key=value`, `--set key=value`, or raw `--query <json>`) | `POST /data/bulk/transactions` |
| `data destroy` | **destructive**: delete objects of a type | `DELETE /data/destroy` |
| `data purge` | **destructive**: permanently purge soft-deleted | `DELETE /data/purge` |

`data bulk`'s `where`-clause matches **exact field values** (Firefly's bulk endpoint), so it cannot
select by the search DSL. For query-based selection (`description_contains`, `amount_more`, …) use
`tx categorize` / `tx edit --where` (`transaction.md`), which resolve ids via search and batch the
edits client-side. `data export --format json|ndjson` is the deliberate one-shot to replace
repeated `tx list --all --json` dumps over the same range.

`destroy`/`purge` are **guarded**: require `--objects <type>` (destroy) and a typed confirmation
of the instance name unless `--yes` is *also* present. Never destructive without explicit scope.

```sh
firefly data export transactions --start 2026-01-01 --output txns.csv
firefly data export transactions --format ndjson > txns.ndjson
firefly data bulk --where category_id=1 --set category_id=5
firefly data destroy --objects budgets --yes
```

## `user` — current + admin users
| Command | API |
|---|---|
| `user view` | `GET /about/user` (current user) |
| `user list` | `GET /users` (admin) |
| `user view <id>` | `GET /users/{id}` (admin) |

User writes (`POST /users`, `PUT/DELETE /users/{id}`) and `/user-groups*` are admin-only and
left to `firefly api` (see `08` api-only rows).

## `preference` — user preferences
| Command | API |
|---|---|
| `preference list` | `GET /preferences` |
| `preference get <name>` | `GET /preferences/{name}` |
| `preference set <name> <value>` | `POST /preferences` or `PUT /preferences/{name}` |

Alias: `pref`.

## `config-value` — system configuration (admin)
| Command | API |
|---|---|
| `config-value get [name]` | `GET /configuration` (all) / `GET /configuration/{name}` |
| `config-value set <name> <value>` | `PUT /configuration/{name}` |

Named distinctly from `config` (CLI config, `03`) to avoid confusion: this is **server** config.

## `cron`
| Command | API |
|---|---|
| `cron run <cliToken>` | `GET /cron/{cliToken}` — trigger scheduled jobs |

## `about`
| Command | API |
|---|---|
| `about` | `GET /about` — server version, OS, PHP/db driver |

## `completion`, `alias`, `version`
- `completion <bash\|zsh\|fish>` — emit shell completion script (`09`).
- `alias set <name> <expansion>` / `alias list` / `alias delete <name>` — user command aliases,
  stored in `config.yml` (`03`). `alias set co "transaction create"`.
- `version` — CLI version + pinned API spec version.
