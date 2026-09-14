alter table errands
  add column if not exists creator_confirmed_at timestamptz,
  add column if not exists runner_confirmed_at timestamptz;

create index if not exists idx_errands_confirmation_queue
  on errands(tenant_slug, status, creator_confirmed_at, runner_confirmed_at, created_at desc);

alter table event_signups
  add column if not exists status text not null default 'signed',
  add column if not exists cancelled_at timestamptz;

create index if not exists idx_event_signups_active
  on event_signups(event_id, status);

alter table match_greetings
  add column if not exists status text not null default 'pending',
  add column if not exists responded_at timestamptz;

create index if not exists idx_match_greetings_inbox
  on match_greetings(tenant_slug, target_id, status, created_at desc);
