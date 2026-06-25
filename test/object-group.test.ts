import { describe, expect, test } from 'bun:test';
import { register } from '../src/commands/object-group.ts';
import { findCall, runCmd } from './cmdHarness.ts';

describe('object-group commands', () => {
  test('list hits GET /object-groups', async () => {
    const { out, log } = await runCmd(register, ['object-group', 'list'], {
      'GET /object-groups': {
        body: { data: [{ id: '2', attributes: { title: 'Savings', order: 1 } }] },
      },
    });
    expect(findCall(log, 'GET', '/v1/object-groups')).toBeDefined();
    expect(out).toContain('Savings');
  });

  test('ogroup alias works', async () => {
    const { log } = await runCmd(register, ['ogroup', 'list'], {
      'GET /object-groups': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/v1/object-groups')).toBeDefined();
  });

  test('view hits GET /object-groups/{id}', async () => {
    const { out } = await runCmd(register, ['object-group', 'view', '2'], {
      'GET /object-groups/2': { body: { data: { id: '2', attributes: { title: 'Savings' } } } },
    });
    expect(out).toContain('Savings');
  });

  test('edit puts title/order', async () => {
    const { log } = await runCmd(
      register,
      ['object-group', 'edit', '2', '--title', 'Renamed', '--order', '3'],
      { 'PUT /object-groups/2': { body: { data: { id: '2', attributes: { title: 'Renamed' } } } } },
    );
    expect(JSON.parse(findCall(log, 'PUT', '/v1/object-groups/2')!.body!)).toEqual({
      title: 'Renamed',
      order: 3,
    });
  });

  test('delete with --yes', async () => {
    const { log } = await runCmd(register, ['object-group', 'delete', '2', '--yes'], {
      'DELETE /object-groups/2': { status: 204 },
    });
    expect(findCall(log, 'DELETE', '/v1/object-groups/2')).toBeDefined();
  });

  test('bills lists bills in the group', async () => {
    const { log } = await runCmd(register, ['object-group', 'bills', '2'], {
      'GET /object-groups/2/bills': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/object-groups/2/bills')).toBeDefined();
  });

  test('piggies lists piggy banks in the group', async () => {
    const { log } = await runCmd(register, ['object-group', 'piggies', '2'], {
      'GET /object-groups/2/piggy-banks': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/object-groups/2/piggy-banks')).toBeDefined();
  });
});
