create table tenants (
  id uuid primary key,
  slug text unique not null,
  name text not null,
  short_name text not null,
  status text not null check (status in ('preparing', 'active', 'suspended')),
  plan text not null default 'starter',
  theme jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campuses (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  name text not null,
  address text,
  location jsonb,
  sort_order integer not null default 0
);

create table users (
  id uuid primary key,
  wechat_openid text unique,
  nickname text,
  avatar_url text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table tenant_memberships (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  campus_id uuid references campuses(id),
  role text not null,
  verification_status text not null default 'unverified',
  unique (tenant_id, user_id)
);

create table knowledge_entries (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  campus_id uuid references campuses(id),
  category text not null,
  title text not null,
  content text not null,
  source_name text,
  source_url text,
  status text not null default 'draft',
  created_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table media_assets (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  campus_id uuid references campuses(id),
  storage_key text not null,
  title text not null,
  category text,
  status text not null default 'active',
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table posts (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  campus_id uuid references campuses(id),
  author_id uuid not null references users(id),
  channel text not null,
  content text not null,
  media jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table comments (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  post_id uuid not null references posts(id),
  author_id uuid not null references users(id),
  content text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table service_modules (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  key text not null,
  title text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'disabled',
  sort_order integer not null default 0,
  unique (tenant_id, key)
);

create table merchants (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  name text not null,
  category text not null,
  qualification jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigserial primary key,
  tenant_id uuid references tenants(id),
  actor_id uuid references users(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_knowledge_tenant on knowledge_entries(tenant_id, status);
create index idx_media_tenant on media_assets(tenant_id, status);
create index idx_posts_tenant_created on posts(tenant_id, status, created_at desc);
create index idx_services_tenant on service_modules(tenant_id, status);
create index idx_merchants_tenant on merchants(tenant_id, status);
