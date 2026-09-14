begin;

create table if not exists marketplace_views (
  listing_id uuid not null references marketplace_listings(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  tenant_slug text not null,
  campus_slug text not null,
  view_count integer not null default 1 check(view_count > 0),
  last_viewed_at timestamptz not null default now(),
  primary key(listing_id,user_id),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug)
);

create table if not exists marketplace_trade_intents (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references marketplace_listings(id) on delete cascade,
  tenant_slug text not null,
  campus_slug text not null,
  buyer_id bigint not null references users(id) on delete cascade,
  seller_id bigint not null references users(id) on delete cascade,
  status text not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  unique(listing_id,buyer_id),
  check(status in ('requested','accepted','cancelled','completed')),
  check(buyer_id <> seller_id)
);

create index if not exists idx_marketplace_views_recent
  on marketplace_views(tenant_slug,campus_slug,user_id,last_viewed_at desc);
create index if not exists idx_marketplace_trade_intents_user
  on marketplace_trade_intents(tenant_slug,campus_slug,buyer_id,seller_id,status,updated_at desc);

commit;
