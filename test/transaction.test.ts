import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Command } from 'commander';
import { register } from '../src/commands/transaction.ts';
import { applyGlobalOptionsRecursively } from '../src/globals.ts';
import { captureStdout, fetchStub } from './helpers.ts';

/** Build an isolated program with just the transaction command + global flags. */
function makeProgram(): Command {
  const program = new Command();
  register(program);
  applyGlobalOptionsRecursively(program);
  const propagate = (cmd: Command): void => {
    cmd.exitOverride();
    for (const sub of cmd.commands) {
      propagate(sub);
    }
  };
  propagate(program);
  return program;
}

const realFetch = global.fetch;

type Log = Array<{ method: string; url: string; body?: string }>;

function stub(routes: Parameters<typeof fetchStub>[0]): Log {
  const log: Log = [];
  global.fetch = fetchStub(routes, log);
  return log;
}

const group = (over: Record<string, unknown> = {}) => ({
  id: '55',
  attributes: {
    transactions: [
      {
        type: 'withdrawal',
        date: '2026-01-15',
        amount: '12.50',
        currency_symbol: '$',
        description: 'Coffee',
        source_name: 'Checking',
        destination_name: 'Coffee Shop',
        category_name: 'Food',
        ...over,
      },
    ],
  },
});

beforeEach(() => {
  process.env.FIREFLY_URL = 'https://ff.example';
  process.env.FIREFLY_TOKEN = 'secret';
  process.env.FIREFLY_INSTANCE = '';
  process.env.NO_COLOR = '1';
});

afterEach(() => {
  global.fetch = realFetch;
});

async function run(args: string[]): Promise<string> {
  const program = makeProgram();
  return captureStdout(async () => {
    await program.parseAsync(args, { from: 'user' });
  });
}

describe('transaction list', () => {
  test('passes type/start filters to GET /transactions', async () => {
    const log = stub({ 'GET /v1/transactions': { body: { data: [group()] } } });
    const out = await run(['tx', 'list', '--type', 'withdrawal', '--start', '2026-01-01']);
    expect(log[0].url).toContain('/v1/transactions');
    expect(log[0].url).toContain('type=withdrawal');
    expect(log[0].url).toContain('start=2026-01-01');
    expect(out).toContain('Coffee');
  });

  test('--account scopes to /accounts/{id}/transactions', async () => {
    const log = stub({ 'GET /v1/accounts/3/transactions': { body: { data: [] } } });
    await run(['tx', 'list', '--account', '3']);
    expect(log[0].url).toContain('/v1/accounts/3/transactions');
  });

  test('--tag scopes to /tags/{tag}/transactions', async () => {
    const log = stub({ 'GET /v1/tags/groceries/transactions': { body: { data: [] } } });
    await run(['tx', 'list', '--tag', 'groceries']);
    expect(log[0].url).toContain('/v1/tags/groceries/transactions');
  });
});

describe('transaction view', () => {
  test('GET /transactions/{id} renders the description', async () => {
    const log = stub({ 'GET /v1/transactions/100': { body: { data: group() } } });
    const out = await run(['tx', 'view', '100']);
    expect(log[0].url).toContain('/v1/transactions/100');
    expect(out).toContain('Coffee');
  });

  test('--journal targets /transaction-journals/{id}', async () => {
    const log = stub({ 'GET /v1/transaction-journals/9': { body: { data: group() } } });
    await run(['tx', 'view', '9', '--journal']);
    expect(log[0].url).toContain('/v1/transaction-journals/9');
  });
});

