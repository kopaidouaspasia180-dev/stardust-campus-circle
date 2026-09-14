begin;

alter table users add column if not exists phone_encrypted text;
alter table users add column if not exists phone_hash text;
alter table users add column if not exists phone_verified_at timestamptz;

create unique index if not exists idx_users_phone_hash
  on users(phone_hash)
  where phone_hash is not null;

commit;
