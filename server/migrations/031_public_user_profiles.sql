alter table users add column if not exists public_id text;
alter table users add column if not exists profile_background text not null default '';
alter table users add column if not exists profile_bio text not null default '';
alter table users add column if not exists profile_interests jsonb not null default '[]'::jsonb;
alter table users add column if not exists profile_gallery jsonb not null default '[]'::jsonb;

create sequence if not exists user_public_id_seq start 2 minvalue 2 maxvalue 999999;

create or replace function next_user_public_id() returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad(nextval('user_public_id_seq')::text, 6, '0');
    if candidate <> '666666' and not exists(select 1 from users where public_id=candidate) then
      return candidate;
    end if;
  end loop;
end;
$$;

update users set public_id='000001'
where id=(select id from users where nickname='创世神' and phone_verified_at is not null order by created_at limit 1)
  and public_id is null;

update users set public_id='666666'
where id=coalesce(
    (select pa.user_id from platform_admins pa where pa.role='platform_admin' and pa.status='active' order by pa.created_at limit 1),
    (select id from users where lower(nickname) in ('stardust','星尘','平台管理员') order by created_at limit 1)
  )
  and public_id is null and not exists(select 1 from users where public_id='666666');

update users set public_id=next_user_public_id() where public_id is null;
alter table users alter column public_id set default next_user_public_id();
alter table users alter column public_id set not null;
create unique index if not exists idx_users_public_id on users(public_id);

alter table resource_conversations drop constraint if exists resource_conversations_resource_type_check;
alter table resource_conversations add constraint resource_conversations_resource_type_check
  check(resource_type in ('market_listing','job','lost_post','errand','match','community_post','user_profile'));
