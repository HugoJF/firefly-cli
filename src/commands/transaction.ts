/**
 * `firefly transaction` — Firefly's core object. A transaction is a *group* of
 * one or more **splits** (each: type, amount, source, destination, …). We model
 * the group, not raw split rows. Aliases: `tx`, `txn`.
 *
 * Covers coverage-matrix rows:
 *   /transactions                          GET, POST → list / create
 *   /transactions/{id}                     GET,PUT,DEL → view / edit / delete
 *   /transaction-journals/{id}             GET, DEL  → view/delete --journal
 *   /transactions/{id}/piggy-bank-events   GET       → events
 *   /accounts|categories|budgets/{id}/transactions, /tags/{tag}/transactions,
 *   /currencies/{code}/transactions        GET       → scoped list filters
 *   /attachments (+/{id}/upload)           POST      → attach
 *
 * See spec/06-commands/transaction.md.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import type { FireflyClient } from '../api/client.ts';
import { buildUrl } from '../api/client.ts';
import { CancelledError, UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import {
  formatMoney,
  formatSplitAmount,
  printMutation,
  printResult,
  renderItem,
  renderList,
} from '../output/render.ts';
import { type ReferenceKind, pickReference } from '../output/selectors.ts';
import { mapConcurrent } from '../util/concurrent.ts';
import { readStdin } from '../util/prompt.ts';
import { SEARCH_OPERATORS_HELP } from './search.ts';

const TX_TYPES = ['withdrawal', 'deposit', 'transfer'];

function int(value: string): number {
  return Number.parseInt(value, 10);
}

function collect(value: string, prev: string[]): string[] {
  prev.push(value);
  return prev;
}

/**
 * Resolve a date-ish input to ISO `YYYY-MM-DD`. Small relative subset
 * (`today`, `yesterday`, `-Nd`, `this-month`); ISO strings pass through.
 * Foundation gap: no shared relative-date resolver (see final report).
 */
function toIsoDate(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }
  const value = input.trim();
  const today = new Date();
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  if (value === 'today') {
    return iso(today);
  }
  if (value === 'yesterday') {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return iso(d);
  }
  if (value === 'this-month') {
    return iso(new Date(today.getFullYear(), today.getMonth(), 1));
  }
  const rel = value.match(/^([+-]\d+)d$/);
  if (rel) {
    const d = new Date(today);
    d.setDate(d.getDate() + Number.parseInt(rel[1], 10));
    return iso(d);
  }
  return value;
}

function firstSplit(group: any): any {
  return group?.attributes?.transactions?.[0] ?? {};
}

function signedAmount(split: any): string {
  return formatSplitAmount(split, { signed: true });
}

/** Curated group-level columns for a transaction list (spec/06). */
const transactionColumns = [
  { header: 'id', get: (t: any) => t.id ?? '' },
  { header: 'date', get: (t: any) => String(firstSplit(t).date ?? '').slice(0, 10) },
  { header: 'type', get: (t: any) => firstSplit(t).type ?? '' },
  {
    header: 'description',
    get: (t: any) => t.attributes?.group_title ?? firstSplit(t).description ?? '',
  },
  { header: 'amount', get: (t: any) => signedAmount(firstSplit(t)) },
  {
    header: 'source → destination',
    get: (t: any) => `${firstSplit(t).source_name ?? ''} → ${firstSplit(t).destination_name ?? ''}`,
  },
  { header: 'category', get: (t: any) => firstSplit(t).category_name ?? '' },
];

