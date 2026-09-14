begin;

-- Ranking entries can be removed after publication. The original constraint
-- did not include that operational state even though the API already used it.
alter table ranking_places drop constraint if exists ranking_places_status_check;
alter table ranking_places
  add constraint ranking_places_status_check
  check(status in ('pending','active','rejected','removed'));

-- Comments are public UGC too, so they need the same report and audit loop as
-- posts. Reports are scoped through their parent post and are unique per user.
create table if not exists community_comment_reports (
  id bigserial primary key,
  comment_id uuid not null references community_comments(id) on delete cascade,
  reporter_id bigint not null references users(id) on delete cascade,
  reason text not null,
  detail text not null default '',
  status text not null default 'open',
  handled_at timestamptz,
  handled_by bigint references users(id),
  created_at timestamptz not null default now(),
  unique(comment_id,reporter_id),
  check(status in ('open','resolved'))
);

create index if not exists idx_community_comment_reports_open
  on community_comment_reports(status,created_at asc);

commit;
