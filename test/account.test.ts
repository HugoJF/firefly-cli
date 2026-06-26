import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Command } from 'commander';
import { register } from '../src/commands/account.ts';
import { applyGlobalOptionsRecursively } from '../src/globals.ts';
import { captureStdout, fetchStub } from './helpers.ts';

/** Build an isolated program with just the account command + global flags. */
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

describe('account list', () => {
  test('passes type/limit/page filters to GET /accounts', async () => {
    const log = stub({
      'GET /v1/accounts': {
        body: { data: [{ id: '1', attributes: { name: 'Checking', type: 'asset' } }] },
      },
    });
    const out = await run(['account', 'list', '--type', 'asset', '--limit', '5', '--page', '2']);
    expect(log[0].method).toBe('GET');
    expect(log[0].url).toContain('/v1/accounts');
    expect(log[0].url).toContain('type=asset');
    expect(log[0].url).toContain('limit=5');
    expect(log[0].url).toContain('page=2');
    expect(out).toContain('Checking');
  });

  test('--currency scopes to /currencies/{code}/accounts', async () => {
    const log = stub({
      'GET /v1/currencies/EUR/accounts': { body: { data: [] } },
    });
    await run(['account', 'list', '--currency', 'EUR']);
    expect(log[0].url).toContain('/v1/currencies/EUR/accounts');
  });
});

describe('account view', () => {
  test('GET /accounts/{id} and renders the name', async () => {
    const log = stub({
      'GET /v1/accounts/7': {
        body: { data: { id: '7', attributes: { name: 'Savings', type: 'asset' } } },
      },
    });
    const out = await run(['account', 'view', '7']);
    expect(log[0].url).toContain('/v1/accounts/7');
    expect(out).toContain('Savings');
  });
});

describe('account create', () => {
  test('POSTs the AccountStore body and confirms', async () => {
    const log = stub({
      'POST /v1/accounts': { body: { data: { id: '12', attributes: { name: 'Savings' } } } },
    });
    const out = await run([
      'account',
      'create',
      '--name',
      'Savings',
      '--type',
      'asset',
      '--currency',
      'EUR',
    ]);
    expect(log[0].method).toBe('POST');
    const body = JSON.parse(log[0].body ?? '{}');
    expect(body).toMatchObject({
      name: 'Savings',
      type: 'asset',
      currency_code: 'EUR',
      active: true,
    });
    expect(out).toContain('Created account');
    expect(out).toContain('12');
    expect(out).toContain('Savings');
  });

  test('422 validation error exits with code 5', async () => {
    stub({
      'POST /v1/accounts': {
        status: 422,
        body: { message: 'Validation failed', errors: { name: ['The name is required.'] } },
      },
    });
    const program = makeProgram();
    await expect(
      program.parseAsync(['account', 'create', '--name', 'x', '--type', 'asset'], { from: 'user' }),
    ).rejects.toMatchObject({ exitCode: 5 });
  });
});

describe('account delete', () => {
  test('--yes deletes without prompting', async () => {
    const log = stub({ 'DELETE /v1/accounts/5': { status: 204 } });
    const out = await run(['account', 'delete', '5', '--yes']);
    expect(log[0].method).toBe('DELETE');
    expect(log[0].url).toContain('/v1/accounts/5');
    expect(out).toContain('Deleted account');
    expect(out).toContain('5');
  });
});

describe('account transactions', () => {
  test('GET /accounts/{id}/transactions with date range', async () => {
    const log = stub({
      'GET /v1/accounts/3/transactions': { body: { data: [] } },
    });
    await run(['account', 'transactions', '3', '--start', '2026-01-01', '--end', '2026-02-01']);
    expect(log[0].url).toContain('/v1/accounts/3/transactions');
    expect(log[0].url).toContain('start=2026-01-01');
    expect(log[0].url).toContain('end=2026-02-01');
  });
});

describe('account spend', () => {
  const motelGroup = (amount: string, date: string) => ({
    id: '1',
    attributes: {
      transactions: [
        { type: 'withdrawal', amount, date, currency_symbol: '$', currency_decimal_places: 2 },
      ],
    },
  });

  test('resolves a name then aggregates count/sum/avg', async () => {
    const log = stub({
      'GET /v1/search/accounts': {
        body: { data: [{ id: '38', attributes: { name: 'Estrelas Motel' } }] },
      },
      'GET /v1/accounts/38/transactions': {
        body: {
          data: [motelGroup('100', '2025-01-01'), motelGroup('50', '2025-02-01')],
        },
      },
    });
    const out = await run(['account', 'spend', 'Estrelas Motel']);
    expect(log[0].url).toContain('/v1/search/accounts');
    expect(log[1].url).toContain('/v1/accounts/38/transactions');
    expect(out).toMatch(/total\s+2\s+150\.00\s+75\.00/);
  });

  test('--by year buckets the spend', async () => {
    stub({
      'GET /v1/search/accounts': {
        body: { data: [{ id: '38', attributes: { name: 'Motel' } }] },
      },
      'GET /v1/accounts/38/transactions': {
        body: { data: [motelGroup('100', '2024-06-01'), motelGroup('40', '2025-06-01')] },
      },
    });
    const out = await run(['account', 'spend', 'Motel', '--by', 'year']);
    expect(out).toMatch(/2024\s+1\s+100\.00/);
    expect(out).toMatch(/2025\s+1\s+40\.00/);
  });

  test('a numeric argument skips name resolution', async () => {
    const log = stub({
      'GET /v1/accounts/7/transactions': { body: { data: [] } },
    });
    await run(['account', 'spend', '7']);
    expect(log[0].url).toContain('/v1/accounts/7/transactions');
  });
});
