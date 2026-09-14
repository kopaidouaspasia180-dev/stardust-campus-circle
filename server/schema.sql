create extension if not exists pgcrypto;

create table if not exists tenants (
  slug text primary key,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists campus_sites (
  tenant_slug text not null references tenants(slug) on delete cascade,
  slug text not null,
  name text not null,
  address text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(tenant_slug,slug)
);

create table if not exists users (
  id bigserial primary key,
  device_id text unique not null,
  nickname text not null default '校园同学',
  avatar text not null default '同',
  created_at timestamptz not null default now()
);
alter table users add column if not exists wechat_openid text;
alter table users add column if not exists wechat_openid_hash text;
alter table users add column if not exists phone_encrypted text;
alter table users add column if not exists phone_hash text;
alter table users add column if not exists phone_verified_at timestamptz;
alter table users add column if not exists public_id text;
alter table users add column if not exists profile_background text not null default '';
alter table users add column if not exists profile_bio text not null default '';
alter table users add column if not exists profile_interests jsonb not null default '[]'::jsonb;
alter table users add column if not exists profile_gallery jsonb not null default '[]'::jsonb;
create unique index if not exists idx_users_wechat_openid on users(wechat_openid) where wechat_openid is not null;
create unique index if not exists idx_users_wechat_openid_hash on users(wechat_openid_hash) where wechat_openid_hash is not null;
create unique index if not exists idx_users_phone_hash on users(phone_hash) where phone_hash is not null;

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_user_sessions_active on user_sessions(token_hash,expires_at);

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
alter table merchants add column if not exists campus_slug text not null default 'daxuexidao';

create table if not exists merchant_staff (
  merchant_id bigint not null references merchants(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  role text not null default 'operator',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(merchant_id,user_id),
  check(role in ('owner','manager','operator'))
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

alter table orders add column if not exists order_no text;
alter table orders add column if not exists service_date date;
alter table orders add column if not exists service_slot text not null default 'lunch';
alter table orders add column if not exists fulfillment_type text not null default 'pickup';
alter table orders add column if not exists contact_name text not null default '';
alter table orders add column if not exists contact_phone text not null default '';
alter table orders add column if not exists delivery_address text not null default '';
alter table orders add column if not exists accepted_at timestamptz;
alter table orders add column if not exists ready_at timestamptz;
alter table orders add column if not exists completed_at timestamptz;
alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists cancel_reason text not null default '';
alter table orders add column if not exists idempotency_key text;
alter table orders add column if not exists campus_slug text not null default 'daxuexidao';
alter table orders add column if not exists payment_status text not null default 'unpaid';
alter table orders add column if not exists payment_reference text not null default '';
alter table orders add column if not exists total_amount_cents integer;
update orders set total_amount_cents=round(total_amount * 100)::integer where total_amount_cents is null;
alter table orders alter column total_amount_cents set not null;
create unique index if not exists idx_orders_order_no on orders(order_no) where order_no is not null;
drop index if exists idx_orders_user_idempotency;
create unique index if not exists idx_orders_user_idempotency on orders(user_id,tenant_slug,campus_slug,idempotency_key) where idempotency_key is not null;

create table if not exists order_items (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id bigint not null references products(id),
  product_name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check (quantity > 0)
);
alter table order_items add column if not exists unit_price_cents integer;
update order_items set unit_price_cents=round(unit_price * 100)::integer where unit_price_cents is null;
alter table order_items alter column unit_price_cents set not null;

create table if not exists lunch_inventory (
  service_date date not null,
  product_id bigint not null references products(id) on delete cascade,
  capacity integer not null check (capacity >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= capacity),
  updated_at timestamptz not null default now(),
  primary key(service_date,product_id)
);

create table if not exists couriers (
  id bigserial primary key,
  tenant_slug text not null references tenants(slug),
  name text not null,
  phone text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists courier_accounts (
  courier_id bigint not null references couriers(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(courier_id,user_id)
);

create table if not exists platform_admins (
  user_id bigint not null references users(id) on delete cascade,
  tenant_slug text references tenants(slug),
  role text not null default 'school_admin',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key(user_id,tenant_slug),
  check(role in ('platform_admin','school_admin','auditor'))
);

create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  order_id uuid not null unique references orders(id) on delete cascade,
  merchant_id bigint not null references merchants(id),
  courier_id bigint references couriers(id),
  pickup_address text not null default '',
  dropoff_address text not null,
  delivery_fee numeric(10,2) not null default 0,
  status text not null default 'waiting_merchant',
  claimed_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
alter table deliveries add column if not exists campus_slug text not null default 'daxuexidao';
alter table deliveries add column if not exists delivery_fee_cents integer;
update deliveries set delivery_fee_cents=round(delivery_fee * 100)::integer where delivery_fee_cents is null;
alter table deliveries alter column delivery_fee_cents set not null;

create table if not exists order_events (
  id bigserial primary key,
  tenant_slug text not null references tenants(slug),
  order_id uuid not null references orders(id) on delete cascade,
  actor_type text not null,
  actor_ref text not null default '',
  from_status text,
  to_status text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists notification_outbox (
  id bigserial primary key,
  tenant_slug text not null references tenants(slug),
  order_id uuid references orders(id) on delete cascade,
  recipient_type text not null,
  recipient_ref text not null,
  channel text not null default 'wechat_subscribe',
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text not null default '',
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table notification_outbox add column if not exists campus_slug text not null default 'daxuexidao';

create table if not exists payment_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  campus_slug text not null,
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  status text not null default 'created',
  provider_reference text not null default '',
  amount_cents integer not null check(amount_cents >= 0),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null references tenants(slug),
  campus_slug text not null,
  order_id uuid not null unique references orders(id) on delete cascade,
  out_refund_no text not null unique,
  transaction_id text not null,
  amount_cents integer not null check(amount_cents > 0),
  reason text not null default '',
  status text not null default 'pending',
  provider_reference text not null default '',
  attempts integer not null default 0,
  last_error text not null default '',
  next_attempt_at timestamptz not null default now(),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create table if not exists marketplace_views (
  listing_id uuid not null references marketplace_listings(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  tenant_slug text not null,
  campus_slug text not null,
  view_count integer not null default 1 check(view_count > 0),
  last_viewed_at timestamptz not null default now(),
  primary key (listing_id, user_id)
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
  unique(listing_id,buyer_id),
  check(status in ('requested','accepted','cancelled','completed')),
  check(buyer_id <> seller_id)
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
  parent_comment_id uuid references community_comments(id) on delete set null,
  reply_to_user_id bigint references users(id) on delete set null,
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

create table if not exists community_follows (
  tenant_slug text not null,
  campus_slug text not null,
  follower_id bigint not null references users(id) on delete cascade,
  followed_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(tenant_slug,campus_slug,follower_id,followed_id),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  check(follower_id <> followed_id)
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
create index if not exists idx_merchants_campus on merchants(tenant_slug,campus_slug,status);
create index if not exists idx_merchant_staff_user on merchant_staff(user_id,status);
create index if not exists idx_courier_accounts_user on courier_accounts(user_id,status);
create index if not exists idx_orders_user on orders(user_id, created_at desc);
create index if not exists idx_orders_campus on orders(tenant_slug,campus_slug,created_at desc);
create index if not exists idx_orders_merchant_status on orders(merchant_id,status,created_at);
create index if not exists idx_deliveries_available on deliveries(tenant_slug,status,created_at);
create index if not exists idx_order_events_order on order_events(order_id,created_at);
create index if not exists idx_notification_outbox_pending on notification_outbox(status,next_attempt_at);
create index if not exists idx_notification_outbox_campus on notification_outbox(tenant_slug,campus_slug,status,next_attempt_at);
create index if not exists idx_payment_refunds_pending on payment_refunds(status,next_attempt_at);
create index if not exists idx_payment_attempts_order on payment_attempts(order_id,created_at desc);
create index if not exists idx_market_tenant on marketplace_listings(tenant_slug, status, created_at desc);
create index if not exists idx_errands_tenant on errands(tenant_slug, status, created_at desc);
create index if not exists idx_express_user on express_packages(user_id, created_at desc);
create index if not exists idx_jobs_tenant on jobs(tenant_slug, status);
create index if not exists idx_events_tenant on events(tenant_slug, status);
create index if not exists idx_posts_tenant on community_posts(tenant_slug,status,created_at desc);
create index if not exists idx_service_requests on service_requests(tenant_slug,service_type,created_at desc);

insert into tenants(slug, name) values
  ('tangshan', '唐山学院')
on conflict (slug) do update set name = excluded.name;

insert into campus_sites(tenant_slug,slug,name,address) values
  ('tangshan','daxuexidao','大学西道校区','大学西道校区'),
  ('tangshan','huayanbeilu','华岩北路校区','华岩北路校区'),
  ('tangshan','longze','龙泽路校区','龙泽路校区')
on conflict(tenant_slug,slug) do update set name=excluded.name,address=excluded.address,status='active';

-- Historical experience-store data must never leak into an operational menu.
update merchants set status='inactive' where tenant_slug='tangshan' and name='校园食堂体验档口';

insert into merchants(tenant_slug, campus_slug, name, category, description, delivery_minutes, min_order)
select 'tangshan', 'daxuexidao', '吃啥不愁小饭桌', '午餐', '每天只做午餐，10:30 前下单，11:00–13:30 取餐或配送。', 30, 0
where not exists (select 1 from merchants where tenant_slug='tangshan' and name='吃啥不愁小饭桌');

insert into products(merchant_id, name, description, price, category, stock)
select m.id, v.name, v.description, v.price, v.category, v.stock
from merchants m
cross join (values
  ('今日小饭桌套餐', '每日菜单不同，以当天首页为准', 22.80::numeric, '午餐套餐', 999),
  ('香煎鸡胸藜麦餐', '高蛋白 · 低脂 · 营养均衡', 19.80::numeric, '减脂餐', 999),
  ('香煎三文鱼藜麦餐', '优质脂肪 · 高蛋白', 24.80::numeric, '减脂餐', 999),
  ('红烧牛肉面', '慢炖牛肉 · 手工面', 18.80::numeric, '面食', 999),
  ('番茄鸡蛋面', '酸甜开胃 · 现煮', 14.80::numeric, '面食', 999),
  ('小炒黄牛肉盖饭', '鲜嫩黄牛肉 · 青红椒', 22.80::numeric, '家常菜', 999),
  ('鸡胸蔬菜沙拉', '清爽轻负担', 18.80::numeric, '轻食', 999),
  ('冬瓜排骨汤', '每日现煲 · 清甜暖胃', 12.00::numeric, '汤粥', 999)
) as v(name, description, price, category, stock)
where m.tenant_slug='tangshan' and m.name='吃啥不愁小饭桌'
and not exists (select 1 from products p where p.merchant_id=m.id and p.name=v.name);

update couriers set status='inactive' where tenant_slug='tangshan' and name='测试骑手';

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
