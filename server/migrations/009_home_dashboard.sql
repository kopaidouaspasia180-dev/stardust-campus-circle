begin;

-- Campus announcements are operational content, not front-end constants. Only
-- active announcements inside their publication window are visible to users.
create table if not exists campus_announcements (
  id bigserial primary key,
  tenant_slug text not null,
  campus_slug text not null,
  title text not null,
  content text not null,
  route text not null default '/pages/messages/index',
  status text not null default 'draft',
  priority smallint not null default 0,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by bigint references users(id),
  updated_by bigint references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  check(status in ('draft','active','archived')),
  check(priority between 0 and 100),
  check(length(title) between 2 and 60),
  check(length(content) between 2 and 240),
  check(route='' or route like '/pages/%'),
  check(expires_at is null or expires_at > publish_at)
);

-- Weather is optional operational data. Until a licensed weather provider is
-- configured, staff may maintain a truthful campus snapshot; absence stays
-- empty instead of falling back to fabricated weather.
create table if not exists campus_home_status (
  tenant_slug text not null,
  campus_slug text not null,
  weather_temperature text not null default '',
  weather_condition text not null default '',
  weather_note text not null default '',
  updated_by bigint references users(id),
  updated_at timestamptz not null default now(),
  primary key(tenant_slug,campus_slug),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  check(length(weather_temperature) <= 20),
  check(length(weather_condition) <= 40),
  check(length(weather_note) <= 80)
);

create index if not exists idx_campus_announcements_active
  on campus_announcements(tenant_slug,campus_slug,status,priority desc,publish_at desc);

commit;
