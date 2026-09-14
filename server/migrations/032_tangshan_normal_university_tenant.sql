begin;

insert into tenants(slug,name,status) values
  ('tstc','唐山师范学院','active')
on conflict(slug) do update set name=excluded.name,status='active';

insert into campus_sites(tenant_slug,slug,name,address,status) values
  ('tstc','daxuedao','大学道校区','河北省唐山市建设北路156号','active'),
  ('tstc','xueyuanlu','学院路校区','河北省唐山市学院路41号','active')
on conflict(tenant_slug,slug) do update
set name=excluded.name,address=excluded.address,status='active';

commit;
