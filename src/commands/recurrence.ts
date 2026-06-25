/**
 * `firefly recurrence` (alias `recurring`) — templates that auto-create
 * transactions on a schedule (spec/06 recurrence.md). Endpoints:
 *   /recurrences[/{id}[/transactions|/trigger]], /currencies/{code}/recurrences.
 *
 * `create` resolves --source/--destination/--category/--budget via reference
 * pickers (flag first, then interactive autocomplete) as in transaction.md.
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { formatMoney, printMutation, renderItem, renderList } from '../output/render.ts';
import { pickReference } from '../output/selectors.ts';

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
const firstRep = (r: any) => attrs(r)?.repetitions?.[0] ?? {};

export function register(program: Command): void {
  const recurrence = program
    .command('recurrence')
    .aliases(['recurring'])
    .description('Manage recurring transactions');

  recurrence
    .command('list')
    .description('List recurrences')
    .option('--currency <code>', 'Scope to a currency code')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path = opts.currency ? `/currencies/${opts.currency}/recurrences` : '/recurrences';
      const { data } = await client.getPaged(path, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (r: any) => r.id },
          { header: 'title', get: (r: any) => attrs(r).title ?? '' },
          { header: 'type', get: (r: any) => firstSplit(r).type ?? attrs(r).type ?? '' },
          {
            header: 'amount',
            get: (r: any) =>
              formatMoney(firstSplit(r).amount, {
                decimalPlaces: firstSplit(r).currency_decimal_places,
              }),
          },
          { header: 'repeat_freq', get: (r: any) => firstRep(r).type ?? '' },
          { header: 'first_date', get: (r: any) => String(attrs(r).first_date ?? '').slice(0, 10) },
          {
            header: 'latest_date',
            get: (r: any) => String(attrs(r).latest_date ?? '').slice(0, 10),
          },
          { header: 'active', get: (r: any) => String(attrs(r).active ?? '') },
        ],
        ctx.output,
      );
    });

  recurrence
    .command('view')
    .description('Show one recurrence')
    .argument('<id>', 'Recurrence id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/recurrences/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(
        item,
        [
          { label: 'ID', get: (r: any) => r.id },
          { label: 'Title', get: (r: any) => attrs(r).title ?? '' },
          { label: 'Type', get: (r: any) => firstSplit(r).type ?? attrs(r).type ?? '' },
          {
            label: 'Amount',
            get: (r: any) =>
              formatMoney(firstSplit(r).amount, {
                decimalPlaces: firstSplit(r).currency_decimal_places,
              }),
          },
          { label: 'Repeat freq', get: (r: any) => firstRep(r).type ?? '' },
          { label: 'First date', get: (r: any) => String(attrs(r).first_date ?? '').slice(0, 10) },
          {
            label: 'Latest date',
            get: (r: any) => String(attrs(r).latest_date ?? '').slice(0, 10),
          },
          { label: 'Active', get: (r: any) => String(attrs(r).active ?? '') },
          { label: 'Notes', get: (r: any) => attrs(r).notes ?? '' },
        ],
        ctx.output,
      );
    });

  recurrence
    .command('create')
    .description('Create a recurrence')
    .requiredOption('--type <type>', 'Transaction type (withdrawal|deposit|transfer)')
    .requiredOption('--title <title>', 'Recurrence title')
    .requiredOption('--amount <amount>', 'Transaction amount')
    .requiredOption('--first-date <date>', 'First fire date (YYYY-MM-DD)')
    .requiredOption('--repeat-freq <freq>', 'Repetition type (daily|weekly|monthly|yearly|ndom)')
    .option('--moment <m>', 'Repetition moment (day-of-week/month, per repeat-freq)')
    .option('--repetitions <n>', 'Max number of created transactions', intArg)
    .option('--source <id>', 'Source account (prompted if omitted on a TTY)')
    .option('--destination <id>', 'Destination account (prompted if omitted on a TTY)')
    .option('--category <id>', 'Category id')
    .option('--budget <id>', 'Budget id')
    .option('--description <text>', 'Transaction description (defaults to title)')
    .option('--notes <text>', 'Notes')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();

      let source = opts.source;
      if (!source) {
        source = (await pickReference('accounts', ctx, { flag: '--source' })).id;
      }
      let destination = opts.destination;
      if (!destination) {
        destination = (await pickReference('accounts', ctx, { flag: '--destination' })).id;
      }

      const body = compact({
        type: opts.type,
        title: opts.title,
        first_date: opts.firstDate,
        nr_of_repetitions: opts.repetitions,
        notes: opts.notes,
        repetitions: [compact({ type: opts.repeatFreq, moment: opts.moment ?? '' })],
        transactions: [
          compact({
            description: opts.description ?? opts.title,
            amount: opts.amount,
            source_id: String(source),
            destination_id: String(destination),
            category_id: opts.category,
            budget_id: opts.budget,
          }),
        ],
      });
      const res = await client.post('/recurrences', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created recurrence',
        description: attrs(item).title ?? opts.title,
      });
    });

  recurrence
    .command('edit')
    .description('Update a recurrence')
    .argument('<id>', 'Recurrence id')
    .option('--title <title>', 'Recurrence title')
    .option('--active <bool>', 'Whether the recurrence is active')
    .option('--repetitions <n>', 'Max number of created transactions', intArg)
    .option('--notes <text>', 'Notes')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body = compact({
        title: opts.title,
        active: opts.active === undefined ? undefined : opts.active === 'true',
        nr_of_repetitions: opts.repetitions,
        notes: opts.notes,
      });
      const res = await client.put(`/recurrences/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id,
        verb: 'Updated recurrence',
        description: attrs(item).title ?? opts.title ?? '',
      });
    });

  recurrence
    .command('delete')
    .description('Delete a recurrence')
    .argument('<id>', 'Recurrence id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete recurrence ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/recurrences/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted recurrence', description: '' });
    });

  recurrence
    .command('trigger')
    .description('Fire the recurrence now')
    .argument('<id>', 'Recurrence id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      await client.post(`/recurrences/${id}/trigger`, {});
      printMutation(ctx.output, { id, verb: 'Triggered recurrence', description: '' });
    });

  recurrence
    .command('transactions')
    .description('Transactions created by the recurrence')
    .argument('<id>', 'Recurrence id')
    .option('--start <date>', 'Range start (YYYY-MM-DD)')
    .option('--end <date>', 'Range end (YYYY-MM-DD)')
    .option('--type <type>', 'Transaction type filter')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/recurrences/${id}/transactions`, {
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
