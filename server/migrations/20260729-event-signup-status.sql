begin;

alter table event_signups
  add column if not exists status text not null default 'signed',
  add column if not exists cancelled_at timestamptz;

create index if not exists idx_event_signups_active
  on event_signups(event_id, status);

commit;
