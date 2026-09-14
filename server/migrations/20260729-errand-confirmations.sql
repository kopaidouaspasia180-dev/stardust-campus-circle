begin;

-- An errand is completed only after both sides confirm the handoff.
alter table errands
  add column if not exists creator_confirmed_at timestamptz,
  add column if not exists runner_confirmed_at timestamptz;

create index if not exists idx_errands_confirmation_queue
  on errands(tenant_slug, status, creator_confirmed_at, runner_confirmed_at, created_at desc);

commit;