describe('transaction create', () => {
  test('single split assembled from top-level flags', async () => {
    const log = stub({ 'POST /v1/transactions': { body: { data: group() } } });
    const out = await run([
      'tx',
      'create',
      '--type',
      'withdrawal',
      '--amount',
      '12.50',
      '--description',
      'Coffee',
      '--source',
      'Checking',
      '--destination',
      'Coffee Shop',
      '--category',
      'Food',
    ]);
    expect(log[0].method).toBe('POST');
    const body = JSON.parse(log[0].body ?? '{}');
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0]).toMatchObject({
      type: 'withdrawal',
      amount: '12.50',
      description: 'Coffee',
      source_name: 'Checking',
      destination_name: 'Coffee Shop',
      category_name: 'Food',
    });
    expect(body.transactions[0].date).toBeDefined();
    expect(out).toContain('Created transaction');
    expect(out).toContain('55');
  });

  test('numeric source/destination map to *_id fields', async () => {
    const log = stub({ 'POST /v1/transactions': { body: { data: group() } } });
    await run([
      'tx',
      'create',
      '--type',
      'transfer',
      '--amount',
      '5',
      '--description',
      'Move',
      '--source',
      '1',
      '--destination',
      '2',
    ]);
    const body = JSON.parse(log[0].body ?? '{}');
    expect(body.transactions[0]).toMatchObject({ source_id: '1', destination_id: '2' });
  });

  test('multi-split via repeated --split assembles transactions[]', async () => {
    const log = stub({ 'POST /v1/transactions': { body: { data: { id: '9', attributes: {} } } } });
    const out = await run([
      'tx',
      'create',
      '--type',
      'withdrawal',
      '--source',
      'Checking',
      '--destination',
      'Shop',
      '--description',
      'Split run',
      '--split',
      'amount=5,description=A,category=Food',
      '--split',
      'amount=7,description=B,category=Fun',
    ]);
    const body = JSON.parse(log[0].body ?? '{}');
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0]).toMatchObject({
      type: 'withdrawal',
      amount: '5',
      description: 'A',
      category_name: 'Food',
      source_name: 'Checking',
      destination_name: 'Shop',
    });
    expect(body.transactions[1]).toMatchObject({
      amount: '7',
      description: 'B',
      category_name: 'Fun',
    });
    // group_title set from --description when there are multiple splits.
    expect(body.group_title).toBe('Split run');
    expect(out).toContain('Created transaction');
  });

  test('422 validation error exits with code 5', async () => {
    stub({
      'POST /v1/transactions': {
        status: 422,
        body: { message: 'Validation failed', errors: { amount: ['The amount is required.'] } },
      },
    });
    const program = makeProgram();
    await expect(
      program.parseAsync(
        [
          'tx',
          'create',
          '--type',
          'withdrawal',
          '--amount',
          '0',
          '--description',
          'x',
          '--source',
          'A',
          '--destination',
          'B',
        ],
        { from: 'user' },
      ),
    ).rejects.toMatchObject({ exitCode: 5 });
  });
});

describe('transaction delete', () => {
  test('--yes deletes the group', async () => {
    const log = stub({ 'DELETE /v1/transactions/42': { status: 204 } });
    const out = await run(['tx', 'delete', '42', '--yes']);
    expect(log[0].method).toBe('DELETE');
    expect(log[0].url).toContain('/v1/transactions/42');
    expect(out).toContain('Deleted transaction');
  });

  test('--journal --yes deletes a single journal', async () => {
    const log = stub({ 'DELETE /v1/transaction-journals/7': { status: 204 } });
    await run(['tx', 'delete', '7', '--journal', '--yes']);
    expect(log[0].url).toContain('/v1/transaction-journals/7');
  });
});

describe('transaction list --query / --group-by / --account-name', () => {
  test('--query routes to /search/transactions', async () => {
    const log = stub({ 'GET /v1/search/transactions': { body: { data: [group()] } } });
    const out = await run(['tx', 'list', '--query', 'has_no_category:true']);
    expect(log[0].url).toContain('/v1/search/transactions');
    expect(log[0].url).toContain('query=has_no_category');
    expect(out).toContain('Coffee');
  });

  test('--group-by category --sum emits an aggregate table', async () => {
    const rows = {
      data: [
        group({ category_name: 'Food', amount: '10' }),
        group({ category_name: 'Food', amount: '5' }),
        group({ category_name: 'Fun', amount: '7' }),
      ],
    };
    const log = stub({ 'GET /v1/transactions': { body: rows } });
    const out = await run(['tx', 'list', '--group-by', 'category', '--sum']);
    expect(log[0].url).toContain('/v1/transactions');
    // Food = 2 rows summing 15, sorted first.
    expect(out).toMatch(/Food\s+2\s+15/);
    expect(out).toMatch(/Fun\s+1\s+7/);
  });

  test('--account-name resolves via /search/accounts then scopes', async () => {
    const log = stub({
      'GET /v1/search/accounts': {
        body: { data: [{ id: '38', attributes: { name: 'Estrelas Motel' } }] },
      },
      'GET /v1/accounts/38/transactions': { body: { data: [group()] } },
    });
    await run(['tx', 'list', '--account-name', 'Estrelas Motel']);
    expect(log[0].url).toContain('/v1/search/accounts');
    expect(log[1].url).toContain('/v1/accounts/38/transactions');
  });
});