/** Group-by dimensions for `tx list --group-by` (client-side roll-up). */
const GROUP_BY_DIMS = ['category', 'account', 'payee', 'month', 'day-of-week'] as const;
type GroupByDim = (typeof GROUP_BY_DIMS)[number];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Bucket key for a split under the chosen dimension. "payee" = the non-asset side. */
function groupKey(split: any, dim: GroupByDim): string {
  switch (dim) {
    case 'category':
      return split.category_name || '(uncategorized)';
    case 'account':
      return split.source_name || '(unknown)';
    case 'payee':
      // For a withdrawal the payee is the destination; for a deposit, the source.
      return (split.type === 'deposit' ? split.source_name : split.destination_name) || '(unknown)';
    case 'month':
      return String(split.date ?? '').slice(0, 7) || '(no date)';
    case 'day-of-week': {
      const d = split.date ? new Date(split.date) : null;
      return d && !Number.isNaN(d.getTime()) ? WEEKDAYS[d.getUTCDay()] : '(no date)';
    }
  }
}

/** Roll transaction groups up by a dimension and render the aggregate table. */
function renderGroupBy(rows: any[], dim: GroupByDim, opts: any, ctx: any): void {
  const buckets = new Map<string, { count: number; sum: number; dp: number }>();
  for (const group of rows) {
    for (const split of group?.attributes?.transactions ?? []) {
      const key = groupKey(split, dim);
      const bucket = buckets.get(key) ?? { count: 0, sum: 0, dp: 2 };
      bucket.count += 1;
      const amount = Number(split.amount);
      if (!Number.isNaN(amount)) {
        bucket.sum += Math.abs(amount);
      }
      if (Number.isFinite(split.currency_decimal_places)) {
        bucket.dp = split.currency_decimal_places;
      }
      buckets.set(key, bucket);
    }
  }
  // Sort by summed amount desc when summing, else by count desc.
  const entries = [...buckets.entries()].sort((a, b) =>
    opts.sum ? b[1].sum - a[1].sum : b[1].count - a[1].count,
  );
  const columns: Array<{ header: string; get: (e: [string, any]) => string }> = [
    { header: dim, get: (e) => e[0] },
    { header: 'count', get: (e) => String(e[1].count) },
  ];
  if (opts.sum) {
    columns.push({
      header: 'sum',
      get: (e) => formatMoney(e[1].sum, { decimalPlaces: e[1].dp }),
    });
  }
  renderList(entries, columns, ctx.output);
}

/** Render a transaction list, or a roll-up when --group-by is set. */
function emitTransactions(rows: any[], opts: any, ctx: any): void {
  if (opts.groupBy) {
    if (!GROUP_BY_DIMS.includes(opts.groupBy)) {
      throw new UsageError(
        `Invalid --group-by "${opts.groupBy}".`,
        `Valid: ${GROUP_BY_DIMS.join(', ')}.`,
      );
    }
    renderGroupBy(rows, opts.groupBy as GroupByDim, opts, ctx);
    return;
  }
  renderList(rows, transactionColumns, ctx.output);
}

/** Resolve an account name to its id via the search endpoint (exact-ish match). */
async function resolveAccountId(client: FireflyClient, name: string): Promise<string> {
  const { data } = await client.getPaged('/search/accounts', {
    query: { query: name, field: 'name' },
    limit: 50,
  });
  const exact = data.find(
    (a: any) => (a.attributes?.name ?? '').toLowerCase() === name.toLowerCase(),
  );
  const hit = exact ?? data[0];
  if (!hit?.id) {
    throw new UsageError(
      `No account matched name "${name}".`,
      'Check the name or pass --account <id>.',
    );
  }
  return hit.id;
}

/** Map a flag value to either an `_id` (numeric) or `_name` field. */
function refFields(prefix: string, value?: string): Record<string, string> {
  if (!value) {
    return {};
  }
  return /^\d+$/.test(value) ? { [`${prefix}_id`]: value } : { [`${prefix}_name`]: value };
}

/**
 * Resolve a reference flag, falling back to an autocomplete picker when missing.
 * `required` references prompt on a TTY / error off-TTY; optional ones are simply
 * left unset when absent.
 */
