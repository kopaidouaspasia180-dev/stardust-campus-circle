begin;

create table if not exists community_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id bigint not null references users(id),
  reason text not null,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_id,user_id)
);

create index if not exists idx_community_reports_queue
  on community_reports(tenant_slug,status,created_at desc);

commit;
