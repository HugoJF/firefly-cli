/**
 * `firefly piggy` (alias `piggy-bank`) — savings goals on an asset account
 * (spec/06 piggy.md). Endpoints: /piggy-banks[/{id}[/events]],
 * /accounts/{id}/piggy-banks.
 *
 * `fund add|remove` is ergonomic sugar over `edit`'s current amount: Firefly has
 * no dedicated add/remove endpoint, so we read the piggy, adjust, and PUT.
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { printMutation, renderItem, renderList } from '../output/render.ts';
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

/**
 * Build the PUT body that applies `delta` to a piggy bank's saved amount.
 * Firefly v6.6.x keys the saved amount under `accounts[].current_amount`; when a
 * single account is present we adjust it there, else we fall back to the
 * top-level `current_amount` the spec describes.
 */
export function buildFundBody(currentAttrs: any, delta: number): Record<string, unknown> {
  const accounts = Array.isArray(currentAttrs?.accounts) ? currentAttrs.accounts : [];
  if (accounts.length === 1 && accounts[0]?.id != null) {
    const cur = Number(accounts[0].current_amount ?? 0);
    return { accounts: [{ id: String(accounts[0].id), current_amount: String(cur + delta) }] };
  }
  const cur = Number(currentAttrs?.current_amount ?? 0);
  return { current_amount: String(cur + delta) };
}

export function register(program: Command): void {
  const piggy = program
    .command('piggy')
    .aliases(['piggy-bank'])
    .description('Manage piggy banks (savings goals)');

  piggy
    .command('list')
    .description('List piggy banks')
    .option('--account <id>', 'Scope to an asset account id')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path = opts.account ? `/accounts/${opts.account}/piggy-banks` : '/piggy-banks';
      const { data } = await client.getPaged(path, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (p: any) => p.id },
          { header: 'name', get: (p: any) => attrs(p).name ?? '' },
          {
            header: 'amount',
            get: (p: any) => `${attrs(p).current_amount ?? ''}/${attrs(p).target_amount ?? ''}`,
          },
          { header: 'percentage', get: (p: any) => String(attrs(p).percentage ?? '') },
          {
            header: 'target_date',
            get: (p: any) => String(attrs(p).target_date ?? '').slice(0, 10),
          },
        ],
        ctx.output,
      );
    });

  piggy
    .command('view')
    .description('Show one piggy bank')
    .argument('<id>', 'Piggy bank id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/piggy-banks/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(
        item,
        [
          { label: 'ID', get: (p: any) => p.id },
          { label: 'Name', get: (p: any) => attrs(p).name ?? '' },
          { label: 'Current', get: (p: any) => attrs(p).current_amount ?? '' },
          { label: 'Target', get: (p: any) => attrs(p).target_amount ?? '' },
          { label: 'Percentage', get: (p: any) => String(attrs(p).percentage ?? '') },
          { label: 'Start date', get: (p: any) => String(attrs(p).start_date ?? '').slice(0, 10) },
          {
            label: 'Target date',
            get: (p: any) => String(attrs(p).target_date ?? '').slice(0, 10),
          },
          { label: 'Notes', get: (p: any) => attrs(p).notes ?? '' },
        ],
        ctx.output,
      );
    });

  piggy
    .command('create')
    .description('Create a piggy bank')
    .requiredOption('--name <name>', 'Piggy bank name')
    .option('--account <id>', 'Owning asset account (prompted if omitted on a TTY)')
    .option('--target-amount <amount>', 'Savings target amount')
    .option('--current-amount <amount>', 'Initial saved amount')
    .option('--start-date <date>', 'Start date (YYYY-MM-DD)')
    .option('--target-date <date>', 'Target date (YYYY-MM-DD)')
    .option('--notes <text>', 'Notes')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      let accountId = opts.account;
      if (!accountId) {
        accountId = (await pickReference('accounts', ctx, { flag: '--account' })).id;
      }
      const body = compact({
        name: opts.name,
        accounts: [compact({ id: String(accountId), current_amount: opts.currentAmount })],
        target_amount: opts.targetAmount,
        current_amount: opts.currentAmount,
        start_date: opts.startDate,
        target_date: opts.targetDate,
        notes: opts.notes,
      });
      const res = await client.post('/piggy-banks', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created piggy bank',
        description: attrs(item).name ?? opts.name,
      });
    });

  piggy
    .command('edit')
    .description('Update a piggy bank')
    .argument('<id>', 'Piggy bank id')
    .option('--name <name>', 'Piggy bank name')
    .option('--target-amount <amount>', 'Savings target amount')
    .option('--current-amount <amount>', 'Saved amount')
    .option('--start-date <date>', 'Start date (YYYY-MM-DD)')
    .option('--target-date <date>', 'Target date (YYYY-MM-DD)')
    .option('--notes <text>', 'Notes')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body = compact({
        name: opts.name,
        target_amount: opts.targetAmount,
        current_amount: opts.currentAmount,
        start_date: opts.startDate,
        target_date: opts.targetDate,
        notes: opts.notes,
      });
      const res = await client.put(`/piggy-banks/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id,
        verb: 'Updated piggy bank',
        description: attrs(item).name ?? opts.name ?? '',
      });
    });

  piggy
    .command('delete')
    .description('Delete a piggy bank')
    .argument('<id>', 'Piggy bank id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete piggy bank ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/piggy-banks/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted piggy bank', description: '' });
    });

  piggy
    .command('events')
    .description('Add/remove history for a piggy bank')
    .argument('<id>', 'Piggy bank id')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/piggy-banks/${id}/events`, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (e: any) => e.id },
          { header: 'date', get: (e: any) => String(attrs(e).date ?? '').slice(0, 10) },
          { header: 'amount', get: (e: any) => attrs(e).amount ?? '' },
          { header: 'currency', get: (e: any) => attrs(e).currency_code ?? '' },
        ],
        ctx.output,
      );
    });

  // ── fund (sugar over current_amount) ───────────────────────────────────────
  const fund = piggy.command('fund').description('Adjust the saved amount (add/remove money)');

  const fundAction =
    (sign: 1 | -1) => async (id: string, opts: { amount?: string }, command: Command) => {
      const ctx = await getContext(command);
      if (opts.amount === undefined) {
        const { UsageError } = await import('../api/errors.ts');
        throw new UsageError('Missing required amount.', 'Provide --amount.');
      }
      const client = await ctx.client();
      const current = await client.get(`/piggy-banks/${id}`);
      const item = (current.data?.data ?? current.data) as any;
      const delta = sign * Number(opts.amount);
      const body = buildFundBody(attrs(item), delta);
      await client.put(`/piggy-banks/${id}`, body);
      printMutation(ctx.output, {
        id,
        verb: sign > 0 ? 'Added to piggy bank' : 'Removed from piggy bank',
        description: String(opts.amount),
      });
    };

  fund
    .command('add')
    .description('Add money to the goal')
    .argument('<id>', 'Piggy bank id')
    .option('--amount <amount>', 'Amount to add')
    .action(fundAction(1));

  fund
    .command('remove')
    .description('Remove money from the goal')
    .argument('<id>', 'Piggy bank id')
    .option('--amount <amount>', 'Amount to remove')
    .action(fundAction(-1));
}