async function resolveRef(
  ctx: Awaited<ReturnType<typeof getContext>>,
  kind: ReferenceKind,
  value: string | undefined,
  flag: string,
  required: boolean,
): Promise<string | undefined> {
  if (value) {
    return value;
  }
  if (!required) {
    return undefined;
  }
  return (await pickReference(kind, ctx, { flag })).id;
}

/** Parse a `--split key=val,key=val` string into an API split object. */
function parseSplit(raw: string, defaults: Record<string, unknown>): Record<string, unknown> {
  const split: Record<string, unknown> = { ...defaults };
  for (const pair of raw.split(',')) {
    if (!pair.trim()) {
      continue;
    }
    const eq = pair.indexOf('=');
    if (eq === -1) {
      throw new UsageError(`Invalid --split entry (expected key=value): ${pair}`);
    }
    const key = pair.slice(0, eq).trim();
    const val = pair.slice(eq + 1).trim();
    switch (key) {
      case 'type':
      case 'amount':
      case 'description':
      case 'notes':
        split[key] = val;
        break;
      case 'date':
        split.date = toIsoDate(val);
        break;
      case 'source':
        Object.assign(split, refFields('source', val));
        break;
      case 'destination':
        Object.assign(split, refFields('destination', val));
        break;
      case 'category':
        Object.assign(split, refFields('category', val));
        break;
      case 'budget':
        Object.assign(split, refFields('budget', val));
        break;
      case 'tag':
      case 'tags':
        split.tags = [...((split.tags as string[]) ?? []), val];
        break;
      case 'foreign_amount':
      case 'foreign-amount':
        split.foreign_amount = val;
        break;
      case 'foreign_currency':
      case 'foreign-currency':
        split.foreign_currency_code = val;
        break;
      default:
        split[key] = val;
    }
  }
  return split;
}

/** Open `$VISUAL`/`$EDITOR` with seed content; return the saved text. */
function openEditor(seed: string): string {
  const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
  const file = join(tmpdir(), `firefly-tx-${Date.now()}.yaml`);
  writeFileSync(file, seed);
  const [cmd, ...args] = editor.split(/\s+/);
  const res = spawnSync(cmd, [...args, file], { stdio: 'inherit' });
  if (res.status !== 0 && res.status !== null) {
    throw new CancelledError('Editor exited with an error.');
  }
  const text = readFileSync(file, 'utf8');
  rmSync(file, { force: true });
  return text;
}

