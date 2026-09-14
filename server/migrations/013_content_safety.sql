begin;

alter table marketplace_listings add column if not exists moderation_note text not null default '';
alter table marketplace_listings add column if not exists reviewed_at timestamptz;
alter table marketplace_listings add column if not exists reviewed_by bigint references users(id);

create index if not exists idx_market_moderation_queue
  on marketplace_listings(tenant_slug,campus_slug,status,created_at desc)
  where status='pending';

commit;
