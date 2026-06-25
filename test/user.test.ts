import { describe, expect, test } from 'bun:test';
import { register } from '../src/commands/user.ts';
import { runCommand } from './cmdHelpers.ts';

describe('user', () => {
  test('view (no id) → /about/user', async () => {
    const { requests, stdout } = await runCommand(register, ['user', 'view'], {
      'GET /about/user': {
        body: { data: { id: '1', attributes: { email: 'me@example.com', role: 'owner' } } },
      },
    });
    expect(requests[0].url).toContain('/about/user');
    expect(stdout).toContain('me@example.com');
  });

  test('view <id> → /users/{id}', async () => {
    const { requests } = await runCommand(register, ['user', 'view', '42', '--json'], {
      'GET /users/42': { body: { data: { id: '42', attributes: { email: 'a@b.c' } } } },
    });
    expect(requests[0].url).toContain('/users/42');
  });

  test('list → /users', async () => {
    const { requests } = await runCommand(register, ['user', 'list', '--json'], {
      'GET /users': {
        body: { data: [{ id: '1', attributes: { email: 'x@y.z', role: 'owner' } }] },
      },
    });
    expect(requests[0].url).toContain('/users');
  });
});
