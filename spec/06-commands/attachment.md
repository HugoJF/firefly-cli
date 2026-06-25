# `attachment` — Attachments

Files attached to transactions, accounts, bills, budgets, categories, piggy banks, tags.
Cross-cutting: also reachable as `<noun> attach`. Alias: `file`.

Attachment lifecycle in Firefly is two-step: create the metadata record (`POST /attachments`
with `attachable_type` + `attachable_id`), then upload bytes (`POST /attachments/{id}/upload`).
The CLI's `upload`/`<noun> attach` does both in one command.

## Subcommands
| Verb | Purpose | API |
|---|---|---|
| `list` | list attachments, scoped by owner flag | `GET /attachments`; scoped: `GET /{owner}/{id}/attachments` |
| `view <id>` | metadata detail | `GET /attachments/{id}` |
| `upload <file>` | create + upload, attach to owner (`--transaction\|--account\|--bill\|--budget\|--category\|--piggy\|--tag <id>` + `--title --notes`) | `POST /attachments` then `POST /attachments/{id}/upload` |
| `edit <id>` | update metadata (`--title --notes`) | `PUT /attachments/{id}` |
| `download <id>` | download bytes (`--output <path>`, default = filename; `-` = stdout) | `GET /attachments/{id}/download` |
| `delete <id>` | delete (`--yes`) | `DELETE /attachments/{id}` |

Scoped `list` owner flags map to: `/accounts/{id}/attachments`, `/bills/{id}/attachments`,
`/budgets/{id}/attachments`, `/categories/{id}/attachments`, `/piggy-banks/{id}/attachments`,
`/tags/{tag}/attachments`, `/transactions/{id}/attachments`.

## Table columns
`id`, `filename`, `attachable_type`, `attachable_id`, `size`, `title`.

## Examples
```sh
firefly attachment upload receipt.pdf --transaction 4821 --title "Coffee receipt"
firefly tx attach 4821 receipt.pdf                 # equivalent sugar
firefly attachment download 90 --output ./receipt.pdf
```
