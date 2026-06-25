/**
 * `firefly webhook` (alias `hook`) — outbound HTTP notifications + delivery
 * inspection (spec/06-commands/webhook.md).
 *
 * Endpoints covered (spec/08): GET/POST /webhooks, GET/PUT/DELETE
 * /webhooks/{id}, POST /webhooks/{id}/submit,
 * POST /webhooks/{id}/trigger-transaction/{transactionId},
 * GET /webhooks/{id}/messages, GET /webhooks/{id}/messages/{messageId},
 * GET /webhooks/{id}/messages/{messageId}/attempts,
 * GET /webhooks/{id}/messages/{messageId}/attempts/{attemptId}.
 *
 * Firefly v6 stores triggers/responses/deliveries as arrays; the `--trigger`,
 * `--response`, `--delivery` flags map onto those arrays.
 */
import type { Command } from 'commander';
import { UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import { printMutation, renderItem, renderList } from '../output/render.ts';

function joinArr(value: unknown): string {
  return Array.isArray(value) ? value.join(',') : String(value ?? '');
}

export function register(program: Command): void {
  const webhook = program.command('webhook').aliases(['hook']).description('Manage webhooks');

  // ── list ────────────────────────────────────────────────────────────────
  webhook
    .command('list')
    .description('List webhooks')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/webhooks', {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (w: any) => w.id },
          { header: 'title', get: (w: any) => w.attributes?.title ?? '' },
          { header: 'url', get: (w: any) => w.attributes?.url ?? '' },
          { header: 'trigger', get: (w: any) => joinArr(w.attributes?.triggers) },
          { header: 'response', get: (w: any) => joinArr(w.attributes?.responses) },
          { header: 'delivery', get: (w: any) => joinArr(w.attributes?.deliveries) },
          { header: 'active', get: (w: any) => String(w.attributes?.active ?? '') },
        ],
        ctx.output,
      );
    });

  // ── view ────────────────────────────────────────────────────────────────
  webhook
    .command('view')
    .description('Show one webhook')
    .argument('<id>', 'Webhook id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/webhooks/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      const a = item.attributes ?? {};
      renderItem(
        item,
        [
          { label: 'ID', get: () => item.id },
          { label: 'Title', get: () => a.title ?? '' },
          { label: 'URL', get: () => a.url ?? '' },
          { label: 'Triggers', get: () => joinArr(a.triggers) },
          { label: 'Responses', get: () => joinArr(a.responses) },
          { label: 'Deliveries', get: () => joinArr(a.deliveries) },
          { label: 'Active', get: () => String(a.active ?? '') },
          { label: 'Secret', get: () => a.secret ?? '' },
        ],
        ctx.output,
      );
    });

  // ── create ───────────────────────────────────────────────────────────────
  webhook
    .command('create')
    .description('Create a webhook')
    .option('--title <title>', 'Webhook title')
    .option('--url <url>', 'Target URL (must start with https)')
    .option('--trigger <enum>', 'Trigger event, e.g. STORE_TRANSACTION')
    .option('--response <enum>', 'Response payload, e.g. TRANSACTIONS')
    .option('--delivery <enum>', 'Delivery format, e.g. JSON', 'JSON')
    .option('--active', 'Webhook is active (default true)')
    .option('--no-active', 'Webhook is inactive')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      if (!opts.title || !opts.url || !opts.trigger || !opts.response) {
        throw new UsageError(
          'Missing required fields.',
          'Provide --title, --url, --trigger and --response.',
        );
      }
      const body: Record<string, unknown> = {
        title: opts.title,
        url: opts.url,
        triggers: [opts.trigger],
        responses: [opts.response],
        deliveries: [opts.delivery],
      };
      if (command.getOptionValueSource('active') === 'cli') {
        body.active = opts.active;
      }
      const res = await client.post('/webhooks', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created webhook',
        description: item.attributes?.title ?? opts.title,
      });
    });

  // ── edit ─────────────────────────────────────────────────────────────────
  webhook
    .command('edit')
    .description('Update a webhook')
    .argument('<id>', 'Webhook id')
    .option('--title <title>', 'Webhook title')
    .option('--url <url>', 'Target URL')
    .option('--trigger <enum>', 'Trigger event')
    .option('--response <enum>', 'Response payload')
    .option('--delivery <enum>', 'Delivery format')
    .option('--active', 'Webhook is active')
    .option('--no-active', 'Webhook is inactive')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body: Record<string, unknown> = {};
      if (opts.title !== undefined) {
        body.title = opts.title;
      }
      if (opts.url !== undefined) {
        body.url = opts.url;
      }
      if (opts.trigger) {
        body.triggers = [opts.trigger];
      }
      if (opts.response) {
        body.responses = [opts.response];
      }
      if (opts.delivery) {
        body.deliveries = [opts.delivery];
      }
      if (command.getOptionValueSource('active') === 'cli') {
        body.active = opts.active;
      }
      const res = await client.put(`/webhooks/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id ?? id,
        verb: 'Updated webhook',
        description: item.attributes?.title ?? '',
      });
    });

  // ── delete ───────────────────────────────────────────────────────────────
  webhook
    .command('delete')
    .description('Delete a webhook')
    .argument('<id>', 'Webhook id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete webhook ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/webhooks/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted webhook', description: '' });
    });

  // ── submit ────────────────────────────────────────────────────────────────
  webhook
    .command('submit')
    .description('Force-submit pending messages for a webhook')
    .argument('<id>', 'Webhook id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      await client.post(`/webhooks/${id}/submit`);
      printMutation(ctx.output, { id, verb: 'Submitted webhook', description: '' });
    });

  // ── trigger (re-fire for a transaction) ───────────────────────────────────
  webhook
    .command('trigger')
    .description('Re-fire a webhook for a transaction')
    .argument('<id>', 'Webhook id')
    .argument('<transactionId>', 'Transaction id')
    .action(async (id: string, transactionId: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      await client.post(`/webhooks/${id}/trigger-transaction/${transactionId}`);
      printMutation(ctx.output, {
        id,
        verb: 'Triggered webhook',
        description: `for transaction ${transactionId}`,
      });
    });

  // ── messages (nested) ─────────────────────────────────────────────────────
  const messages = webhook
    .command('messages')
    .description('Inspect webhook delivery messages and attempts');

  messages
    .command('list', { isDefault: true })
    .description('List delivery messages for a webhook')
    .argument('<id>', 'Webhook id')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/webhooks/${id}/messages`, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderMessageList(data, ctx);
    });

  messages
    .command('view')
    .description('Show one delivery message')
    .argument('<id>', 'Webhook id')
    .argument('<messageId>', 'Message id')
    .action(async (id: string, messageId: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/webhooks/${id}/messages/${messageId}`);
      const item = (res.data?.data ?? res.data) as any;
      const a = item.attributes ?? {};
      renderItem(
        item,
        [
          { label: 'ID', get: () => item.id },
          { label: 'Webhook', get: () => String(a.webhook_id ?? id) },
          { label: 'Sent', get: () => String(a.sent ?? '') },
          { label: 'Errored', get: () => String(a.errored ?? '') },
          { label: 'UUID', get: () => a.uuid ?? '' },
          { label: 'Created', get: () => a.created_at ?? '' },
        ],
        ctx.output,
      );
    });

  const attempts = messages
    .command('attempts')
    .description('Inspect delivery attempts for a message');

  attempts
    .command('list', { isDefault: true })
    .description('List delivery attempts for a message')
    .argument('<id>', 'Webhook id')
    .argument('<messageId>', 'Message id')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (id: string, messageId: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/webhooks/${id}/messages/${messageId}/attempts`, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (m: any) => m.id },
          { header: 'status_code', get: (m: any) => String(m.attributes?.status_code ?? '') },
          { header: 'created_at', get: (m: any) => m.attributes?.created_at ?? '' },
        ],
        ctx.output,
      );
    });

  attempts
    .command('view')
    .description('Show one delivery attempt')
    .argument('<id>', 'Webhook id')
    .argument('<messageId>', 'Message id')
    .argument('<attemptId>', 'Attempt id')
    .action(async (id: string, messageId: string, attemptId: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/webhooks/${id}/messages/${messageId}/attempts/${attemptId}`);
      const item = (res.data?.data ?? res.data) as any;
      const a = item.attributes ?? {};
      renderItem(
        item,
        [
          { label: 'ID', get: () => item.id },
          { label: 'Message', get: () => String(a.webhook_message_id ?? messageId) },
          { label: 'Status code', get: () => String(a.status_code ?? '') },
          { label: 'Logs', get: () => a.logs ?? '' },
          { label: 'Response', get: () => a.response ?? '' },
          { label: 'Created', get: () => a.created_at ?? '' },
        ],
        ctx.output,
      );
    });
}

function renderMessageList(data: any[], ctx: Awaited<ReturnType<typeof getContext>>): void {
  renderList(
    data,
    [
      { header: 'id', get: (m: any) => m.id },
      { header: 'sent', get: (m: any) => String(m.attributes?.sent ?? '') },
      { header: 'errored', get: (m: any) => String(m.attributes?.errored ?? '') },
      { header: 'created_at', get: (m: any) => m.attributes?.created_at ?? '' },
    ],
    ctx.output,
  );
}
