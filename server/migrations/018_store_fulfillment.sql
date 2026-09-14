begin;

alter table campus_service_products
  add column if not exists category text not null default '其他';

alter table campus_service_products
  drop constraint if exists campus_service_products_category_check;
alter table campus_service_products
  add constraint campus_service_products_category_check
  check(length(category) between 1 and 30);

alter table campus_service_orders
  add column if not exists fulfillment_type text not null default 'pickup',
  add column if not exists contact_name text not null default '',
  add column if not exists contact_phone text not null default '',
  add column if not exists delivery_address text not null default '';

alter table campus_service_orders
  drop constraint if exists campus_service_orders_fulfillment_type_check;
alter table campus_service_orders
  add constraint campus_service_orders_fulfillment_type_check
  check(fulfillment_type in ('pickup','delivery'));

alter table campus_service_orders
  add constraint campus_service_orders_contact_name_check
  check(length(contact_name) <= 30) not valid;
alter table campus_service_orders validate constraint campus_service_orders_contact_name_check;

alter table campus_service_orders
  add constraint campus_service_orders_contact_phone_check
  check(length(contact_phone) <= 255) not valid;
alter table campus_service_orders validate constraint campus_service_orders_contact_phone_check;

alter table campus_service_orders
  add constraint campus_service_orders_delivery_address_check
  check(length(delivery_address) <= 120) not valid;
alter table campus_service_orders validate constraint campus_service_orders_delivery_address_check;

commit;
