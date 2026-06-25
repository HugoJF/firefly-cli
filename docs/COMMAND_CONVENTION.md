# Command Module Convention

The contract every noun-command module follows. The reference implementation is
[`src/commands/_TEMPLATE.ts`](../src/commands/_TEMPLATE.ts) — copy it. This doc is
the prose version of that file. The foundation (CLI wiring, config, auth, output,
client) is done; noun agents only add command modules.

## TL;DR — adding a command in 4 steps

1. Copy `src/commands/_TEMPLATE.ts` → `src/commands/<noun>.ts`, rename `widget`.
2. Wire real endpoints (from the coverage matrix `spec/08`) + curated columns.
3. Register it in `src/commands/index.ts`:
   ```ts
   import { register as <noun> } from './<noun>.ts';
   // add `<noun>` to the `registrars` array (keep it alphabetical)
   ```
4. Add a test under `test/` using a fetch stub (see `test/api.test.ts`).

That's the only shared file you touch (`index.ts`), and it's a one-line append —
no parallel-edit conflicts on logic.

## The `register(program)` export

Each module exports exactly one function:

```ts
import type { Command } from 'commander';
export function register(program: Command): void { /* define subcommands */ }
```

The loader in `src/cli.ts` calls every `register` listed in `commands/index.ts`,
then applies global flags to the whole tree. Runtime filesystem scanning is NOT
used (it breaks in the `--compile` binary) — the explicit `registrars` array IS
the registration mechanism.

## Global flags — never redeclare them

`--instance --json [fields] --template --yes --no-color --no-pager --quiet
--verbose --help` are added to every command automatically by
`src/globals.ts`. Do **not** declare them yourself. Read their resolved effect
through the `Ctx` object. (If you need a short flag that collides with a global —
as `api` does with `-q` — declare your own; the colliding global is skipped on
that command only.)

## Getting a `Ctx`

The last argument commander passes to an action is the `Command`. Pass it to
`getContext`:

```ts
.action(async (opts, command: Command) => {
  const ctx = await getContext(command);
  const client = await ctx.client(); // resolves instance + token + base URL
});
```

`Ctx` provides:

| Member | Use |
|---|---|
| `ctx.client()` | `Promise<FireflyClient>` for the active instance (auth, retries, paging). |
| `ctx.resolveInstance()` | `{ name, url, token, authMethod }` (precedence per spec/02). |
| `ctx.output` | Resolved `OutputOptions` to hand to render helpers. |
| `ctx.flags` | Merged global flags (rarely needed directly). |
| `ctx.config` | `ConfigStore` (settings, instances, aliases). |
| `ctx.confirm(msg)` | TTY y/N; `--yes` → true; non-TTY without `--yes` → usage error. |
| `ctx.confirmTyped(msg, expected)` | Typed confirmation for destructive ops. |

## Talking to the API

Always go through `await ctx.client()`. Paths may be written `/transactions`,
`transactions`, `/v1/accounts/1`, or `v2/...` — the client normalises the base
URL (`…/api`) and version prefix (`v1` by default).

```ts
const client = await ctx.client();
const { data } = await client.getPaged('/accounts', { limit, page, all });   // lists
const res = await client.get(`/accounts/${id}`);                              // single
const res = await client.post('/accounts', body);                            // create
const res = await client.put(`/accounts/${id}`, body);                       // edit
await client.delete(`/accounts/${id}`);                                       // delete
```

`getPaged` merges `.data` across pages and honours `--limit/--page/--all` over
Firefly's `meta.pagination`. Idempotent GETs retry on 5xx/network; writes never
retry. Errors are thrown as typed `FireflyApiError` with the right exit code —
let them propagate; the top-level handler renders them.

## Rendering output — never `process.stdout.write` results

Use `src/output/render.ts` so `--json`, `--template`, table (TTY) and plain
(piped) all work without per-command code:

| Helper | When |
|---|---|
| `renderList(rows, columns, ctx.output)` | `list` verbs. `columns: { header, get }[]`. |
| `renderItem(item, fields, ctx.output)` | `view` verbs. `fields: { label, get }[]`. |
| `printMutation(ctx.output, { id, verb, description })` | one-line create/edit/delete confirmation. |
| `printResult(data, ctx.output)` | raw passthrough (json/template). |
| `printMessage(text, ctx.output)` | non-essential chatter (suppressed by `--quiet`). |

Curated columns are a human-meaningful subset (spec/05) — full fidelity is
always available via `--json`. You do not branch on mode yourself; the helpers
read `ctx.output.mode`.

## Interactive vs flag mode (spec/04, spec/09)

Every prompt must have a flag twin. Resolve a reference from a flag first; only
when missing, call the picker:

```ts
import { pickReference } from '../output/selectors.ts';
let source = opts.source;
if (!source) {
  source = (await pickReference('accounts', ctx, { flag: '--source' })).id;
}
```

`pickReference` uses the matching `/autocomplete/*` endpoint on a TTY, and throws
a `UsageError` naming the flag in non-TTY/CI contexts (never hangs).

## Errors and exit codes

Throw — don't print-and-exit. Use the typed errors from `src/api/errors.ts`:

- `UsageError` (exit 2) — bad/missing flags or args.
- `AuthError` (exit 4) — missing/invalid creds.
- `CancelledError` (exit 8) — user aborted.
- API failures already map to the right code via `FireflyApiError`.

The handler in `cli.ts` prints `error:`/`hint:` to stderr and exits.

## Aliases and verbs

- Nouns are singular; `list` pluralizes conceptually.
- Use the fixed verb vocabulary: `list view create edit delete`, plus
  noun-specific verbs only when no CRUD verb fits (spec/04).
- Declare aliases with `.aliases([...])` from each noun's `spec/06-commands/*`.

## Output modes recap

| Trigger | Mode |
|---|---|
| TTY, no flag | table |
| piped / non-TTY, no flag | plain (TSV) |
| `--json` / `--json a,b` | JSON (optionally projected) |
| `--template '{{.x}}'` | template (foundation subset: dotted-path substitution; helpers TBD) |

`--jq` is deferred (spec/12): users pipe `--json` to an external `jq`.
