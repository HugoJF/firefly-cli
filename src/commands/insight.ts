/**
 * `firefly insight` — read-only analytics over `/summary/basic` and the 24
 * `/insight/{flow}/{by}` endpoints (spec/06 insight.md, matrix rows
 * `/summary/basic`, `/insight/expense|income|transfer/*`).
 *
 *   insight summary                      GET /summary/basic
 *   insight expense  <by>                GET /insight/expense/{by}
 *   insight income   <by>                GET /insight/income/{by}
 *   insight transfer <by>                GET /insight/transfer/{by}
 *
 * `<by>` is validated per flow; --start/--end are required (the API rejects
 * requests without them). Optional id filters are forwarded as the endpoints'
 * array params (`accounts[]`, `categories[]`, `budgets[]`, `tags[]`).
 */
import type { Command } from 'commander';
import type { Query } from '../api/client.ts';
import { UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import { formatMoney, printResult, renderList } from '../output/render.ts';

/** Allowed `<by>` values per flow (spec/06, cross-checked against the v1 spec). */
export const INSIGHT_BY: Record<'expense' | 'income' | 'transfer', readonly string[]> = {
  expense: [
    'asset',
    'bill',
    'budget',
    'category',
    'expense',
    'tag',
    'total',
    'no-bill',
    'no-budget',
    'no-category',
    'no-tag',
  ],
  income: ['asset', 'category', 'revenue', 'tag', 'total', 'no-category', 'no-tag'],
  transfer: ['asset', 'category', 'tag', 'total', 'no-category', 'no-tag'],
};

/** Validate a `<by>` for a flow, throwing a UsageError listing the valid set. */
export function validateBy(flow: keyof typeof INSIGHT_BY, by: string): string {
  if (!INSIGHT_BY[flow].includes(by)) {
    throw new UsageError(
      `Invalid <by> "${by}" for insight ${flow}.`,
      `Valid values: ${INSIGHT_BY[flow].join(', ')}`,
    );
  }
  return by;
}

function collect(value: string, prev: string[]): string[] {
  prev.push(value);
  return prev;
}

/** Build the shared insight query (dates + optional id-array filters). */
function insightQuery(opts: {
  start?: string;
  end?: string;
  accounts?: string[];
  categories?: string[];
  budgets?: string[];
  tags?: string[];
}): Query {
  if (!opts.start || !opts.end) {
    throw new UsageError('insight requires both --start and --end (YYYY-MM-DD).');
  }
  const query: Query = { start: opts.start, end: opts.end };
  if (opts.accounts?.length) {
    query['accounts[]'] = opts.accounts;
  }
  if (opts.categories?.length) {
    query['categories[]'] = opts.categories;
  }
  if (opts.budgets?.length) {
    query['budgets[]'] = opts.budgets;
  }
  if (opts.tags?.length) {
    query['tags[]'] = opts.tags;
  }
  return query;
}

function addFilterOptions(cmd: Command): Command {
  return cmd
    .requiredOption('--start <date>', 'Start date (YYYY-MM-DD)')
    .requiredOption('--end <date>', 'End date (YYYY-MM-DD)')
    .option('--accounts <id>', 'Filter by account id (repeatable)', collect, [])
    .option('--categories <id>', 'Filter by category id (repeatable)', collect, [])
    .option('--budgets <id>', 'Filter by budget id (repeatable)', collect, [])
    .option('--tags <id>', 'Filter by tag id (repeatable)', collect, []);
}

const INSIGHT_COLUMNS = [
  { header: 'id', get: (r: any) => r.id ?? '' },
  { header: 'name', get: (r: any) => r.name ?? '' },
  {
    header: 'amount',
    get: (r: any) => formatMoney(r.difference_float ?? r.difference, { symbol: r.currency_symbol }),
  },
  { header: 'currency', get: (r: any) => r.currency_code ?? '' },
];

function registerFlow(parent: Command, flow: keyof typeof INSIGHT_BY): void {
  addFilterOptions(
    parent
      .command(flow)
      .description(`Insight into ${flow}s, grouped by <by>`)
      .argument('<by>', `Grouping: ${INSIGHT_BY[flow].join(', ')}`),
  ).action(async (by: string, opts, command: Command) => {
    validateBy(flow, by);
    const ctx = await getContext(command);
    const client = await ctx.client();
    const res = await client.get(`/insight/${flow}/${by}`, insightQuery(opts));
    const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    renderList(rows as any[], INSIGHT_COLUMNS, ctx.output);
  });
}

export function register(program: Command): void {
  const insight = program.command('insight').description('Read-only financial analytics');

  insight
    .command('summary')
    .description('Net worth, balances, spent/earned (GET /summary/basic)')
    .requiredOption('--start <date>', 'Start date (YYYY-MM-DD)')
    .requiredOption('--end <date>', 'End date (YYYY-MM-DD)')
    .option('--currency <code>', 'Restrict to a currency code')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const query: Query = { start: opts.start, end: opts.end };
      if (opts.currency) {
        query.currency_code = opts.currency;
      }
      const res = await client.get('/summary/basic', query);
      const data = (res.data?.data ?? res.data) as Record<string, any>;

      if (ctx.output.mode === 'json' || ctx.output.mode === 'template') {
        printResult(data, ctx.output);
        return;
      }
      // BasicSummary is an object keyed by entry-key; flatten to rows.
      const rows = Object.values(data ?? {});
      renderList(
        rows as any[],
        [
          { header: 'key', get: (r: any) => r.key ?? '' },
          { header: 'title', get: (r: any) => r.title ?? '' },
          { header: 'amount', get: (r: any) => r.value_parsed ?? r.monetary_value ?? '' },
          { header: 'currency', get: (r: any) => r.currency_code ?? '' },
        ],
        ctx.output,
      );
    });

  registerFlow(insight, 'expense');
  registerFlow(insight, 'income');
  registerFlow(insight, 'transfer');
}
