/**
 * `firefly account` — accounts (asset, expense, revenue, liability, …).
 *
 * Covers coverage-matrix rows:
 *   /accounts                       GET, POST  → list / create
 *   /accounts/{id}                  GET,PUT,DEL → view / edit / delete
 *   /accounts/{id}/transactions     GET        → transactions
 *   /currencies/{code}/accounts     GET        → list --currency
 *   /chart/account/overview         GET        → balance
 *
 * See spec/06-commands/account.md. Alias: `acct`.
 */
import type { Command } from 'commander';
import { UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import { printMutation, printResult, renderItem, renderList } from '../output/render.ts';
import { isInteractive, readLine } from '../util/prompt.ts';

const ACCOUNT_TYPES = [
  'asset',
  'expense',
  'revenue',
  'liability',
  'cash',
  'reconciliation',
  'initial-balance',
  'loan',
  'debt',
  'mortgage',
];

/** Parse an integer option value (commander coercer). */
function int(value: string): number {
  return Number.parseInt(value, 10);
}

/** Parse a boolean-ish flag value: only an explicit "false"/"no"/"0" is false. */
function parseBool(value: string): boolean {
  return !/^(false|no|0)$/i.test(value.trim());
}

/**
 * Resolve a date-ish input to ISO `YYYY-MM-DD`. Supports a small relative
 * subset (`today`, `yesterday`, `-Nd`, `this-month`); ISO strings pass through.
 *
 * Foundation gap: there is no shared relative-date resolver; this is a local
 * copy (see final report).
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

/** Prompt for one of a fixed set of choices on a TTY; flag-error off-TTY. */
async function promptChoice(label: string, choices: string[], flag: string): Promise<string> {
  if (!isInteractive()) {
    throw new UsageError(`Missing required ${label}.`, `Provide ${flag}.`);
  }
  process.stderr.write(`Select ${label}:\n`);
  choices.forEach((c, i) => process.stderr.write(`  ${i + 1}) ${c}\n`));
  const answer = (await readLine(`Enter number [1-${choices.length}]: `)).trim();
  const idx = Number.parseInt(answer, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= choices.length) {
    throw new UsageError('Invalid selection.', `Provide ${flag}.`);
  }
  return choices[idx];
}

/** Prompt for free text on a TTY; flag-error off-TTY. */
async function promptText(label: string, flag: string): Promise<string> {
  if (!isInteractive()) {
    throw new UsageError(`Missing required ${label}.`, `Provide ${flag}.`);
  }
  const answer = (await readLine(`${label}: `)).trim();
  if (!answer) {
    throw new UsageError(`Missing required ${label}.`, `Provide ${flag}.`);
  }
  return answer;
}

/** Curated table columns for an account list. */
const accountColumns = [
  { header: 'id', get: (a: any) => a.id ?? '' },
  { header: 'name', get: (a: any) => a.attributes?.name ?? '' },
  { header: 'type', get: (a: any) => a.attributes?.type ?? '' },
  { header: 'role', get: (a: any) => a.attributes?.account_role ?? '' },
  { header: 'currency', get: (a: any) => a.attributes?.currency_code ?? '' },
  { header: 'balance', get: (a: any) => a.attributes?.current_balance ?? '' },
  { header: 'active', get: (a: any) => String(a.attributes?.active ?? '') },
];

/** Build the AccountStore body from create/edit flags (only provided keys). */
function buildAccountBody(opts: any, isCreate: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) {
      body[key] = value;
    }
  };
  set('name', opts.name);
  set('type', opts.type);
  set('currency_code', opts.currency);
  set('opening_balance', opts.openingBalance);
  set('opening_balance_date', toIsoDate(opts.openingBalanceDate));
  set('virtual_balance', opts.virtualBalance);
  set('iban', opts.iban);
  set('bic', opts.bic);
  set('account_number', opts.accountNumber);
  set('account_role', opts.role);
  set('liability_type', opts.liabilityType);
  set('liability_direction', opts.liabilityDirection);
  set('interest', opts.interest);
  set('interest_period', opts.interestPeriod);
  set('notes', opts.notes);
  if (opts.active !== undefined) {
    body.active = opts.active;
  } else if (isCreate) {
    body.active = true;
  }
  return body;
}

/** Shared create/edit flag set. */
function addWriteFlags(cmd: Command): Command {
  return cmd
    .option('--name <name>', 'Account name')
    .option('--type <type>', `Account type (${ACCOUNT_TYPES.join('|')})`)
    .option('--currency <code>', 'Currency code (default: instance primary)')
    .option('--opening-balance <amount>', 'Opening balance')
    .option('--opening-balance-date <date>', 'Opening balance date')
    .option('--virtual-balance <amount>', 'Virtual balance')
    .option('--iban <iban>', 'IBAN')
    .option('--bic <bic>', 'BIC')
    .option('--account-number <number>', 'Account number')
    .option('--role <role>', 'Asset account role (defaultAsset|savingAsset|…)')
    .option('--liability-type <type>', 'Liability type (debt|loan|mortgage)')
    .option('--liability-direction <dir>', 'Liability direction (credit|debit)')
    .option('--interest <pct>', 'Interest percentage')
    .option('--interest-period <period>', 'Interest period (daily|monthly|yearly)')
    .option('--active <bool>', 'Whether the account is active', parseBool)
    .option('--notes <text>', 'Notes');
}

