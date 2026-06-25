# Firefly III CLI — Specification

`firefly` is a `gh`-style command-line client for [Firefly III](https://www.firefly-iii.org/),
built with **Bun** and shipped as a **compiled binary**. This `spec/` tree is the source of
truth; code follows docs.

Pinned API: **Firefly III v6.6.2 / API v1** — vendored at
`../reference/firefly-iii-v6.6.2-v1.yaml`.

## Reading order
1. [`00-vision-principles.md`](00-vision-principles.md) — what/why, gh parallels, design tenets, non-goals.
2. [`04-command-model.md`](04-command-model.md) — full noun-verb taxonomy + global flags (the backbone).
3. [`08-coverage-matrix.md`](08-coverage-matrix.md) — every API path → command (the coverage proof).

### Cross-cutting contracts
- [`01-architecture.md`](01-architecture.md) — Bun layout, API client, OpenAPI typegen.
- [`02-auth.md`](02-auth.md) — PAT now / OAuth later, token storage.
- [`03-config.md`](03-config.md) — config file, multi-instance profiles, precedence.
- [`05-output.md`](05-output.md) — render modes, filtering, exit codes.
- [`07-api-escape-hatch.md`](07-api-escape-hatch.md) — `firefly api` raw access.
- [`09-completion-interactivity.md`](09-completion-interactivity.md) — completion, selectors, TTY rules.

### Command specs ([`06-commands/`](06-commands/))
Money/core: [transaction](06-commands/transaction.md) · [account](06-commands/account.md) ·
[budget](06-commands/budget.md) · [category](06-commands/category.md) ·
[bill](06-commands/bill.md) · [piggy](06-commands/piggy.md) · [tag](06-commands/tag.md) ·
[recurrence](06-commands/recurrence.md)
Automation: [rule & rule-group](06-commands/rule.md) · [webhook](06-commands/webhook.md)
Reference: [currency & rates](06-commands/currency.md) · [link & link-type](06-commands/link.md) ·
[object-group](06-commands/object-group.md) · [attachment](06-commands/attachment.md)
Reporting: [insight / chart / search](06-commands/insight.md)
Meta/system: [meta](06-commands/meta.md) (data, user, preference, config-value, cron, about,
completion, alias, version)

### Ops
- [`10-distribution.md`](10-distribution.md) — compiled binaries, release, versioning.
- [`11-testing.md`](11-testing.md) — test layers + CI coverage gate.

## Status legend (used in `08`)
`specced` — covered by a doc · `api-only` — reachable only via `firefly api` (deliberate).
