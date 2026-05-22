create extension if not exists pgcrypto;

create type user_role as enum ('SUPER_ADMIN','ADMIN','SALES','ACCOUNTING','OPERATION','OWNER');
create type order_status as enum ('DRAFT','SUBMITTED','ADMIN_REVIEW','CONFIRMED','REFINERY_BOOKED','WAITING_PAYMENT','PAID','PICKUP_READY','DELIVERING','COMPLETED','CANCELLED');

create or replace function set_updated_at() returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists users_profile (
  id uuid primary key references auth.users(id),
  company_id uuid not null references companies(id),
  full_name text,
  role user_role not null default 'SALES',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid null,
  updated_by uuid null,
  is_deleted boolean default false
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), name text not null,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists permissions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), code text not null,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), role_id uuid not null references roles(id), permission_id uuid not null references permissions(id),
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);

create table if not exists payment_conditions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), code text not null, name text not null, extra_cost_per_liter numeric(10,4) not null default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists depots (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), code text not null, name text not null, pickup_cost_per_liter numeric(10,4) not null default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists price_rule_settings (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), service_fee_per_liter numeric(10,4) not null default 0, profit_margin_per_liter numeric(10,4) not null default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);

create table if not exists price_ocr_uploads (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), image_url text not null, ocr_raw_text text, ocr_status text not null default 'PENDING',
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists oil_base_prices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), ocr_upload_id uuid references price_ocr_uploads(id), effective_date date not null default current_date,
  confirmed boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists oil_price_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), oil_base_price_id uuid not null references oil_base_prices(id), product_code text not null, product_name text not null,
  base_cost_price numeric(10,4) not null, selling_price numeric(10,4),
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists price_calculation_logs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), oil_price_item_id uuid references oil_price_items(id), payload jsonb not null,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), company_name text not null, tax_id text, address text, phone text,
  credit_limit numeric(14,2) default 0, payment_term_days int default 0, status text default 'ACTIVE',
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists customer_vehicles (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), customer_id uuid not null references customers(id), license_plate text not null, driver_name text, driver_phone text, pickup_license_number text,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists refineries (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), name text not null, contact_info text, active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists refinery_depots (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), refinery_id uuid not null references refineries(id), location text not null, loading_bay_code text, pump_code text,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);

create table if not exists line_customers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), customer_id uuid references customers(id), line_user_id text not null unique, display_name text, profile_image_url text,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists line_messages (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), line_customer_id uuid references line_customers(id), direction text not null, message_type text not null, message_text text,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists line_broadcasts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), title text not null, message text not null, status text default 'DRAFT',
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists line_broadcast_recipients (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), line_broadcast_id uuid not null references line_broadcasts(id), line_customer_id uuid not null references line_customers(id), sent_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);

create table if not exists sale_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), customer_id uuid not null references customers(id), line_customer_id uuid references line_customers(id), order_status order_status not null default 'DRAFT',
  depot_id uuid references depots(id), payment_condition_id uuid references payment_conditions(id), delivery_location text, refinery_booking_number text, due_date date,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists sale_order_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), sale_order_id uuid not null references sale_orders(id), product_code text not null, product_name text not null,
  liters numeric(14,2) not null, unit_price numeric(10,4) not null, amount numeric(14,2) generated always as (liters*unit_price) stored,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists sale_order_status_logs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), sale_order_id uuid not null references sale_orders(id), from_status order_status, to_status order_status not null, note text,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), sale_order_id uuid not null references sale_orders(id), invoice_no text not null, issued_at date not null default current_date, amount numeric(14,2) not null,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), sale_order_id uuid not null references sale_orders(id), receipt_no text not null, issued_at date not null default current_date, amount numeric(14,2) not null,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), sale_order_id uuid not null references sale_orders(id), paid_at date not null default current_date, amount numeric(14,2) not null,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);
create table if not exists credit_alert_logs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), customer_id uuid not null references customers(id), alert_type text not null, message text not null,
  created_at timestamptz default now(), updated_at timestamptz default now(), created_by uuid null, updated_by uuid null, is_deleted boolean default false
);

create index if not exists idx_company_orders on sale_orders(company_id, order_status, created_at desc);
create index if not exists idx_company_prices on oil_base_prices(company_id, effective_date desc);
create index if not exists idx_company_customers on customers(company_id, company_name);

create or replace function current_company_id() returns uuid as $$
  select company_id from users_profile where id = auth.uid() and is_deleted = false limit 1;
$$ language sql stable;

