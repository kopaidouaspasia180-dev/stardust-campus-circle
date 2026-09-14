begin;

-- Campus rankings are shared by one school. Keep the originating campus on
-- each place as a location label, but remove duplicated seeded rows and fake
-- seed likes before enforcing the school-wide name boundary.
update ranking_places set base_likes=0 where base_likes<>0;

update ranking_places
set status='removed', moderation_note='历史演示地点已下架', updated_at=now()
where source_type='curated' and cover_key<>'life-mocha-pro' and status<>'removed';

create temporary table ranking_place_duplicate_map on commit drop as
with ranked as (
  select id,
    first_value(id) over(
      partition by tenant_slug,category,lower(trim(name))
      order by (status='active') desc,(source_type='student') desc,
        (coalesce(image_url,'')<>'') desc,created_at,id
    ) keeper_id,
    row_number() over(
      partition by tenant_slug,category,lower(trim(name))
      order by (status='active') desc,(source_type='student') desc,
        (coalesce(image_url,'')<>'') desc,created_at,id
    ) position
  from ranking_places
  where status in ('pending','active')
)
select id duplicate_id,keeper_id from ranked where position>1;

insert into ranking_place_likes(place_id,user_id,created_at)
select map.keeper_id,likes.user_id,min(likes.created_at)
from ranking_place_duplicate_map map
join ranking_place_likes likes on likes.place_id=map.duplicate_id
group by map.keeper_id,likes.user_id
on conflict(place_id,user_id) do nothing;

insert into ranking_place_reports(place_id,reporter_id,reason,detail,status,handled_at,handled_by,created_at)
select map.keeper_id,reports.reporter_id,reports.reason,reports.detail,reports.status,
  reports.handled_at,reports.handled_by,reports.created_at
from ranking_place_duplicate_map map
join ranking_place_reports reports on reports.place_id=map.duplicate_id
on conflict(place_id,reporter_id) do nothing;

delete from ranking_places places
using ranking_place_duplicate_map map
where places.id=map.duplicate_id;

drop index if exists idx_ranking_places_live_name;
create unique index if not exists idx_ranking_places_school_live_name
  on ranking_places(tenant_slug,category,lower(trim(name)))
  where status in ('pending','active');

create index if not exists idx_ranking_places_school_public
  on ranking_places(tenant_slug,category,status,created_at desc);

create table if not exists ranking_place_favorites (
  place_id uuid not null references ranking_places(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(place_id,user_id)
);

create index if not exists idx_ranking_place_favorites_user
  on ranking_place_favorites(user_id,created_at desc);

create table if not exists ranking_place_comments (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references ranking_places(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  content text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status in ('active','removed'))
);

create index if not exists idx_ranking_place_comments_place
  on ranking_place_comments(place_id,status,created_at desc);

create table if not exists ranking_place_comment_reports (
  id bigserial primary key,
  comment_id uuid not null references ranking_place_comments(id) on delete cascade,
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

create index if not exists idx_ranking_place_comment_reports_open
  on ranking_place_comment_reports(status,created_at asc);

commit;
