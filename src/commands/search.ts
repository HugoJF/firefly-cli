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

/**
 * Cheatsheet for Firefly III's transaction search DSL. Surfaced in
 * `search transactions --help` and `tx list --query --help` so the query
 * language is discoverable (it is otherwise invisible). See
 * https://docs.firefly-iii.org/how-to/firefly-iii/features/search/ for the full
 * operator set.
 */
export const SEARCH_OPERATORS_HELP = `
Query operators (Firefly III search language — combine with spaces = AND):
  has_no_category:true        category_is:"Food"            budget_is:"Bills"
  has_any_tag:true            tag_is:"Trip"                 notes_contain:"text"
  amount_more:100             amount_less:50                amount_is:42
  description_contains:"Eden Beer"                          description_is:"Exact"
  date_after:2026-01-01       date_before:2026-12-31        date_on:2026-06-01
  source_account_is:"Checking"            destination_account_is:"Estrelas Motel"
  type:withdrawal             currency_is:EUR

Examples:
  firefly search transactions 'has_no_category:true date_after:2026-01-01'
  firefly search transactions 'category_is:"Food" amount_more:100'
  firefly search transactions 'description_contains:"Eden Beer"'`;

export function register(program: Command): void {
  const search = program.command('search').description('Search transactions and accounts');

  search
    .command('transactions')
    .description('Search transactions (GET /search/transactions)')
    .argument('<query>', 'Firefly search query, e.g. "amount_more:100 category_is:Food"')
    .addHelpText('after', SEARCH_OPERATORS_HELP)
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
