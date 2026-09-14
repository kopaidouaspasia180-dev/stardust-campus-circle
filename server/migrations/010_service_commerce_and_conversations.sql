begin;

alter table events add column if not exists image_url text;
alter table events add column if not exists created_by bigint references users(id);
alter table events add column if not exists updated_at timestamptz not null default now();

alter table resource_conversations drop constraint if exists resource_conversations_resource_type_check;
alter table resource_conversations add constraint resource_conversations_resource_type_check
  check(resource_type in ('market_listing','job','lost_post','errand','match'));

create table if not exists campus_service_products (
  id bigserial primary key,
  tenant_slug text not null,
  campus_slug text not null,
  service_type text not null,
  name text not null,
  description text not null default '',
  price_cents integer not null check(price_cents >= 0),
  image_url text not null default '',
  stock integer not null default 0 check(stock >= 0),
  sort_order integer not null default 0,
  status text not null default 'active',
  created_by bigint references users(id),
  updated_by bigint references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  unique(tenant_slug,campus_slug,service_type,name),
  check(service_type in ('flowers','fruit','snacks')),
  check(status in ('active','inactive')),
  check(length(name) between 2 and 80),
  check(length(description) <= 300)
);

create table if not exists campus_service_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  tenant_slug text not null,
  campus_slug text not null,
  user_id bigint not null references users(id),
  service_type text not null,
  status text not null default 'submitted',
  total_amount_cents integer not null check(total_amount_cents >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  check(service_type in ('flowers','fruit','snacks')),
  check(status in ('submitted','confirmed','preparing','ready','completed','cancelled')),
  check(length(note) <= 300)
);

create table if not exists campus_service_order_items (
  id bigserial primary key,
  order_id uuid not null references campus_service_orders(id) on delete cascade,
  product_id bigint references campus_service_products(id) on delete set null,
  product_name text not null,
  unit_price_cents integer not null check(unit_price_cents >= 0),
  quantity integer not null check(quantity between 1 and 20)
);

create index if not exists idx_service_products_public
  on campus_service_products(tenant_slug,campus_slug,service_type,status,sort_order,id);
create index if not exists idx_service_orders_user
  on campus_service_orders(tenant_slug,campus_slug,user_id,created_at desc);
create index if not exists idx_service_orders_admin
  on campus_service_orders(tenant_slug,campus_slug,status,created_at desc);

commit;