/** Parse an editor/YAML body into an array of split objects. */
function splitsFromYaml(text: string): Record<string, unknown>[] {
  const stripped = text.replace(/^\s*#.*$/gm, '').trim();
  if (!stripped) {
    throw new CancelledError('Empty buffer — aborted.');
  }
  const parsed = parseYaml(stripped);
  const list = Array.isArray(parsed) ? parsed : parsed?.transactions;
  if (!Array.isArray(list) || list.length === 0) {
    throw new UsageError('Editor body must contain a non-empty list of splits.');
  }
  return list as Record<string, unknown>[];
}

const EDITOR_TEMPLATE = `# One transaction = a list of splits. Save & close to submit; empty to abort.
transactions:
  - type: withdrawal
    amount: "0.00"
    description: ""
    source_name: ""
    destination_name: ""
    # category_name: ""
    # budget_name: ""
`;

/** Assemble the splits array for create/edit from flags / --split / --editor. */
async function assembleSplits(
  ctx: Awaited<ReturnType<typeof getContext>>,
  opts: any,
  seed: string,
): Promise<Record<string, unknown>[]> {
  if (opts.editor) {
    return splitsFromYaml(openEditor(seed));
  }

  const defaults: Record<string, unknown> = {};
  if (opts.type) {
    defaults.type = opts.type;
  }
  if (opts.date) {
    defaults.date = toIsoDate(opts.date);
  }
  Object.assign(defaults, refFields('source', opts.source));
  Object.assign(defaults, refFields('destination', opts.destination));

  if (opts.split && opts.split.length > 0) {
    return (opts.split as string[]).map((raw) => parseSplit(raw, defaults));
  }

  // Single split from top-level flags (the 90% case).
  const type = opts.type ?? (await pickType());
  const source = await resolveRef(ctx, 'accounts', opts.source, '--source', true);
  const destination = await resolveRef(ctx, 'accounts', opts.destination, '--destination', true);
  const category = await resolveRef(ctx, 'categories', opts.category, '--category', false);
  const budget = await resolveRef(ctx, 'budgets', opts.budget, '--budget', false);

  if (!opts.amount) {
    throw new UsageError('Missing required amount.', 'Provide --amount.');
  }
  if (!opts.description) {
    throw new UsageError('Missing required description.', 'Provide --description.');
  }

  const split: Record<string, unknown> = {
    type,
    amount: opts.amount,
    description: opts.description,
    date: toIsoDate(opts.date) ?? toIsoDate('today'),
    ...refFields('source', source),
    ...refFields('destination', destination),
    ...refFields('category', category),
    ...refFields('budget', budget),
  };
  if (opts.tag && opts.tag.length > 0) {
    split.tags = opts.tag;
  }
  if (opts.notes) {
    split.notes = opts.notes;
  }
  if (opts.foreignAmount) {
    split.foreign_amount = opts.foreignAmount;
  }
  if (opts.foreignCurrency) {
    split.foreign_currency_code = opts.foreignCurrency;
  }
  return [split];
}

/** Choice prompt for --type (TTY) / flag-error (off-TTY). */
async function pickType(): Promise<string> {
  const { isInteractive, readLine } = await import('../util/prompt.ts');
  if (!isInteractive()) {
    throw new UsageError('Missing required type.', 'Provide --type withdrawal|deposit|transfer.');
  }
  process.stderr.write('Select type:\n');
  TX_TYPES.forEach((t, i) => process.stderr.write(`  ${i + 1}) ${t}\n`));
  const answer = (await readLine(`Enter number [1-${TX_TYPES.length}]: `)).trim();
  const idx = Number.parseInt(answer, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= TX_TYPES.length) {
    throw new UsageError('Invalid selection.', 'Provide --type.');
  }
  return TX_TYPES[idx];
}

/** Shared create/edit flag set. */
function addWriteFlags(cmd: Command): Command {
  return cmd
    .option('--type <type>', `Transaction type (${TX_TYPES.join('|')})`)
    .option('--amount <amount>', 'Amount (decimal)')
    .option('--description <text>', 'Description')
    .option('--source <ref>', 'Source account (id or name)')
    .option('--destination <ref>', 'Destination account (id or name)')
    .option('--date <date>', 'Date (default today; relative ok)')
    .option('--category <ref>', 'Category (id or name)')
    .option('--budget <ref>', 'Budget (id or name)')
    .option('--tag <tag>', 'Tag (repeatable)', collect, [])
    .option('--foreign-amount <amount>', 'Foreign-currency amount')
    .option('--foreign-currency <code>', 'Foreign currency code')
    .option('--notes <text>', 'Notes')
    .option('--split <kv>', 'Add a split: key=val,key=val (repeatable)', collect, [])
    .option('--editor', 'Compose splits in $EDITOR (YAML)');
}

/** Changed fields only: build one partial split from edit flags. */
function buildPartialSplit(opts: any): Record<string, unknown> {
  const split: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== '') {
      split[k] = v;
    }
  };
  set('type', opts.type);
  set('amount', opts.amount);
  set('description', opts.description);
  set('date', toIsoDate(opts.date));
  set('notes', opts.notes);
  Object.assign(split, refFields('source', opts.source));
  Object.assign(split, refFields('destination', opts.destination));
  Object.assign(split, refFields('category', opts.category));
  Object.assign(split, refFields('budget', opts.budget));
  if (opts.tag && opts.tag.length > 0) {
    split.tags = opts.tag;
  }
  return split;
}

