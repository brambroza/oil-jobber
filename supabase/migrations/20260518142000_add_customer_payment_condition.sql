alter table customers
  add column if not exists payment_condition_id uuid null references payment_conditions(id);

create index if not exists idx_customers_payment_condition_id on customers(payment_condition_id);
