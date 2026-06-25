/**
 * `firefly user` — current user + admin user reads (spec/06 meta.md).
 *
 *   user view          GET /about/user   (current user)
 *   user view <id>     GET /users/{id}   (admin)
 *   user list          GET /users        (admin)
 *
 * Writes (`POST /users`, `PUT/DELETE /users/{id}`) are admin-only and left to
 * `firefly api` (matrix api-only rows).
 */
import type { Command } from 'commander';
import { getContext } from '../context.ts';
import { renderItem, renderList } from '../output/render.ts';

const USER_FIELDS = [
  { label: 'ID', get: (u: any) => u.id ?? '' },
  { label: 'Email', get: (u: any) => u.attributes?.email ?? '' },
  { label: 'Role', get: (u: any) => u.attributes?.role ?? '' },
  { label: 'Blocked', get: (u: any) => String(u.attributes?.blocked ?? false) },
  { label: 'Created', get: (u: any) => u.attributes?.created_at?.slice(0, 10) ?? '' },
];

export function register(program: Command): void {
  const user = program.command('user').description('View current and admin users');

  user
    .command('view')
    .description('Show the current user, or an admin user by id')
    .argument('[id]', 'User id (admin); omit for the current user')
    .action(async (id: string | undefined, _opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const res = await client.get(id ? `/users/${id}` : '/about/user');
      const item = (res.data?.data ?? res.data) as any;
      renderItem(item, USER_FIELDS, ctx.output);
    });

  user
    .command('list')
    .description('List all users (admin) — GET /users')
    .option('--limit <n>', 'Page size', (v) => Number.parseInt(v, 10))
    .option('--page <n>', 'Page number', (v) => Number.parseInt(v, 10))
    .option('--all', 'Fetch every page')
    .action(async (opts, command: Command) => {
      const ctx = await getContext(command);
      const client = await ctx.client();
      const { data } = await client.getPaged('/users', {
        limit: opts.limit,
        page: opts.page,
        all: opts.all,
      });
      renderList(
        data,
        [
          { header: 'id', get: (u: any) => u.id ?? '' },
          { header: 'email', get: (u: any) => u.attributes?.email ?? '' },
          { header: 'role', get: (u: any) => u.attributes?.role ?? '' },
          { header: 'blocked', get: (u: any) => String(u.attributes?.blocked ?? false) },
        ],
        ctx.output,
      );
    });
}
