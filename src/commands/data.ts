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

export function register(program: Command): void {
  const data = program.command('data').description('Bulk, export and destructive data operations');

  // ── export ───────────────────────────────────────────────────────────────
  data
    .command('export')
    .description(`Export data to CSV. kind ∈ ${EXPORT_KINDS.join(', ')}`)
    .argument('<kind>', 'What to export')
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
      const ctx = await getContext(command);
      const client = await ctx.client();
      const query: Query = { type: 'csv' };
      if (opts.start) {
        query.start = opts.start;
      }
      if (opts.end) {
        query.end = opts.end;
      }
      const res = await client.get(`/data/export/${kind}`, query);
      // CSV bodies come back as text; JSON-ish bodies stringify cleanly too.
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

      if (opts.output) {
        await Bun.write(opts.output, body);
        printMessage(`Exported ${kind} → ${opts.output}`, ctx.output);
        return;
      }
      process.stdout.write(body.endsWith('\n') ? body : `${body}\n`);
    });

  // ── bulk ─────────────────────────────────────────────────────────────────
  data
    .command('bulk')
    .description('Bulk-update transactions by query (POST /data/bulk/transactions)')
    .requiredOption('--query <json>', 'JSON bulk query (Firefly bulk-update syntax)')
    .action(async (opts, command: Command) => {
      // Validate it parses; the API expects the raw JSON string as a query param.
      try {
        JSON.parse(opts.query);
      } catch {
        throw new UsageError('--query must be valid JSON.');
      }
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.post('/data/bulk/transactions', undefined, {
        query: { query: opts.query },
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
