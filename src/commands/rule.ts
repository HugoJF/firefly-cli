/**
 * `firefly rule` — automation rules (spec/06-commands/rule.md).
 *
 * Rules apply triggers/actions to transactions. Their nested trigger/action
 * arrays are exposed via repeatable `--trigger type:value` / `--action
 * type:value`, or via `--editor` for a full YAML body (same affordance as
 * transaction splits, spec/09 "Editor flow").
 *
 * Endpoints covered (spec/08): GET/POST /rules, GET /currencies/{code}/rules,
 * GET/PUT/DELETE /rules/{id}, GET /rules/{id}/test, POST /rules/{id}/trigger.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { parse as parseYaml } from 'yaml';
import { CancelledError, UsageError } from '../api/errors.ts';
import { getContext } from '../context.ts';
import { printMutation, renderItem, renderList } from '../output/render.ts';

interface Clause {
  type: string;
  value: string;
  order: number;
}

/** Parse repeatable `--trigger type:value` / `--action type:value` flags. */
export function parseClauses(items: string[] | undefined): Clause[] {
  return (items ?? []).map((raw, i) => {
    const idx = raw.indexOf(':');
    if (idx === -1) {
      throw new UsageError(`Invalid clause (expected type:value): ${raw}`);
    }
    return { type: raw.slice(0, idx).trim(), value: raw.slice(idx + 1), order: i + 1 };
  });
}

/**
 * LOCAL helper (foundation has no editor flow). Opens $VISUAL/$EDITOR with the
 * given YAML scaffold and returns the parsed object. An empty buffer cancels.
 */
