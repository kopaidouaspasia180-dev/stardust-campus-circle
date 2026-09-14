create table if not exists daily_menu_items (
  id bigserial primary key,
  tenant_slug text not null references tenants(slug),
  campus_slug text not null,
  merchant_id bigint not null references merchants(id) on delete cascade,
  product_id bigint not null references products(id) on delete restrict,
  service_date date not null,
  name text not null,
  description text not null default '',
  category text not null default '午餐套餐',
  price numeric(10,2) not null check(price >= 0),
  original_price numeric(10,2),
  image_url text,
  capacity integer not null check(capacity >= 0),
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_date, product_id)
);

create index if not exists idx_daily_menu_items_customer on daily_menu_items(tenant_slug,campus_slug,service_date,status,sort_order);
create index if not exists idx_daily_menu_items_merchant on daily_menu_items(merchant_id,service_date,status);
