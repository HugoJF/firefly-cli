# `insight`, `chart`, `search` — Reporting & Discovery

Read-only analytics. Three nouns documented together.

## `insight`
Wraps the 24 `/insight/*` endpoints + `/summary/basic`. Shape: `insight <flow> <by>`.

| Command | API |
|---|---|
| `insight summary` | `GET /summary/basic` (net worth, balances, spent/earned) |
| `insight expense <by>` | `GET /insight/expense/{by}` |
| `insight income <by>` | `GET /insight/income/{by}` |
| `insight transfer <by>` | `GET /insight/transfer/{by}` |

`<by>` values per flow (from the spec):
- expense: `asset bill budget category expense tag total no-bill no-budget no-category no-tag`
- income: `asset category revenue tag total no-category no-tag`
- transfer: `asset category tag total no-category no-tag`

All take `--start`/`--end` (required by the API) and optional id filters
(`--accounts --categories --budgets --tags`) passed as the endpoints' array params.

```sh
firefly insight expense category --start 2026-01-01 --end 2026-06-30 --json | jq .
firefly insight summary --start this-month
```

## `chart`
Thin wrapper over `/chart/*` (raw chart data, mainly for `--json` consumers/dashboards).

| Command | API |
|---|---|
| `chart account` | `GET /chart/account/overview` |
| `chart balance` | `GET /chart/balance/balance` |
| `chart budget` | `GET /chart/budget/overview` |
| `chart category` | `GET /chart/category/overview` |

All take `--start`/`--end`. Default render is a compact table; full series via `--json`.

## `search`
| Command | API |
|---|---|
| `search transactions <query>` | `GET /search/transactions` (`--query` syntax per Firefly search) |
| `search accounts <query>` | `GET /search/accounts` (`--field --type`) |

```sh
firefly search transactions "amount_more:100 category_is:Food" --limit 20
firefly search accounts "Savings" --type asset
```

## Table columns
insight: `key`/`name`, `amount`, `currency`. search: same columns as the underlying noun's list.
