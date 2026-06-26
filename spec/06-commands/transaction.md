# `transaction` — Transactions

Flagship command. Firefly's core object. A "transaction" is a group of one or more **splits**;
each split has a type (`withdrawal` | `deposit` | `transfer`), amount, source, destination, and
optional category/budget/tags. We model the group, not the raw split rows.

Aliases: `tx`, `txn`.

## Synopsis
```
firefly transaction <verb> [target] [flags]
```

## Subcommands
| Verb | Purpose | Key flags | Interactive? |
|---|---|---|---|
| `list` | list transactions | `--query --type --start --end --account --account-name --category --budget --tag --group-by --sum --count --limit --page --all` | no |
| `view <id>` | show one group + its splits | `--json` | no |
| `create` | create a transaction | `--type --amount --description --source --destination --date --category --budget --tag --split --editor` | yes |
| `edit [ids...]` | update one or many transactions | same as create (changed fields only), `--editor`, `--journal`, `--where <query>`, `--stdin`, `--concurrency` | yes (single) / confirm (bulk) |
| `categorize <query> <category>` | bulk-set a category on every match of a query | `--concurrency` | confirm |
| `delete <id>` | delete a transaction | `--yes` | confirm |
| `attach <id> <file>` | attach a file | — | no |
| `events <id>` | piggy-bank events caused by this txn | — | no |

### Discovery, selection & aggregation
- **`list --query <dsl>`** routes to `GET /search/transactions`, so the search DSL is reachable
  from `list` (not a separate "secret language"). `--help` prints the operator cheatsheet.
- **`list --account-name "<name>"`** resolves the name → id via `GET /search/accounts` (an extra
  hop the user would otherwise do by hand), then scopes as `--account` does.
- **`list --group-by category|account|payee|month|day-of-week [--sum] [--count]`** rolls the
  fetched rows up **client-side** into an aggregate table (the API only offers fixed insight
  pivots). `payee` = the non-asset side of each split.
- A `--all` with no server-side filter prints a one-line stderr tip pointing at `search`.

### Bulk edit (selection × one partial edit)
`edit` takes a target set from exactly one of: explicit `[ids...]`, `--where <query>` (resolved via
`GET /search/transactions`), or `--stdin` (whitespace/newline-separated ids). The changed-field
flags build a single partial split applied to every target via batched PUTs (`--concurrency`,
default 8), printing progress and a final `N updated, M failed` line (non-zero exit on any
failure). `--editor` stays single-target only. `categorize` is the focused shortcut for the most
common case (`--where <query> --category <cat>`).

For a *field-equality* bulk update on the server, see `data bulk` (`meta.md`) — but it cannot
select by the search DSL.

## Endpoint mapping
| Subcommand | API |
|---|---|
| list | `GET /transactions` (+ scoped `GET /accounts/{id}/transactions`, `/categories/{id}/transactions`, `/budgets/{id}/transactions`, `/tags/{tag}/transactions`, `/currencies/{code}/transactions` when filtered; `GET /search/transactions` with `--query`) |
| view | `GET /transactions/{id}` (or `GET /transaction-journals/{id}` with `--journal`) |
| create | `POST /transactions` |
| edit | `PUT /transactions/{id}` per target (bulk: one PUT each, batched). `--journal` resolves the group via `GET /transaction-journals/{id}` then PUTs the group with the split keyed by `transaction_journal_id`. `--where` selects via `GET /search/transactions` |
| categorize | `GET /search/transactions` then a PUT per match |
| delete | `DELETE /transactions/{id}` (or `DELETE /transaction-journals/{id}` with `--journal`) |
| attach | `POST /attachments` then `POST /attachments/{id}/upload` (see `attachment.md`) |
| events | `GET /transactions/{id}/piggy-bank-events` |

## Flags (create/edit)
Backed by `TransactionSplit` fields (`type, date, amount, description, source_id/source_name,
destination_id/destination_name, category_id/category_name, budget_id/budget_name,
foreign_amount, foreign_currency_code, notes, tags, ...`).

| Flag | Type | Required | Notes |
|---|---|---|---|
| `--type` | enum | yes (create) | `withdrawal\|deposit\|transfer`; choice prompt if omitted on TTY |
| `--amount` | string | yes | decimal; validated |
| `--description` | string | yes | |
| `--source` | string | cond. | account id or name; picker via `/autocomplete/accounts` (`09`) |
| `--destination` | string | cond. | account id or name; picker |
| `--date` | date | no | default today; accepts relative (`05`) |
| `--category` | string | no | id or name; picker |
| `--budget` | string | no | id or name; picker (withdrawals) |
| `--tag` | string[] | no | repeatable |
| `--foreign-amount` / `--foreign-currency` | string | no | foreign-currency leg |
| `--notes` | string | no | |
| `--split` | string[] | no | repeatable; each `--split key=val,key=val` adds another split row |
| `--editor` | bool | no | open `$EDITOR` with a YAML body for multi-split (`09`) |

Required source/destination depend on `--type`: withdrawal needs source asset + destination
expense; deposit the reverse; transfer two asset accounts. The CLI infers/prompts the missing
side based on `--type`.

## Multi-split model (key divergence)
The API takes `transactions: [ {split}, {split} ]`. We expose this as:
- single split → top-level flags (the 90% case);
- multiple splits → repeated `--split` flags **or** `--editor` (YAML list). The CLI assembles the
  `transactions[]` array. Users never write the array index syntax (that's `firefly api`, `07`).

## Table columns (list)
`id`, `date`, `type`, `description`, `amount` (signed + currency symbol), `source → destination`,
`category`. Full fidelity via `--json`.

## Examples
```sh
firefly tx create --type withdrawal --amount 12.50 --description Coffee \
  --source Checking --destination "Coffee Shop" --category Food

firefly tx list --type withdrawal --start -30d --json id,description,amount | jq .
firefly tx list --query 'has_no_category:true' --all
firefly tx list --start 2026-01-01 --end 2026-06-30 --all --group-by payee --sum

firefly tx categorize 'description_contains:"Eden Beer"' "Nights out"
firefly tx edit 2103 2104 2105 --category Groceries --yes
firefly tx edit --where 'category_is:"Misc"' --tag review --yes
firefly tx edit 9 --journal --category Food      # edit one split in a multi-split group

firefly tx create --editor          # multi-split via YAML
firefly tx delete 4821 --yes
```

## Notes
- `view`/`delete --journal` operate on a single split journal id vs the whole group id.
  `edit --journal` does too: it PUTs the parent group with the split keyed by its
  `transaction_journal_id`, so per-split category edits in multi-split groups are possible.
- Bulk `edit`/`categorize` require `--yes` (or a TTY confirm) since they touch many rows.
- Validation errors (422) surface per-field (`05`).
