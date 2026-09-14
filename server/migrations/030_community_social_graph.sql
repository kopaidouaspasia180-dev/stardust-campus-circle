begin;

alter table community_comments
  add column if not exists parent_comment_id uuid references community_comments(id) on delete set null;

alter table community_comments
  add column if not exists reply_to_user_id bigint references users(id) on delete set null;

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

alter table resource_conversations drop constraint if exists resource_conversations_resource_type_check;
alter table resource_conversations add constraint resource_conversations_resource_type_check
  check(resource_type in ('market_listing','job','lost_post','errand','match','community_post'));

create index if not exists idx_community_follows_target
  on community_follows(tenant_slug,campus_slug,followed_id,created_at desc);

create index if not exists idx_community_comments_parent
  on community_comments(parent_comment_id,created_at asc);

commit;
