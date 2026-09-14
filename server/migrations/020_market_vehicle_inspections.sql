alter table marketplace_listings add column if not exists vehicle_brand text not null default '';
alter table marketplace_listings add column if not exists vehicle_range_km integer;
alter table marketplace_listings add column if not exists battery_year integer;
alter table marketplace_listings add column if not exists registration_status text not null default '';

alter table marketplace_listings drop constraint if exists marketplace_listings_vehicle_range_check;
alter table marketplace_listings add constraint marketplace_listings_vehicle_range_check
  check(vehicle_range_km is null or vehicle_range_km between 5 and 250);
alter table marketplace_listings drop constraint if exists marketplace_listings_battery_year_check;
alter table marketplace_listings add constraint marketplace_listings_battery_year_check
  check(battery_year is null or battery_year between 2015 and 2100);
alter table marketplace_listings drop constraint if exists marketplace_listings_registration_status_check;
alter table marketplace_listings add constraint marketplace_listings_registration_status_check
  check(registration_status in ('','registered','unregistered','unknown'));

create table if not exists marketplace_inspection_appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug) on delete cascade,
  campus_slug text not null,
  listing_id uuid not null references marketplace_listings(id) on delete cascade,
  buyer_id bigint not null references users(id) on delete cascade,
  seller_id bigint not null references users(id) on delete cascade,
  requested_date date not null,
  requested_slot text not null check(requested_slot in ('上午','下午','晚上')),
  meeting_place text not null,
  note text not null default '',
  status text not null default 'requested' check(status in ('requested','confirmed','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(buyer_id <> seller_id)
);

create index if not exists idx_market_inspection_user
  on marketplace_inspection_appointments(tenant_slug,campus_slug,buyer_id,seller_id,status,requested_date);
