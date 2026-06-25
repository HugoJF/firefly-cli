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
| `list` | list transactions | `--type --start --end --account --category --budget --tag --limit --page --all` | no |
| `view <id>` | show one group + its splits | `--json` | no |
| `create` | create a transaction | `--type --amount --description --source --destination --date --category --budget --tag --split --editor` | yes |
| `edit <id>` | update a transaction | same as create (changed fields only) `--editor` | yes |
| `delete <id>` | delete a transaction | `--yes` | confirm |
| `attach <id> <file>` | attach a file | — | no |
| `events <id>` | piggy-bank events caused by this txn | — | no |

## Endpoint mapping
| Subcommand | API |
|---|---|
| list | `GET /transactions` (+ scoped `GET /accounts/{id}/transactions`, `/categories/{id}/transactions`, `/budgets/{id}/transactions`, `/tags/{tag}/transactions`, `/currencies/{code}/transactions` when filtered) |
| view | `GET /transactions/{id}` (or `GET /transaction-journals/{id}` with `--journal`) |
| create | `POST /transactions` |
| edit | `PUT /transactions/{id}` |
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

firefly tx create --editor          # multi-split via YAML
firefly tx delete 4821 --yes
```

## Notes
- `view`/`delete --journal` operate on a single split journal id vs the whole group id.
- Validation errors (422) surface per-field (`05`).
