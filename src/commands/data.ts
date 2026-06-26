/**
 * `firefly data` — bulk, export and destructive maintenance ops (spec/06
 * meta.md). Matrix rows `/data/export/*`, `/data/bulk/transactions`,
 * `/data/destroy`, `/data/purge`.
 *
 *   data export <kind>   GET /data/export/{kind}   (CSV → --output file or stdout)
 *   data bulk            POST /data/bulk/transactions
 *   data destroy         DELETE /data/destroy      (guarded: --objects + typed confirm)
 *   data purge           DELETE /data/purge        (guarded: typed confirm)
 *
 * Foundation note: the shared client always requests `Accept: application/json`
 * and reads the body as text (no binary path). Firefly exports are CSV text, so
 * writing `res.data` verbatim is correct today; a true binary export endpoint
 * would need a foundation streaming/array-buffer path.
 */
import type { Command } from 'commander';
import type { Query } from '../api/client.ts';
import { UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import { printMessage, printMutation, printResult } from '../output/render.ts';

/** Exportable kinds → `/data/export/{kind}` (spec/06 meta.md). */
export const EXPORT_KINDS = [
  'accounts',
  'bills',
  'budgets',
  'categories',
  'piggy-banks',
  'recurring',
  'rules',
  'tags',
  'transactions',
] as const;

/** Accumulate repeated `--flag key=value` into an object. */
function collectKv(raw: string, prev: Record<string, string>): Record<string, string> {
  const eq = raw.indexOf('=');
  if (eq === -1) {
    throw new UsageError(`Invalid entry (expected key=value): ${raw}`);
  }
  prev[raw.slice(0, eq).trim()] = raw.slice(eq + 1).trim();
  return prev;
}

export function register(program: Command): void {
  const data = program.command('data').description('Bulk, export and destructive data operations');

  // ── export ───────────────────────────────────────────────────────────────
  data
    .command('export')
    .description(
      `Export data ("pull everything once, analyze locally"). kind ∈ ${EXPORT_KINDS.join(', ')}`,
    )
    .argument('<kind>', 'What to export')
    .option('--format <fmt>', 'Output format: csv|json|ndjson (default csv)', 'csv')
    .option('--output <file>', 'Write to a file instead of stdout')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--end <date>', 'End date (YYYY-MM-DD)')
    .action(async (kind: string, opts, command: Command) => {
      if (!EXPORT_KINDS.includes(kind as (typeof EXPORT_KINDS)[number])) {
        throw new UsageError(
          `Invalid export kind "${kind}".`,
          `Valid kinds: ${EXPORT_KINDS.join(', ')}`,
        );
      }
      const format = opts.format as string;
      if (!['csv', 'json', 'ndjson'].includes(format)) {
        throw new UsageError(`Invalid --format "${format}".`, 'Valid: csv, json, ndjson.');
      }
      const ctx = await getContext(command);
      const client = await ctx.client();

      let body: string;
      if (format === 'csv') {
        const query: Query = { type: 'csv' };
        if (opts.start) {
          query.start = opts.start;
        }
        if (opts.end) {
          query.end = opts.end;
        }
        const res = await client.get(`/data/export/${kind}`, query);
        body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      } else {
        // json/ndjson: pull the full collection via the list endpoint and serialize.
        const { data } = await client.getPaged(`/${kind}`, {
          query: { start: opts.start, end: opts.end },
          all: true,
        });
        body =
          format === 'ndjson'
            ? data.map((d) => JSON.stringify(d)).join('\n')
            : JSON.stringify(data, null, 2);
      }

      if (opts.output) {
        await Bun.write(opts.output, body.endsWith('\n') ? body : `${body}\n`);
        printMessage(`Exported ${kind} → ${opts.output}`, ctx.output);
        return;
      }
      process.stdout.write(body.endsWith('\n') ? body : `${body}\n`);
    });

  // ── bulk ─────────────────────────────────────────────────────────────────
  //
  // Firefly's bulk endpoint matches transactions by *field equality* (a `where`
  // clause), NOT the search DSL. For DSL-based selection (description_contains,
  // amount_more, …) use `firefly tx categorize <query> <cat>` or
  // `firefly tx edit --where <query>` instead.
  data
    .command('bulk')
    .description('Bulk-update transactions by field-equality (POST /data/bulk/transactions)')
    .option('--query <json>', 'Raw JSON bulk query (escape hatch; Firefly bulk-update syntax)')
    .option('--where <key=value>', 'Match field equals value (repeatable)', collectKv, {})
    .option('--set <key=value>', 'Field to update with a new value (repeatable)', collectKv, {})
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  firefly data bulk --where category_id=1 --set category_id=5\n' +
        '  firefly data bulk --query \'{"where":{"category_id":"1"},"update":{"category_id":"5"}}\'\n' +
        '\nNote: where-clauses are exact field matches. For search-query selection use\n' +
        "'firefly tx categorize' / 'firefly tx edit --where'.",
    )
    .action(async (opts, command: Command) => {
      let query: string;
      if (opts.query) {
        try {
          JSON.parse(opts.query);
        } catch {
          throw new UsageError('--query must be valid JSON.');
        }
        query = opts.query;
      } else {
        const update = opts.set as Record<string, string>;
        if (Object.keys(update).length === 0) {
          throw new UsageError(
            'Nothing to update.',
            'Pass --set key=value (and optionally --where key=value), or --query <json>.',
          );
        }
        query = JSON.stringify({ where: opts.where, update });
      }
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.post('/data/bulk/transactions', undefined, {
        query: { query },
      });
      if (ctx.output.mode === 'json' || ctx.output.mode === 'template') {
        printResult(res.data ?? {}, ctx.output);
        return;
      }
      printMutation(ctx.output, { verb: 'Bulk-updated transactions', description: '' });
    });

  // ── destroy (guarded) ──────────────────────────────────────────────────────
  data
    .command('destroy')
    .description('DESTRUCTIVE: delete all objects of a type (DELETE /data/destroy)')
    .requiredOption('--objects <type>', 'Object type to destroy (e.g. budgets, transactions)')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const instance = await ctx.resolveInstance();
      const confirmed = await ctx.confirmTyped(
        `This permanently destroys all "${opts.objects}" on instance "${instance.name}".`,
        instance.name,
      );
      if (!confirmed) {
        throw new UsageError('Confirmation did not match; aborted.');
      }
      const client = await ctx.client();
      await client.delete('/data/destroy', { query: { objects: opts.objects } });
      printMutation(ctx.output, { verb: 'Destroyed', description: opts.objects });
    });

  // ── purge (guarded) ────────────────────────────────────────────────────────
  data
    .command('purge')
    .description('DESTRUCTIVE: permanently purge soft-deleted objects (DELETE /data/purge)')
    .action(async (_opts, command: Command) => {
      const ctx = await getContext(command);
      const instance = await ctx.resolveInstance();
      const confirmed = await ctx.confirmTyped(
        `This permanently purges all soft-deleted objects on instance "${instance.name}".`,
        instance.name,
      );
      if (!confirmed) {
        throw new UsageError('Confirmation did not match; aborted.');
      }
      const client = await ctx.client();
      await client.delete('/data/purge');
      printMutation(ctx.output, { verb: 'Purged soft-deleted objects', description: '' });
    });
}
