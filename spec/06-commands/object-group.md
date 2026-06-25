# `object-group` — Object Groups

Groupings for piggy banks and bills (no create endpoint — groups are created implicitly by
assigning an `object_group_title` on a piggy/bill; this command manages existing ones).
Alias: `ogroup`.

## Subcommands
| Verb | Purpose | API |
|---|---|---|
| `list` | list object groups | `GET /object-groups` |
| `view <id>` | detail | `GET /object-groups/{id}` |
| `edit <id>` | rename / reorder (`--title --order`) | `PUT /object-groups/{id}` |
| `delete <id>` | delete (`--yes`) | `DELETE /object-groups/{id}` |
| `bills <id>` | bills in the group | `GET /object-groups/{id}/bills` |
| `piggies <id>` | piggy banks in the group | `GET /object-groups/{id}/piggy-banks` |

No `create`: there is no `POST /object-groups`. Help text explains groups are created by setting
`object_group_title` on a piggy/bill (`piggy create --object-group ...`).

## Table columns
`id`, `title`, `order`.

## Examples
```sh
firefly object-group list
firefly object-group piggies 2
```
