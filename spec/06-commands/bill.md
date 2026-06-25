# `bill` — Bills (Subscriptions)

Recurring expected payments. Alias: `subscription`.

## Subcommands
| Verb | Purpose | API |
|---|---|---|
| `list` | list bills | `GET /bills` (or `GET /currencies/{code}/bills` with `--currency`) |
| `view <id>` | bill detail (next expected, paid dates) | `GET /bills/{id}` |
| `create` | create (`--name --amount-min --amount-max --date --repeat-freq --skip --currency --notes`) | `POST /bills` |
| `edit <id>` | update | `PUT /bills/{id}` |
| `delete <id>` | delete (`--yes`) | `DELETE /bills/{id}` |
| `transactions <id>` | transactions matched to the bill | `GET /bills/{id}/transactions` |
| `rules <id>` | rules that set this bill | `GET /bills/{id}/rules` |

Attachments via `attachment list --bill <id>` → `GET /bills/{id}/attachments`.

## Table columns
`id`, `name`, `amount_min`–`amount_max`, `repeat_freq`, `next_expected_match`, `active`, `currency`.

## Examples
```sh
firefly bill create --name Netflix --amount-min 15 --amount-max 16 --repeat-freq monthly --date 2026-06-01
firefly bill transactions 5
```
