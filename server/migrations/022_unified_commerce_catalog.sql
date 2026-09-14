begin;

alter table campus_service_products
  add column if not exists data_mode text not null default 'live';
alter table campus_service_products
  drop constraint if exists campus_service_products_data_mode_check;
alter table campus_service_products
  add constraint campus_service_products_data_mode_check check(data_mode in ('test','live'));

alter table merchants
  add column if not exists data_mode text not null default 'live';
alter table merchants
  drop constraint if exists merchants_data_mode_check;
alter table merchants
  add constraint merchants_data_mode_check check(data_mode in ('test','live'));

alter table products
  add column if not exists data_mode text not null default 'live';
alter table products
  drop constraint if exists products_data_mode_check;
alter table products
  add constraint products_data_mode_check check(data_mode in ('test','live'));

alter table daily_menu_items
  add column if not exists data_mode text not null default 'live';
alter table daily_menu_items
  drop constraint if exists daily_menu_items_data_mode_check;
alter table daily_menu_items
  add constraint daily_menu_items_data_mode_check check(data_mode in ('test','live'));

insert into campus_service_products(
  tenant_slug,campus_slug,service_type,name,description,category,price_cents,image_url,stock,sort_order,status,data_mode
)
select campus.tenant_slug,campus.slug,'snacks',seed.name,seed.description,seed.category,seed.price_cents,'',seed.stock,seed.sort_order,'active','test'
from campus_sites campus
cross join (values
  ('原味薯片 70g','测试商品，规格与库存由校区运营确认','零食',750,60,10),
  ('原味夹心饼干 116g','测试商品，规格与库存由校区运营确认','零食',890,60,20),
  ('可乐 500ml','测试商品，可在后台替换为真实品牌与图片','饮料',350,80,30),
  ('饮用水 550ml','测试商品，可在后台替换为真实品牌与图片','饮料',200,100,40),
  ('红烧牛肉面','测试商品，桶装方便面','泡面',550,50,50),
  ('酸菜牛肉面','测试商品，桶装方便面','泡面',550,50,60),
  ('原木抽纸 3包','测试商品，宿舍日用','日用',1290,30,70),
  ('便携湿巾 10片','测试商品，宿舍日用','日用',490,40,80)
) as seed(name,description,category,price_cents,stock,sort_order)
where campus.tenant_slug='tangshan' and campus.status='active'
on conflict(tenant_slug,campus_slug,service_type,name) do nothing;

insert into merchants(tenant_slug,campus_slug,name,category,description,status,delivery_minutes,min_order,data_mode)
select campus.tenant_slug,campus.slug,'校园外卖测试档口','校园餐饮','测试档口；上线前请由校区运营核实商户、图片、价格与库存','active',30,0,'test'
from campus_sites campus
where campus.tenant_slug='tangshan' and campus.status='active'
  and not exists (
    select 1 from merchants merchant
    where merchant.tenant_slug=campus.tenant_slug and merchant.campus_slug=campus.slug and merchant.name='校园外卖测试档口'
  );

insert into products(merchant_id,name,description,price,category,image_url,stock,status,data_mode)
select merchant.id,seed.name,seed.description,seed.price,seed.category,null,seed.stock,'active','test'
from merchants merchant
cross join (values
  ('番茄炒蛋盖饭','番茄炒蛋、时蔬与米饭',12.90::numeric,'家常菜',30),
  ('黑椒鸡胸轻食餐','鸡胸肉、玉米、鸡蛋与时蔬',16.90::numeric,'减脂餐',24),
  ('红烧牛肉面','牛肉、青菜与面条',14.90::numeric,'面食',20),
  ('照烧鸡腿饭','去骨鸡腿、时蔬与米饭',15.90::numeric,'午餐套餐',26),
  ('三文鱼能量碗','三文鱼、杂粮与新鲜蔬菜',24.90::numeric,'轻食',12),
  ('冰柠檬茶','500ml，冷热与甜度请在备注说明',5.90::numeric,'饮品',40)
) as seed(name,description,price,category,stock)
where merchant.tenant_slug='tangshan' and merchant.name='校园外卖测试档口'
  and not exists (
    select 1 from products product where product.merchant_id=merchant.id and product.name=seed.name
  );

create index if not exists idx_service_products_scope_mode
  on campus_service_products(tenant_slug,campus_slug,service_type,data_mode,status,sort_order,id);
create index if not exists idx_merchants_scope_mode
  on merchants(tenant_slug,campus_slug,data_mode,status,id);

commit;
