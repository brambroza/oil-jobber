alter table payment_conditions
  add column if not exists payment_type text not null default 'CASH',
  add column if not exists credit_days integer not null default 0;

alter table payment_conditions
  add constraint payment_conditions_payment_type_chk
  check (payment_type in ('CASH', 'CREDIT'));

alter table payment_conditions
  add constraint payment_conditions_credit_days_chk
  check (credit_days >= 0);
