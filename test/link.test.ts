import { describe, expect, test } from 'bun:test';
import { register } from '../src/commands/link.ts';
import { findCall, runCmd } from './cmdHarness.ts';

describe('link-type commands', () => {
  test('list hits GET /link-types', async () => {
    const { out, log } = await runCmd(register, ['link-type', 'list'], {
      'GET /link-types': {
        body: {
          data: [
            {
              id: '1',
              attributes: {
                name: 'Refund',
                inward: 'refunds',
                outward: 'is refunded by',
                editable: true,
              },
            },
          ],
        },
      },
    });
    expect(findCall(log, 'GET', '/v1/link-types')).toBeDefined();
    expect(out).toContain('Refund');
  });

  test('ltype alias works', async () => {
    const { log } = await runCmd(register, ['ltype', 'list'], {
      'GET /link-types': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/v1/link-types')).toBeDefined();
  });

  test('view hits GET /link-types/{id}', async () => {
    const { out } = await runCmd(register, ['link-type', 'view', '1'], {
      'GET /link-types/1': { body: { data: { id: '1', attributes: { name: 'Refund' } } } },
    });
    expect(out).toContain('Refund');
  });

  test('create posts name/inward/outward', async () => {
    const { log } = await runCmd(
      register,
      [
        'link-type',
        'create',
        '--name',
        'Refund',
        '--inward',
        'refunds',
        '--outward',
        'is refunded by',
      ],
      { 'POST /link-types': { body: { data: { id: '3', attributes: { name: 'Refund' } } } } },
    );
    expect(JSON.parse(findCall(log, 'POST', '/v1/link-types')!.body!)).toEqual({
      name: 'Refund',
      inward: 'refunds',
      outward: 'is refunded by',
    });
  });

  test('edit puts changes', async () => {
    const { log } = await runCmd(register, ['link-type', 'edit', '1', '--name', 'Repaid'], {
      'PUT /link-types/1': { body: { data: { id: '1', attributes: { name: 'Repaid' } } } },
    });
    expect(JSON.parse(findCall(log, 'PUT', '/v1/link-types/1')!.body!)).toEqual({ name: 'Repaid' });
  });

  test('delete with --yes', async () => {
    const { log } = await runCmd(register, ['link-type', 'delete', '1', '--yes'], {
      'DELETE /link-types/1': { status: 204 },
    });
    expect(findCall(log, 'DELETE', '/v1/link-types/1')).toBeDefined();
  });

  test('transactions lists linked journals', async () => {
    const { log } = await runCmd(register, ['link-type', 'transactions', '1'], {
      'GET /link-types/1/transactions': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/link-types/1/transactions')).toBeDefined();
  });
});

describe('link commands', () => {
  test('list hits GET /transaction-links', async () => {
    const { log } = await runCmd(register, ['link', 'list'], {
      'GET /transaction-links': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/v1/transaction-links')).toBeDefined();
  });

  test('list --journal scopes to journal links', async () => {
    const { log } = await runCmd(register, ['link', 'list', '--journal', '880'], {
      'GET /transaction-journals/880/links': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/transaction-journals/880/links')).toBeDefined();
  });

  test('view hits GET /transaction-links/{id}', async () => {
    const { log } = await runCmd(register, ['link', 'view', '4'], {
      'GET /transaction-links/4': { body: { data: { id: '4', attributes: {} } } },
    });
    expect(findCall(log, 'GET', '/transaction-links/4')).toBeDefined();
  });

  test('create connects two journals', async () => {
    const { log } = await runCmd(
      register,
      [
        'link',
        'create',
        '--type',
        '1',
        '--inward',
        '880',
        '--outward',
        '881',
        '--notes',
        'refund of',
      ],
      { 'POST /transaction-links': { body: { data: { id: '4' } } } },
    );
    expect(JSON.parse(findCall(log, 'POST', '/v1/transaction-links')!.body!)).toEqual({
      link_type_id: '1',
      inward_id: '880',
      outward_id: '881',
      notes: 'refund of',
    });
  });

  test('edit puts notes', async () => {
    const { log } = await runCmd(register, ['link', 'edit', '4', '--notes', 'updated'], {
      'PUT /transaction-links/4': { body: { data: { id: '4' } } },
    });
    expect(JSON.parse(findCall(log, 'PUT', '/v1/transaction-links/4')!.body!)).toEqual({
      notes: 'updated',
    });
  });

  test('delete with --yes', async () => {
    const { log } = await runCmd(register, ['link', 'delete', '4', '--yes'], {
      'DELETE /transaction-links/4': { status: 204 },
    });
    expect(findCall(log, 'DELETE', '/v1/transaction-links/4')).toBeDefined();
  });
});
