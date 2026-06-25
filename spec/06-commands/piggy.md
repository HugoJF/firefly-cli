# `piggy` — Piggy Banks

Savings goals attached to an asset account. Alias: `piggy-bank`.

## Subcommands
| Verb | Purpose | API |
|---|---|---|
| `list` | list piggy banks (`--account` to scope) | `GET /piggy-banks`, `GET /accounts/{id}/piggy-banks` |
| `view <id>` | detail (target, current, percentage) | `GET /piggy-banks/{id}` |
| `create` | create (`--name --account --target-amount --current-amount --start-date --target-date --notes`) | `POST /piggy-banks` |
| `edit <id>` | update | `PUT /piggy-banks/{id}` |
| `delete <id>` | delete (`--yes`) | `DELETE /piggy-banks/{id}` |
| `events <id>` | add/remove history | `GET /piggy-banks/{id}/events` |
| `fund add <id> --amount` | add money to the goal | `PUT /piggy-banks/{id}` (adjust `current_amount`) |
| `fund remove <id> --amount` | remove money | `PUT /piggy-banks/{id}` |

`fund` is sugar over `edit`'s `current_amount` (the API has no dedicated add/remove endpoint;
this is a deliberate ergonomic divergence). Attachments via `attachment list --piggy <id>`.

## Table columns
`id`, `name`, `account`, `current_amount`/`target_amount`, `percentage`, `target_date`.

## Examples
```sh
firefly piggy create --name "New Laptop" --account Savings --target-amount 2000
firefly piggy fund add 4 --amount 150
firefly piggy events 4
```
