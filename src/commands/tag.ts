/**
 * `firefly tag` — cross-cutting labels on transactions (spec/06 tag.md).
 * The target accepts a tag id OR a tag name; the API keys these by tag string.
 * Endpoints: /tags[/{tag}[/transactions]].
 */
import type { Command } from 'commander';
import { UsageError } from '../api/errors.ts';
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
const numArg = (v: string) => Number.parseFloat(v);
const attrs = (row: any) => row?.attributes ?? row ?? {};
const firstSplit = (t: any) => attrs(t)?.transactions?.[0] ?? {};
const allSplits = (groups: any[]) => groups.flatMap((g) => attrs(g)?.transactions ?? []);

/** Render the server-provided `sums` array on a tag, or '' when absent/null. */
function formatSums(sums: any): string {
  if (!Array.isArray(sums) || sums.length === 0) {
    return '';
  }
  return sums
    .map((s: any) =>
      formatMoney(s.sum, {
        symbol: s.currency_symbol ?? '',
        decimalPlaces: s.currency_decimal_places,
      }),
    )
    .join(', ');
}

export function register(program: Command): void {
  const tag = program.command('tag').description('Manage tags');

  tag
    .command('list')
    .description('List tags')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/tags', {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (t: any) => t.id },
          { header: 'tag', get: (t: any) => attrs(t).tag ?? '' },
          { header: 'date', get: (t: any) => String(attrs(t).date ?? '').slice(0, 10) },
          { header: 'description', get: (t: any) => attrs(t).description ?? '' },
        ],
        ctx.output,
      );
    });

  tag
    .command('view')
    .description('Show one tag (with sums)')
    .argument('<tag>', 'Tag id or name')
    .action(async (target: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/tags/${encodeURIComponent(target)}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(
        item,
        [
          { label: 'ID', get: (t: any) => t.id },
          { label: 'Tag', get: (t: any) => attrs(t).tag ?? '' },
          { label: 'Date', get: (t: any) => String(attrs(t).date ?? '').slice(0, 10) },
          { label: 'Description', get: (t: any) => attrs(t).description ?? '' },
          { label: 'Sums', get: (t: any) => formatSums(attrs(t).sums) },
          { label: 'Latitude', get: (t: any) => String(attrs(t).latitude ?? '') },
          { label: 'Longitude', get: (t: any) => String(attrs(t).longitude ?? '') },
        ],
        ctx.output,
      );
    });

  tag
    .command('create')
    .description('Create a tag')
    .option('--tag <name>', 'Tag name')
    .option('--name <name>', 'Alias for --tag')
    .option('--date <date>', 'Date (YYYY-MM-DD)')
    .option('--description <text>', 'Description')
    .option('--latitude <n>', 'Latitude', numArg)
    .option('--longitude <n>', 'Longitude', numArg)
    .option('--zoom-level <n>', 'Map zoom level', intArg)
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      // Accept --name as an alias for --tag (a common guess). Only the truly
      // missing case is a usage error; an explicit empty string still hits the
      // server's own validation.
      const tagName = opts.tag ?? opts.name;
      if (tagName == null) {
        throw new UsageError('A tag name is required.', 'Pass --tag <name>.');
      }
      const body = compact({
        tag: tagName,
        date: opts.date,
        description: opts.description,
        latitude: opts.latitude,
        longitude: opts.longitude,
        zoom_level: opts.zoomLevel,
      });
      const res = await client.post('/tags', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created tag',
        description: attrs(item).tag ?? tagName,
      });
    });

  tag
    .command('edit')
    .description('Update a tag')
    .argument('<tag>', 'Tag id or name')
    .option('--tag <name>', 'New tag name')
    .option('--date <date>', 'Date (YYYY-MM-DD)')
    .option('--description <text>', 'Description')
    .option('--latitude <n>', 'Latitude', numArg)
    .option('--longitude <n>', 'Longitude', numArg)
    .option('--zoom-level <n>', 'Map zoom level', intArg)
    .action(async (target: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body = compact({
        tag: opts.tag,
        date: opts.date,
        description: opts.description,
        latitude: opts.latitude,
        longitude: opts.longitude,
        zoom_level: opts.zoomLevel,
      });
      const res = await client.put(`/tags/${encodeURIComponent(target)}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id ?? target,
        verb: 'Updated tag',
        description: attrs(item).tag ?? opts.tag ?? target,
      });
    });

  tag
    .command('delete')
    .description('Delete a tag')
    .argument('<tag>', 'Tag id or name')
    .action(async (target: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete tag ${target}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/tags/${encodeURIComponent(target)}`);
      printMutation(ctx.output, { id: target, verb: 'Deleted tag', description: '' });
    });

  tag
    .command('transactions')
    .description('Transactions with the tag')
    .argument('<tag>', 'Tag id or name')
    .option('--start <date>', 'Range start (YYYY-MM-DD)')
    .option('--end <date>', 'Range end (YYYY-MM-DD)')
    .option('--type <type>', 'Transaction type filter')
    .option('--limit <n>', 'Page size', intArg)
    .option('--page <n>', 'Page number', intArg)
    .option('--all', 'Fetch every page')
    .action(async (target: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/tags/${encodeURIComponent(target)}/transactions`, {
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

  tag
    .command('stats')
    .description("Aggregate a tag's transactions: count and sum per type")
    .argument('<tag>', 'Tag id or name')
    .option('--start <date>', 'Range start (YYYY-MM-DD)')
    .option('--end <date>', 'Range end (YYYY-MM-DD)')
    .action(async (target: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      // Always walk every page — stats over a partial page would be misleading.
      const { data } = await client.getPaged(`/tags/${encodeURIComponent(target)}/transactions`, {
        query: { start: opts.start, end: opts.end },
        all: true,
      });
      const byType = new Map<string, any>();
      for (const s of allSplits(data)) {
        const key = s.type ?? 'unknown';
        const row = byType.get(key) ?? {
          type: key,
          count: 0,
          total: 0,
          currency_code: s.currency_code ?? '',
          currency_decimal_places: s.currency_decimal_places,
        };
        row.count += 1;
        row.total += Number(s.amount ?? 0);
        byType.set(key, row);
      }
      const rows = [...byType.values()].map((r) => ({
        type: r.type,
        count: r.count,
        sum: formatMoney(r.total, { decimalPlaces: r.currency_decimal_places }),
        currency: r.currency_code,
      }));
      renderList(
        rows,
        [
          { header: 'type', get: (r: any) => r.type },
          { header: 'count', get: (r: any) => String(r.count) },
          { header: 'sum', get: (r: any) => r.sum },
          { header: 'currency', get: (r: any) => r.currency },
        ],
        ctx.output,
      );
    });
}