export function register(program: Command): void {
  const account = program.command('account').aliases(['acct']).description('Manage accounts');

  // ── list ──────────────────────────────────────────────────────────────────
  account
    .command('list')
    .description('List accounts')
    .option('--type <type>', 'Filter by account type')
    .option('--query <q>', 'Free-text filter')
    .option('--currency <code>', 'Scope to a currency code')
    .option('--date <date>', 'Balance date')
    .option('--limit <n>', 'Page size', int)
    .option('--page <n>', 'Page number', int)
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path = opts.currency ? `/currencies/${opts.currency}/accounts` : '/accounts';
      const { data } = await client.getPaged(path, {
        query: { type: opts.type, query: opts.query, date: toIsoDate(opts.date) },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(data, accountColumns, ctx.output);
    });

  // ── view ──────────────────────────────────────────────────────────────────
  account
    .command('view')
    .description('Show one account')
    .argument('<id>', 'Account id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/accounts/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      renderItem(
        item,
        [
          { label: 'ID', get: (a: any) => a.id ?? '' },
          { label: 'Name', get: (a: any) => a.attributes?.name ?? '' },
          { label: 'Type', get: (a: any) => a.attributes?.type ?? '' },
          { label: 'Role', get: (a: any) => a.attributes?.account_role ?? '' },
          { label: 'Currency', get: (a: any) => a.attributes?.currency_code ?? '' },
          { label: 'Balance', get: (a: any) => a.attributes?.current_balance ?? '' },
          { label: 'IBAN', get: (a: any) => a.attributes?.iban ?? '' },
          { label: 'Active', get: (a: any) => String(a.attributes?.active ?? '') },
        ],
        ctx.output,
      );
    });

  // ── create ────────────────────────────────────────────────────────────────
  addWriteFlags(account.command('create').description('Create an account')).action(
    async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      if (!opts.name) {
        opts.name = await promptText('Account name', '--name');
      }
      if (!opts.type) {
        opts.type = await promptChoice('account type', ACCOUNT_TYPES, '--type');
      }
      const res = await client.post('/accounts', buildAccountBody(opts, true));
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item?.id,
        verb: 'Created account',
        description: item?.attributes?.name ?? opts.name,
      });
    },
  );

  // ── edit ──────────────────────────────────────────────────────────────────
  addWriteFlags(
    account.command('edit').description('Update an account').argument('<id>', 'Account id'),
  ).action(async (id: string, opts, command: Command) => {
    const ctx = await getContext(command);
    const client = await ctx.client();
    const body = buildAccountBody(opts, false);
    if (Object.keys(body).length === 0) {
      throw new UsageError('No fields to update.', 'Pass at least one field flag (e.g. --name).');
    }
    const res = await client.put(`/accounts/${id}`, body);
    const item = (res.data?.data ?? res.data) as any;
    printMutation(ctx.output, {
      id: item?.id ?? id,
      verb: 'Updated account',
      description: item?.attributes?.name ?? '',
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────
  account
    .command('delete')
    .description('Delete an account')
    .argument('<id>', 'Account id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete account ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/accounts/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted account', description: '' });
    });

  // ── transactions ──────────────────────────────────────────────────────────
  account
    .command('transactions')
    .description('List transactions for an account')
    .argument('<id>', 'Account id')
    .option('--type <type>', 'Filter by transaction type')
    .option('--start <date>', 'Start date')
    .option('--end <date>', 'End date')
    .option('--limit <n>', 'Page size', int)
    .option('--page <n>', 'Page number', int)
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/accounts/${id}/transactions`, {
        query: { type: opts.type, start: toIsoDate(opts.start), end: toIsoDate(opts.end) },
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(data, transactionColumns, ctx.output);
    });

  // ── balance ───────────────────────────────────────────────────────────────
  account
    .command('balance')
    .description('Show balance/overview chart data for an account')
    .argument('<id>', 'Account id')
    .option('--start <date>', 'Start date')
    .option('--end <date>', 'End date')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      // Learn the account's name so we can filter the (all-accounts) overview.
      const acct = (await client.get(`/accounts/${id}`)).data?.data as any;
      const name = acct?.attributes?.name;
      const res = await client.get('/chart/account/overview', {
        start: toIsoDate(opts.start),
        end: toIsoDate(opts.end),
      });
      const series = (Array.isArray(res.data) ? res.data : (res.data?.data ?? [])) as any[];
      const filtered = name ? series.filter((s) => s.label === name) : series;
      const chosen = filtered.length > 0 ? filtered : series;
      if (ctx.output.mode === 'json' || ctx.output.mode === 'template') {
        printResult(chosen, ctx.output);
        return;
      }
      const rows = chosen.flatMap((s) =>
        Object.entries(s.entries ?? {}).map(([date, value]) => ({ label: s.label, date, value })),
      );
      renderList(
        rows,
        [
          { header: 'account', get: (r: any) => r.label ?? '' },
          { header: 'date', get: (r: any) => String(r.date).slice(0, 10) },
          { header: 'balance', get: (r: any) => String(r.value ?? '') },
        ],
        ctx.output,
      );
    });
}

/**
 * Curated transaction columns (group-level), shared with the `transaction`
 * command's list view. A group's first split drives the row.
 */
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

function firstSplit(group: any): any {
  return group?.attributes?.transactions?.[0] ?? {};
}

function signedAmount(split: any): string {
  const symbol = split.currency_symbol ?? '';
  const amount = split.amount ?? '';
  if (amount === '') {
    return '';
  }
  const sign = split.type === 'withdrawal' ? '-' : split.type === 'deposit' ? '+' : '';
  return `${sign}${symbol}${amount}`;
}
