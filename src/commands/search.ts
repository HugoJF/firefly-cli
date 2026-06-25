/**
 * `firefly search` — full-text discovery (spec/06 insight.md).
 *
 *   search transactions <query>   GET /search/transactions
 *   search accounts     <query>   GET /search/accounts  (--field, --type)
 *
 * Columns mirror the underlying noun's list. Full fidelity is via `--json`.
 */
import type { Command } from 'commander';
import type { Query } from '../api/client.ts';
import { getContext } from '../context.ts';
import { formatMoney, renderList } from '../output/render.ts';

function intArg(v: string): number {
  return Number.parseInt(v, 10);
}

export function register(program: Command): void {
  const search = program.command('search').description('Search transactions and accounts');

  search
    .command('transactions')
    .description('Search transactions (GET /search/transactions)')
    .argument('<query>', 'Firefly search query, e.g. "amount_more:100 category_is:Food"')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (query: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/search/transactions', {
        query: { query },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (t: any) => t.id ?? '' },
          {
            header: 'date',
            get: (t: any) => t.attributes?.transactions?.[0]?.date?.slice(0, 10) ?? '',
          },
          {
            header: 'description',
            get: (t: any) =>
              t.attributes?.group_title ?? t.attributes?.transactions?.[0]?.description ?? '',
          },
          {
            header: 'amount',
            get: (t: any) => {
              const s = t.attributes?.transactions?.[0] ?? {};
              return formatMoney(s.amount, { decimalPlaces: s.currency_decimal_places });
            },
          },
        ],
        ctx.output,
      );
    });

  search
    .command('accounts')
    .description('Search accounts (GET /search/accounts)')
    .argument('<query>', 'Search text, e.g. "Savings"')
    .option('--field <field>', 'Account field to match (default: all)', 'all')
    .option('--type <type>', 'Account type filter (default: all)', 'all')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (query: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const baseQuery: Query = { query, field: opts.field };
      if (opts.type) {
        baseQuery.type = opts.type;
      }
      const { data } = await client.getPaged('/search/accounts', {
        query: baseQuery,
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (a: any) => a.id ?? '' },
          { header: 'name', get: (a: any) => a.attributes?.name ?? '' },
          { header: 'type', get: (a: any) => a.attributes?.type ?? '' },
          { header: 'iban', get: (a: any) => a.attributes?.iban ?? '' },
        ],
        ctx.output,
      );
    });
}
