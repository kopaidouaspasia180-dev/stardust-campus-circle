begin;

-- Compatibility bridge for clean installations. The original schema did not
-- include these timestamps, while migration 026 updates them when disabling
-- historical test catalog data. Keep this as a separate migration so applied
-- migration checksums never change.
alter table products
  add column if not exists updated_at timestamptz not null default now();

alter table merchants
  add column if not exists updated_at timestamptz not null default now();

commit;
