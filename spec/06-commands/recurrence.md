# `recurrence` — Recurring Transactions

Templates that auto-create transactions on a schedule. Alias: `recurring`.

## Subcommands
| Verb | Purpose | API |
|---|---|---|
| `list` | list recurrences | `GET /recurrences` (or `GET /currencies/{code}/recurrences` with `--currency`) |
| `view <id>` | detail (schedule, template) | `GET /recurrences/{id}` |
| `create` | create (`--type --title --amount --source --destination --first-date --repeat-freq --repetitions --category --budget --notes`) | `POST /recurrences` |
| `edit <id>` | update | `PUT /recurrences/{id}` |
| `delete <id>` | delete (`--yes`) | `DELETE /recurrences/{id}` |
| `trigger <id>` | fire now | `POST /recurrences/{id}/trigger` |
| `transactions <id>` | transactions it created | `GET /recurrences/{id}/transactions` |

Reference pickers for `--source`/`--destination`/`--category`/`--budget` as in `transaction.md`.

## Table columns
`id`, `title`, `type`, `amount`, `repeat_freq`, `first_date`, `latest_date`, `active`.

## Examples
```sh
firefly recurrence create --type withdrawal --title Rent --amount 1200 \
  --source Checking --destination Landlord --first-date 2026-07-01 --repeat-freq monthly
firefly recurrence trigger 3
```
