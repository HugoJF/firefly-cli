/**
 * ════════════════════════════════════════════════════════════════════════════
 *  REFERENCE COMMAND MODULE — copy this file to build a noun command.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  This file is NOT registered (it has no entry in commands/index.ts) and is
 *  skipped by the loader. It is the contract every noun-command agent follows.
 *  See docs/COMMAND_CONVENTION.md for the prose version.
 *
 *  To create `firefly widget ...`:
 *    1. Copy this file to `src/commands/widget.ts`.
 *    2. Replace `widget` everywhere; wire real endpoints + columns.
 *    3. In `src/commands/index.ts` add (alphabetically):
 *         import { register as widget } from './widget.ts';
 *         ...and `widget` to the `registrars` array.
 *    4. Add a test under `test/` (mock fetch; see test/api.test.ts).
 *
 *  RULES (do not break these — they keep parallel work conflict-free):
 *    • Export exactly `register(program)`. Nothing else is imported by the loader.
 *    • NEVER declare global flags (--json, --instance, --yes, --verbose, …);
 *      they are added to every command automatically. Read them via ctx.
 *    • NEVER write to process.stdout for results — use the render.ts helpers so
 *      json/template/table/plain all work for free.
 *    • Get a Ctx with `await getContext(command)` (last action arg is the Command).
 *    • Talk to the API only through `await ctx.client()` (auth + base URL + retries).
 *    • Missing required reference → interactive picker on a TTY, flag error off-TTY:
 *      use `pickReference(kind, ctx, { flag })`.
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { printMutation, renderItem, renderList } from '../output/render.ts';
import { pickReference } from '../output/selectors.ts';

export function register(program: Command): void {
  // Top-level noun command + aliases (spec/04). A bare `firefly widget` prints help.
  const widget = program.command('widget').aliases(['wid']).description('Manage widgets');

  // ── list ────────────────────────────────────────────────────────────────
  widget
    .command('list')
    .description('List widgets')
    // List/paging flags are command-specific; declare the ones you support.
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .option('--query <q>', 'Free-text filter (if supported by the endpoint)')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();

      // getPaged merges `.data` across pages and honours --limit/--page/--all.
      const { data } = await client.getPaged('/widgets', {
        query: { query: opts.query },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });

      // Curated columns (spec/05). --json/--template override this automatically.
      renderList(
        data,
        [
          { header: 'id', get: (w: any) => w.id },
          { header: 'name', get: (w: any) => w.attributes?.name ?? '' },
        ],
        ctx.output,
      );
    });

  // ── view ────────────────────────────────────────────────────────────────
  widget
    .command('view')
    .description('Show one widget')
    .argument('<id>', 'Widget id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/widgets/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(
        item,
        [
          { label: 'ID', get: (w: any) => w.id },
          { label: 'Name', get: (w: any) => w.attributes?.name ?? '' },
        ],
        ctx.output,
      );
    });

  // ── create (mutation + interactive picker + confirmation) ────────────────
  widget
    .command('create')
    .description('Create a widget')
    .option('--name <name>', 'Widget name')
    .option('--account <id>', 'Owning account id (prompted if omitted on a TTY)')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();

      // Flag mode vs interactive: resolve the account either from --account or
      // an autocomplete-backed picker. Off-TTY this throws naming --account.
      let accountId = opts.account;
      if (!accountId) {
        accountId = (await pickReference('accounts', ctx, { flag: '--account' })).id;
      }

      const res = await client.post('/widgets', {
        name: opts.name,
        account_id: accountId,
      });
      const item = (res.data?.data ?? res.data) as any;

      // One-line confirmation (spec/05); suppressed by --quiet, JSON under --json.
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created widget',
        description: item.attributes?.name ?? '',
      });
    });

  // ── delete (destructive → confirm) ───────────────────────────────────────
  widget
    .command('delete')
    .description('Delete a widget')
    .argument('<id>', 'Widget id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      // ctx.confirm: --yes short-circuits; non-TTY without --yes errors clearly.
      if (!(await ctx.confirm(`Delete widget ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/widgets/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted widget', description: '' });
    });
}
