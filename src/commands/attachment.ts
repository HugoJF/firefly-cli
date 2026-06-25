/**
 * `firefly attachment` (alias `file`) — files attached to transactions,
 * accounts, bills, budgets, categories, piggy banks and tags
 * (spec/06-commands/attachment.md).
 *
 * The attachment lifecycle is two-step: create the metadata record
 * (`POST /attachments`), then upload the bytes (`POST /attachments/{id}/upload`).
 * `upload` does both. `download` streams the bytes back.
 *
 * Endpoints covered (spec/08): GET/POST /attachments, GET/PUT/DELETE
 * /attachments/{id}, POST /attachments/{id}/upload,
 * GET /attachments/{id}/download, plus the scoped owner lists
 * (GET /{owner}/{id}/attachments).
 *
 * FOUNDATION GAP: the shared FireflyClient (src/api/client.ts) only handles
 * JSON request/response bodies. Binary upload (octet-stream) and binary download
 * are therefore implemented with LOCAL fetch helpers (`uploadBytes` /
 * `downloadBytes`) that reuse the resolved instance creds + `buildUrl`. If the
 * foundation later grows binary support, these can be deleted.
 */
import { basename } from 'node:path';
import type { Command } from 'commander';
import { buildUrl } from '../api/client.ts';
import { FireflyApiError, UsageError } from '../api/errors.ts';
import type { Ctx } from '../context.ts';
import { getContext } from '../context.ts';
import { printMessage, printMutation, renderItem, renderList } from '../output/render.ts';

/** Owner flag → (list path builder, attachable_type for create). */
const OWNERS: Record<string, { path: (id: string) => string; type: string }> = {
  transaction: { path: (id) => `/transactions/${id}/attachments`, type: 'TransactionJournal' },
  account: { path: (id) => `/accounts/${id}/attachments`, type: 'Account' },
  bill: { path: (id) => `/bills/${id}/attachments`, type: 'Bill' },
  budget: { path: (id) => `/budgets/${id}/attachments`, type: 'Budget' },
  category: { path: (id) => `/categories/${id}/attachments`, type: 'Category' },
  piggy: { path: (id) => `/piggy-banks/${id}/attachments`, type: 'PiggyBank' },
  tag: { path: (id) => `/tags/${id}/attachments`, type: 'Tag' },
};

/** Resolve which owner flag (if any) was supplied; throws if more than one. */
function resolveOwner(opts: Record<string, any>): { key: string; id: string } | undefined {
  const present = Object.keys(OWNERS).filter((k) => opts[k] !== undefined);
  if (present.length === 0) {
    return undefined;
  }
  if (present.length > 1) {
    throw new UsageError(`Only one owner flag allowed (got --${present.join(', --')}).`);
  }
  return { key: present[0], id: String(opts[present[0]]) };
}

/** LOCAL: PUT raw file bytes to the upload endpoint (foundation gap). */
async function uploadBytes(ctx: Ctx, id: string, filePath: string): Promise<void> {
  const inst = await ctx.resolveInstance();
  const url = buildUrl(inst.url, `/attachments/${id}/upload`);
  const bytes = await Bun.file(filePath).arrayBuffer();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inst.token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: bytes,
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw FireflyApiError.fromResponse(res.status, 'POST', url, body);
  }
}

