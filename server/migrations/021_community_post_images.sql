alter table community_posts
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

update community_posts
set image_urls = jsonb_build_array(image_url)
where image_url is not null
  and image_url <> ''
  and image_urls = '[]'::jsonb;

alter table community_posts
  drop constraint if exists community_posts_image_urls_array;

alter table community_posts
  add constraint community_posts_image_urls_array
  check (jsonb_typeof(image_urls) = 'array' and jsonb_array_length(image_urls) <= 3);
