begin;

with updated as (
  update campus_service_products
  set description = '用于验证微信支付、订单回调和退款闭环；每次仅购买 1 件。',
      price_cents = 1,
      stock = greatest(stock, 100),
      sort_order = -100,
      status = 'active',
      category = '支付测试',
      data_mode = 'live',
      updated_at = now()
  where id = (
    select id
    from campus_service_products
    where tenant_slug = 'tangshan'
      and campus_slug = 'daxuexidao'
      and service_type = 'snacks'
      and name = '微信支付 ¥0.01 测试商品'
    order by id
    limit 1
  )
  returning id
)
insert into campus_service_products (
  tenant_slug,
  campus_slug,
  service_type,
  name,
  description,
  price_cents,
  image_url,
  stock,
  sort_order,
  status,
  category,
  data_mode
)
select
  'tangshan',
  'daxuexidao',
  'snacks',
  '微信支付 ¥0.01 测试商品',
  '用于验证微信支付、订单回调和退款闭环；每次仅购买 1 件。',
  1,
  '',
  100,
  -100,
  'active',
  '支付测试',
  'live'
where not exists (select 1 from updated);

commit;
