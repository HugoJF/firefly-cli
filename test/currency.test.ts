import { describe, expect, test } from 'bun:test';
import { register } from '../src/commands/currency.ts';
import { findCall, runCmd } from './cmdHarness.ts';

describe('currency commands', () => {
  test('list hits GET /currencies', async () => {
    const { out, log } = await runCmd(register, ['currency', 'list'], {
      'GET /currencies': {
        body: {
          data: [
            {
              id: '1',
              attributes: {
                code: 'EUR',
                name: 'Euro',
                symbol: '€',
                decimal_places: 2,
                enabled: true,
              },
            },
          ],
        },
      },
    });
    expect(findCall(log, 'GET', '/v1/currencies')).toBeDefined();
    expect(out).toContain('EUR');
    expect(out).toContain('Euro');
  });

  test('view hits GET /currencies/{code}', async () => {
    const { out } = await runCmd(register, ['currency', 'view', 'EUR'], {
      'GET /currencies/EUR': {
        body: { data: { id: '1', attributes: { code: 'EUR', name: 'Euro' } } },
      },
    });
    expect(out).toContain('Euro');
  });

  test('create posts a currency', async () => {
    const { log } = await runCmd(
      register,
      [
        'currency',
        'create',
        '--code',
        'BTC',
        '--name',
        'Bitcoin',
        '--symbol',
        'B',
        '--decimal-places',
        '8',
      ],
      { 'POST /currencies': { body: { data: { attributes: { code: 'BTC', name: 'Bitcoin' } } } } },
    );
    expect(JSON.parse(findCall(log, 'POST', '/v1/currencies')!.body!)).toEqual({
      code: 'BTC',
      name: 'Bitcoin',
      symbol: 'B',
      decimal_places: 8,
    });
  });

  test('edit puts changes', async () => {
    const { log } = await runCmd(register, ['currency', 'edit', 'EUR', '--name', 'Euros'], {
      'PUT /currencies/EUR': { body: { data: { attributes: { code: 'EUR', name: 'Euros' } } } },
    });
    expect(JSON.parse(findCall(log, 'PUT', '/v1/currencies/EUR')!.body!)).toEqual({
      name: 'Euros',
    });
  });

  test('delete with --yes', async () => {
    const { log } = await runCmd(register, ['currency', 'delete', 'BTC', '--yes'], {
      'DELETE /currencies/BTC': { status: 204 },
    });
    expect(findCall(log, 'DELETE', '/v1/currencies/BTC')).toBeDefined();
  });

  test('enable posts to /enable', async () => {
    const { log } = await runCmd(register, ['currency', 'enable', 'EUR'], {
      'POST /currencies/EUR/enable': { status: 204 },
    });
    expect(findCall(log, 'POST', '/currencies/EUR/enable')).toBeDefined();
  });

  test('disable posts to /disable', async () => {
    const { log } = await runCmd(register, ['currency', 'disable', 'EUR'], {
      'POST /currencies/EUR/disable': { status: 204 },
    });
    expect(findCall(log, 'POST', '/currencies/EUR/disable')).toBeDefined();
  });

  test('primary with no arg shows the primary currency', async () => {
    const { out, log } = await runCmd(register, ['currency', 'primary'], {
      'GET /currencies/primary': { body: { data: { attributes: { code: 'EUR', name: 'Euro' } } } },
    });
    expect(findCall(log, 'GET', '/currencies/primary')).toBeDefined();
    expect(out).toContain('Euro');
  });

  test('primary with a code sets the primary currency', async () => {
    const { log } = await runCmd(register, ['currency', 'primary', 'USD'], {
      'POST /currencies/USD/primary': { body: { data: { attributes: { code: 'USD' } } } },
    });
    expect(findCall(log, 'POST', '/currencies/USD/primary')).toBeDefined();
  });

  test('rate list hits GET /exchange-rates', async () => {
    const { log } = await runCmd(register, ['currency', 'rate', 'list'], {
      'GET /exchange-rates': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/v1/exchange-rates')).toBeDefined();
  });

  test('rate list --date scopes to by-date', async () => {
    const { log } = await runCmd(register, ['currency', 'rate', 'list', '--date', '2026-06-25'], {
      'GET /exchange-rates/by-date/2026-06-25': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/exchange-rates/by-date/2026-06-25')).toBeDefined();
  });

  test('rate view hits by-currencies', async () => {
    const { log } = await runCmd(register, ['currency', 'rate', 'view', 'USD', 'EUR'], {
      'GET /exchange-rates/by-currencies/USD/EUR': { body: { data: { id: '2', attributes: {} } } },
    });
    expect(findCall(log, 'GET', '/exchange-rates/by-currencies/USD/EUR')).toBeDefined();
  });

  test('rate set posts a date->rate body', async () => {
    const { log } = await runCmd(
      register,
      ['currency', 'rate', 'set', 'USD', 'EUR', '--rate', '0.92', '--date', '2026-06-25'],
      { 'POST /exchange-rates/USD/EUR': { body: { data: [{ id: '9' }] } } },
    );
    const call = findCall(log, 'POST', '/v1/exchange-rates/USD/EUR');
    expect(JSON.parse(call!.body!)).toEqual({ '2026-06-25': '0.92' });
  });

  test('rate edit puts rate + date', async () => {
    const { log } = await runCmd(
      register,
      ['currency', 'rate', 'edit', '9', '--rate', '0.93', '--date', '2026-06-26'],
      { 'PUT /exchange-rates/9': { body: { data: { id: '9', attributes: {} } } } },
    );
    expect(JSON.parse(findCall(log, 'PUT', '/v1/exchange-rates/9')!.body!)).toEqual({
      rate: '0.93',
      date: '2026-06-26',
    });
  });

  test('rate delete with --yes', async () => {
    const { log } = await runCmd(register, ['currency', 'rate', 'delete', '9', '--yes'], {
      'DELETE /exchange-rates/9': { status: 204 },
    });
    expect(findCall(log, 'DELETE', '/v1/exchange-rates/9')).toBeDefined();
  });
});
