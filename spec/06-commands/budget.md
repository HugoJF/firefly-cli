# `budget` — Budgets

Budgets, their periodic **limits**, and **available-budget** envelopes. Limits and
available-budgets fold under `budget` rather than becoming top-level nouns.

## Subcommands
| Verb | Purpose | API |
|---|---|---|
| `list` | list budgets | `GET /budgets` |
| `view <id>` | budget detail | `GET /budgets/{id}` |
| `create` | create budget (`--name --auto-budget-* --notes`) | `POST /budgets` |
| `edit <id>` | update budget | `PUT /budgets/{id}` |
| `delete <id>` | delete budget (`--yes`) | `DELETE /budgets/{id}` |
| `transactions <id>` | budget's transactions; `--none` for unbudgeted | `GET /budgets/{id}/transactions`, `GET /budgets/transactions-without-budget` |
| `limit list [id]` | list limits (all, or for one budget) | `GET /budgets/{id}/limits`, `GET /budget-limits`, `GET /currencies/{code}/budget-limits` (`--currency`) |
| `limit set <id>` | set a limit (`--amount --start --end --currency`) | `POST /budgets/{id}/limits` |
| `limit view <id> <limitId>` | limit detail | `GET /budgets/{id}/limits/{limitId}` |
| `limit edit <id> <limitId>` | update limit | `PUT /budgets/{id}/limits/{limitId}` |
| `limit delete <id> <limitId>` | delete limit (`--yes`) | `DELETE /budgets/{id}/limits/{limitId}` |
| `limit transactions <id> <limitId>` | txns in a limit period | `GET /budgets/{id}/limits/{limitId}/transactions` |
| `available list` | available-budget envelopes | `GET /available-budgets`, `GET /currencies/{code}/available-budgets` |
| `available view <id>` | available-budget detail | `GET /available-budgets/{id}` |

## Table columns
budget list: `id`, `name`, `active`, `auto_budget_type`, `spent` (current period).
limit list: `id`, `budget`, `start`, `end`, `amount`, `spent`, `currency`.

## Examples
```sh
firefly budget list
firefly budget limit set 3 --amount 400 --start 2026-06-01 --end 2026-06-30
firefly budget transactions --none --start this-month   # unbudgeted spending
```
