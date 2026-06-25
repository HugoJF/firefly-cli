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
