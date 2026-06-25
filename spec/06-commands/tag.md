# `tag` — Tags

Cross-cutting labels on transactions. Target accepts tag id **or** tag name (the API keys these
by tag string).

## Subcommands
| Verb | Purpose | API |
|---|---|---|
| `list` | list tags | `GET /tags` |
| `view <tag>` | tag detail + sums | `GET /tags/{tag}` |
| `create` | create (`--tag --date --description --latitude --longitude --zoom-level`) | `POST /tags` |
| `edit <tag>` | update | `PUT /tags/{tag}` |
| `delete <tag>` | delete (`--yes`) | `DELETE /tags/{tag}` |
| `transactions <tag>` | transactions with the tag (`--start --end --type`) | `GET /tags/{tag}/transactions` |
| `stats <tag>` | aggregate count + sum per type (`--start --end`) | `GET /tags/{tag}/transactions` (client-side aggregation) |

`view` shows the server's `sums` when populated; `stats` always works by paginating the tag's
transactions and aggregating client-side (count and summed amount per transaction type),
formatted to the currency's precision. Use `stats` when `sums` is null (older Firefly versions)
or when you want a per-type breakdown.

Attachments via `attachment list --tag <tag>` → `GET /tags/{tag}/attachments`.

## Table columns
`id`, `tag`, `date`, `description`.

## Examples
```sh
firefly tag create --tag vacation-2026
firefly tag transactions vacation-2026 --json | jq '[.data[].attributes.transactions[].amount|tonumber]|add'
```
