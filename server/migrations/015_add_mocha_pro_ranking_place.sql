begin;

-- A curated life-service entry requested by the operator. Each Tangshan
-- campus receives an independent row so likes and moderation stay isolated.
insert into ranking_places(
  tenant_slug,campus_slug,category,name,note,location,cover_key,source_type,status,base_likes
)
select
  c.tenant_slug,
  c.slug,
  'life',
  '摩卡 Pro 美发（唐山吾悦广场店）',
  '剪发、烫染与造型作品展示，具体方案及价格以到店沟通为准',
  '唐山吾悦广场 · 具体楼层以商场导视为准',
  'life-mocha-pro',
  'curated',
  'active',
  0
from campus_sites c
where c.tenant_slug='tangshan'
  and c.status='active'
  and not exists (
    select 1
    from ranking_places p
    where p.tenant_slug=c.tenant_slug
      and p.campus_slug=c.slug
      and p.category='life'
      and lower(p.name)=lower('摩卡 Pro 美发（唐山吾悦广场店）')
      and p.status in ('pending','active')
  );

commit;
