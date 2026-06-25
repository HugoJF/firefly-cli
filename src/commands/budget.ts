/**
 * `firefly budget` — budgets, their periodic limits, and available-budget
 * envelopes (spec/06 budget.md). Limits fold under `budget limit` and
 * available-budgets under `budget available` rather than as top-level nouns.
 *
 * Endpoints (coverage matrix spec/08):
 *   /budgets, /budgets/{id}, /budgets/{id}/transactions,
 *   /budgets/transactions-without-budget,
 *   /budget-limits, /budgets/{id}/limits[/{limitId}[/transactions]],
 *   /currencies/{code}/budget-limits,
 *   /available-budgets[/{id}], /currencies/{code}/available-budgets.
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { formatMoney, printMutation, renderItem, renderList } from '../output/render.ts';

/** Drop undefined keys so we never send empty JSON fields. */
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

/** First split of a transaction group, used for curated transaction columns. */
const firstSplit = (t: any) => attrs(t)?.transactions?.[0] ?? {};

function transactionColumns() {
  return [
    { header: 'id', get: (t: any) => t.id },
    { header: 'date', get: (t: any) => String(firstSplit(t).date ?? '').slice(0, 10) },
    { header: 'description', get: (t: any) => firstSplit(t).description ?? '' },
    {
      header: 'amount',
      get: (t: any) =>
        formatMoney(firstSplit(t).amount, { decimalPlaces: firstSplit(t).currency_decimal_places }),
    },
    { header: 'currency', get: (t: any) => firstSplit(t).currency_code ?? '' },
  ];
}

function spentCell(b: any): string {
  const s = attrs(b)?.spent;
  if (Array.isArray(s) && s.length > 0) {
    return `${s[0].sum ?? ''} ${s[0].currency_code ?? ''}`.trim();
  }
  return '';
}

