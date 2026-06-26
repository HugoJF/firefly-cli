# firefly

[![CI](https://github.com/HugoJF/firefly-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/HugoJF/firefly-cli/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/HugoJF/firefly-cli)](https://github.com/HugoJF/firefly-cli/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [`gh`](https://cli.github.com/)-style command-line client for the
[Firefly III](https://www.firefly-iii.org/) personal-finance API. Capture transactions, run
reports, and manage one or more Firefly III servers from your terminal — readable tables by
default, clean JSON on request, and a raw `api` escape hatch for everything else.

```console
$ firefly tx list --limit 3
id    date        type        description        amount    source → destination     category
2103  2026-05-30  withdrawal  Coffee             -$4.50    Checking → Blue Bottle   Food
2102  2026-05-29  deposit     Salary            +$3200.00  ACME Inc → Checking       Income
2101  2026-05-28  transfer    Move to savings    $500.00   Checking → Savings
```

> [Firefly III](https://www.firefly-iii.org/) is a free, self-hosted personal-finance manager.
> `firefly` is an **independent client** for its REST API (v1) — not affiliated with or endorsed
> by the Firefly III project. Pinned to Firefly III **API v1** (developed against v6.x servers).

## Contents

- [Highlights](#highlights)
- [Install](#install)
- [Quickstart](#quickstart)
- [Examples](#examples)
- [Command overview](#command-overview)
- [Multi-instance](#multi-instance)
- [Output & scripting](#output--scripting)
- [Escape hatch: `firefly api`](#escape-hatch-firefly-api)
- [Configuration](#configuration)
- [Aliases](#aliases)
- [Shell completion](#shell-completion)
- [Development](#development)
- [License](#license)

## Highlights

- **Noun-verb commands** — `firefly tx create`, `firefly account list`, `firefly budget limit set`.
- **Multi-instance** — manage personal + self-hosted servers, switch with `--instance`.
- **Scriptable** — `--json` (with field projection) and `--template`; pipe to `jq`.
- **Raw escape hatch** — `firefly api <endpoint>` reaches any endpoint, modelled or not.
- **Self-contained binary** — compiled with Bun; no runtime to install for end users.
- **Safe by default** — mutations confirm interactively; destructive ops are guarded.

## Install

### Prebuilt binary (recommended)

Download the binary for your platform from the
[latest release](https://github.com/HugoJF/firefly-cli/releases/latest), or use the installer
(detects OS/arch, verifies the checksum, makes it executable):

```sh
curl -fsSL https://raw.githubusercontent.com/HugoJF/firefly-cli/main/install.sh | sh
```

Release assets are named per platform:

| Platform | Asset |
|---|---|
| Linux x64 | `firefly-linux-x64` |
| Linux arm64 | `firefly-linux-arm64` |
| macOS x64 | `firefly-darwin-x64` |
| macOS arm64 | `firefly-darwin-arm64` |
| Windows x64 | `firefly-windows-x64.exe` |

The binary is self-contained — **no Bun or Node runtime required** to run it.

### Build from source

Requires [Bun](https://bun.sh) (source builds only):

```sh
git clone https://github.com/HugoJF/firefly-cli
cd firefly-cli
bun install
bun run build      # produces ./dist/firefly
```

Optionally symlink it onto your `PATH` during development:

```sh
bun link           # exposes `firefly` globally (rebuild to refresh)
```

## Quickstart

```sh
# 1. Log in. Get a Personal Access Token in Firefly III:
#    Profile → OAuth → Personal Access Tokens → Create new token, then paste it.
firefly auth login            # prompts for base URL + PAT (masked)
firefly auth status           # verify the token works

# 2. Use it.
firefly account list
firefly tx create --type withdrawal --amount 12.50 \
  --description "Coffee" --source "Checking" --destination "Blue Bottle"
firefly insight expense category --start 2026-01-01 --end 2026-06-30
```

Non-interactive login (CI / scripts) reads the token from stdin:

```sh
firefly auth login --instance work --url https://ff.work.example --with-token < token.txt
# or fully ephemeral, no stored config:
FIREFLY_URL=https://ff.work.example FIREFLY_TOKEN=$TOKEN firefly account list
```

## Examples

> Output below uses illustrative data. Amounts render at the account's currency precision.

**List asset accounts**

```console
$ firefly account list --type asset
id  name      type   role          currency  current_balance  active
12  Checking  asset  defaultAsset  USD       4812.55          true
13  Savings   asset  savingAsset   USD       20150.00         true
14  Cash      asset  cashWallet    USD       60.00            true
```

**Create a transaction** (interactive pickers fill anything you omit on a TTY)

```sh
firefly tx create --type withdrawal --amount 23.90 \
  --description "Groceries" --source Checking --destination "Corner Market" --category Food
# ✓ Created transaction 2104 — Groceries
```

**Split a transaction across categories**

```sh
firefly tx create --type withdrawal --source Checking --destination "Big Box" \
  --split 'amount=40,description=Cleaning supplies,category=Home' \
  --split 'amount=18.50,description=Snacks,category=Food'
```

**Aggregate stats for a tag** (count + sum per type — great for credit-card statement tags)

```console
$ firefly tag stats "Card statement 2026-06"
type        count  sum      currency
transfer    1      2686.07  BRL
withdrawal  41     2686.07  BRL
```

**Spending insight by category, as JSON for a dashboard**

```console
$ firefly insight expense category --start 2026-01-01 --end 2026-06-30 --json
[
  { "id": "15", "name": "Food",      "difference_float": -642.18, "currency_code": "USD" },
  { "id": "21", "name": "Transport", "difference_float": -188.40, "currency_code": "USD" }
]
```

**Set a monthly budget limit**

```sh
firefly budget limit set 3 --amount 400 --start 2026-06-01 --end 2026-06-30
```

**Find transactions with the search query language**

`search transactions` (and `tx list --query`) accept Firefly III's search DSL. Common operators
— combine with spaces (AND):

```text
has_no_category:true        category_is:"Food"            budget_is:"Bills"
has_any_tag:true            tag_is:"Trip"                 notes_contain:"text"
amount_more:100             amount_less:50                amount_is:42
description_contains:"Eden Beer"                          description_is:"Exact"
date_after:2026-01-01       date_before:2026-12-31        date_on:2026-06-01
source_account_is:"Checking"            destination_account_is:"Estrelas Motel"
type:withdrawal             currency_is:EUR
```

```sh
firefly search transactions 'amount_more:1000 date_after:2026-01-01'
firefly tx list --query 'has_no_category:true' --all
```

**Bulk-categorize everything matching a query** (batched, with a progress + summary line)

```sh
firefly tx categorize 'has_no_category:true description_contains:"Eden Beer"' "Nights out"
# ✓ Updated 37 transactions

# or apply any field edit to a selection:
firefly tx edit --where 'category_is:"Misc"' --category "Groceries" --yes
echo "2103 2104 2105" | firefly tx edit --stdin --tag "review" --yes
```

**Group-by roll-ups without leaving the CLI**

```console
$ firefly tx list --start 2026-01-01 --end 2026-06-30 --all --group-by payee --sum
payee            count  sum
Estrelas Motel   12     1840.00
Eden Beer        9      612.50

$ firefly account spend "Estrelas Motel" --by year
year  count  sum       avg
2025  41     6020.00   146.83
2026  12     1840.00   153.33
```

## Command overview

Noun-verb throughout: `firefly <noun> <verb> [target] [flags]`. Verbs are a fixed vocabulary —
`list view create edit delete` — plus noun-specific verbs. Run `firefly <noun> --help` for exact
verbs and flags. Common aliases in parentheses.

### Money / core
| Command | Verbs |
|---|---|
| `transaction` (`tx`) | list, view, create, edit, delete, categorize, attach, events — `list --query`/`--group-by`/`--account-name`, bulk `edit` (multiple ids, `--where`, `--stdin`, `--journal`), repeatable `--split`, `--editor` |
| `account` (`acct`) | list, view, create, edit, delete, transactions, balance, spend |
| `budget` | list, view, create, edit, delete + nested `limit`, `available` |
| `category` (`cat`) | list, view, create, edit, delete, transactions |
| `bill` (`subscription`) | list, view, create, edit, delete, transactions, rules |
| `piggy` (`piggy-bank`) | list, view, create, edit, delete, events, fund |
| `tag` | list, view, create, edit, delete, transactions, **stats** |
| `recurrence` (`recurring`) | list, view, create, edit, delete, trigger, transactions |

### Automation
| Command | Verbs |
|---|---|
| `rule` | list, view, create, edit, delete, test, trigger |
| `rule-group` (`rgroup`) | list, view, create, edit, delete, rules, test, trigger |
| `webhook` (`hook`) | list, view, create, edit, delete, messages, submit, trigger |

### Reference
| Command | Verbs |
|---|---|
| `currency` | list, view, create, edit, delete, enable, disable, primary, `rate` (exchange rates) |
| `link-type` (`ltype`) · `link` | manage link types and links between transactions |
| `object-group` (`ogroup`) | list, view, edit, delete, bills, piggies |
| `attachment` (`file`) | list, view, upload, download, delete |

### Reporting
| Command | Verbs |
|---|---|
| `insight` | `expense` / `income` / `transfer` grouped by category, budget, tag, …; `summary` |
| `chart` | account, balance, budget, category |
| `search` | transactions, accounts |

### System / meta
| Command | Verbs |
|---|---|
| `auth` | login, logout, status, token, switch |
| `instance` | list, add, remove, default |
| `config` | get, set, list (CLI settings) |
| `api` | raw API escape hatch ([below](#escape-hatch-firefly-api)) |
| `data` | export, bulk, destroy, purge *(destroy/purge guarded)* |
| `user` · `preference` (`pref`) · `config-value` | server users / preferences / admin config |
| `about` · `cron` · `completion` · `alias` · `version` | server info, jobs, completion, aliases, version |

## Multi-instance

An *instance* is one Firefly III server plus its credentials, identified by a short name.

```sh
firefly instance add                  # register a new instance (same as auth login)
firefly instance list                 # name, URL, auth method, default marker
firefly instance default work         # set the default instance
firefly account list --instance work  # one-off override
```

Resolution precedence (highest first):

1. `FIREFLY_TOKEN` + `FIREFLY_URL` environment (ephemeral — great for CI)
2. `--instance <name>` flag
3. `FIREFLY_INSTANCE` environment
4. Default instance from config

## Output & scripting

Human-readable tables on a TTY, plain TSV when piped. For machine output:

```sh
firefly account list --json                            # full JSON
firefly account list --json id,attributes.name         # project fields (dotted paths reach nested)
firefly tx list --template '{{.id}} {{.description}}'   # Go-template-style
```

Firefly wraps resources in a JSON:API envelope, so most fields live under `attributes` — use a
dotted path to project them, or reach for `jq` (below) when you want to rename/reshape.

`--jq` is **not** built in — pipe `--json` to an external [`jq`](https://jqlang.github.io/jq/):

```sh
# net spending per category this year
firefly insight expense category --start 2026-01-01 --end 2026-12-31 --json \
  | jq -r '.[] | "\(.name): \(.difference_float)"'

# total of all asset balances
firefly account list --type asset --json \
  | jq '[.[].attributes.current_balance | tonumber] | add'
```

Exit codes are meaningful (0 ok, 2 usage, 3 not-found, 4 auth, 5 validation, …) so scripts can
branch on failures.

## Escape hatch: `firefly api`

Any endpoint not modelled as a command (and any future endpoint) is reachable raw, modelled on
`gh api`. Auth, base URL, and instance resolution are identical to modelled commands.

```sh
firefly api /v1/accounts/123                       # GET
firefly api currencies --paginate                  # follow pagination
firefly api transactions -X POST \
  -F 'transactions[][type]=withdrawal' \
  -F 'transactions[][amount]=12.50' \
  -F 'transactions[][description]=Coffee' \
  -F 'transactions[][source_id]=1' \
  -F 'transactions[][destination_name]=Blue Bottle' \
  -F 'transactions[][date]=2026-06-25'
```

## Configuration

- Location (XDG-respecting): `~/.config/firefly/config.yml` on Linux,
  `~/Library/Application Support/firefly/` on macOS, `%AppData%\firefly\` on Windows.
- Tokens are stored **separately** in `tokens.json` with `0600` permissions — never in
  `config.yml`.
- `FIREFLY_CONFIG_DIR` overrides the config directory (handy for tests / sandboxes).

```sh
firefly config list                        # effective config, tokens redacted
firefly config set settings.output json    # default to JSON output
firefly config set settings.pager never    # disable the pager
```

## Aliases

Define your own command shortcuts (stored in config, expanded before dispatch):

```sh
firefly alias set co "transaction create"
firefly alias set bal "account list --type asset"
firefly co --type withdrawal --amount 5 --description Snack --source Checking --destination Kiosk
```

## Shell completion

```sh
firefly completion bash >> ~/.bashrc          # or zsh / fish
firefly completion zsh  > ~/.zfunc/_firefly
```

Completion includes dynamic values (account names, categories, currencies, tags) pulled from the
active instance.

## Development

Bun scripts (see [`package.json`](package.json) for the full list):

```sh
bun install
bun run dev              # run from source
bun test                 # run the test suite
bun run lint             # Biome lint/format check
bun run coverage-gate    # verify every API path is modelled or explicitly api-only
bun run build            # compile ./dist/firefly
bun run build:all        # cross-compile all release targets
```

Adding a command follows a fixed convention — see
[`docs/COMMAND_CONVENTION.md`](docs/COMMAND_CONVENTION.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).
The full design lives in [`spec/`](spec/) — the source of truth; code follows docs.

## License

[MIT](LICENSE). `firefly` is an independent client; Firefly III's own AGPL license does not
attach to it.
