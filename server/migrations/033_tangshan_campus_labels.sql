begin;

-- 保留三个历史 slug，避免已关联的帖子、课表、快递和账号数据失联；只更新用户可见名称。
update campus_sites
set name = case slug
  when 'daxuexidao' then '南院'
  when 'huayanbeilu' then '华岩路'
  when 'longze' then '东院'
  else name
end,
status = 'active'
where tenant_slug = 'tangshan'
  and slug in ('daxuexidao','huayanbeilu','longze');

insert into campus_sites(tenant_slug,slug,name,address,status) values
  ('tangshan','beiyuan','北院','','active')
on conflict(tenant_slug,slug) do update
set name = excluded.name,
    status = 'active';

commit;
