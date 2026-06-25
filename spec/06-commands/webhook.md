# `webhook` — Webhooks

Outbound HTTP notifications on Firefly events, plus delivery inspection. Alias: `hook`.

## Subcommands
| Verb | Purpose | API |
|---|---|---|
| `list` | list webhooks | `GET /webhooks` |
| `view <id>` | webhook detail | `GET /webhooks/{id}` |
| `create` | create (`--title --url --trigger --response --delivery --active`) | `POST /webhooks` |
| `edit <id>` | update | `PUT /webhooks/{id}` |
| `delete <id>` | delete (`--yes`) | `DELETE /webhooks/{id}` |
| `submit <id>` | force-submit pending messages | `POST /webhooks/{id}/submit` |
| `trigger <id> <transactionId>` | re-fire for a transaction | `POST /webhooks/{id}/trigger-transaction/{transactionId}` |
| `messages <id>` | list delivery messages | `GET /webhooks/{id}/messages` |
| `messages view <id> <messageId>` | one message | `GET /webhooks/{id}/messages/{messageId}` |
| `messages attempts <id> <messageId>` | delivery attempts | `GET /webhooks/{id}/messages/{messageId}/attempts` |
| `messages attempts view <id> <messageId> <attemptId>` | one attempt | `GET /.../attempts/{attemptId}` |

`--trigger`/`--response`/`--delivery` map the webhook enum fields.

## Table columns
webhook list: `id`, `title`, `url`, `trigger`, `response`, `delivery`, `active`.
messages: `id`, `sent`, `errored`, `created_at`.

## Examples
```sh
firefly webhook create --title "Notify" --url https://hook.example/ff \
  --trigger STORE_TRANSACTION --response TRANSACTIONS --delivery JSON
firefly webhook messages 1
```
