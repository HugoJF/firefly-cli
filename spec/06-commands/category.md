# `category` — Categories

Free-form spending/earning categories. Alias: `cat`.

## Subcommands
| Verb | Purpose | API |
|---|---|---|
| `list` | list categories | `GET /categories` |
| `view <id>` | detail incl. spent/earned | `GET /categories/{id}` |
| `create` | create (`--name --notes`) | `POST /categories` |
| `edit <id>` | update | `PUT /categories/{id}` |
| `delete <id>` | delete (`--yes`) | `DELETE /categories/{id}` |
| `transactions <id>` | category's transactions (`--start --end --type`) | `GET /categories/{id}/transactions` |

Attachments via `attachment list --category <id>` → `GET /categories/{id}/attachments`.

## Table columns
`id`, `name`, `spent`, `earned` (current period when the API returns it).

## Examples
```sh
firefly cat create --name Groceries
firefly cat transactions 7 --start -90d --json | jq '[.data[].attributes.transactions[].amount|tonumber]|add'
```
