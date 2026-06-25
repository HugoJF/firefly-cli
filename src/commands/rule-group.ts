/**
 * `firefly rule-group` (alias `rgroup`) — ordering/batching of rules
 * (spec/06-commands/rule.md).
 *
 * Endpoints covered (spec/08): GET/POST /rule-groups, GET/PUT/DELETE
 * /rule-groups/{id}, GET /rule-groups/{id}/rules, GET /rule-groups/{id}/test,
 * POST /rule-groups/{id}/trigger.
 */
import type { Command } from 'commander';
import { UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import { printMutation, renderItem, renderList } from '../output/render.ts';

/** Build the start/end/accounts[] query shared by test + trigger. */
function runQuery(opts: { start?: string; end?: string; accounts?: string }): Record<string, any> {
  const query: Record<string, any> = {};
  if (opts.start) {
    query.start = opts.start;
  }
  if (opts.end) {
    query.end = opts.end;
  }
  if (opts.accounts) {
    query['accounts[]'] = opts.accounts.split(',').map((s) => s.trim());
  }
  return query;
}

export function register(program: Command): void {
  const group = program.command('rule-group').aliases(['rgroup']).description('Manage rule groups');

  // ── list ────────────────────────────────────────────────────────────────
  group
    .command('list')
    .description('List rule groups')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/rule-groups', {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (g: any) => g.id },
          { header: 'title', get: (g: any) => g.attributes?.title ?? '' },
          { header: 'active', get: (g: any) => String(g.attributes?.active ?? '') },
          { header: 'order', get: (g: any) => String(g.attributes?.order ?? '') },
        ],
        ctx.output,
      );
    });

  // ── view ────────────────────────────────────────────────────────────────
  group
    .command('view')
    .description('Show one rule group')
    .argument('<id>', 'Rule group id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/rule-groups/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      const a = item.attributes ?? {};
      renderItem(
        item,
        [
          { label: 'ID', get: () => item.id },
          { label: 'Title', get: () => a.title ?? '' },
          { label: 'Description', get: () => a.description ?? '' },
          { label: 'Active', get: () => String(a.active ?? '') },
          { label: 'Order', get: () => String(a.order ?? '') },
        ],
        ctx.output,
      );
    });

  // ── create ───────────────────────────────────────────────────────────────
  group
    .command('create')
    .description('Create a rule group')
    .option('--title <title>', 'Group title')
    .option('--description <text>', 'Group description')
    .option('--order <n>', 'Order', (v) => Number.parseInt(v, 10))
    .option('--active', 'Group is active (default true)')
    .option('--no-active', 'Group is inactive')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      if (!opts.title) {
        throw new UsageError('Missing required --title.');
      }
      const body: Record<string, unknown> = { title: opts.title };
      if (opts.description !== undefined) {
        body.description = opts.description;
      }
      if (opts.order !== undefined) {
        body.order = opts.order;
      }
      if (command.getOptionValueSource('active') === 'cli') {
        body.active = opts.active;
      }
      const res = await client.post('/rule-groups', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created rule group',
        description: item.attributes?.title ?? opts.title,
      });
    });

  // ── edit ─────────────────────────────────────────────────────────────────
  group
    .command('edit')
    .description('Update a rule group')
    .argument('<id>', 'Rule group id')
    .option('--title <title>', 'Group title')
    .option('--description <text>', 'Group description')
    .option('--order <n>', 'Order', (v) => Number.parseInt(v, 10))
    .option('--active', 'Group is active')
    .option('--no-active', 'Group is inactive')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body: Record<string, unknown> = {};
      if (opts.title !== undefined) {
        body.title = opts.title;
      }
      if (opts.description !== undefined) {
        body.description = opts.description;
      }
      if (opts.order !== undefined) {
        body.order = opts.order;
      }
      if (command.getOptionValueSource('active') === 'cli') {
        body.active = opts.active;
      }
      const res = await client.put(`/rule-groups/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id ?? id,
        verb: 'Updated rule group',
        description: item.attributes?.title ?? '',
      });
    });

  // ── delete ───────────────────────────────────────────────────────────────
  group
    .command('delete')
    .description('Delete a rule group')
    .argument('<id>', 'Rule group id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete rule group ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/rule-groups/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted rule group', description: '' });
    });

  // ── rules (members) ───────────────────────────────────────────────────────
  group
    .command('rules')
    .description('List rules in a group')
    .argument('<id>', 'Rule group id')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/rule-groups/${id}/rules`, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (r: any) => r.id },
          { header: 'title', get: (r: any) => r.attributes?.title ?? '' },
          { header: 'active', get: (r: any) => String(r.attributes?.active ?? '') },
          { header: 'order', get: (r: any) => String(r.attributes?.order ?? '') },
        ],
        ctx.output,
      );
    });

  // ── test (dry-run all rules) ──────────────────────────────────────────────
  group
    .command('test')
    .description('Dry-run all rules in a group')
    .argument('<id>', 'Rule group id')
    .option('--start <date>', 'Range start (ISO YYYY-MM-DD)')
    .option('--end <date>', 'Range end (ISO YYYY-MM-DD)')
    .option('--accounts <ids>', 'Comma-separated account ids')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/rule-groups/${id}/test`, runQuery(opts));
      const data = (res.data?.data ?? res.data) as any[];
      renderList(
        Array.isArray(data) ? data : [],
        [
          { header: 'id', get: (t: any) => t.id },
          {
            header: 'description',
            get: (t: any) => t.attributes?.transactions?.[0]?.description ?? '',
          },
        ],
        ctx.output,
      );
    });

  // ── trigger (apply all rules) ─────────────────────────────────────────────
  group
    .command('trigger')
    .description('Apply all rules in a group for real')
    .argument('<id>', 'Rule group id')
    .option('--start <date>', 'Range start (ISO YYYY-MM-DD)')
    .option('--end <date>', 'Range end (ISO YYYY-MM-DD)')
    .option('--accounts <ids>', 'Comma-separated account ids')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      await client.post(`/rule-groups/${id}/trigger`, undefined, { query: runQuery(opts) });
      printMutation(ctx.output, { id, verb: 'Triggered rule group', description: '' });
    });
}
