/**
 * `firefly currency` — currency definitions, enable/disable, primary selection,
 * and exchange rates folded under `currency rate` (spec/06-commands/currency.md).
 * The target is the currency **code** (e.g. `EUR`).
 *
 * Endpoints covered (spec/08): GET/POST /currencies, GET/PUT/DELETE
 * /currencies/{code}, POST /currencies/{code}/enable, .../disable,
 * GET /currencies/primary, POST /currencies/{code}/primary,
 * GET /exchange-rates, GET /exchange-rates/by-date/{date},
 * GET /exchange-rates/by-currencies/{from}/{to},
 * GET/POST /exchange-rates/{from}/{to}, GET /exchange-rates/{from}/{to}/{date},
 * PUT/DELETE /exchange-rates/{id}.
 */
import type { Command } from 'commander';
import { UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import { printMutation, renderItem, renderList } from '../output/render.ts';

const RATE_COLUMNS = [
  { header: 'id', get: (r: any) => r.id },
  { header: 'from', get: (r: any) => r.attributes?.from_currency_code ?? '' },
  { header: 'to', get: (r: any) => r.attributes?.to_currency_code ?? '' },
  { header: 'date', get: (r: any) => (r.attributes?.date ?? '').slice(0, 10) },
  { header: 'rate', get: (r: any) => String(r.attributes?.rate ?? '') },
];

export function register(program: Command): void {
  const currency = program.command('currency').description('Manage currencies and exchange rates');

  // ── list ────────────────────────────────────────────────────────────────
  currency
    .command('list')
    .description('List currencies')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/currencies', {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'code', get: (c: any) => c.attributes?.code ?? c.id },
          { header: 'name', get: (c: any) => c.attributes?.name ?? '' },
          { header: 'symbol', get: (c: any) => c.attributes?.symbol ?? '' },
          { header: 'decimal_places', get: (c: any) => String(c.attributes?.decimal_places ?? '') },
          { header: 'enabled', get: (c: any) => String(c.attributes?.enabled ?? '') },
          {
            header: 'primary',
            get: (c: any) => String(c.attributes?.primary ?? c.attributes?.default ?? ''),
          },
        ],
        ctx.output,
      );
    });

  // ── view ────────────────────────────────────────────────────────────────
  currency
    .command('view')
    .description('Show one currency')
    .argument('<code>', 'Currency code (e.g. EUR)')
    .action(async (code: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/currencies/${code}`);
      const item = (res.data?.data ?? res.data) as any;
      renderCurrency(item, ctx);
    });

  // ── create ───────────────────────────────────────────────────────────────
  currency
    .command('create')
    .description('Create a currency')
    .option('--code <code>', 'ISO-style currency code')
    .option('--name <name>', 'Currency name')
    .option('--symbol <symbol>', 'Currency symbol')
    .option('--decimal-places <n>', 'Decimal places', (v) => Number.parseInt(v, 10))
    .option('--enabled', 'Enable on creation')
    .option('--no-enabled', 'Create disabled')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      if (!opts.code || !opts.name || !opts.symbol) {
        throw new UsageError('Missing required fields.', 'Provide --code, --name and --symbol.');
      }
      const body: Record<string, unknown> = {
        code: opts.code,
        name: opts.name,
        symbol: opts.symbol,
      };
      if (opts.decimalPlaces !== undefined) {
        body.decimal_places = opts.decimalPlaces;
      }
      if (command.getOptionValueSource('enabled') === 'cli') {
        body.enabled = opts.enabled;
      }
      const res = await client.post('/currencies', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.attributes?.code ?? opts.code,
        verb: 'Created currency',
        description: item.attributes?.name ?? opts.name,
      });
    });

  // ── edit ─────────────────────────────────────────────────────────────────
  currency
    .command('edit')
    .description('Update a currency')
    .argument('<code>', 'Currency code')
    .option('--name <name>', 'Currency name')
    .option('--symbol <symbol>', 'Currency symbol')
    .option('--decimal-places <n>', 'Decimal places', (v) => Number.parseInt(v, 10))
    .option('--enabled', 'Enable')
    .option('--no-enabled', 'Disable')
    .action(async (code: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body: Record<string, unknown> = {};
      if (opts.name !== undefined) {
        body.name = opts.name;
      }
      if (opts.symbol !== undefined) {
        body.symbol = opts.symbol;
      }
      if (opts.decimalPlaces !== undefined) {
        body.decimal_places = opts.decimalPlaces;
      }
      if (command.getOptionValueSource('enabled') === 'cli') {
        body.enabled = opts.enabled;
      }
      const res = await client.put(`/currencies/${code}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.attributes?.code ?? code,
        verb: 'Updated currency',
        description: item.attributes?.name ?? '',
      });
    });

  // ── delete ───────────────────────────────────────────────────────────────
  currency
    .command('delete')
    .description('Delete a currency')
    .argument('<code>', 'Currency code')
    .action(async (code: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete currency ${code}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/currencies/${code}`);
      printMutation(ctx.output, { id: code, verb: 'Deleted currency', description: '' });
    });

  // ── enable / disable ──────────────────────────────────────────────────────
  currency
    .command('enable')
    .description('Enable a currency')
    .argument('<code>', 'Currency code')
    .action(async (code: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      await client.post(`/currencies/${code}/enable`);
      printMutation(ctx.output, { id: code, verb: 'Enabled currency', description: '' });
    });

  currency
    .command('disable')
    .description('Disable a currency')
    .argument('<code>', 'Currency code')
    .action(async (code: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      await client.post(`/currencies/${code}/disable`);
      printMutation(ctx.output, { id: code, verb: 'Disabled currency', description: '' });
    });

  // ── primary (show or set) ─────────────────────────────────────────────────
  currency
    .command('primary')
    .description('Show the primary currency, or set it with a code')
    .argument('[code]', 'Currency code to make primary')
    .action(async (code: string | undefined, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      if (!code) {
        const res = await client.get('/currencies/primary');
        const item = (res.data?.data ?? res.data) as any;
        renderCurrency(item, ctx);
        return;
      }
      const res = await client.post(`/currencies/${code}/primary`);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item?.attributes?.code ?? code,
        verb: 'Set primary currency',
        description: item?.attributes?.name ?? '',
      });
    });

  // ── rate (exchange rates) ─────────────────────────────────────────────────
  const rate = currency.command('rate').description('Manage exchange rates');

  rate
    .command('list')
    .description('List exchange rates')
    .option('--date <date>', 'Scope to a single date (ISO YYYY-MM-DD)')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path = opts.date ? `/exchange-rates/by-date/${opts.date}` : '/exchange-rates';
      const { data } = await client.getPaged(path, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(data, RATE_COLUMNS, ctx.output);
    });

  rate
    .command('view')
    .description('Show the exchange rate for a currency pair')
    .argument('<from>', 'From currency code')
    .argument('<to>', 'To currency code')
    .option('--date <date>', 'Rate on a specific date (ISO YYYY-MM-DD)')
    .action(async (from: string, to: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path = opts.date
        ? `/exchange-rates/${from}/${to}/${opts.date}`
        : `/exchange-rates/by-currencies/${from}/${to}`;
      const res = await client.get(path);
      const data = res.data?.data ?? res.data;
      const list = Array.isArray(data) ? data : [data];
      renderList(list, RATE_COLUMNS, ctx.output);
    });

  rate
    .command('set')
    .description('Set the exchange rate for a currency pair')
    .argument('<from>', 'From currency code')
    .argument('<to>', 'To currency code')
    .requiredOption('--rate <value>', 'Exchange rate value')
    .option('--date <date>', 'Date for the rate (ISO YYYY-MM-DD, default today)')
    .action(async (from: string, to: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const date = opts.date ?? new Date().toISOString().slice(0, 10);
      const body: Record<string, unknown> = { [date]: String(opts.rate) };
      const res = await client.post(`/exchange-rates/${from}/${to}`, body);
      const data = res.data?.data ?? res.data;
      const item = Array.isArray(data) ? data[0] : data;
      printMutation(ctx.output, {
        id: item?.id,
        verb: 'Set exchange rate',
        description: `${from}->${to} = ${opts.rate} (${date})`,
      });
    });

  rate
    .command('edit')
    .description('Update an exchange rate')
    .argument('<id>', 'Exchange rate id')
    .requiredOption('--rate <value>', 'Exchange rate value')
    .requiredOption('--date <date>', 'Date for the rate (ISO YYYY-MM-DD)')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.put(`/exchange-rates/${id}`, {
        rate: String(opts.rate),
        date: opts.date,
      });
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item?.id ?? id,
        verb: 'Updated exchange rate',
        description: String(opts.rate),
      });
    });

  rate
    .command('delete')
    .description('Delete an exchange rate')
    .argument('<id>', 'Exchange rate id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete exchange rate ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/exchange-rates/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted exchange rate', description: '' });
    });
}

function renderCurrency(item: any, ctx: Awaited<ReturnType<typeof getContext>>): void {
  const a = item?.attributes ?? {};
  renderItem(
    item ?? {},
    [
      { label: 'Code', get: () => a.code ?? item?.id ?? '' },
      { label: 'Name', get: () => a.name ?? '' },
      { label: 'Symbol', get: () => a.symbol ?? '' },
      { label: 'Decimal places', get: () => String(a.decimal_places ?? '') },
      { label: 'Enabled', get: () => String(a.enabled ?? '') },
      { label: 'Primary', get: () => String(a.primary ?? a.default ?? '') },
    ],
    ctx.output,
  );
}
