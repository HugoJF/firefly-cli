import { describe, expect, test } from 'bun:test';
import { register } from '../src/commands/cron.ts';
import { runCommand } from './cmdHelpers.ts';

describe('cron run', () => {
  test('GETs /cron/{cliToken}', async () => {
    const { requests } = await runCommand(register, ['cron', 'run', 'abc123'], {
      'GET /cron/abc123': { body: { message: 'ok' } },
    });
    expect(requests[0].url).toContain('/cron/abc123');
  });
});
