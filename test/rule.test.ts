import { describe, expect, test } from 'bun:test';
import { parseClauses, register, ruleRunQuery } from '../src/commands/rule.ts';
import { findCall, runCmd } from './cmdHarness.ts';

describe('rule clause parsing', () => {
  test('parses type:value with ordering', () => {
    expect(parseClauses(['description_contains:Amazon', 'amount_more:10'])).toEqual([
      { type: 'description_contains', value: 'Amazon', order: 1 },
      { type: 'amount_more', value: '10', order: 2 },
    ]);
  });
  test('keeps colons in the value', () => {
    expect(parseClauses(['notes_contains:a:b'])).toEqual([
      { type: 'notes_contains', value: 'a:b', order: 1 },
    ]);
  });
  test('throws without a colon', () => {
    expect(() => parseClauses(['nope'])).toThrow();
  });
});

describe('ruleRunQuery', () => {
  test('builds start/end/accounts[]', () => {
    expect(ruleRunQuery({ start: '2026-01-01', end: '2026-02-01', accounts: '1,2' })).toEqual({
      start: '2026-01-01',
      end: '2026-02-01',
      'accounts[]': ['1', '2'],
    });
  });
});

describe('rule commands', () => {
  test('list hits GET /rules with curated columns', async () => {
    const { out, log } = await runCmd(register, ['rule', 'list'], {
      'GET /rules': {
        body: {
          data: [
            {
              id: '12',
              attributes: {
                title: 'Groceries',
                rule_group_title: 'Default',
                active: true,
                strict: true,
                stop_processing: false,
              },
            },
          ],
        },
      },
    });
    expect(findCall(log, 'GET', '/v1/rules')).toBeDefined();
    expect(out).toContain('12');
    expect(out).toContain('Groceries');
  });

  test('list --currency scopes to /currencies/{code}/rules', async () => {
    const { log } = await runCmd(register, ['rule', 'list', '--currency', 'EUR'], {
      'GET /currencies/EUR/rules': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/currencies/EUR/rules')).toBeDefined();
  });

  test('view hits GET /rules/{id}', async () => {
    const { out } = await runCmd(register, ['rule', 'view', '12'], {
      'GET /rules/12': {
        body: {
          data: {
            id: '12',
            attributes: {
              title: 'Groceries',
              triggers: [{ type: 'description_contains', value: 'Lidl' }],
              actions: [{ type: 'set_category', value: 'Food' }],
            },
          },
        },
      },
    });
    expect(out).toContain('Groceries');
    expect(out).toContain('description_contains:Lidl');
  });

  test('create posts triggers + actions', async () => {
    const { log } = await runCmd(
      register,
      [
        'rule',
        'create',
        '--title',
        'My rule',
        '--rule-group',
        '3',
        '--trigger',
        'description_contains:Amazon',
        '--action',
        'set_category:Shopping',
        '--no-active',
      ],
      { 'POST /rules': { body: { data: { id: '99', attributes: { title: 'My rule' } } } } },
    );
    const call = findCall(log, 'POST', '/v1/rules');
    expect(call).toBeDefined();
    const body = JSON.parse(call!.body!);
    expect(body.title).toBe('My rule');
    expect(body.rule_group_id).toBe('3');
    expect(body.trigger).toBe('store-journal');
    expect(body.triggers).toEqual([{ type: 'description_contains', value: 'Amazon', order: 1 }]);
    expect(body.actions).toEqual([{ type: 'set_category', value: 'Shopping', order: 1 }]);
    expect(body.active).toBe(false);
  });

  test('edit puts changed fields', async () => {
    const { log } = await runCmd(register, ['rule', 'edit', '12', '--title', 'Renamed'], {
      'PUT /rules/12': { body: { data: { id: '12', attributes: { title: 'Renamed' } } } },
    });
    const call = findCall(log, 'PUT', '/v1/rules/12');
    expect(JSON.parse(call!.body!)).toEqual({ title: 'Renamed' });
  });

  test('delete with --yes calls DELETE', async () => {
    const { log } = await runCmd(register, ['rule', 'delete', '12', '--yes'], {
      'DELETE /rules/12': { status: 204 },
    });
    expect(findCall(log, 'DELETE', '/v1/rules/12')).toBeDefined();
  });

  test('test does a dry-run GET with query', async () => {
    const { log } = await runCmd(
      register,
      ['rule', 'test', '12', '--start', '2026-01-01', '--accounts', '1,2'],
      { 'GET /rules/12/test': { body: { data: [] } } },
    );
    const call = findCall(log, 'GET', '/rules/12/test');
    expect(call).toBeDefined();
    expect(call!.url).toContain('start=2026-01-01');
    expect(call!.url).toContain('accounts');
  });

  test('trigger posts to /rules/{id}/trigger', async () => {
    const { log } = await runCmd(register, ['rule', 'trigger', '12', '--end', '2026-02-01'], {
      'POST /rules/12/trigger': { status: 204 },
    });
    const call = findCall(log, 'POST', '/rules/12/trigger');
    expect(call).toBeDefined();
    expect(call!.url).toContain('end=2026-02-01');
  });
});
