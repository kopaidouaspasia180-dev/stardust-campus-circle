alter table users add column if not exists wechat_openid text;
alter table users add column if not exists wechat_openid_hash text;

create unique index if not exists idx_users_wechat_openid
  on users(wechat_openid)
  where wechat_openid is not null;

create unique index if not exists idx_users_wechat_openid_hash
  on users(wechat_openid_hash)
  where wechat_openid_hash is not null;
