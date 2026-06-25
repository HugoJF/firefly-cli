# `rule` & `rule-group` — Automation Rules

Rules apply triggers/actions to transactions; rule-groups order and batch rules. Two related
nouns kept separate (they are distinct API resources) but documented together.

Aliases: `rule-group` → `rgroup`.

## `rule`
| Verb | Purpose | API |
|---|---|---|
| `list` | list rules (`--currency` scopes) | `GET /rules`, `GET /currencies/{code}/rules` |
| `view <id>` | rule detail (triggers, actions) | `GET /rules/{id}` |
| `create` | create (`--title --rule-group --trigger --action --strict --active --stop-processing`; `--editor` for full trigger/action sets) | `POST /rules` |
| `edit <id>` | update | `PUT /rules/{id}` |
| `delete <id>` | delete (`--yes`) | `DELETE /rules/{id}` |
| `test <id>` | dry-run against transactions (`--start --end --accounts`) | `GET /rules/{id}/test` |
| `trigger <id>` | apply for real (`--start --end --accounts`) | `POST /rules/{id}/trigger` |

Rule triggers/actions are nested arrays — exposed via repeatable `--trigger key:value` /
`--action key:value` or `--editor` (YAML), same pattern as transaction splits (`transaction.md`).

## `rule-group`
| Verb | Purpose | API |
|---|---|---|
| `list` | list groups | `GET /rule-groups` |
| `view <id>` | group detail | `GET /rule-groups/{id}` |
| `create` | create (`--title --description --active --order`) | `POST /rule-groups` |
| `edit <id>` | update | `PUT /rule-groups/{id}` |
| `delete <id>` | delete (`--yes`) | `DELETE /rule-groups/{id}` |
| `rules <id>` | rules in the group | `GET /rule-groups/{id}/rules` |
| `test <id>` | dry-run all rules in group | `GET /rule-groups/{id}/test` |
| `trigger <id>` | apply all rules in group | `POST /rule-groups/{id}/trigger` |

## Table columns
rule list: `id`, `title`, `rule_group`, `active`, `strict`, `stop_processing`.
rule-group list: `id`, `title`, `active`, `order`.

## Examples
```sh
firefly rule test 12 --start -30d
firefly rule-group trigger 2 --start this-month
```