describe('transaction edit (bulk)', () => {
  test('multiple ids issue one PUT each with the partial split', async () => {
    const log = stub({ 'PUT /v1/transactions/': { body: { data: group() } } });
    const out = await run(['tx', 'edit', '101', '102', '103', '--category', 'Food', '--yes']);
    const puts = log.filter((l) => l.method === 'PUT');
    expect(puts).toHaveLength(3);
    expect(JSON.parse(puts[0].body as string).transactions[0]).toMatchObject({
      category_name: 'Food',
    });
    expect(out).toContain('Updated');
    expect(out).toContain('3 transactions');
  });

  test('--where searches then edits each match', async () => {
    const log = stub({
      'GET /v1/search/transactions': {
        body: { data: [{ id: '201' }, { id: '202' }] },
      },
      'PUT /v1/transactions/': { body: { data: group() } },
    });
    await run(['tx', 'edit', '--where', 'has_no_category:true', '--category', 'Rolês', '--yes']);
    expect(log[0].url).toContain('/v1/search/transactions');
    const puts = log.filter((l) => l.method === 'PUT');
    expect(puts).toHaveLength(2);
  });

  test('--journal resolves the group and keys the split by journal id', async () => {
    const log = stub({
      'GET /v1/transaction-journals/9': { body: { data: { id: '55', attributes: {} } } },
      'PUT /v1/transactions/55': { body: { data: group() } },
    });
    await run(['tx', 'edit', '9', '--journal', '--category', 'Food']);
    expect(log[0].url).toContain('/v1/transaction-journals/9');
    const put = log.find((l) => l.method === 'PUT');
    expect(put?.url).toContain('/v1/transactions/55');
    expect(JSON.parse(put?.body as string).transactions[0]).toMatchObject({
      transaction_journal_id: '9',
      category_name: 'Food',
    });
  });
});

describe('transaction categorize', () => {
  test('searches and bulk-sets the category', async () => {
    const log = stub({
      'GET /v1/search/transactions': { body: { data: [{ id: '1' }, { id: '2' }] } },
      'PUT /v1/transactions/': { body: { data: group() } },
    });
    const out = await run([
      'tx',
      'categorize',
      'description_contains:"Eden Beer"',
      'Rolês',
      '--yes',
    ]);
    expect(log[0].url).toContain('/v1/search/transactions');
    expect(log.filter((l) => l.method === 'PUT')).toHaveLength(2);
    expect(out).toContain('2 transactions');
  });
});

describe('transaction edit (bulk) failure handling', () => {
  test('reports failures and sets a non-zero exit code', async () => {
    const prevExit = process.exitCode;
    process.exitCode = 0;
    // Specific 500 route must precede the generic success route.
    const log = stub({
      'PUT /v1/transactions/102': { status: 500, body: { message: 'boom' } },
      'PUT /v1/transactions/': { body: { data: group() } },
    });
    const out = await run(['tx', 'edit', '101', '102', '--category', 'Food', '--yes']);
    expect(log.filter((l) => l.method === 'PUT').length).toBeGreaterThanOrEqual(2);
    expect(out).toContain('1 transactions, 1 failed');
    expect(process.exitCode).toBe(1);
    process.exitCode = prevExit;
  });
});
