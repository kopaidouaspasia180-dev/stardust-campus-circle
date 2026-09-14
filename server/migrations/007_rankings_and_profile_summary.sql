begin;

create table if not exists ranking_places (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  campus_slug text not null,
  user_id bigint references users(id) on delete set null,
  category text not null,
  name text not null,
  note text not null,
  location text not null,
  image_url text,
  cover_key text not null default '',
  source_type text not null default 'student',
  status text not null default 'pending',
  moderation_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by bigint references users(id),
  base_likes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(category in ('food','fun','life')),
  check(source_type in ('curated','student')),
  check(status in ('pending','active','rejected')),
  check(base_likes >= 0),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug)
);

create unique index if not exists idx_ranking_places_live_name
  on ranking_places(tenant_slug,campus_slug,category,lower(name))
  where status in ('pending','active');

create index if not exists idx_ranking_places_public
  on ranking_places(tenant_slug,campus_slug,category,status,created_at desc);

create index if not exists idx_ranking_places_owner
  on ranking_places(user_id,tenant_slug,campus_slug,created_at desc);

create table if not exists ranking_place_likes (
  place_id uuid not null references ranking_places(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(place_id,user_id)
);

create index if not exists idx_ranking_place_likes_user
  on ranking_place_likes(user_id,created_at desc);

create table if not exists ranking_place_reports (
  id bigserial primary key,
  place_id uuid not null references ranking_places(id) on delete cascade,
  reporter_id bigint not null references users(id) on delete cascade,
  reason text not null,
  detail text not null default '',
  status text not null default 'open',
  handled_at timestamptz,
  handled_by bigint references users(id),
  created_at timestamptz not null default now(),
  unique(place_id,reporter_id),
  check(status in ('open','resolved'))
);

create index if not exists idx_ranking_place_reports_open
  on ranking_place_reports(status,created_at asc);

insert into ranking_places(
  tenant_slug,campus_slug,category,name,note,location,cover_key,source_type,status,base_likes
)
select
  c.tenant_slug,c.slug,v.category,v.name,v.note,v.location,v.cover_key,'curated','active',v.base_likes
from campus_sites c
cross join (values
  ('food','唐山宴饮食文化博物馆','唐山特色与城市餐饮体验','距校约 2.1km','food-tangshanyan',38),
  ('food','远洋城餐饮区','选择丰富，适合同学聚餐','距校约 2.4km','food-yuanyang',31),
  ('food','大学城周边餐饮','距离校园近，下课就能去','步行约 12 分钟','food-university',26),
  ('fun','唐山南湖景区','城市地标，适合散步拍照','距校约 3.4km','fun-nanhu',42),
  ('fun','唐山博物馆','城市文化展览，室内好逛','距校约 4.2km','fun-museum',29),
  ('fun','凤凰山公园','轻松散步，适合傍晚出发','距校约 2.8km','fun-phoenix',24),
  ('life','大学城城市书房','安静自习，也适合临时充电','距校约 0.6km','life-library',36),
  ('life','龙华西道公园','运动休闲，晚饭后就近散步','距校约 1.7km','life-longhua',22),
  ('life','远洋城综合服务','购物、餐饮和日常服务集中','距校约 2.4km','life-yuanyang',19)
) as v(category,name,note,location,cover_key,base_likes)
where c.tenant_slug='tangshan' and c.status='active'
on conflict do nothing;

commit;
