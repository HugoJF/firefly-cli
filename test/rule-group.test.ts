import { describe, expect, test } from 'bun:test';
import { register } from '../src/commands/rule-group.ts';
import { findCall, runCmd } from './cmdHarness.ts';

describe('rule-group commands', () => {
  test('list hits GET /rule-groups', async () => {
    const { out, log } = await runCmd(register, ['rule-group', 'list'], {
      'GET /rule-groups': {
        body: { data: [{ id: '2', attributes: { title: 'Bills', active: true, order: 1 } }] },
      },
    });
    expect(findCall(log, 'GET', '/v1/rule-groups')).toBeDefined();
    expect(out).toContain('Bills');
  });

  test('rgroup alias works', async () => {
    const { log } = await runCmd(register, ['rgroup', 'list'], {
      'GET /rule-groups': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/v1/rule-groups')).toBeDefined();
  });

  test('view hits GET /rule-groups/{id}', async () => {
    const { out } = await runCmd(register, ['rule-group', 'view', '2'], {
      'GET /rule-groups/2': { body: { data: { id: '2', attributes: { title: 'Bills' } } } },
    });
    expect(out).toContain('Bills');
  });

  test('create posts a group', async () => {
    const { log } = await runCmd(
      register,
      ['rule-group', 'create', '--title', 'New', '--order', '4'],
      { 'POST /rule-groups': { body: { data: { id: '7', attributes: { title: 'New' } } } } },
    );
    const call = findCall(log, 'POST', '/v1/rule-groups');
    expect(JSON.parse(call!.body!)).toEqual({ title: 'New', order: 4 });
  });

  test('edit puts changes', async () => {
    const { log } = await runCmd(register, ['rule-group', 'edit', '2', '--title', 'Renamed'], {
      'PUT /rule-groups/2': { body: { data: { id: '2', attributes: { title: 'Renamed' } } } },
    });
    expect(JSON.parse(findCall(log, 'PUT', '/v1/rule-groups/2')!.body!)).toEqual({
      title: 'Renamed',
    });
  });

  test('delete with --yes', async () => {
    const { log } = await runCmd(register, ['rule-group', 'delete', '2', '--yes'], {
      'DELETE /rule-groups/2': { status: 204 },
    });
    expect(findCall(log, 'DELETE', '/v1/rule-groups/2')).toBeDefined();
  });

  test('rules lists members', async () => {
    const { log } = await runCmd(register, ['rule-group', 'rules', '2'], {
      'GET /rule-groups/2/rules': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/rule-groups/2/rules')).toBeDefined();
  });

  test('test dry-runs the group', async () => {
    const { log } = await runCmd(register, ['rule-group', 'test', '2', '--start', '2026-01-01'], {
      'GET /rule-groups/2/test': { body: { data: [] } },
    });
    const call = findCall(log, 'GET', '/rule-groups/2/test');
    expect(call!.url).toContain('start=2026-01-01');
  });

  test('trigger applies the group', async () => {
    const { log } = await runCmd(register, ['rule-group', 'trigger', '2'], {
      'POST /rule-groups/2/trigger': { status: 204 },
    });
    expect(findCall(log, 'POST', '/rule-groups/2/trigger')).toBeDefined();
  });
});
