/**
 * `firefly object-group` (alias `ogroup`) — groupings for piggy banks and bills
 * (spec/06-commands/object-group.md).
 *
 * There is no POST /object-groups: groups are created implicitly by assigning an
 * `object_group_title` on a piggy/bill (`piggy create --object-group ...`), so
 * this command has no `create` verb.
 *
 * Endpoints covered (spec/08): GET /object-groups, GET/PUT/DELETE
 * /object-groups/{id}, GET /object-groups/{id}/bills,
 * GET /object-groups/{id}/piggy-banks.
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { printMutation, renderItem, renderList } from '../output/render.ts';

export function register(program: Command): void {
  const group = program
    .command('object-group')
    .aliases(['ogroup'])
    .description(
      'Manage object groups (no create — set object_group_title on a piggy/bill to make one)',
    );

  // ── list ────────────────────────────────────────────────────────────────
  group
    .command('list')
    .description('List object groups')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/object-groups', {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (g: any) => g.id },
          { header: 'title', get: (g: any) => g.attributes?.title ?? '' },
          { header: 'order', get: (g: any) => String(g.attributes?.order ?? '') },
        ],
        ctx.output,
      );
    });

  // ── view ────────────────────────────────────────────────────────────────
  group
    .command('view')
    .description('Show one object group')
    .argument('<id>', 'Object group id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/object-groups/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      const a = item.attributes ?? {};
      renderItem(
        item,
        [
          { label: 'ID', get: () => item.id },
          { label: 'Title', get: () => a.title ?? '' },
          { label: 'Order', get: () => String(a.order ?? '') },
        ],
        ctx.output,
      );
    });

  // ── edit ─────────────────────────────────────────────────────────────────
  group
    .command('edit')
    .description('Rename or reorder an object group')
    .argument('<id>', 'Object group id')
    .option('--title <title>', 'New title')
    .option('--order <n>', 'New order', (v) => Number.parseInt(v, 10))
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body: Record<string, unknown> = {};
      if (opts.title !== undefined) {
        body.title = opts.title;
      }
      if (opts.order !== undefined) {
        body.order = opts.order;
      }
      const res = await client.put(`/object-groups/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id ?? id,
        verb: 'Updated object group',
        description: item.attributes?.title ?? '',
      });
    });

  // ── delete ───────────────────────────────────────────────────────────────
  group
    .command('delete')
    .description('Delete an object group')
    .argument('<id>', 'Object group id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete object group ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/object-groups/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted object group', description: '' });
    });

  // ── bills ─────────────────────────────────────────────────────────────────
  group
    .command('bills')
    .description('List bills in an object group')
    .argument('<id>', 'Object group id')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/object-groups/${id}/bills`, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (b: any) => b.id },
          { header: 'name', get: (b: any) => b.attributes?.name ?? '' },
          { header: 'amount_min', get: (b: any) => b.attributes?.amount_min ?? '' },
          { header: 'amount_max', get: (b: any) => b.attributes?.amount_max ?? '' },
          { header: 'active', get: (b: any) => String(b.attributes?.active ?? '') },
        ],
        ctx.output,
      );
    });

  // ── piggies ────────────────────────────────────────────────────────────────
  group
    .command('piggies')
    .description('List piggy banks in an object group')
    .argument('<id>', 'Object group id')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/object-groups/${id}/piggy-banks`, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (p: any) => p.id },
          { header: 'name', get: (p: any) => p.attributes?.name ?? '' },
          { header: 'target_amount', get: (p: any) => p.attributes?.target_amount ?? '' },
          { header: 'current_amount', get: (p: any) => p.attributes?.current_amount ?? '' },
        ],
        ctx.output,
      );
    });
}
