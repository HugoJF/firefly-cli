# `link` & `link-type` — Transaction Links

`link-type` defines relationship kinds (e.g. "refund", "related"); `link` connects two
transaction journals. Distinct API resources. Alias: `link-type` → `ltype`.

## `link-type`
| Verb | Purpose | API |
|---|---|---|
| `list` | list link types | `GET /link-types` |
| `view <id>` | detail | `GET /link-types/{id}` |
| `create` | create (`--name --inward --outward`) | `POST /link-types` |
| `edit <id>` | update | `PUT /link-types/{id}` |
| `delete <id>` | delete (`--yes`) | `DELETE /link-types/{id}` |
| `transactions <id>` | journals linked via this type | `GET /link-types/{id}/transactions` |

## `link`
| Verb | Purpose | API |
|---|---|---|
| `list` | list links (`--journal <id>` to scope) | `GET /transaction-links`, `GET /transaction-journals/{id}/links` |
| `view <id>` | link detail | `GET /transaction-links/{id}` |
| `create` | connect two journals (`--type --inward <journalId> --outward <journalId> --notes`) | `POST /transaction-links` |
| `edit <id>` | update | `PUT /transaction-links/{id}` |
| `delete <id>` | delete (`--yes`) | `DELETE /transaction-links/{id}` |

## Table columns
link-type list: `id`, `name`, `inward`, `outward`, `editable`.
link list: `id`, `link_type`, `inward_id` → `outward_id`.

## Examples
```sh
firefly link-type list
firefly link create --type 1 --inward 880 --outward 881 --notes "refund of"
```
