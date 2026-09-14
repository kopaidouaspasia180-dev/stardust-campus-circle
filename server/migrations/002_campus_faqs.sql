create table if not exists campus_faqs (
  id bigserial primary key,
  tenant_slug text not null references tenants(slug),
  campus_slug text,
  keywords text not null,
  answer text not null,
  source_label text not null default '校园运营知识库',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (campus_slug is null or length(campus_slug) > 0)
);

create index if not exists idx_campus_faqs_lookup on campus_faqs(tenant_slug,campus_slug,status,updated_at desc);

insert into campus_faqs(tenant_slug,campus_slug,keywords,answer,source_label)
select 'tangshan','daxuexidao','外卖 午餐 小饭桌 订餐',
  '小饭桌只做午餐。请在当天 10:30 前完成下单；取餐时间为 11:00–13:30。具体菜单、取餐点和配送范围以订单页当天展示为准。',
  '小饭桌运营规则'
where not exists (select 1 from campus_faqs where tenant_slug='tangshan' and campus_slug='daxuexidao' and keywords='外卖 午餐 小饭桌 订餐');
