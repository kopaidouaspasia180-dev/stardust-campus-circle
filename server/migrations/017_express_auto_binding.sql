begin;

create table if not exists express_bindings (
  user_id bigint not null references users(id) on delete cascade,
  tenant_slug text not null,
  campus_slug text not null,
  phone_encrypted text not null,
  phone_hash text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  provider_status text not null default 'pending_provider' check (provider_status in ('pending_provider','active','paused')),
  bound_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,tenant_slug,campus_slug),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug)
);

create unique index if not exists idx_express_binding_phone_active
  on express_bindings(tenant_slug,campus_slug,phone_hash)
  where status='active';

alter table express_packages add column if not exists source text not null default 'manual';
alter table express_packages add column if not exists provider_event_id text;
alter table express_packages add column if not exists pickup_code_encrypted text;
alter table express_packages add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_express_provider_event
  on express_packages(tenant_slug,campus_slug,provider_event_id)
  where provider_event_id is not null;

create index if not exists idx_express_binding_lookup
  on express_bindings(tenant_slug,campus_slug,phone_hash,status);

commit;
