/**
 * `firefly category` (alias `cat`) — free-form spending/earning categories
 * (spec/06 category.md). Endpoints: /categories[/{id}[/transactions]].
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { formatMoney, printMutation, renderItem, renderList } from '../output/render.ts';

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as Partial<T>;
}

const intArg = (v: string) => Number.parseInt(v, 10);
const attrs = (row: any) => row?.attributes ?? row ?? {};
const firstSplit = (t: any) => attrs(t)?.transactions?.[0] ?? {};

/** Curated sum from a category's `spent`/`earned` array. */
function sumCell(row: any, key: 'spent' | 'earned'): string {
  const s = attrs(row)?.[key];
  if (Array.isArray(s) && s.length > 0) {
    return `${s[0].sum ?? ''} ${s[0].currency_code ?? ''}`.trim();
  }
  return '';
}

export function register(program: Command): void {
  const category = program
    .command('category')
    .aliases(['cat'])
    .description('Manage spending/earning categories');

  category
    .command('list')
    .description('List categories')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .option('--start <date>', 'Period start (YYYY-MM-DD) for spent/earned')
    .option('--end <date>', 'Period end (YYYY-MM-DD) for spent/earned')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/categories', {
        query: { start: opts.start, end: opts.end },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (c: any) => c.id },
          { header: 'name', get: (c: any) => attrs(c).name ?? '' },
          { header: 'spent', get: (c: any) => sumCell(c, 'spent') },
          { header: 'earned', get: (c: any) => sumCell(c, 'earned') },
        ],
        ctx.output,
      );
    });

  category
    .command('view')
    .description('Show one category')
    .argument('<id>', 'Category id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/categories/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(
        item,
        [
          { label: 'ID', get: (c: any) => c.id },
          { label: 'Name', get: (c: any) => attrs(c).name ?? '' },
          { label: 'Spent', get: (c: any) => sumCell(c, 'spent') },
          { label: 'Earned', get: (c: any) => sumCell(c, 'earned') },
          { label: 'Notes', get: (c: any) => attrs(c).notes ?? '' },
        ],
        ctx.output,
      );
    });

  category
    .command('create')
    .description('Create a category')
    .requiredOption('--name <name>', 'Category name')
    .option('--notes <text>', 'Notes')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.post('/categories', compact({ name: opts.name, notes: opts.notes }));
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created category',
        description: attrs(item).name ?? opts.name,
      });
    });

  category
    .command('edit')
    .description('Update a category')
    .argument('<id>', 'Category id')
    .option('--name <name>', 'Category name')
    .option('--notes <text>', 'Notes')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.put(
        `/categories/${id}`,
        compact({ name: opts.name, notes: opts.notes }),
      );
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id,
        verb: 'Updated category',
        description: attrs(item).name ?? opts.name ?? '',
      });
    });

  category
    .command('delete')
    .description('Delete a category')
    .argument('<id>', 'Category id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete category ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/categories/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted category', description: '' });
    });

  category
    .command('transactions')
    .description("A category's transactions")
    .argument('<id>', 'Category id')
    .option('--start <date>', 'Range start (YYYY-MM-DD)')
    .option('--end <date>', 'Range end (YYYY-MM-DD)')
    .option('--type <type>', 'Transaction type filter')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/categories/${id}/transactions`, {
        query: { start: opts.start, end: opts.end, type: opts.type },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (t: any) => t.id },
          { header: 'date', get: (t: any) => String(firstSplit(t).date ?? '').slice(0, 10) },
          { header: 'description', get: (t: any) => firstSplit(t).description ?? '' },
          {
            header: 'amount',
            get: (t: any) =>
              formatMoney(firstSplit(t).amount, {
                decimalPlaces: firstSplit(t).currency_decimal_places,
              }),
          },
          { header: 'currency', get: (t: any) => firstSplit(t).currency_code ?? '' },
        ],
        ctx.output,
      );
    });
}
