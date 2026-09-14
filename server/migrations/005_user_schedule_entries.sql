create table if not exists user_schedule_entries (
  id bigserial primary key,
  tenant_slug text not null references tenants(slug) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  name text not null,
  time_text text not null,
  room text not null default '',
  teacher text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_user_schedule_entries_owner on user_schedule_entries(tenant_slug,user_id,created_at desc);
