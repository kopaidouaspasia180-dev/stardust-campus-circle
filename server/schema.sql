create extension if not exists pgcrypto;

create table if not exists tenants (
  slug text primary key,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists users (
  id bigserial primary key,
  device_id text unique not null,
  nickname text not null default '校园同学',
  avatar text not null default '同',
  created_at timestamptz not null default now()
);

create table if not exists merchants (
  id bigserial primary key,
  tenant_slug text not null references tenants(slug),
  name text not null,
  category text not null,
  description text not null default '',
  status text not null default 'active',
  delivery_minutes integer not null default 30,
  min_order numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id bigserial primary key,
  merchant_id bigint not null references merchants(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  category text not null default '推荐',
  image_url text,
  stock integer not null default 999,
  status text not null default 'active'
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  user_id bigint not null references users(id),
  merchant_id bigint not null references merchants(id),
  total_amount numeric(10,2) not null,
  status text not null default 'submitted',
  pickup_note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id bigint not null references products(id),
  product_name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check (quantity > 0)
);

create table if not exists marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  user_id bigint not null references users(id),
  title text not null,
  description text not null,
  category text not null default '其他',
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  condition_label text not null default '正常使用',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists marketplace_favorites (
  listing_id uuid not null references marketplace_listings(id) on delete cascade,
  user_id bigint not null references users(id),
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);

create table if not exists errands (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  creator_id bigint not null references users(id),
  runner_id bigint references users(id),
  title text not null,
  description text not null,
  pickup_place text not null,
  delivery_place text not null,
  reward numeric(10,2) not null check (reward >= 0),
  deadline text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists express_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  user_id bigint not null references users(id),
  carrier text not null,
  tracking_no text not null,
  pickup_code text not null default '',
  station text not null default '校内快递点',
  status text not null default 'waiting',
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id bigserial primary key,
  tenant_slug text not null references tenants(slug),
  title text not null,
  organization text not null,
  location text not null,
  salary_text text not null,
  description text not null,
  verified boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists job_applications (
  job_id bigint not null references jobs(id) on delete cascade,
  user_id bigint not null references users(id),
  message text not null default '',
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  primary key (job_id, user_id)
);

create table if not exists events (
  id bigserial primary key,
  tenant_slug text not null references tenants(slug),
  title text not null,
  organizer text not null,
  event_time text not null,
  location text not null,
  description text not null,
  capacity integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists event_signups (
  event_id bigint not null references events(id) on delete cascade,
  user_id bigint not null references users(id),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists audit_logs (
  id bigserial primary key,
  tenant_slug text,
  user_id bigint,
  action text not null,
  resource_type text not null,
  resource_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  user_id bigint not null references users(id),
  channel text not null default '日常',
  tag text not null default '校园日常',
  content text not null,
  location text not null default '',
  image_url text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id bigint not null references users(id),
  content text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists community_likes (
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id bigint not null references users(id),
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);

create table if not exists service_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  user_id bigint not null references users(id),
  service_type text not null,
  title text not null,
  detail text not null,
  status text not null default 'submitted',
  created_at timestamptz not null default now()
);

create table if not exists match_profiles (
  tenant_slug text not null references tenants(slug),
  user_id bigint not null references users(id),
  anonymous_name text not null,
  interests text not null,
  intro text not null,
  status text not null default 'active',
  updated_at timestamptz not null default now(),
  primary key(tenant_slug,user_id)
);

create table if not exists match_greetings (
  tenant_slug text not null references tenants(slug),
  sender_id bigint not null references users(id),
  target_id bigint not null references users(id),
  message text not null default '',
  created_at timestamptz not null default now(),
  primary key(tenant_slug,sender_id,target_id)
);

create index if not exists idx_merchants_tenant on merchants(tenant_slug, status);
create index if not exists idx_orders_user on orders(user_id, created_at desc);
create index if not exists idx_market_tenant on marketplace_listings(tenant_slug, status, created_at desc);
create index if not exists idx_errands_tenant on errands(tenant_slug, status, created_at desc);
create index if not exists idx_express_user on express_packages(user_id, created_at desc);
create index if not exists idx_jobs_tenant on jobs(tenant_slug, status);
create index if not exists idx_events_tenant on events(tenant_slug, status);
create index if not exists idx_posts_tenant on community_posts(tenant_slug,status,created_at desc);
create index if not exists idx_service_requests on service_requests(tenant_slug,service_type,created_at desc);

insert into tenants(slug, name) values
  ('tangshan', '唐山学院'),
  ('stdu', '石家庄铁道大学'),
  ('lyit', '洛阳理工学院')
on conflict (slug) do update set name = excluded.name;

insert into merchants(tenant_slug, name, category, description, delivery_minutes, min_order)
select 'tangshan', '校园食堂体验档口', '校园餐饮', '平台内测档口，正式营业信息须由学校运营方审核。', 25, 10
where not exists (select 1 from merchants where tenant_slug='tangshan' and name='校园食堂体验档口');

insert into products(merchant_id, name, description, price, category)
select m.id, v.name, v.description, v.price, v.category
from merchants m
cross join (values
  ('番茄鸡蛋盖饭', '现点现做，内测商品', 12.00::numeric, '主食'),
  ('香菇鸡肉饭', '内测商品，实际菜单以上线商家为准', 15.00::numeric, '主食'),
  ('豆浆', '内测饮品', 3.00::numeric, '饮品'),
  ('时令水果杯', '内测商品', 8.00::numeric, '小食')
) as v(name, description, price, category)
where m.tenant_slug='tangshan' and m.name='校园食堂体验档口'
and not exists (select 1 from products p where p.merchant_id=m.id and p.name=v.name);

insert into jobs(tenant_slug, title, organization, location, salary_text, description, verified)
select * from (values
  ('tangshan','图书整理勤工助学','校内勤工助学信息','校内','以学校通知为准','协助整理资料，报名资格、工作时间和报酬以学校正式通知为准。',true),
  ('tangshan','校园活动志愿者','校园活动中心','大学西道校区','志愿时长','协助现场引导与秩序维护，不收取任何报名费用。',true)
) as v(tenant_slug,title,organization,location,salary_text,description,verified)
where not exists (select 1 from jobs j where j.tenant_slug=v.tenant_slug and j.title=v.title);

insert into events(tenant_slug, title, organizer, event_time, location, description, capacity)
select * from (values
  ('tangshan','校园音乐社开放体验','校园音乐社','本周三 19:00','大学生活动中心','面向同学开放的社团体验活动，具体安排以组织方最新通知为准。',80),
  ('tangshan','周末校园摄影散步','摄影兴趣小组','本周六 16:30','校园中心广场','在校内公共区域交流拍摄，遇天气变化可能调整。',30)
) as v(tenant_slug,title,organizer,event_time,location,description,capacity)
where not exists (select 1 from events e where e.tenant_slug=v.tenant_slug and e.title=v.title);