/** LOCAL: GET the attachment bytes (foundation gap). */
async function downloadBytes(ctx: Ctx, id: string): Promise<Buffer> {
  const inst = await ctx.resolveInstance();
  const url = buildUrl(inst.url, `/attachments/${id}/download`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${inst.token}` } });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw FireflyApiError.fromResponse(res.status, 'GET', url, body);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function register(program: Command): void {
  const attachment = program
    .command('attachment')
    .aliases(['file'])
    .description('Manage attachments (files on transactions, accounts, bills, …)');

  // ── list (optionally scoped by owner) ─────────────────────────────────────
  attachment
    .command('list')
    .description('List attachments, optionally scoped to an owner')
    .option('--transaction <id>', 'Scope to a transaction')
    .option('--account <id>', 'Scope to an account')
    .option('--bill <id>', 'Scope to a bill')
    .option('--budget <id>', 'Scope to a budget')
    .option('--category <id>', 'Scope to a category')
    .option('--piggy <id>', 'Scope to a piggy bank')
    .option('--tag <id>', 'Scope to a tag')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const owner = resolveOwner(opts);
      const path = owner ? OWNERS[owner.key].path(owner.id) : '/attachments';
      const { data } = await client.getPaged(path, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(data, attachmentColumns(), ctx.output);
    });

  // ── view ────────────────────────────────────────────────────────────────
  attachment
    .command('view')
    .description('Show attachment metadata')
    .argument('<id>', 'Attachment id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/attachments/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      const a = item.attributes ?? {};
      renderItem(
        item,
        [
          { label: 'ID', get: () => item.id },
          { label: 'Filename', get: () => a.filename ?? '' },
          { label: 'Title', get: () => a.title ?? '' },
          { label: 'Owner type', get: () => a.attachable_type ?? '' },
          { label: 'Owner id', get: () => String(a.attachable_id ?? '') },
          { label: 'Size', get: () => String(a.size ?? '') },
          { label: 'MIME', get: () => a.mime ?? '' },
          { label: 'Notes', get: () => a.notes ?? '' },
        ],
        ctx.output,
      );
    });

  // ── upload (create metadata + upload bytes) ───────────────────────────────
  attachment
    .command('upload')
    .description('Create an attachment and upload its bytes')
    .argument('<file>', 'Path to the file to upload')
    .option('--transaction <id>', 'Attach to a transaction')
    .option('--account <id>', 'Attach to an account')
    .option('--bill <id>', 'Attach to a bill')
    .option('--budget <id>', 'Attach to a budget')
    .option('--category <id>', 'Attach to a category')
    .option('--piggy <id>', 'Attach to a piggy bank')
    .option('--tag <id>', 'Attach to a tag')
    .option('--title <title>', 'Attachment title')
    .option('--notes <text>', 'Attachment notes')
    .action(async (file: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const owner = resolveOwner(opts);
      if (!owner) {
        throw new UsageError(
          'Missing owner.',
          'Provide one of --transaction/--account/--bill/--budget/--category/--piggy/--tag.',
        );
      }
      const filename = basename(file);
      const body: Record<string, unknown> = {
        filename,
        attachable_type: OWNERS[owner.key].type,
        attachable_id: owner.id,
      };
      if (opts.title !== undefined) {
        body.title = opts.title;
      }
      if (opts.notes !== undefined) {
        body.notes = opts.notes;
      }
      // Step 1: create the metadata record.
      const res = await client.post('/attachments', body);
      const item = (res.data?.data ?? res.data) as any;
      const id = String(item.id);
      // Step 2: upload the bytes.
      await uploadBytes(ctx, id, file);
      printMutation(ctx.output, {
        id,
        verb: 'Uploaded attachment',
        description: filename,
      });
    });

  // ── edit (metadata) ───────────────────────────────────────────────────────
  attachment
    .command('edit')
    .description('Update attachment metadata')
    .argument('<id>', 'Attachment id')
    .option('--title <title>', 'Attachment title')
    .option('--notes <text>', 'Attachment notes')
    .option('--filename <name>', 'Filename')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body: Record<string, unknown> = {};
      if (opts.title !== undefined) {
        body.title = opts.title;
      }
      if (opts.notes !== undefined) {
        body.notes = opts.notes;
      }
      if (opts.filename !== undefined) {
        body.filename = opts.filename;
      }
      const res = await client.put(`/attachments/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id ?? id,
        verb: 'Updated attachment',
        description: item.attributes?.filename ?? '',
      });
    });

  // ── download ──────────────────────────────────────────────────────────────
  attachment
    .command('download')
    .description('Download attachment bytes')
    .argument('<id>', 'Attachment id')
    .option('--output <path>', 'Output path; "-" writes to stdout (default: filename)')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const bytes = await downloadBytes(ctx, id);
      if (opts.output === '-') {
        process.stdout.write(bytes);
        return;
      }
      let target = opts.output;
      if (!target) {
        // Default to the stored filename.
        const client = await ctx.client();
        const res = await client.get(`/attachments/${id}`);
        const item = (res.data?.data ?? res.data) as any;
        target = item.attributes?.filename ?? `attachment-${id}`;
      }
      await Bun.write(target, bytes);
      printMessage(`Wrote ${bytes.length} bytes to ${target}`, ctx.output);
    });

  // ── delete ───────────────────────────────────────────────────────────────
  attachment
    .command('delete')
    .description('Delete an attachment')
    .argument('<id>', 'Attachment id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete attachment ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/attachments/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted attachment', description: '' });
    });
}

function attachmentColumns() {
  return [
    { header: 'id', get: (a: any) => a.id },
    { header: 'filename', get: (a: any) => a.attributes?.filename ?? '' },
    { header: 'attachable_type', get: (a: any) => a.attributes?.attachable_type ?? '' },
    { header: 'attachable_id', get: (a: any) => String(a.attributes?.attachable_id ?? '') },
    { header: 'size', get: (a: any) => String(a.attributes?.size ?? '') },
    { header: 'title', get: (a: any) => a.attributes?.title ?? '' },
  ];
}
