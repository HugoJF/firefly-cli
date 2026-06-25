# `currency` — Currencies & Exchange Rates

Currency definitions, enable/disable, primary selection, and exchange rates (folded under
`currency rate`). Target is the currency **code** (e.g. `EUR`).

## Currency verbs
| Verb | Purpose | API |
|---|---|---|
| `list` | list currencies | `GET /currencies` |
| `view <code>` | currency detail | `GET /currencies/{code}` |
| `create` | create (`--code --name --symbol --decimal-places`) | `POST /currencies` |
| `edit <code>` | update | `PUT /currencies/{code}` |
| `delete <code>` | delete (`--yes`) | `DELETE /currencies/{code}` |
| `enable <code>` | enable | `POST /currencies/{code}/enable` |
| `disable <code>` | disable | `POST /currencies/{code}/disable` |
| `primary [code]` | show primary (no arg) / set primary | `GET /currencies/primary`, `POST /currencies/{code}/primary` |

## `currency rate` (exchange rates)
| Verb | Purpose | API |
|---|---|---|
| `rate list` | list rates (`--date` to scope) | `GET /exchange-rates`, `GET /exchange-rates/by-date/{date}` |
| `rate view <from> <to>` | rate for a pair (`--date`) | `GET /exchange-rates/by-currencies/{from}/{to}`, `GET /exchange-rates/{from}/{to}`, `GET /exchange-rates/{from}/{to}/{date}` |
| `rate set <from> <to>` | set a rate (`--rate --date`) | `POST /exchange-rates/{from}/{to}` |
| `rate edit <id>` | update a rate | `PUT /exchange-rates/{id}` |
| `rate delete <id>` | delete a rate (`--yes`) | `DELETE /exchange-rates/{id}` |

## Table columns
currency list: `code`, `name`, `symbol`, `decimal_places`, `enabled`, `primary`.
rate list: `id`, `from`, `to`, `date`, `rate`.

## Examples
```sh
firefly currency list
firefly currency primary EUR
firefly currency rate set USD EUR --rate 0.92 --date 2026-06-25
```
