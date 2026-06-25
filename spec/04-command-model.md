# 04 — Command Model

The command taxonomy is the backbone every other spec references. Structure is **noun-verb**:
`firefly <noun> <verb> [args] [flags]`, mirroring `gh`.

## Top-level shape

```
firefly <group> <command> [target] [flags]
firefly <meta-command> ...
firefly api <method> <path> [flags]      # escape hatch
```

Groups hold related nouns/verbs. A bare `firefly <noun>` with no verb prints that noun's help.

## Noun groups & verbs

Verbs are drawn from a fixed vocabulary so they're predictable across nouns:
`list`, `view`, `create`, `edit`, `delete` (CRUD), plus noun-specific verbs.

### Money / core
| Noun (aliases) | Verbs | Notes |
|---|---|---|
| `transaction` (`tx`, `txn`) | list, view, create, edit, delete, attach | `create --type withdrawal\|deposit\|transfer`; repeatable `--split`; `attach` adds files |
| `account` (`acct`) | list, view, create, edit, delete, transactions, balance | `--type asset\|expense\|revenue\|liability\|...` filter; `balance` = chart/overview |
| `budget` | list, view, create, edit, delete, limit, transactions | `limit set\|list\|delete` nested; available-budget under `budget available` |
| `category` (`cat`) | list, view, create, edit, delete, transactions | |
| `bill` (`subscription`) | list, view, create, edit, delete, transactions, rules | |
| `piggy` (`piggy-bank`) | list, view, create, edit, delete, events, fund | `fund add\|remove` adjusts saved amount |
| `tag` | list, view, create, edit, delete, transactions, stats | id-or-tag-name target; `stats` = client-side count+sum per type |
| `recurrence` (`recurring`) | list, view, create, edit, delete, trigger, transactions | |

### Automation
| Noun | Verbs | Notes |
|---|---|---|
| `rule` | list, view, create, edit, delete, test, trigger | |
| `rule-group` (`rgroup`) | list, view, create, edit, delete, rules, test, trigger | |
| `webhook` (`hook`) | list, view, create, edit, delete, messages, submit, trigger | `messages` drills into messages/attempts |

### Reference / admin
| Noun | Verbs | Notes |
|---|---|---|
| `currency` | list, view, create, edit, delete, enable, disable, primary, rate | `rate` = exchange-rates subgroup |
| `link-type` (`ltype`) | list, view, create, edit, delete | |
| `link` | list, view, create, delete | transaction-links between journals |
| `object-group` (`ogroup`) | list, view, edit, delete, bills, piggies | |
| `attachment` (`file`) | list, view, upload, download, delete | cross-cutting; also via `<noun> attach` |

### Insight / reporting
| Noun | Verbs | Notes |
|---|---|---|
| `insight` | expense, income, transfer, summary | `expense category\|budget\|tag\|asset\|bill\|...`; `summary` = summary/basic |
| `chart` | account, balance, budget, category | thin wrapper over `/chart/*` |
| `search` | transactions, accounts | |

### System / meta
| Command | Verbs | Notes |
|---|---|---|
| `auth` | login, logout, status, token, switch | PAT now (see `02`) |
| `config` | get, set, list | per-instance + global keys |
| `instance` | list, add, remove, default | manage multi-instance profiles |
| `api` | (raw) | escape hatch — `07` |
| `data` | export, bulk, destroy, purge | destroy/purge guarded |
| `user` | view, list | maps `/about/user`, `/users`; admin-only writes via `api` |
| `preference` (`pref`) | get, set, list | `/preferences` |
| `config-value` | get, set | `/configuration` (system config; admin) |
| `about` | — | server version/info |
| `cron` | run | `/cron/{cliToken}` trigger |
| `completion` | bash, zsh, fish | shell completion scripts |
| `alias` | set, list, delete | user-defined command aliases |
| `version` | — | CLI version |

## Global flags (available on all commands)

| Flag | Env | Meaning |
|---|---|---|
| `--instance <name>` | `FIREFLY_INSTANCE` | select profile (`03`); else default profile |
| `--json [fields]` | — | machine output (`05`) |
| `--jq <expr>` | — | filter JSON output with jq expression |
| `--template <tmpl>` | — | Go-template-style output |
| `--yes`, `-y` | — | skip confirmation prompts |
| `--no-color` | `NO_COLOR` | disable ANSI color |
| `--quiet`, `-q` | — | suppress non-essential output |
| `--verbose`, `-v` | `FIREFLY_DEBUG` | log HTTP requests to stderr |
| `--help`, `-h` | — | command help |

Paging/filter flags common to `list` verbs (`--limit`, `--page`, `--all`, `--start`, `--end`,
`--type`, `--query`) are defined once in `05-output.md` and reused.

## Naming conventions

- Nouns singular (`transaction`, not `transactions`); the `list` verb pluralizes conceptually.
- Verbs lowercase, from the fixed vocabulary; noun-specific verbs only when no CRUD verb fits.
- Aliases are short, collision-free, documented in each `06/*` spec.
- Targets accept the resource's natural key: numeric `id` everywhere, plus `code` for currency,
  tag-name for tag (the API itself keys these by code/tag).

## Interactive vs flag mode

Follows `gh`:
- **TTY + missing required input** → prompt interactively (selectors backed by autocomplete, see
  `09`).
- **Non-TTY (piped/CI) + missing required input** → error with the exact flag needed; never hang.
- All prompts have a flag equivalent so every command is fully scriptable.
- `--yes` forces non-interactive and accepts defaults/confirmations.
