begin;

-- Every operational record is scoped to one campus. Existing rows are assigned
-- to the first active campus of their tenant; no row is deleted or duplicated.
alter table couriers add column if not exists campus_slug text;
alter table user_schedule_entries add column if not exists campus_slug text;
alter table marketplace_listings add column if not exists campus_slug text;
alter table errands add column if not exists campus_slug text;
alter table express_packages add column if not exists campus_slug text;
alter table jobs add column if not exists campus_slug text;
alter table events add column if not exists campus_slug text;
alter table audit_logs add column if not exists campus_slug text;
alter table community_posts add column if not exists campus_slug text;
alter table service_requests add column if not exists campus_slug text;
alter table match_profiles add column if not exists campus_slug text;
alter table match_greetings add column if not exists campus_slug text;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'couriers','user_schedule_entries','marketplace_listings','errands',
    'express_packages','jobs','events','audit_logs','community_posts',
    'service_requests','match_profiles','match_greetings'
  ] loop
    execute format(
      'update %I item set campus_slug=(
         select c.slug from campus_sites c
         where c.tenant_slug=item.tenant_slug and c.status=''active''
         order by c.created_at,c.slug limit 1
       ) where item.campus_slug is null',
      table_name
    );
    execute format('alter table %I alter column campus_slug set not null', table_name);
    execute format(
      'alter table %I add constraint %I foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug)',
      table_name,
      table_name || '_campus_scope_fk'
    );
  end loop;
end $$;

-- Community reports inherit the same immutable campus boundary as their post.
alter table community_reports add column if not exists tenant_slug text;
alter table community_reports add column if not exists campus_slug text;
update community_reports report
set tenant_slug=post.tenant_slug,campus_slug=post.campus_slug
from community_posts post
where post.id=report.post_id and (report.tenant_slug is null or report.campus_slug is null);
alter table community_reports alter column tenant_slug set not null;
alter table community_reports alter column campus_slug set not null;
alter table community_reports
  add constraint community_reports_campus_scope_fk
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug);

-- Anonymous matching used to be unique only per school. Campus becomes part of
-- both identities so a profile or greeting can never cross campus boundaries.
alter table match_profiles drop constraint if exists match_profiles_pkey;
alter table match_profiles add primary key(tenant_slug,campus_slug,user_id);
alter table match_greetings drop constraint if exists match_greetings_pkey;
alter table match_greetings add primary key(tenant_slug,campus_slug,sender_id,target_id);

-- Tenant admins can be limited to one campus while school admins retain access
-- to all campuses inside the current school.
alter table platform_admins add column if not exists campus_slug text;
alter table platform_admins drop constraint if exists platform_admins_role_check;
alter table platform_admins add constraint platform_admins_role_check
  check(role in ('platform_admin','school_admin','campus_admin','content_admin','finance_admin','auditor'));
alter table platform_admins add constraint platform_admins_campus_scope_fk
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug);
alter table platform_admins add constraint platform_admins_scope_check
  check(
    (role in ('platform_admin','school_admin') and campus_slug is null)
    or (role in ('campus_admin','content_admin','finance_admin','auditor') and campus_slug is not null)
  );

create table if not exists user_campus_memberships (
  user_id bigint not null references users(id) on delete cascade,
  tenant_slug text not null,
  campus_slug text not null,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(user_id,tenant_slug,campus_slug),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  check(status in ('active','suspended'))
);

create table if not exists campus_settings (
  tenant_slug text not null,
  campus_slug text not null,
  setting_key text not null,
  setting_value text not null default '',
  updated_by bigint references users(id),
  updated_at timestamptz not null default now(),
  primary key(tenant_slug,campus_slug,setting_key),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  check(setting_key in ('operator_wechat','operator_qr_url','operator_contact_note','ebike_contact_enabled'))
);

-- Resource conversations provide one chat model for second-hand listings,
-- student job posts and lost-and-found posts.
create table if not exists resource_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null,
  campus_slug text not null,
  resource_type text not null,
  resource_id text not null,
  initiator_id bigint not null references users(id) on delete cascade,
  participant_id bigint not null references users(id) on delete cascade,
  status text not null default 'active',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  unique(tenant_slug,campus_slug,resource_type,resource_id,initiator_id,participant_id),
  check(resource_type in ('market_listing','job','lost_post')),
  check(status in ('active','closed','blocked')),
  check(initiator_id <> participant_id)
);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references resource_conversations(id) on delete cascade,
  sender_id bigint not null references users(id) on delete cascade,
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check(length(content) between 1 and 600)
);

