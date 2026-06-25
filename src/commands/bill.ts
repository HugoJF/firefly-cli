/**
 * `firefly bill` (alias `subscription`) — recurring expected payments
 * (spec/06 bill.md). Endpoints: /bills[/{id}[/transactions|/rules]],
 * /currencies/{code}/bills.
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

export function register(program: Command): void {
  const bill = program
    .command('bill')
    .aliases(['subscription'])
    .description('Manage bills (subscriptions)');

  bill
    .command('list')
    .description('List bills')
    .option('--currency <code>', 'Scope to a currency code')
    .option('--start <date>', 'Range start (YYYY-MM-DD)')
    .option('--end <date>', 'Range end (YYYY-MM-DD)')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path = opts.currency ? `/currencies/${opts.currency}/bills` : '/bills';
      const { data } = await client.getPaged(path, {
        query: { start: opts.start, end: opts.end },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (b: any) => b.id },
          { header: 'name', get: (b: any) => attrs(b).name ?? '' },
          {
            header: 'amount',
            get: (b: any) => `${attrs(b).amount_min ?? ''}–${attrs(b).amount_max ?? ''}`,
          },
          { header: 'repeat_freq', get: (b: any) => attrs(b).repeat_freq ?? '' },
          {
            header: 'next_expected_match',
            get: (b: any) => String(attrs(b).next_expected_match ?? '').slice(0, 10),
          },
          { header: 'active', get: (b: any) => String(attrs(b).active ?? '') },
          { header: 'currency', get: (b: any) => attrs(b).currency_code ?? '' },
        ],
        ctx.output,
      );
    });

  bill
    .command('view')
    .description('Show one bill')
    .argument('<id>', 'Bill id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/bills/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(
        item,
        [
          { label: 'ID', get: (b: any) => b.id },
          { label: 'Name', get: (b: any) => attrs(b).name ?? '' },
          { label: 'Amount min', get: (b: any) => attrs(b).amount_min ?? '' },
          { label: 'Amount max', get: (b: any) => attrs(b).amount_max ?? '' },
          { label: 'Repeat freq', get: (b: any) => attrs(b).repeat_freq ?? '' },
          { label: 'Skip', get: (b: any) => String(attrs(b).skip ?? '') },
          {
            label: 'Next expected',
            get: (b: any) => String(attrs(b).next_expected_match ?? '').slice(0, 10),
          },
          { label: 'Active', get: (b: any) => String(attrs(b).active ?? '') },
          { label: 'Currency', get: (b: any) => attrs(b).currency_code ?? '' },
          { label: 'Notes', get: (b: any) => attrs(b).notes ?? '' },
        ],
        ctx.output,
      );
    });

  bill
    .command('create')
    .description('Create a bill')
    .requiredOption('--name <name>', 'Bill name')
    .requiredOption('--amount-min <amount>', 'Minimum expected amount')
    .requiredOption('--amount-max <amount>', 'Maximum expected amount')
    .requiredOption('--date <date>', 'Anchor date (YYYY-MM-DD)')
    .requiredOption('--repeat-freq <freq>', 'Repeat frequency (weekly|monthly|yearly|...)')
    .option('--skip <n>', 'How often to skip (0 = never)', intArg)
    .option('--currency <code>', 'Currency code')
    .option('--notes <text>', 'Notes')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body = compact({
        name: opts.name,
        amount_min: opts.amountMin,
        amount_max: opts.amountMax,
        date: opts.date,
        repeat_freq: opts.repeatFreq,
        skip: opts.skip,
        currency_code: opts.currency,
        notes: opts.notes,
      });
      const res = await client.post('/bills', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created bill',
        description: attrs(item).name ?? opts.name,
      });
    });

  bill
    .command('edit')
    .description('Update a bill')
    .argument('<id>', 'Bill id')
    .option('--name <name>', 'Bill name')
    .option('--amount-min <amount>', 'Minimum expected amount')
    .option('--amount-max <amount>', 'Maximum expected amount')
    .option('--date <date>', 'Anchor date (YYYY-MM-DD)')
    .option('--repeat-freq <freq>', 'Repeat frequency')
    .option('--skip <n>', 'How often to skip', intArg)
    .option('--currency <code>', 'Currency code')
    .option('--active <bool>', 'Whether the bill is active')
    .option('--notes <text>', 'Notes')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body = compact({
        name: opts.name,
        amount_min: opts.amountMin,
        amount_max: opts.amountMax,
        date: opts.date,
        repeat_freq: opts.repeatFreq,
        skip: opts.skip,
        currency_code: opts.currency,
        active: opts.active === undefined ? undefined : opts.active === 'true',
        notes: opts.notes,
      });
      const res = await client.put(`/bills/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id,
        verb: 'Updated bill',
        description: attrs(item).name ?? opts.name ?? '',
      });
    });

  bill
    .command('delete')
    .description('Delete a bill')
    .argument('<id>', 'Bill id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete bill ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/bills/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted bill', description: '' });
    });

  bill
    .command('transactions')
    .description('Transactions matched to the bill')
    .argument('<id>', 'Bill id')
    .option('--start <date>', 'Range start (YYYY-MM-DD)')
    .option('--end <date>', 'Range end (YYYY-MM-DD)')
    .option('--type <type>', 'Transaction type filter')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/bills/${id}/transactions`, {
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

  bill
    .command('rules')
    .description('Rules that set this bill')
    .argument('<id>', 'Bill id')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/bills/${id}/rules`, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (r: any) => r.id },
          { header: 'title', get: (r: any) => attrs(r).title ?? '' },
          { header: 'active', get: (r: any) => String(attrs(r).active ?? '') },
        ],
        ctx.output,
      );
    });
}
