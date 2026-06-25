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
import { buildUrl } from '../api/client.ts';
import { CancelledError, UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import {
  formatSplitAmount,
  printMutation,
  printResult,
  renderItem,
  renderList,
} from '../output/render.ts';
import { type ReferenceKind, pickReference } from '../output/selectors.ts';

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

export function register(program: Command): void {
  const tx = program
    .command('transaction')
    .aliases(['tx', 'txn'])
    .description('Manage transactions');

  // ── list ──────────────────────────────────────────────────────────────────
  tx.command('list')
    .description('List transactions')
    .option('--type <type>', 'Filter by type (withdrawal|deposit|transfer)')
    .option('--start <date>', 'Start date')
    .option('--end <date>', 'End date')
    .option('--account <id>', 'Scope to an account id')
    .option('--category <id>', 'Scope to a category id')
    .option('--budget <id>', 'Scope to a budget id')
    .option('--tag <tag>', 'Scope to a tag')
    .option('--currency <code>', 'Scope to a currency code')
    .option('--limit <n>', 'Page size', int)
    .option('--page <n>', 'Page number', int)
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      let path = '/transactions';
      if (opts.account) {
        path = `/accounts/${opts.account}/transactions`;
      } else if (opts.category) {
        path = `/categories/${opts.category}/transactions`;
      } else if (opts.budget) {
        path = `/budgets/${opts.budget}/transactions`;
      } else if (opts.tag) {
        path = `/tags/${opts.tag}/transactions`;
      } else if (opts.currency) {
        path = `/currencies/${opts.currency}/transactions`;
      }
      const { data } = await client.getPaged(path, {
        query: { type: opts.type, start: toIsoDate(opts.start), end: toIsoDate(opts.end) },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(data, transactionColumns, ctx.output);
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
    tx.command('edit').description('Update a transaction').argument('<id>', 'Transaction id'),
  ).action(async (id: string, opts, command: Command) => {
    const ctx = await getContext(command);
    const client = await ctx.client();

    let body: Record<string, unknown>;
    if (opts.editor) {
      const current = (await client.get(`/transactions/${id}`)).data?.data as any;
      const seed = toYaml({ transactions: current?.attributes?.transactions ?? [] });
      body = { transactions: splitsFromYaml(openEditor(seed)) };
    } else {
      // Changed fields only: build one partial split from provided flags.
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
      if (opts.split && opts.split.length > 0) {
        body = { transactions: (opts.split as string[]).map((raw) => parseSplit(raw, {})) };
      } else {
        if (Object.keys(split).length === 0) {
          throw new UsageError('No fields to update.', 'Pass a field flag, --split, or --editor.');
        }
        body = { transactions: [split] };
      }
    }

    const res = await client.put(`/transactions/${id}`, body);
    const item = (res.data?.data ?? res.data) as any;
    printMutation(ctx.output, {
      id: item?.id ?? id,
      verb: 'Updated transaction',
      description: item?.attributes?.group_title ?? firstSplit(item).description ?? '',
    });
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