create table if not exists conversation_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null,
  campus_slug text not null,
  conversation_id uuid not null references resource_conversations(id) on delete cascade,
  reporter_id bigint not null references users(id) on delete cascade,
  reason text not null,
  detail text not null default '',
  status text not null default 'open',
  handled_at timestamptz,
  handled_by bigint references users(id),
  created_at timestamptz not null default now(),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  unique(conversation_id,reporter_id),
  check(status in ('open','resolved'))
);

-- Student job posts are paid first, then contacted and manually reviewed. The
-- public jobs table receives a row only after the full workflow is approved.
alter table jobs add column if not exists poster_user_id bigint references users(id) on delete set null;
alter table jobs add column if not exists source_type text not null default 'curated';
alter table jobs add column if not exists moderation_note text not null default '';
alter table jobs add column if not exists reviewed_at timestamptz;
alter table jobs add column if not exists reviewed_by bigint references users(id);
alter table jobs add constraint jobs_source_type_check check(source_type in ('curated','student'));

create table if not exists job_posting_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  tenant_slug text not null,
  campus_slug text not null,
  user_id bigint not null references users(id),
  job_id bigint unique references jobs(id) on delete set null,
  title text not null,
  organization text not null,
  location text not null,
  salary_text text not null,
  description text not null,
  amount_cents integer not null default 1000,
  status text not null default 'payment_required',
  payment_status text not null default 'unpaid',
  payment_reference text not null default '',
  contact_confirmed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by bigint references users(id),
  moderation_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(tenant_slug,campus_slug) references campus_sites(tenant_slug,slug),
  check(amount_cents=1000),
  check(status in ('payment_required','pending_contact','pending_review','approved','rejected','cancelled')),
  check(payment_status in ('unpaid','pending','paid','refund_pending','refunded','failed'))
);

create table if not exists job_posting_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  posting_order_id uuid not null references job_posting_orders(id) on delete cascade,
  provider text not null default 'wechat_pay',
  status text not null,
  provider_reference text not null default '',
  amount_cents integer not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists job_posting_refunds (
  id uuid primary key default gen_random_uuid(),
  posting_order_id uuid not null unique references job_posting_orders(id) on delete cascade,
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

create index if not exists idx_memberships_campus on user_campus_memberships(tenant_slug,campus_slug,status,last_seen_at desc);
create index if not exists idx_couriers_campus on couriers(tenant_slug,campus_slug,status);
create index if not exists idx_schedule_campus_user on user_schedule_entries(tenant_slug,campus_slug,user_id,created_at desc);
create index if not exists idx_market_campus on marketplace_listings(tenant_slug,campus_slug,status,created_at desc);
create index if not exists idx_errands_campus on errands(tenant_slug,campus_slug,status,created_at desc);
create index if not exists idx_express_campus_user on express_packages(tenant_slug,campus_slug,user_id,created_at desc);
create index if not exists idx_jobs_campus on jobs(tenant_slug,campus_slug,status,created_at desc);
create index if not exists idx_events_campus on events(tenant_slug,campus_slug,status,created_at desc);
create index if not exists idx_audit_campus on audit_logs(tenant_slug,campus_slug,created_at desc);
create index if not exists idx_posts_campus on community_posts(tenant_slug,campus_slug,status,created_at desc);
create index if not exists idx_service_requests_campus on service_requests(tenant_slug,campus_slug,service_type,created_at desc);
create index if not exists idx_conversations_user_a on resource_conversations(tenant_slug,campus_slug,initiator_id,last_message_at desc);
create index if not exists idx_conversations_user_b on resource_conversations(tenant_slug,campus_slug,participant_id,last_message_at desc);
create index if not exists idx_conversation_messages on conversation_messages(conversation_id,created_at);
create index if not exists idx_conversation_unread on conversation_messages(conversation_id,read_at,created_at) where read_at is null;
create index if not exists idx_conversation_reports_open on conversation_reports(tenant_slug,campus_slug,status,created_at);
create index if not exists idx_job_posting_orders_review on job_posting_orders(tenant_slug,campus_slug,status,created_at);
create index if not exists idx_job_posting_refunds_pending on job_posting_refunds(status,next_attempt_at);

commit;