create or replace function calculate_oil_selling_price(p_base numeric, p_payment uuid, p_depot uuid, p_company uuid)
returns numeric as $$
declare v_pay numeric; v_dep numeric; v_service numeric; v_profit numeric;
begin
  select extra_cost_per_liter into v_pay from payment_conditions where id=p_payment and company_id=p_company;
  select pickup_cost_per_liter into v_dep from depots where id=p_depot and company_id=p_company;
  select service_fee_per_liter, profit_margin_per_liter into v_service, v_profit from price_rule_settings where company_id=p_company and is_deleted=false order by created_at desc limit 1;
  return coalesce(p_base,0)+coalesce(v_pay,0)+coalesce(v_dep,0)+coalesce(v_service,0)+coalesce(v_profit,0);
end;
$$ language plpgsql security definer;

create or replace function get_dashboard_sales_summary(p_company uuid)
returns table(daily_sales numeric, monthly_sales numeric, total_orders bigint, outstanding numeric, overdue numeric) as $$
begin
  return query
  with order_sum as (
    select so.id, so.due_date, coalesce(sum(soi.amount),0) as total
    from sale_orders so left join sale_order_items soi on soi.sale_order_id=so.id and soi.is_deleted=false
    where so.company_id=p_company and so.is_deleted=false
    group by so.id, so.due_date
  ), paid as (
    select sale_order_id, coalesce(sum(amount),0) amt from payment_transactions where company_id=p_company and is_deleted=false group by sale_order_id
  )
  select
    coalesce((select sum(total) from order_sum where id in (select id from sale_orders where created_at::date=current_date and company_id=p_company)),0),
    coalesce((select sum(total) from order_sum where id in (select id from sale_orders where date_trunc('month',created_at)=date_trunc('month',now()) and company_id=p_company)),0),
    (select count(*) from sale_orders where company_id=p_company and is_deleted=false),
    coalesce((select sum(o.total-coalesce(p.amt,0)) from order_sum o left join paid p on p.sale_order_id=o.id),0),
    coalesce((select sum(o.total-coalesce(p.amt,0)) from order_sum o left join paid p on p.sale_order_id=o.id where o.due_date < current_date),0);
end;
$$ language plpgsql security definer;

create or replace function get_order_outstanding_amount(p_order uuid)
returns numeric as $$
  with total as (select coalesce(sum(amount),0) t from sale_order_items where sale_order_id=p_order and is_deleted=false),
  paid as (select coalesce(sum(amount),0) p from payment_transactions where sale_order_id=p_order and is_deleted=false)
  select (select t from total) - (select p from paid);
$$ language sql stable security definer;

create or replace function get_customer_credit_status(p_customer uuid)
returns table(customer_id uuid, credit_limit numeric, used_credit numeric, available_credit numeric) as $$
begin
  return query
  with o as (
    select so.customer_id, coalesce(sum(soi.amount),0) total
    from sale_orders so join sale_order_items soi on soi.sale_order_id=so.id and soi.is_deleted=false
    where so.customer_id=p_customer and so.is_deleted=false group by so.customer_id
  ), p as (
    select so.customer_id, coalesce(sum(pt.amount),0) paid
    from sale_orders so join payment_transactions pt on pt.sale_order_id=so.id and pt.is_deleted=false
    where so.customer_id=p_customer and so.is_deleted=false group by so.customer_id
  )
  select c.id, c.credit_limit, coalesce(o.total,0)-coalesce(p.paid,0), c.credit_limit-(coalesce(o.total,0)-coalesce(p.paid,0))
  from customers c left join o on o.customer_id=c.id left join p on p.customer_id=c.id where c.id=p_customer;
end;
$$ language plpgsql security definer;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users_profile','roles','permissions','role_permissions','payment_conditions','depots','price_rule_settings','price_ocr_uploads','oil_base_prices','oil_price_items','price_calculation_logs','customers','customer_vehicles','refineries','refinery_depots','line_customers','line_messages','line_broadcasts','line_broadcast_recipients','sale_orders','sale_order_items','sale_order_status_logs','invoices','receipts','payment_transactions','credit_alert_logs']
  LOOP
    EXECUTE format('alter table %I enable row level security', t);
    EXECUTE format('create policy %I_select on %I for select using (company_id = current_company_id())', t, t);
    EXECUTE format('create policy %I_insert on %I for insert with check (company_id = current_company_id())', t, t);
    EXECUTE format('create policy %I_update on %I for update using (company_id = current_company_id()) with check (company_id = current_company_id())', t, t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users_profile','roles','permissions','role_permissions','payment_conditions','depots','price_rule_settings','price_ocr_uploads','oil_base_prices','oil_price_items','price_calculation_logs','customers','customer_vehicles','refineries','refinery_depots','line_customers','line_messages','line_broadcasts','line_broadcast_recipients','sale_orders','sale_order_items','sale_order_status_logs','invoices','receipts','payment_transactions','credit_alert_logs']
  LOOP
    EXECUTE format('create trigger trg_%I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  END LOOP;
END $$;
