begin;

alter table match_greetings
  add column if not exists status text not null default 'pending',
  add column if not exists responded_at timestamptz;

create index if not exists idx_match_greetings_inbox
  on match_greetings(tenant_slug, target_id, status, created_at desc);

commit;
