begin;

update campus_service_products
set status = 'inactive', updated_at = now()
where data_mode = 'test'
   or name = '微信支付 ¥0.01 测试商品';

update daily_menu_items
set status = 'inactive', updated_at = now()
where data_mode = 'test';

update products
set status = 'inactive', updated_at = now()
where data_mode = 'test';

update merchants
set status = 'inactive', updated_at = now()
where data_mode = 'test';

commit;
