begin;

create table if not exists admin_login_codes (
  code_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  tenant_slug text not null references tenants(slug) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_login_codes_expiry
  on admin_login_codes(expires_at) where consumed_at is null;

alter table campus_service_orders
  add column if not exists payment_status text not null default 'offline',
  add column if not exists payment_reference text;

alter table campus_service_orders
  drop constraint if exists campus_service_orders_status_check;
alter table campus_service_orders
  add constraint campus_service_orders_status_check
  check(status in ('payment_pending','submitted','confirmed','preparing','ready','completed','cancelled'));

alter table campus_service_orders
  drop constraint if exists campus_service_orders_payment_status_check;
alter table campus_service_orders
  add constraint campus_service_orders_payment_status_check
  check(payment_status in ('offline','pending','paid','refund_pending','refunded','refund_failed','failed'));

create table if not exists campus_service_payment_attempts (
  id bigserial primary key,
  order_id uuid not null references campus_service_orders(id) on delete cascade,
  provider text not null default 'wechat_pay',
  status text not null,
  provider_reference text,
  amount_cents integer not null check(amount_cents >= 0),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check(status in ('prepay_created','paid','failed'))
);

create index if not exists idx_campus_service_payment_attempts_order
  on campus_service_payment_attempts(order_id,created_at desc);

create table if not exists campus_service_refunds (
  id bigserial primary key,
  order_id uuid not null unique references campus_service_orders(id) on delete cascade,
  out_refund_no text not null unique,
  transaction_id text not null,
  amount_cents integer not null check(amount_cents > 0),
  reason text not null default '',
  status text not null default 'pending',
  provider_reference text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status in ('pending','requesting','retrying','processing','succeeded','failed'))
);

create index if not exists idx_campus_service_refunds_queue
  on campus_service_refunds(status,next_attempt_at);

commit;
