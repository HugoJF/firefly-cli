import { describe, expect, test } from 'bun:test';
import { register } from '../src/commands/webhook.ts';
import { findCall, runCmd } from './cmdHarness.ts';

describe('webhook commands', () => {
  test('list hits GET /webhooks', async () => {
    const { out, log } = await runCmd(register, ['webhook', 'list'], {
      'GET /webhooks': {
        body: {
          data: [
            {
              id: '1',
              attributes: {
                title: 'Notify',
                url: 'https://h.example',
                triggers: ['STORE_TRANSACTION'],
                responses: ['TRANSACTIONS'],
                deliveries: ['JSON'],
                active: true,
              },
            },
          ],
        },
      },
    });
    expect(findCall(log, 'GET', '/v1/webhooks')).toBeDefined();
    expect(out).toContain('Notify');
    expect(out).toContain('STORE_TRANSACTION');
  });

  test('hook alias works', async () => {
    const { log } = await runCmd(register, ['hook', 'list'], {
      'GET /webhooks': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/v1/webhooks')).toBeDefined();
  });

  test('create maps singular flags onto arrays', async () => {
    const { log } = await runCmd(
      register,
      [
        'webhook',
        'create',
        '--title',
        'Notify',
        '--url',
        'https://hook.example/ff',
        '--trigger',
        'STORE_TRANSACTION',
        '--response',
        'TRANSACTIONS',
        '--delivery',
        'JSON',
      ],
      { 'POST /webhooks': { body: { data: { id: '5', attributes: { title: 'Notify' } } } } },
    );
    const body = JSON.parse(findCall(log, 'POST', '/v1/webhooks')!.body!);
    expect(body).toEqual({
      title: 'Notify',
      url: 'https://hook.example/ff',
      triggers: ['STORE_TRANSACTION'],
      responses: ['TRANSACTIONS'],
      deliveries: ['JSON'],
    });
  });

  test('edit puts updated url', async () => {
    const { log } = await runCmd(register, ['webhook', 'edit', '5', '--url', 'https://new'], {
      'PUT /webhooks/5': { body: { data: { id: '5', attributes: {} } } },
    });
    expect(JSON.parse(findCall(log, 'PUT', '/v1/webhooks/5')!.body!)).toEqual({
      url: 'https://new',
    });
  });

  test('delete with --yes', async () => {
    const { log } = await runCmd(register, ['webhook', 'delete', '5', '--yes'], {
      'DELETE /webhooks/5': { status: 204 },
    });
    expect(findCall(log, 'DELETE', '/v1/webhooks/5')).toBeDefined();
  });

  test('submit posts to /submit', async () => {
    const { log } = await runCmd(register, ['webhook', 'submit', '5'], {
      'POST /webhooks/5/submit': { status: 204 },
    });
    expect(findCall(log, 'POST', '/webhooks/5/submit')).toBeDefined();
  });

  test('trigger re-fires for a transaction', async () => {
    const { log } = await runCmd(register, ['webhook', 'trigger', '5', '4821'], {
      'POST /webhooks/5/trigger-transaction/4821': { status: 204 },
    });
    expect(findCall(log, 'POST', '/webhooks/5/trigger-transaction/4821')).toBeDefined();
  });

  test('messages lists delivery messages', async () => {
    const { out, log } = await runCmd(register, ['webhook', 'messages', '1'], {
      'GET /webhooks/1/messages': {
        body: { data: [{ id: '10', attributes: { sent: true, errored: false } }] },
      },
    });
    expect(findCall(log, 'GET', '/webhooks/1/messages')).toBeDefined();
    expect(out).toContain('10');
  });

  test('messages view shows one message', async () => {
    const { log } = await runCmd(register, ['webhook', 'messages', 'view', '1', '10'], {
      'GET /webhooks/1/messages/10': { body: { data: { id: '10', attributes: { sent: true } } } },
    });
    expect(findCall(log, 'GET', '/webhooks/1/messages/10')).toBeDefined();
  });

  test('messages attempts lists attempts', async () => {
    const { log } = await runCmd(register, ['webhook', 'messages', 'attempts', '1', '10'], {
      'GET /webhooks/1/messages/10/attempts': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/webhooks/1/messages/10/attempts')).toBeDefined();
  });

  test('messages attempts view shows one attempt', async () => {
    const { log } = await runCmd(
      register,
      ['webhook', 'messages', 'attempts', 'view', '1', '10', '3'],
      { 'GET /webhooks/1/messages/10/attempts/3': { body: { data: { id: '3', attributes: {} } } } },
    );
    expect(findCall(log, 'GET', '/webhooks/1/messages/10/attempts/3')).toBeDefined();
  });
});
