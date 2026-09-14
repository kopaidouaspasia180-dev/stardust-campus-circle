alter table community_posts
  drop constraint if exists community_posts_image_urls_array;

alter table community_posts
  add constraint community_posts_image_urls_array
  check (jsonb_typeof(image_urls) = 'array' and jsonb_array_length(image_urls) <= 9);
