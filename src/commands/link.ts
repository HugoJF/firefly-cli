/**
 * `firefly link-type` (alias `ltype`) and `firefly link` — transaction links
 * (spec/06-commands/link.md). Two distinct API resources registered together.
 *
 * Endpoints covered (spec/08): GET/POST /link-types, GET/PUT/DELETE
 * /link-types/{id}, GET /link-types/{id}/transactions,
 * GET/POST /transaction-links, GET/PUT/DELETE /transaction-links/{id},
 * GET /transaction-journals/{id}/links.
 */
import type { Command } from 'commander';
import { UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import { printMutation, renderItem, renderList } from '../output/render.ts';

export function register(program: Command): void {
  registerLinkType(program);
  registerLink(program);
}

function registerLinkType(program: Command): void {
  const linkType = program
    .command('link-type')
    .aliases(['ltype'])
    .description('Manage transaction link types');

  linkType
    .command('list')
    .description('List link types')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/link-types', {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (t: any) => t.id },
          { header: 'name', get: (t: any) => t.attributes?.name ?? '' },
          { header: 'inward', get: (t: any) => t.attributes?.inward ?? '' },
          { header: 'outward', get: (t: any) => t.attributes?.outward ?? '' },
          { header: 'editable', get: (t: any) => String(t.attributes?.editable ?? '') },
        ],
        ctx.output,
      );
    });

  linkType
    .command('view')
    .description('Show one link type')
    .argument('<id>', 'Link type id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/link-types/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      const a = item.attributes ?? {};
      renderItem(
        item,
        [
          { label: 'ID', get: () => item.id },
          { label: 'Name', get: () => a.name ?? '' },
          { label: 'Inward', get: () => a.inward ?? '' },
          { label: 'Outward', get: () => a.outward ?? '' },
          { label: 'Editable', get: () => String(a.editable ?? '') },
        ],
        ctx.output,
      );
    });

  linkType
    .command('create')
    .description('Create a link type')
    .option('--name <name>', 'Link type name')
    .option('--inward <text>', 'Inward description (e.g. "is refunded by")')
    .option('--outward <text>', 'Outward description (e.g. "refunds")')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      if (!opts.name || !opts.inward || !opts.outward) {
        throw new UsageError('Missing required fields.', 'Provide --name, --inward and --outward.');
      }
      const res = await client.post('/link-types', {
        name: opts.name,
        inward: opts.inward,
        outward: opts.outward,
      });
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created link type',
        description: item.attributes?.name ?? opts.name,
      });
    });

  linkType
    .command('edit')
    .description('Update a link type')
    .argument('<id>', 'Link type id')
    .option('--name <name>', 'Link type name')
    .option('--inward <text>', 'Inward description')
    .option('--outward <text>', 'Outward description')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body: Record<string, unknown> = {};
      if (opts.name !== undefined) {
        body.name = opts.name;
      }
      if (opts.inward !== undefined) {
        body.inward = opts.inward;
      }
      if (opts.outward !== undefined) {
        body.outward = opts.outward;
      }
      const res = await client.put(`/link-types/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id ?? id,
        verb: 'Updated link type',
        description: item.attributes?.name ?? '',
      });
    });

  linkType
    .command('delete')
    .description('Delete a link type')
    .argument('<id>', 'Link type id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete link type ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/link-types/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted link type', description: '' });
    });

  linkType
    .command('transactions')
    .description('List transaction journals linked via this type')
    .argument('<id>', 'Link type id')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged(`/link-types/${id}/transactions`, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (t: any) => t.id },
          {
            header: 'description',
            get: (t: any) => t.attributes?.transactions?.[0]?.description ?? '',
          },
          { header: 'amount', get: (t: any) => t.attributes?.transactions?.[0]?.amount ?? '' },
        ],
        ctx.output,
      );
    });
}

function registerLink(program: Command): void {
  const link = program.command('link').description('Manage links between transactions');

  link
    .command('list')
    .description('List transaction links')
    .option('--journal <id>', 'Scope to one transaction journal')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path = opts.journal
        ? `/transaction-journals/${opts.journal}/links`
        : '/transaction-links';
      const { data } = await client.getPaged(path, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(data, linkColumns(), ctx.output);
    });

  link
    .command('view')
    .description('Show one transaction link')
    .argument('<id>', 'Transaction link id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/transaction-links/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      const a = item.attributes ?? {};
      renderItem(
        item,
        [
          { label: 'ID', get: () => item.id },
          { label: 'Link type', get: () => a.link_type_name ?? a.link_type_id ?? '' },
          { label: 'Inward id', get: () => String(a.inward_id ?? '') },
          { label: 'Outward id', get: () => String(a.outward_id ?? '') },
          { label: 'Notes', get: () => a.notes ?? '' },
        ],
        ctx.output,
      );
    });

  link
    .command('create')
    .description('Connect two transaction journals')
    .option('--type <id>', 'Link type id')
    .option('--inward <journalId>', 'Inward transaction journal id')
    .option('--outward <journalId>', 'Outward transaction journal id')
    .option('--notes <text>', 'Notes')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      if (!opts.type || !opts.inward || !opts.outward) {
        throw new UsageError('Missing required fields.', 'Provide --type, --inward and --outward.');
      }
      const body: Record<string, unknown> = {
        link_type_id: opts.type,
        inward_id: opts.inward,
        outward_id: opts.outward,
      };
      if (opts.notes !== undefined) {
        body.notes = opts.notes;
      }
      const res = await client.post('/transaction-links', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created link',
        description: `${opts.inward} -> ${opts.outward}`,
      });
    });

  link
    .command('edit')
    .description('Update a transaction link')
    .argument('<id>', 'Transaction link id')
    .option('--type <id>', 'Link type id')
    .option('--inward <journalId>', 'Inward transaction journal id')
    .option('--outward <journalId>', 'Outward transaction journal id')
    .option('--notes <text>', 'Notes')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const body: Record<string, unknown> = {};
      if (opts.type) {
        body.link_type_id = opts.type;
      }
      if (opts.inward) {
        body.inward_id = opts.inward;
      }
      if (opts.outward) {
        body.outward_id = opts.outward;
      }
      if (opts.notes !== undefined) {
        body.notes = opts.notes;
      }
      const res = await client.put(`/transaction-links/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id ?? id,
        verb: 'Updated link',
        description: '',
      });
    });

  link
    .command('delete')
    .description('Delete a transaction link')
    .argument('<id>', 'Transaction link id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete link ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/transaction-links/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted link', description: '' });
    });
}

function linkColumns() {
  return [
    { header: 'id', get: (l: any) => l.id },
    {
      header: 'link_type',
      get: (l: any) => l.attributes?.link_type_name ?? l.attributes?.link_type_id ?? '',
    },
    { header: 'inward_id', get: (l: any) => String(l.attributes?.inward_id ?? '') },
    { header: 'outward_id', get: (l: any) => String(l.attributes?.outward_id ?? '') },
  ];
}