/** Build the PUT body for a single transaction edit (editor / --split / flags). */
async function buildEditBody(
  client: FireflyClient,
  id: string,
  opts: any,
): Promise<Record<string, unknown>> {
  if (opts.editor) {
    const current = (await client.get(`/transactions/${id}`)).data?.data as any;
    const seed = toYaml({ transactions: current?.attributes?.transactions ?? [] });
    return { transactions: splitsFromYaml(openEditor(seed)) };
  }
  if (opts.split && opts.split.length > 0) {
    return { transactions: (opts.split as string[]).map((raw) => parseSplit(raw, {})) };
  }
  const split = buildPartialSplit(opts);
  if (Object.keys(split).length === 0) {
    throw new UsageError('No fields to update.', 'Pass a field flag, --split, or --editor.');
  }
  return { transactions: [split] };
}

/** Resolve the id set for an edit: explicit ids, a --where query, or --stdin. */
async function resolveEditTargets(
  client: FireflyClient,
  ids: string[],
  opts: any,
): Promise<string[]> {
  const chosen = [opts.where && 'where', opts.stdin && 'stdin', ids.length && 'ids'].filter(
    Boolean,
  );
  if (chosen.length > 1) {
    throw new UsageError('Choose one selection source: ids, --where, or --stdin.');
  }
  if (opts.where) {
    const { data } = await client.getPaged('/search/transactions', {
      query: { query: opts.where },
      all: true,
    });
    return data.map((t: any) => t.id).filter(Boolean);
  }
  if (opts.stdin) {
    const text = await readStdin();
    return text
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ids;
}

/** Edit a single split in place: PUT its group with the split keyed by journal id. */
async function editSingleJournal(
  client: FireflyClient,
  ctx: Awaited<ReturnType<typeof getContext>>,
  journalId: string,
  opts: any,
): Promise<void> {
  const group = (await client.get(`/transaction-journals/${journalId}`)).data?.data as any;
  const groupId = group?.id;
  if (!groupId) {
    throw new UsageError(`Could not resolve the transaction group for journal ${journalId}.`);
  }
  const split = buildPartialSplit(opts);
  if (Object.keys(split).length === 0) {
    throw new UsageError('No fields to update.', 'Pass a field flag (e.g. --category).');
  }
  split.transaction_journal_id = journalId;
  const res = await client.put(`/transactions/${groupId}`, { transactions: [split] });
  const item = (res.data?.data ?? res.data) as any;
  printMutation(ctx.output, {
    id: journalId,
    verb: 'Updated split',
    description: item?.attributes?.group_title ?? '',
  });
}

/** Apply one partial split to many transactions with bounded concurrency. */
async function runBulkEdit(
  ctx: Awaited<ReturnType<typeof getContext>>,
  client: FireflyClient,
  targets: string[],
  split: Record<string, unknown>,
  concurrency: number,
): Promise<void> {
  const body = { transactions: [split] };
  if (!(await ctx.confirm(`Update ${targets.length} transactions?`))) {
    return;
  }
  let done = 0;
  const showProgress = !ctx.output.quiet && process.stderr.isTTY;
  const results = await mapConcurrent(
    targets,
    concurrency,
    (txId) => client.put(`/transactions/${txId}`, body),
    () => {
      done += 1;
      if (showProgress) {
        process.stderr.write(`\rupdating… ${done}/${targets.length}`);
      }
    },
  );
  if (showProgress) {
    process.stderr.write('\r\x1b[K');
  }
  const failed = results.filter((r) => !r.ok);
  for (const f of failed) {
    process.stderr.write(`failed #${f.item}: ${(f.error as Error)?.message ?? 'error'}\n`);
  }
  printMutation(ctx.output, {
    verb: 'Updated',
    description: `${results.length - failed.length} transactions${
      failed.length ? `, ${failed.length} failed` : ''
    }`,
  });
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

export function register(program: Command): void {
  const tx = program
    .command('transaction')
    .aliases(['tx', 'txn'])
    .description('Manage transactions');

  // ── list ──────────────────────────────────────────────────────────────────
  tx.command('list')
    .description('List transactions')
    .option('--query <q>', 'Server-side search query (Firefly DSL); see below')
    .option('--type <type>', 'Filter by type (withdrawal|deposit|transfer)')
    .option('--start <date>', 'Start date')
    .option('--end <date>', 'End date')
    .option('--account <id>', 'Scope to an account id')
    .option('--account-name <name>', 'Scope to an account by name (resolved server-side)')
    .option('--category <id>', 'Scope to a category id')
    .option('--budget <id>', 'Scope to a budget id')
    .option('--tag <tag>', 'Scope to a tag')
    .option('--currency <code>', 'Scope to a currency code')
    .option(
      '--group-by <dim>',
      `Aggregate rows by ${GROUP_BY_DIMS.join('|')} (implies a roll-up table)`,
    )
    .option('--sum', 'With --group-by: include a summed amount column')
    .option('--count', 'With --group-by: include a row count column (on by default)')
    .option('--limit <n>', 'Page size', int)
    .option('--page <n>', 'Page number', int)
    .option('--all', 'Fetch every page')
    .addHelpText('after', SEARCH_OPERATORS_HELP)
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();

      // --query routes to the search endpoint so `list` and `search` aren't a
      // cliff edge ("list has flags, search has a secret language").
      if (opts.query) {
        const { data } = await client.getPaged('/search/transactions', {
          query: { query: opts.query },
          limit: opts.limit,
          page: opts.page,
          all: opts.all,
        });
        emitTransactions(data, opts, ctx);
        return;
      }

      // Resolve --account-name → id (an extra hop the agent usually skipped).
      let accountId = opts.account;
      if (!accountId && opts.accountName) {
        accountId = await resolveAccountId(client, opts.accountName);
      }

      let path = '/transactions';
      if (accountId) {
        path = `/accounts/${accountId}/transactions`;
      } else if (opts.category) {
        path = `/categories/${opts.category}/transactions`;
      } else if (opts.budget) {
        path = `/budgets/${opts.budget}/transactions`;
      } else if (opts.tag) {
        path = `/tags/${opts.tag}/transactions`;
      } else if (opts.currency) {
        path = `/currencies/${opts.currency}/transactions`;
      }

      // Nudge away from "dump the whole DB and filter in jq" when --all is used
      // with no server-side narrowing at all.
      const noFilter =
        !opts.type && !accountId && !opts.category && !opts.budget && !opts.tag && !opts.currency;
      if (opts.all && noFilter && !opts.groupBy && !ctx.output.quiet) {
        process.stderr.write(
          "tip: server-side filtering available via 'firefly search transactions <query>' " +
            "(see 'firefly tx list --help')\n",
        );
      }

      const { data } = await client.getPaged(path, {
        query: { type: opts.type, start: toIsoDate(opts.start), end: toIsoDate(opts.end) },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      emitTransactions(data, opts, ctx);
    });

  // ── view ──────────────────────────────────────────────────────────────────
  tx.command('view')
    .description('Show one transaction group (or a single journal with --journal)')
    .argument('<id>', 'Transaction (group) id, or journal id with --journal')
    .option('--journal', 'Treat the id as a transaction-journal (single split) id')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path = opts.journal ? `/transaction-journals/${id}` : `/transactions/${id}`;
      const res = await client.get(path);
      const item = (res.data?.data ?? res.data) as any;
      if (ctx.output.mode === 'json' || ctx.output.mode === 'template') {
        printResult(item, ctx.output);
        return;
      }
      const splits: any[] = item?.attributes?.transactions ?? [];
      renderItem(
        item,
        [
          { label: 'ID', get: () => item?.id ?? id },
          { label: 'Date', get: () => String(firstSplit(item).date ?? '').slice(0, 10) },
          { label: 'Type', get: () => firstSplit(item).type ?? '' },
          {
            label: 'Description',
            get: () => item?.attributes?.group_title ?? firstSplit(item).description ?? '',
          },
          { label: 'Splits', get: () => String(splits.length) },
          {
            label: 'Amount',
            get: () => splits.map((s) => signedAmount(s)).join(', '),
          },
          {
            label: 'Source → Destination',
            get: () =>
              splits.map((s) => `${s.source_name ?? ''} → ${s.destination_name ?? ''}`).join('; '),
          },
          { label: 'Category', get: () => firstSplit(item).category_name ?? '' },
          { label: 'Budget', get: () => firstSplit(item).budget_name ?? '' },
        ],
        ctx.output,
      );
    });

  // ── create ────────────────────────────────────────────────────────────────
  addWriteFlags(tx.command('create').description('Create a transaction')).action(
    async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const splits = await assembleSplits(ctx, opts, EDITOR_TEMPLATE);
      const body: Record<string, unknown> = { transactions: splits };
      if (splits.length > 1 && opts.description) {
        body.group_title = opts.description;
      }
      const res = await client.post('/transactions', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item?.id,
        verb: 'Created transaction',
        description: item?.attributes?.group_title ?? firstSplit(item).description ?? '',
      });
    },
  );

  // ── edit ──────────────────────────────────────────────────────────────────
  addWriteFlags(
    tx
      .command('edit')
      .description('Update one or many transactions (ids, --stdin, or --where)')
      .argument('[ids...]', 'Transaction id(s); omit when using --where or --stdin'),
  )
    .option('--journal', 'Treat a single id as a transaction-journal (one split) and edit just it')
    .option('--where <query>', 'Select transactions to edit by search query (Firefly DSL)')
    .option('--stdin', 'Read transaction ids from stdin (whitespace/newline separated)')
    .option('--concurrency <n>', 'Max parallel updates for bulk edits (default 8)', int)
    .addHelpText('after', SEARCH_OPERATORS_HELP)
    .action(async (ids: string[], opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();

      // Resolve the target id set: explicit ids, --where query, or --stdin.
      const targets = await resolveEditTargets(client, ids, opts);
      if (targets.length === 0) {
        throw new UsageError(
          'No transactions to edit.',
          'Pass an id, --where <query>, or --stdin.',
        );
      }

      // Per-split edit: PUT the parent group with the split keyed by its journal id.
      if (opts.journal) {
        if (targets.length !== 1) {
          throw new UsageError('--journal edits exactly one journal id.');
        }
        await editSingleJournal(client, ctx, targets[0], opts);
        return;
      }

      // Single explicit target: keep the original single-edit UX (editor support,
      // returns the updated description).
      if (targets.length === 1 && !opts.where && !opts.stdin) {
        const body = await buildEditBody(client, targets[0], opts);
        const res = await client.put(`/transactions/${targets[0]}`, body);
        const item = (res.data?.data ?? res.data) as any;
        printMutation(ctx.output, {
          id: item?.id ?? targets[0],
          verb: 'Updated transaction',
          description: item?.attributes?.group_title ?? firstSplit(item).description ?? '',
        });
        return;
      }

      // Bulk: --editor is single-only; otherwise apply one partial split to each.
      if (opts.editor) {
        throw new UsageError(
          '--editor cannot be combined with bulk selection (--where/--stdin/multiple ids).',
        );
      }
      const split = buildPartialSplit(opts);
      if (Object.keys(split).length === 0) {
        throw new UsageError('No fields to update.', 'Pass a field flag (e.g. --category).');
      }
      await runBulkEdit(ctx, client, targets, split, opts.concurrency ?? 8);
    });

  // ── categorize ──────────────────────────────────────────────────────────────
  tx.command('categorize')
    .description('Bulk-set a category on every transaction matching a query')
    .argument('<query>', 'Search query selecting the transactions (Firefly DSL)')
    .argument('<category>', 'Category to set (id or name)')
    .option('--concurrency <n>', 'Max parallel updates (default 8)', int)
    .addHelpText('after', SEARCH_OPERATORS_HELP)
    .action(async (query: string, category: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/search/transactions', {
        query: { query },
        all: true,
      });
      const targets = data.map((t: any) => t.id).filter(Boolean);
      if (targets.length === 0) {
        throw new UsageError(`No transactions matched query: ${query}`);
      }
      const split = { ...refFields('category', category) };
      await runBulkEdit(ctx, client, targets, split, opts.concurrency ?? 8);
    });

  // ── delete ────────────────────────────────────────────────────────────────
  tx.command('delete')
    .description('Delete a transaction (or a single journal with --journal)')
    .argument('<id>', 'Transaction (group) id, or journal id with --journal')
    .option('--journal', 'Delete a single transaction-journal instead of the group')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const what = opts.journal ? 'transaction journal' : 'transaction';
      if (!(await ctx.confirm(`Delete ${what} ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      const path = opts.journal ? `/transaction-journals/${id}` : `/transactions/${id}`;
      await client.delete(path);
      printMutation(ctx.output, { id, verb: `Deleted ${what}`, description: '' });
    });

  // ── attach ────────────────────────────────────────────────────────────────
  tx.command('attach')
    .description('Attach a file to a transaction')
    .argument('<id>', 'Transaction id')
    .argument('<file>', 'Path to the file to attach')
    .action(async (id: string, file: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      // Attachments hang off a transaction-journal (a split), not the group.
      const group = (await client.get(`/transactions/${id}`)).data?.data as any;
      const journalId = firstSplit(group).transaction_journal_id;
      if (!journalId) {
        throw new UsageError(`Could not resolve a journal id for transaction ${id}.`);
      }
      const filename = file.split('/').pop() ?? file;
      const created = (
        await client.post('/attachments', {
          filename,
          attachable_type: 'TransactionJournal',
          attachable_id: String(journalId),
        })
      ).data?.data as any;
      await uploadBinary(ctx, `/attachments/${created.id}/upload`, file);
      printMutation(ctx.output, {
        id: created.id,
        verb: 'Attached file to transaction',
        description: filename,
      });
    });

  // ── events ────────────────────────────────────────────────────────────────
  tx.command('events')
    .description('List piggy-bank events caused by a transaction')
    .argument('<id>', 'Transaction id')
    .option('--limit <n>', 'Page size', int)
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/transactions/${id}/piggy-bank-events`, {
        limit: opts.limit,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (e: any) => e.id ?? '' },
          { header: 'date', get: (e: any) => String(e.attributes?.created_at ?? '').slice(0, 10) },
          { header: 'piggy_bank', get: (e: any) => e.attributes?.piggy_bank_name ?? '' },
          { header: 'amount', get: (e: any) => e.attributes?.amount ?? '' },
        ],
        ctx.output,
      );
    });
}

/**
 * Upload a binary file body to a Firefly endpoint.
 *
 * Foundation gap: `FireflyClient` only serialises JSON bodies (and a string
 * `rawBody`), so binary uploads have no first-class helper. We reuse the client's
 * URL builder + the resolved instance credentials and call `fetch` directly with
 * the raw bytes. See final report.
 */
async function uploadBinary(
  ctx: Awaited<ReturnType<typeof getContext>>,
  path: string,
  file: string,
): Promise<void> {
  const inst = await ctx.resolveInstance();
  const url = buildUrl(inst.url, path);
  const bytes = await Bun.file(file).arrayBuffer();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inst.token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: bytes,
  });
  if (!res.ok) {
    const { FireflyApiError } = await import('../api/errors.ts');
    throw FireflyApiError.fromResponse(res.status, 'POST', url, await res.json().catch(() => ({})));
  }
}
