# 08 — Coverage Matrix

Maps **every** Firefly III API v1 path (from `reference/firefly-iii-v6.6.2-v1.yaml`) to the
command/flag that covers it, or marks it **api-only** (reachable solely via `firefly api`).

**Status legend:** `planned` (row exists, command not yet specced) · `specced` (covered by a
`06/*` doc or cross-cutting spec) · `api-only` (intentionally not modelled; escape hatch).

The verification gate (see plan): no path may remain `planned`; every path is `specced` or a
deliberate `api-only`.

| Path | Methods | Command | Status |
|---|---|---|---|
| `/about` | GET | `about` | specced |
| `/about/user` | GET | `user view` | specced |
| `/accounts` | GET, POST | `account list` / `account create` | specced |
| `/accounts/{id}` | GET, PUT, DELETE | `account view/edit/delete` | specced |
| `/accounts/{id}/attachments` | GET | `account ... ` → `attachment list --account` | specced |
| `/accounts/{id}/piggy-banks` | GET | `piggy list --account` | specced |
| `/accounts/{id}/transactions` | GET | `account transactions` | specced |
| `/attachments` | GET, POST | `attachment list/create` | specced |
| `/attachments/{id}` | GET, PUT, DELETE | `attachment view/edit/delete` | specced |
| `/attachments/{id}/download` | GET | `attachment download` | specced |
| `/attachments/{id}/upload` | POST | `attachment upload` | specced |
| `/autocomplete/*` (17 paths) | GET | completion + interactive selectors (`09`) | specced |
| `/available-budgets` | GET | `budget available list` | specced |
| `/available-budgets/{id}` | GET | `budget available view` | specced |
| `/batch/finish` | POST | api-only | api-only |
| `/bills` | GET, POST | `bill list/create` | specced |
| `/bills/{id}` | GET, PUT, DELETE | `bill view/edit/delete` | specced |
| `/bills/{id}/attachments` | GET | `attachment list --bill` | specced |
| `/bills/{id}/rules` | GET | `bill rules` | specced |
| `/bills/{id}/transactions` | GET | `bill transactions` | specced |
| `/budget-limits` | GET | `budget limit list --all` | specced |
| `/budgets` | GET, POST | `budget list/create` | specced |
| `/budgets/transactions-without-budget` | GET | `budget transactions --none` | specced |
| `/budgets/{id}` | GET, PUT, DELETE | `budget view/edit/delete` | specced |
| `/budgets/{id}/attachments` | GET | `attachment list --budget` | specced |
| `/budgets/{id}/limits` | GET, POST | `budget limit list/set` | specced |
| `/budgets/{id}/limits/{limitId}` | GET, PUT, DELETE | `budget limit view/edit/delete` | specced |
| `/budgets/{id}/limits/{limitId}/transactions` | GET | `budget limit transactions` | specced |
| `/budgets/{id}/transactions` | GET | `budget transactions` | specced |
| `/categories` | GET, POST | `category list/create` | specced |
| `/categories/{id}` | GET, PUT, DELETE | `category view/edit/delete` | specced |
| `/categories/{id}/attachments` | GET | `attachment list --category` | specced |
| `/categories/{id}/transactions` | GET | `category transactions` | specced |
| `/chart/account/overview` | GET | `chart account` | specced |
| `/chart/balance/balance` | GET | `chart balance` | specced |
| `/chart/budget/overview` | GET | `chart budget` | specced |
| `/chart/category/overview` | GET | `chart category` | specced |
| `/configuration` | GET | `config-value get --all` | specced |
| `/configuration/{name}` | GET, PUT | `config-value get/set` | specced |
| `/cron/{cliToken}` | GET | `cron run` | specced |
| `/currencies` | GET, POST | `currency list/create` | specced |
| `/currencies/primary` | GET | `currency primary` (no arg = show) | specced |
| `/currencies/{code}` | GET, PUT, DELETE | `currency view/edit/delete` | specced |
| `/currencies/{code}/accounts` | GET | `account list --currency` | specced |
| `/currencies/{code}/available-budgets` | GET | `budget available list --currency` | specced |
| `/currencies/{code}/bills` | GET | `bill list --currency` | specced |
| `/currencies/{code}/budget-limits` | GET | `budget limit list --currency` | specced |
| `/currencies/{code}/disable` | POST | `currency disable` | specced |
| `/currencies/{code}/enable` | POST | `currency enable` | specced |
| `/currencies/{code}/primary` | POST | `currency primary <code>` | specced |
| `/currencies/{code}/recurrences` | GET | `recurrence list --currency` | specced |
| `/currencies/{code}/rules` | GET | `rule list --currency` | specced |
| `/currencies/{code}/transactions` | GET | `transaction list --currency` | specced |
| `/data/bulk/transactions` | POST | `data bulk` | specced |
| `/data/destroy` | DELETE | `data destroy` (guarded) | specced |
| `/data/export/*` (9 paths) | GET | `data export <kind>` | specced |
| `/data/purge` | DELETE | `data purge` (guarded) | specced |
| `/exchange-rates` | GET | `currency rate list` | specced |
| `/exchange-rates/by-currencies/{from}/{to}` | GET | `currency rate view` | specced |
| `/exchange-rates/by-date/{date}` | GET | `currency rate list --date` | specced |
| `/exchange-rates/{from}/{to}` | GET, POST | `currency rate view/set` | specced |
| `/exchange-rates/{from}/{to}/{date}` | GET | `currency rate view --date` | specced |
| `/exchange-rates/{id}` | PUT, DELETE | `currency rate edit/delete` | specced |
| `/insight/expense/*` (11 paths) | GET | `insight expense <by>` | specced |
| `/insight/income/*` (7 paths) | GET | `insight income <by>` | specced |
| `/insight/transfer/*` (6 paths) | GET | `insight transfer <by>` | specced |
| `/link-types` | GET, POST | `link-type list/create` | specced |
| `/link-types/{id}` | GET, PUT, DELETE | `link-type view/edit/delete` | specced |
| `/link-types/{id}/transactions` | GET | `link-type ... transactions` | specced |
| `/object-groups` | GET | `object-group list` | specced |
| `/object-groups/{id}` | GET, PUT, DELETE | `object-group view/edit/delete` | specced |
| `/object-groups/{id}/bills` | GET | `object-group bills` | specced |
| `/object-groups/{id}/piggy-banks` | GET | `object-group piggies` | specced |
| `/piggy-banks` | GET, POST | `piggy list/create` | specced |
| `/piggy-banks/{id}` | GET, PUT, DELETE | `piggy view/edit/delete` | specced |
| `/piggy-banks/{id}/attachments` | GET | `attachment list --piggy` | specced |
| `/piggy-banks/{id}/events` | GET | `piggy events` | specced |
| `/preferences` | GET, POST | `preference list/set` | specced |
| `/preferences/{name}` | GET, PUT | `preference get/set` | specced |
| `/recurrences` | GET, POST | `recurrence list/create` | specced |
| `/recurrences/{id}` | GET, PUT, DELETE | `recurrence view/edit/delete` | specced |
| `/recurrences/{id}/transactions` | GET | `recurrence transactions` | specced |
| `/recurrences/{id}/trigger` | POST | `recurrence trigger` | specced |
| `/rule-groups` | GET, POST | `rule-group list/create` | specced |
| `/rule-groups/{id}` | GET, PUT, DELETE | `rule-group view/edit/delete` | specced |
| `/rule-groups/{id}/rules` | GET | `rule-group rules` | specced |
| `/rule-groups/{id}/test` | GET | `rule-group test` | specced |
| `/rule-groups/{id}/trigger` | POST | `rule-group trigger` | specced |
| `/rules` | GET, POST | `rule list/create` | specced |
| `/rules/{id}` | GET, PUT, DELETE | `rule view/edit/delete` | specced |
| `/rules/{id}/test` | GET | `rule test` | specced |
| `/rules/{id}/trigger` | POST | `rule trigger` | specced |
| `/search/accounts` | GET | `search accounts` | specced |
| `/search/transactions` | GET | `search transactions` | specced |
| `/summary/basic` | GET | `insight summary` | specced |
| `/tags` | GET, POST | `tag list/create` | specced |
| `/tags/{tag}` | GET, PUT, DELETE | `tag view/edit/delete` | specced |
| `/tags/{tag}/attachments` | GET | `attachment list --tag` | specced |
| `/tags/{tag}/transactions` | GET | `tag transactions` | specced |
| `/transaction-journals/{id}` | GET, DELETE | `transaction view/delete --journal` | specced |
| `/transaction-journals/{id}/links` | GET | `link list --journal` | specced |
| `/transaction-links` | GET, POST | `link list/create` | specced |
| `/transaction-links/{id}` | GET, PUT, DELETE | `link view/edit/delete` | specced |
| `/transactions` | GET, POST | `transaction list/create` | specced |
| `/transactions/{id}` | GET, PUT, DELETE | `transaction view/edit/delete` | specced |
| `/transactions/{id}/attachments` | GET | `attachment list --transaction` | specced |
| `/transactions/{id}/piggy-bank-events` | GET | `transaction ... events` | specced |
| `/user-groups` | GET | api-only (admin) | api-only |
| `/user-groups/{id}` | GET, PUT | api-only (admin) | api-only |
| `/users` | GET, POST | `user list` (GET); POST admin via api | specced |
| `/users/{id}` | GET, PUT, DELETE | `user view`; write admin via api | specced |
| `/webhooks` | GET, POST | `webhook list/create` | specced |
| `/webhooks/{id}` | GET, PUT, DELETE | `webhook view/edit/delete` | specced |
| `/webhooks/{id}/messages` | GET | `webhook messages` | specced |
| `/webhooks/{id}/messages/{messageId}` | GET | `webhook messages view` | specced |
| `/webhooks/{id}/messages/{messageId}/attempts` | GET | `webhook messages attempts` | specced |
| `/webhooks/{id}/messages/{messageId}/attempts/{attemptId}` | GET | `webhook messages attempts view` | specced |
| `/webhooks/{id}/submit` | POST | `webhook submit` | specced |
| `/webhooks/{id}/trigger-transaction/{transactionId}` | POST | `webhook trigger` | specced |

## api-only rationale

- `/batch/finish` — internal batch-job completion signal; no standalone user value.
- `/user-groups*` — multi-user/admin administration; niche, reachable via `firefly api`.
- `/users` POST + `/users/{id}` PUT/DELETE — admin user management; read modelled, writes via api.

Everything else is modelled. As each `06/*` doc lands, flip its rows to `specced`.