export function register(program: Command): void {
  const budget = program.command('budget').description('Manage budgets and their limits');

  // ── list ──────────────────────────────────────────────────────────────────
  budget
    .command('list')
    .description('List budgets')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .option('--start <date>', 'Period start (YYYY-MM-DD) for spent figures')
    .option('--end <date>', 'Period end (YYYY-MM-DD) for spent figures')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/budgets', {
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
          { header: 'active', get: (b: any) => String(attrs(b).active ?? '') },
          { header: 'auto_budget_type', get: (b: any) => attrs(b).auto_budget_type ?? '' },
          { header: 'spent', get: spentCell },
        ],
        ctx.output,
      );
    });

  // ── view ──────────────────────────────────────────────────────────────────
  budget
    .command('view')
    .description('Show one budget')
    .argument('<id>', 'Budget id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/budgets/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(
        item,
        [
          { label: 'ID', get: (b: any) => b.id },
          { label: 'Name', get: (b: any) => attrs(b).name ?? '' },
          { label: 'Active', get: (b: any) => String(attrs(b).active ?? '') },
          { label: 'Auto budget', get: (b: any) => attrs(b).auto_budget_type ?? '' },
          { label: 'Auto amount', get: (b: any) => attrs(b).auto_budget_amount ?? '' },
          { label: 'Auto period', get: (b: any) => attrs(b).auto_budget_period ?? '' },
          { label: 'Spent', get: spentCell },
          { label: 'Notes', get: (b: any) => attrs(b).notes ?? '' },
        ],
        ctx.output,
      );
    });

  // ── create ────────────────────────────────────────────────────────────────
  budget
    .command('create')
    .description('Create a budget')
    .requiredOption('--name <name>', 'Budget name')
    .option('--active <bool>', 'Whether the budget is active')
    .option('--auto-budget-type <type>', 'Auto-budget type (reset|rollover|none)')
    .option('--auto-budget-amount <amount>', 'Auto-budget amount')
    .option('--auto-budget-period <period>', 'Auto-budget period (daily|weekly|monthly|...)')
    .option('--currency <code>', 'Auto-budget currency code')
    .option('--notes <text>', 'Notes')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body = compact({
        name: opts.name,
        active: opts.active === undefined ? undefined : opts.active === 'true',
        auto_budget_type: opts.autoBudgetType,
        auto_budget_amount: opts.autoBudgetAmount,
        auto_budget_period: opts.autoBudgetPeriod,
        auto_budget_currency_code: opts.currency,
        notes: opts.notes,
      });
      const res = await client.post('/budgets', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created budget',
        description: attrs(item).name ?? opts.name,
      });
    });

  // ── edit ──────────────────────────────────────────────────────────────────
  budget
    .command('edit')
    .description('Update a budget')
    .argument('<id>', 'Budget id')
    .option('--name <name>', 'Budget name')
    .option('--active <bool>', 'Whether the budget is active')
    .option('--auto-budget-type <type>', 'Auto-budget type')
    .option('--auto-budget-amount <amount>', 'Auto-budget amount')
    .option('--auto-budget-period <period>', 'Auto-budget period')
    .option('--currency <code>', 'Auto-budget currency code')
    .option('--notes <text>', 'Notes')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body = compact({
        name: opts.name,
        active: opts.active === undefined ? undefined : opts.active === 'true',
        auto_budget_type: opts.autoBudgetType,
        auto_budget_amount: opts.autoBudgetAmount,
        auto_budget_period: opts.autoBudgetPeriod,
        auto_budget_currency_code: opts.currency,
        notes: opts.notes,
      });
      const res = await client.put(`/budgets/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id,
        verb: 'Updated budget',
        description: attrs(item).name ?? opts.name ?? '',
      });
    });

  // ── delete ────────────────────────────────────────────────────────────────
  budget
    .command('delete')
    .description('Delete a budget')
    .argument('<id>', 'Budget id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete budget ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/budgets/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted budget', description: '' });
    });

  // ── transactions ──────────────────────────────────────────────────────────
  budget
    .command('transactions')
    .description("A budget's transactions; --none for unbudgeted spending")
    .argument('[id]', 'Budget id (omit with --none)')
    .option('--none', 'Show transactions without a budget')
    .option('--start <date>', 'Range start (YYYY-MM-DD)')
    .option('--end <date>', 'Range end (YYYY-MM-DD)')
    .option('--type <type>', 'Transaction type filter')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (id: string | undefined, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path =
        opts.none || !id ? '/budgets/transactions-without-budget' : `/budgets/${id}/transactions`;
      const { data } = await client.getPaged(path, {
        query: { start: opts.start, end: opts.end, type: opts.type },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(data, transactionColumns(), ctx.output);
    });

  registerLimit(budget);
  registerAvailable(budget);
}

// ─── budget limit ────────────────────────────────────────────────────────────
function registerLimit(budget: Command): void {
  const limit = budget.command('limit').description('Manage budget limits (periodic caps)');

  limit
    .command('list')
    .description('List budget limits (all, or for one budget)')
    .argument('[id]', 'Budget id to scope to')
    .option('--currency <code>', 'Scope to a currency code')
    .option('--start <date>', 'Range start (YYYY-MM-DD)')
    .option('--end <date>', 'Range end (YYYY-MM-DD)')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (id: string | undefined, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      let path: string;
      if (id) {
        path = `/budgets/${id}/limits`;
      } else if (opts.currency) {
        path = `/currencies/${opts.currency}/budget-limits`;
      } else {
        path = '/budget-limits';
      }
      const { data } = await client.getPaged(path, {
        query: { start: opts.start, end: opts.end },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (l: any) => l.id },
          { header: 'budget', get: (l: any) => attrs(l).budget_id ?? '' },
          { header: 'start', get: (l: any) => String(attrs(l).start ?? '').slice(0, 10) },
          { header: 'end', get: (l: any) => String(attrs(l).end ?? '').slice(0, 10) },
          { header: 'amount', get: (l: any) => attrs(l).amount ?? '' },
          { header: 'spent', get: (l: any) => attrs(l).spent ?? '' },
          { header: 'currency', get: (l: any) => attrs(l).currency_code ?? '' },
        ],
        ctx.output,
      );
    });

  limit
    .command('set')
    .description('Set a budget limit')
    .argument('<id>', 'Budget id')
    .requiredOption('--amount <amount>', 'Limit amount')
    .requiredOption('--start <date>', 'Limit start date (YYYY-MM-DD)')
    .requiredOption('--end <date>', 'Limit end date (YYYY-MM-DD)')
    .option('--currency <code>', 'Currency code')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body = compact({
        amount: opts.amount,
        start: opts.start,
        end: opts.end,
        currency_code: opts.currency,
      });
      const res = await client.post(`/budgets/${id}/limits`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Set budget limit',
        description: `${opts.amount} (${opts.start}…${opts.end})`,
      });
    });

  limit
    .command('view')
    .description('Show one budget limit')
    .argument('<id>', 'Budget id')
    .argument('<limitId>', 'Limit id')
    .action(async (id: string, limitId: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/budgets/${id}/limits/${limitId}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(
        item,
        [
          { label: 'ID', get: (l: any) => l.id },
          { label: 'Budget', get: (l: any) => attrs(l).budget_id ?? '' },
          { label: 'Start', get: (l: any) => String(attrs(l).start ?? '').slice(0, 10) },
          { label: 'End', get: (l: any) => String(attrs(l).end ?? '').slice(0, 10) },
          { label: 'Amount', get: (l: any) => attrs(l).amount ?? '' },
          { label: 'Spent', get: (l: any) => attrs(l).spent ?? '' },
          { label: 'Currency', get: (l: any) => attrs(l).currency_code ?? '' },
        ],
        ctx.output,
      );
    });

  limit
    .command('edit')
    .description('Update a budget limit')
    .argument('<id>', 'Budget id')
    .argument('<limitId>', 'Limit id')
    .option('--amount <amount>', 'Limit amount')
    .option('--start <date>', 'Limit start date (YYYY-MM-DD)')
    .option('--end <date>', 'Limit end date (YYYY-MM-DD)')
    .action(async (id: string, limitId: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body = compact({ amount: opts.amount, start: opts.start, end: opts.end });
      await client.put(`/budgets/${id}/limits/${limitId}`, body);
      printMutation(ctx.output, {
        id: limitId,
        verb: 'Updated budget limit',
        description: opts.amount ? String(opts.amount) : '',
      });
    });

  limit
    .command('delete')
    .description('Delete a budget limit')
    .argument('<id>', 'Budget id')
    .argument('<limitId>', 'Limit id')
    .action(async (id: string, limitId: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete budget limit ${limitId}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/budgets/${id}/limits/${limitId}`);
      printMutation(ctx.output, { id: limitId, verb: 'Deleted budget limit', description: '' });
    });

  limit
    .command('transactions')
    .description("Transactions in a limit's period")
    .argument('<id>', 'Budget id')
    .argument('<limitId>', 'Limit id')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (id: string, limitId: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/budgets/${id}/limits/${limitId}/transactions`, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(data, transactionColumns(), ctx.output);
    });
}

// ─── budget available ────────────────────────────────────────────────────────
function registerAvailable(budget: Command): void {
  const available = budget
    .command('available')
    .description('Available-budget envelopes (total spendable per period)');

  available
    .command('list')
    .description('List available-budget envelopes')
    .option('--currency <code>', 'Scope to a currency code')
    .option('--start <date>', 'Range start (YYYY-MM-DD)')
    .option('--end <date>', 'Range end (YYYY-MM-DD)')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path = opts.currency
        ? `/currencies/${opts.currency}/available-budgets`
        : '/available-budgets';
      const { data } = await client.getPaged(path, {
        query: { start: opts.start, end: opts.end },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (a: any) => a.id },
          { header: 'amount', get: (a: any) => attrs(a).amount ?? '' },
          { header: 'currency', get: (a: any) => attrs(a).currency_code ?? '' },
          { header: 'start', get: (a: any) => String(attrs(a).start ?? '').slice(0, 10) },
          { header: 'end', get: (a: any) => String(attrs(a).end ?? '').slice(0, 10) },
        ],
        ctx.output,
      );
    });

  available
    .command('view')
    .description('Show one available-budget envelope')
    .argument('<id>', 'Available-budget id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/available-budgets/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(
        item,
        [
          { label: 'ID', get: (a: any) => a.id },
          { label: 'Amount', get: (a: any) => attrs(a).amount ?? '' },
          { label: 'Currency', get: (a: any) => attrs(a).currency_code ?? '' },
          { label: 'Start', get: (a: any) => String(attrs(a).start ?? '').slice(0, 10) },
          { label: 'End', get: (a: any) => String(attrs(a).end ?? '').slice(0, 10) },
        ],
        ctx.output,
      );
    });
}
