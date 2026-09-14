alter table community_posts add column if not exists moderation_note text not null default '';
alter table community_posts add column if not exists reviewed_at timestamptz;
alter table community_posts add column if not exists reviewed_by bigint references users(id);

create table if not exists community_reports (
  id bigserial primary key,
  post_id uuid not null references community_posts(id) on delete cascade,
  reporter_id bigint not null references users(id),
  reason text not null,
  detail text not null default '',
  status text not null default 'open',
  handled_at timestamptz,
  handled_by bigint references users(id),
  created_at timestamptz not null default now(),
  unique(post_id,reporter_id)
);

create index if not exists idx_community_posts_moderation on community_posts(tenant_slug,status,created_at desc);
create index if not exists idx_community_reports_open on community_reports(status,created_at desc);
