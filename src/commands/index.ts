/**
 * Command registry (barrel). This is the auto-registration mechanism (spec/12):
 * every command module exports `register(program)`; the loader in `cli.ts`
 * calls each entry below. An explicit array is used (NOT runtime fs scanning)
 * because the compiled `--compile` binary has no filesystem to scan.
 *
 * To add a command: import its `register` and add it to `registrars`
 * (kept alphabetical). `link.ts` registers both `link` and `link-type`.
 */
import type { Command } from 'commander';

import { register as about } from './about.ts';
import { register as account } from './account.ts';
import { register as alias } from './alias.ts';
import { register as api } from './api.ts';
import { register as attachment } from './attachment.ts';
import { register as auth } from './auth.ts';
import { register as bill } from './bill.ts';
import { register as budget } from './budget.ts';
import { register as category } from './category.ts';
import { register as chart } from './chart.ts';
import { register as completion } from './completion.ts';
import { register as configValue } from './config-value.ts';
import { register as config } from './config.ts';
import { register as cron } from './cron.ts';
import { register as currency } from './currency.ts';
import { register as data } from './data.ts';
import { register as insight } from './insight.ts';
import { register as instance } from './instance.ts';
import { register as link } from './link.ts';
import { register as objectGroup } from './object-group.ts';
import { register as piggy } from './piggy.ts';
import { register as preference } from './preference.ts';
import { register as recurrence } from './recurrence.ts';
import { register as ruleGroup } from './rule-group.ts';
import { register as rule } from './rule.ts';
import { register as search } from './search.ts';
import { register as tag } from './tag.ts';
import { register as transaction } from './transaction.ts';
import { register as user } from './user.ts';
import { register as version } from './version.ts';
import { register as webhook } from './webhook.ts';

export const registrars: Array<(program: Command) => void> = [
  about,
  account,
  alias,
  api,
  attachment,
  auth,
  bill,
  budget,
  category,
  chart,
  completion,
  config,
  configValue,
  cron,
  currency,
  data,
  instance,
  insight,
  link,
  objectGroup,
  piggy,
  preference,
  recurrence,
  rule,
  ruleGroup,
  search,
  tag,
  transaction,
  user,
  version,
  webhook,
];
