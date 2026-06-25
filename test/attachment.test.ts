import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register } from '../src/commands/attachment.ts';
import { findCall, runCmd } from './cmdHarness.ts';

describe('attachment commands', () => {
  test('list hits GET /attachments', async () => {
    const { out, log } = await runCmd(register, ['attachment', 'list'], {
      'GET /attachments': {
        body: {
          data: [
            {
              id: '90',
              attributes: {
                filename: 'receipt.pdf',
                attachable_type: 'TransactionJournal',
                attachable_id: '4821',
                size: 1024,
                title: 'Coffee',
              },
            },
          ],
        },
      },
    });
    expect(findCall(log, 'GET', '/v1/attachments')).toBeDefined();
    expect(out).toContain('receipt.pdf');
  });

  test('file alias + scoped list hits owner endpoint', async () => {
    const { log } = await runCmd(register, ['file', 'list', '--transaction', '4821'], {
      'GET /transactions/4821/attachments': { body: { data: [] } },
    });
    expect(findCall(log, 'GET', '/transactions/4821/attachments')).toBeDefined();
  });

  test('view hits GET /attachments/{id}', async () => {
    const { out } = await runCmd(register, ['attachment', 'view', '90'], {
      'GET /attachments/90': {
        body: { data: { id: '90', attributes: { filename: 'receipt.pdf', title: 'Coffee' } } },
      },
    });
    expect(out).toContain('receipt.pdf');
  });

  test('upload does a two-step create + upload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'firefly-up-'));
    const file = join(dir, 'receipt.pdf');
    await Bun.write(file, 'PDFBYTES');

    const { log } = await runCmd(
      register,
      ['attachment', 'upload', file, '--transaction', '4821', '--title', 'Coffee receipt'],
      {
        'POST /attachments/77/upload': { status: 204 },
        'POST /attachments': {
          body: { data: { id: '77', attributes: { filename: 'receipt.pdf' } } },
        },
      },
    );

    const create = findCall(log, 'POST', '/v1/attachments');
    expect(create).toBeDefined();
    expect(JSON.parse(create!.body!)).toEqual({
      filename: 'receipt.pdf',
      attachable_type: 'TransactionJournal',
      attachable_id: '4821',
      title: 'Coffee receipt',
    });
    // Step 2: bytes uploaded to the per-attachment endpoint.
    expect(findCall(log, 'POST', '/attachments/77/upload')).toBeDefined();
  });

  test('edit puts metadata', async () => {
    const { log } = await runCmd(register, ['attachment', 'edit', '90', '--title', 'New title'], {
      'PUT /attachments/90': {
        body: { data: { id: '90', attributes: { filename: 'receipt.pdf' } } },
      },
    });
    expect(JSON.parse(findCall(log, 'PUT', '/v1/attachments/90')!.body!)).toEqual({
      title: 'New title',
    });
  });

  test('download to stdout streams bytes', async () => {
    const { out, log } = await runCmd(register, ['attachment', 'download', '90', '--output', '-'], {
      'GET /attachments/90/download': { body: 'hello-bytes' },
    });
    expect(findCall(log, 'GET', '/attachments/90/download')).toBeDefined();
    expect(out).toContain('hello-bytes');
  });

  test('delete with --yes', async () => {
    const { log } = await runCmd(register, ['attachment', 'delete', '90', '--yes'], {
      'DELETE /attachments/90': { status: 204 },
    });
    expect(findCall(log, 'DELETE', '/v1/attachments/90')).toBeDefined();
  });
});
