begin;

create table if not exists ranking_lists (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  user_id bigint references users(id) on delete set null,
  title text not null,
  description text not null,
  entry_label text not null default '地点',
  cover_url text,
  source_type text not null default 'student',
  status text not null default 'pending',
  moderation_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by bigint references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(source_type in ('system','student')),
  check(status in ('pending','active','rejected','removed')),
  check(char_length(title) between 2 and 20),
  check(char_length(description) between 5 and 80),
  check(char_length(entry_label) between 1 and 8)
);

create unique index if not exists idx_ranking_lists_school_live_title
  on ranking_lists(tenant_slug,lower(trim(title)))
  where status in ('pending','active');

create index if not exists idx_ranking_lists_school_public
  on ranking_lists(tenant_slug,status,created_at desc);

alter table ranking_places add column if not exists ranking_list_id uuid references ranking_lists(id) on delete cascade;

alter table ranking_places drop constraint if exists ranking_places_category_check;
alter table ranking_places add constraint ranking_places_category_check
  check(category in ('food','fun','life','custom'));

alter table ranking_places drop constraint if exists ranking_places_custom_list_check;
alter table ranking_places add constraint ranking_places_custom_list_check
  check((category='custom' and ranking_list_id is not null) or (category<>'custom' and ranking_list_id is null));

drop index if exists idx_ranking_places_school_live_name;
create unique index if not exists idx_ranking_places_builtin_live_name
  on ranking_places(tenant_slug,category,lower(trim(name)))
  where ranking_list_id is null and status in ('pending','active');
create unique index if not exists idx_ranking_places_custom_live_name
  on ranking_places(tenant_slug,ranking_list_id,lower(trim(name)))
  where ranking_list_id is not null and status in ('pending','active');

create index if not exists idx_ranking_places_custom_public
  on ranking_places(tenant_slug,ranking_list_id,status,created_at desc);

commit;
