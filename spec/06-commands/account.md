# `account` — Accounts

Asset, expense, revenue, liability, and other account types. Alias: `acct`.

## Synopsis
```
firefly account <verb> [target] [flags]
```

## Subcommands
| Verb | Purpose | Key flags | Interactive? |
|---|---|---|---|
| `list` | list accounts | `--type --query --currency --date --limit --page --all` | no |
| `view <id>` | account detail + current balance | `--json` | no |
| `create` | create account | `--name --type --currency --opening-balance --iban --account-number --role --notes` | yes |
| `edit <id>` | update account | same flags (changed only) | yes |
| `delete <id>` | delete account | `--yes` | confirm |
| `transactions <id>` | transactions for an account | `--type --start --end --limit --all` | no |
| `balance <id>` | balance/overview chart data | `--start --end` | no |

## Endpoint mapping
| Subcommand | API |
|---|---|
| list | `GET /accounts` (or `GET /currencies/{code}/accounts` with `--currency`) |
| view | `GET /accounts/{id}` |
| create | `POST /accounts` |
| edit | `PUT /accounts/{id}` |
| delete | `DELETE /accounts/{id}` |
| transactions | `GET /accounts/{id}/transactions` |
| balance | `GET /chart/account/overview` filtered to id (see `chart.md`) |
| (piggies) | `GET /accounts/{id}/piggy-banks` surfaced via `piggy list --account` |
| (attachments) | `GET /accounts/{id}/attachments` via `attachment list --account` |

## Flags (create/edit)
From `AccountStore` (`name, type, iban, bic, account_number, opening_balance,
opening_balance_date, virtual_balance, currency_id/currency_code, active, include_net_worth,
account_role, credit_card_type, monthly_payment_date, liability_type, liability_direction,
interest, interest_period, notes`).

| Flag | Type | Required | Notes |
|---|---|---|---|
| `--name` | string | yes | |
| `--type` | enum | yes | `asset\|expense\|revenue\|liability\|...`; choice prompt on TTY |
| `--currency` | string | no | code; default = instance primary currency |
| `--opening-balance` | string | no | with `--opening-balance-date` |
| `--iban` / `--bic` / `--account-number` | string | no | |
| `--role` | enum | cond. | asset accounts: `defaultAsset\|savingAsset\|...` |
| `--liability-type` / `--liability-direction` / `--interest` / `--interest-period` | — | cond. | liabilities only |
| `--active` | bool | no | default true |
| `--notes` | string | no | |

## Table columns (list)
`id`, `name`, `type`, `role`, `currency`, `current_balance`, `active`.

## Examples
```sh
firefly account list --type asset
firefly account create --name "Savings" --type asset --role savingAsset --currency EUR
firefly account transactions 12 --start this-month --json | jq '.data | length'
```
