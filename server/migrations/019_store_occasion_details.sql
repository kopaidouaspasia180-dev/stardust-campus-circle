begin;

alter table campus_service_orders
  add column if not exists desired_date date,
  add column if not exists desired_time text not null default '',
  add column if not exists gift_message text not null default '';

alter table campus_service_orders
  add constraint campus_service_orders_desired_time_check
  check(desired_time = '' or desired_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') not valid;
alter table campus_service_orders validate constraint campus_service_orders_desired_time_check;

alter table campus_service_orders
  add constraint campus_service_orders_gift_message_check
  check(length(gift_message) <= 120) not valid;
alter table campus_service_orders validate constraint campus_service_orders_gift_message_check;

commit;
