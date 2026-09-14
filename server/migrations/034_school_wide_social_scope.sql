begin;

-- A follow relationship belongs to a school. Campus is retained only as the
-- place where the relationship was first created, not as an isolation key.
delete from community_follows
where ctid in (
  select row_id from (
    select ctid row_id,
      row_number() over (
        partition by tenant_slug,follower_id,followed_id
        order by created_at asc,ctid asc
      ) duplicate_number
    from community_follows
  ) duplicates
  where duplicate_number > 1
);

alter table community_follows drop constraint if exists community_follows_pkey;
alter table community_follows
  add primary key(tenant_slug,follower_id,followed_id);

drop index if exists idx_community_follows_target;
create index if not exists idx_community_follows_school_target
  on community_follows(tenant_slug,followed_id,created_at desc);

create index if not exists idx_community_posts_school_feed
  on community_posts(tenant_slug,status,created_at desc);

create index if not exists idx_conversations_school_user_a
  on resource_conversations(tenant_slug,initiator_id,last_message_at desc)
  where resource_type in ('community_post','user_profile','lost_post');

create index if not exists idx_conversations_school_user_b
  on resource_conversations(tenant_slug,participant_id,last_message_at desc)
  where resource_type in ('community_post','user_profile','lost_post');

commit;