function editBody(initial: string): Record<string, unknown> {
  const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
  const dir = mkdtempSync(join(tmpdir(), 'firefly-rule-'));
  const file = join(dir, 'rule.yaml');
  writeFileSync(file, initial, 'utf8');
  const [cmd, ...args] = editor.split(/\s+/);
  const res = spawnSync(cmd, [...args, file], { stdio: 'inherit' });
  if (res.status !== 0 && res.status !== null) {
    throw new UsageError(`Editor "${editor}" exited with status ${res.status}.`);
  }
  const text = readFileSync(file, 'utf8');
  const stripped = text.replace(/^\s*#.*$/gm, '').trim();
  if (stripped.length === 0) {
    throw new CancelledError('Empty editor buffer — aborted.');
  }
  const parsed = parseYaml(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new UsageError('Editor body did not parse to a YAML mapping.');
  }
  return parsed as Record<string, unknown>;
}

function collect(value: string, prev: string[]): string[] {
  prev.push(value);
  return prev;
}

const RULE_TEMPLATE = `# Rule body (YAML). Save & close to submit; empty buffer aborts.
triggers:
  - type: description_contains
    value: ''
actions:
  - type: set_category
    value: ''
`;

export function register(program: Command): void {
  const rule = program.command('rule').description('Manage automation rules');

  // ── list ────────────────────────────────────────────────────────────────
  rule
    .command('list')
    .description('List rules')
    .option('--currency <code>', 'Scope to rules using a currency')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const path = opts.currency ? `/currencies/${opts.currency}/rules` : '/rules';
      const { data } = await client.getPaged(path, {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (r: any) => r.id },
          { header: 'title', get: (r: any) => r.attributes?.title ?? '' },
          {
            header: 'rule_group',
            get: (r: any) => r.attributes?.rule_group_title ?? r.attributes?.rule_group_id ?? '',
          },
          { header: 'active', get: (r: any) => String(r.attributes?.active ?? '') },
          { header: 'strict', get: (r: any) => String(r.attributes?.strict ?? '') },
          {
            header: 'stop_processing',
            get: (r: any) => String(r.attributes?.stop_processing ?? ''),
          },
        ],
        ctx.output,
      );
    });

  // ── view ────────────────────────────────────────────────────────────────
  rule
    .command('view')
    .description('Show one rule (triggers + actions)')
    .argument('<id>', 'Rule id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/rules/${id}`);
      const item = (res.data?.data ?? res.data) as any;
      const a = item.attributes ?? {};
      const fmt = (clauses: any[]) => (clauses ?? []).map((c) => `${c.type}:${c.value}`).join(', ');
      renderItem(
        item,
        [
          { label: 'ID', get: () => item.id },
          { label: 'Title', get: () => a.title ?? '' },
          { label: 'Description', get: () => a.description ?? '' },
          { label: 'Rule group', get: () => a.rule_group_title ?? a.rule_group_id ?? '' },
          { label: 'When', get: () => a.trigger ?? '' },
          { label: 'Active', get: () => String(a.active ?? '') },
          { label: 'Strict', get: () => String(a.strict ?? '') },
          { label: 'Stop processing', get: () => String(a.stop_processing ?? '') },
          { label: 'Triggers', get: () => fmt(a.triggers) },
          { label: 'Actions', get: () => fmt(a.actions) },
        ],
        ctx.output,
      );
    });

  // ── create ───────────────────────────────────────────────────────────────
  rule
    .command('create')
    .description('Create a rule')
    .option('--title <title>', 'Rule title')
    .option('--description <text>', 'Rule description')
    .option('--rule-group <id>', 'Rule group id')
    .option('--rule-group-title <title>', 'Rule group title (alternative to --rule-group)')
    .option(
      '--when <trigger>',
      'When to fire: store-journal|update-journal|manual',
      'store-journal',
    )
    .option('--trigger <type:value>', 'Repeatable rule trigger', collect, [])
    .option('--action <type:value>', 'Repeatable rule action', collect, [])
    .option('--order <n>', 'Order', (v) => Number.parseInt(v, 10))
    .option('--strict', 'All triggers must match (default true)')
    .option('--no-strict', 'Any trigger may match')
    .option('--active', 'Rule is active (default true)')
    .option('--no-active', 'Rule is inactive')
    .option('--stop-processing', 'Stop processing later rules when this fires')
    .option('--editor', 'Compose triggers/actions in $EDITOR (YAML)')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();

      if (!opts.title) {
        throw new UsageError('Missing required --title.');
      }
      if (!opts.ruleGroup && !opts.ruleGroupTitle) {
        throw new UsageError(
          'Missing rule group.',
          'Provide --rule-group <id> or --rule-group-title <title>.',
        );
      }

      let triggers = parseClauses(opts.trigger);
      let actions = parseClauses(opts.action);
      if (opts.editor) {
        const edited = editBody(RULE_TEMPLATE);
        triggers = (edited.triggers as Clause[]) ?? triggers;
        actions = (edited.actions as Clause[]) ?? actions;
      }
      if (triggers.length === 0) {
        throw new UsageError('A rule needs at least one --trigger (or use --editor).');
      }
      if (actions.length === 0) {
        throw new UsageError('A rule needs at least one --action (or use --editor).');
      }

      const body: Record<string, unknown> = {
        title: opts.title,
        trigger: opts.when,
        triggers,
        actions,
      };
      if (opts.description !== undefined) {
        body.description = opts.description;
      }
      if (opts.ruleGroup) {
        body.rule_group_id = opts.ruleGroup;
      }
      if (opts.ruleGroupTitle) {
        body.rule_group_title = opts.ruleGroupTitle;
      }
      if (opts.order !== undefined) {
        body.order = opts.order;
      }
      if (command.getOptionValueSource('strict') === 'cli') {
        body.strict = opts.strict;
      }
      if (command.getOptionValueSource('active') === 'cli') {
        body.active = opts.active;
      }
      if (opts.stopProcessing !== undefined) {
        body.stop_processing = opts.stopProcessing;
      }

      const res = await client.post('/rules', body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id,
        verb: 'Created rule',
        description: item.attributes?.title ?? opts.title,
      });
    });

  // ── edit ─────────────────────────────────────────────────────────────────
  rule
    .command('edit')
    .description('Update a rule')
    .argument('<id>', 'Rule id')
    .option('--title <title>', 'Rule title')
    .option('--description <text>', 'Rule description')
    .option('--rule-group <id>', 'Rule group id')
    .option('--when <trigger>', 'When to fire: store-journal|update-journal|manual')
    .option('--trigger <type:value>', 'Repeatable rule trigger (replaces all)', collect, [])
    .option('--action <type:value>', 'Repeatable rule action (replaces all)', collect, [])
    .option('--order <n>', 'Order', (v) => Number.parseInt(v, 10))
    .option('--strict', 'All triggers must match')
    .option('--no-strict', 'Any trigger may match')
    .option('--active', 'Rule is active')
    .option('--no-active', 'Rule is inactive')
    .option('--stop-processing', 'Stop processing later rules when this fires')
    .option('--editor', 'Compose triggers/actions in $EDITOR (YAML)')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();

      const body: Record<string, unknown> = {};
      if (opts.title !== undefined) {
        body.title = opts.title;
      }
      if (opts.description !== undefined) {
        body.description = opts.description;
      }
      if (opts.ruleGroup) {
        body.rule_group_id = opts.ruleGroup;
      }
      if (opts.when) {
        body.trigger = opts.when;
      }
      if (opts.order !== undefined) {
        body.order = opts.order;
      }
      if (command.getOptionValueSource('strict') === 'cli') {
        body.strict = opts.strict;
      }
      if (command.getOptionValueSource('active') === 'cli') {
        body.active = opts.active;
      }
      if (opts.stopProcessing !== undefined) {
        body.stop_processing = opts.stopProcessing;
      }
      const triggers = parseClauses(opts.trigger);
      const actions = parseClauses(opts.action);
      if (opts.editor) {
        const edited = editBody(RULE_TEMPLATE);
        if (edited.triggers) {
          body.triggers = edited.triggers;
        }
        if (edited.actions) {
          body.actions = edited.actions;
        }
      } else {
        if (triggers.length > 0) {
          body.triggers = triggers;
        }
        if (actions.length > 0) {
          body.actions = actions;
        }
      }

      const res = await client.put(`/rules/${id}`, body);
      const item = (res.data?.data ?? res.data) as any;
      printMutation(ctx.output, {
        id: item.id ?? id,
        verb: 'Updated rule',
        description: item.attributes?.title ?? '',
      });
    });

  // ── delete ───────────────────────────────────────────────────────────────
  rule
    .command('delete')
    .description('Delete a rule')
    .argument('<id>', 'Rule id')
    .action(async (id: string, _opts, command: Command) => {
      const ctx = await getContext(command);
      if (!(await ctx.confirm(`Delete rule ${id}?`))) {
        return;
      }
      const client = await ctx.client();
      await client.delete(`/rules/${id}`);
      printMutation(ctx.output, { id, verb: 'Deleted rule', description: '' });
    });

  // ── test (dry-run) ────────────────────────────────────────────────────────
  rule
    .command('test')
    .description('Dry-run a rule against transactions')
    .argument('<id>', 'Rule id')
    .option('--start <date>', 'Range start (ISO YYYY-MM-DD)')
    .option('--end <date>', 'Range end (ISO YYYY-MM-DD)')
    .option('--accounts <ids>', 'Comma-separated account ids to limit the test')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(`/rules/${id}/test`, ruleRunQuery(opts));
      const data = (res.data?.data ?? res.data) as any[];
      renderTransactionRun(data, ctx);
    });

  // ── trigger (apply for real) ──────────────────────────────────────────────
  rule
    .command('trigger')
    .description('Apply a rule to transactions for real')
    .argument('<id>', 'Rule id')
    .option('--start <date>', 'Range start (ISO YYYY-MM-DD)')
    .option('--end <date>', 'Range end (ISO YYYY-MM-DD)')
    .option('--accounts <ids>', 'Comma-separated account ids to limit the run')
    .action(async (id: string, opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      await client.post(`/rules/${id}/trigger`, undefined, { query: ruleRunQuery(opts) });
      printMutation(ctx.output, { id, verb: 'Triggered rule', description: '' });
    });
}

/** Build the start/end/accounts[] query shared by test + trigger. */
export function ruleRunQuery(opts: {
  start?: string;
  end?: string;
  accounts?: string;
}): Record<string, any> {
  const query: Record<string, any> = {};
  if (opts.start) {
    query.start = opts.start;
  }
  if (opts.end) {
    query.end = opts.end;
  }
  if (opts.accounts) {
    query['accounts[]'] = opts.accounts.split(',').map((s) => s.trim());
  }
  return query;
}

function renderTransactionRun(data: any[], ctx: Awaited<ReturnType<typeof getContext>>): void {
  renderList(
    Array.isArray(data) ? data : [],
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
}
