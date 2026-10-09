-- ============================================================
-- ROLLBACK for migrations 20261007100000 .. 20261007105000
-- (SALES role, delivery fee, discount, payments/receipts/invoices,
--  company seller info, documents bucket)
--
-- DO NOT put this file in supabase/migrations/. Run it by hand only
-- after the application has been rolled back to the previous release.
--
-- Data that lives only in the new columns is lost when this runs:
--   sale_orders.delivery_fee_*, discount_*, remark, sales_user_id
--   payment_transactions.payment_method/reference_no/slip_url/note/received_by/receipt_id
--   receipts/invoices snapshot columns, users_profile.email, customers price fields
-- Rows created by the new release (payments, receipts, invoices, orders)
-- are kept; only the extra columns are removed.
--
-- Take a backup first:  supabase db dump -f backup-before-rollback.sql
-- ============================================================

begin;

-- ---------- 1. functions / triggers added by the new release ----------
drop function if exists public.record_order_payment(uuid, uuid, numeric, date, text, text, text, text, uuid, boolean);

drop trigger if exists trg_assign_receipt_no on public.receipts;
drop trigger if exists trg_assign_invoice_no on public.invoices;
drop function if exists public.assign_receipt_no();
drop function if exists public.assign_invoice_no();

drop trigger if exists trg_sale_order_items_delivery_fee on public.sale_order_items;
drop trigger if exists trg_sale_orders_delivery_fee on public.sale_orders;
drop function if exists public.trg_items_refresh_delivery_fee();
drop function if exists public.trg_orders_refresh_delivery_fee();
drop function if exists public.refresh_sale_order_delivery_fee(uuid);

drop function if exists public.get_order_total_amount(uuid);

-- ---------- 2. restore the original RPC bodies (from 20260518120000_init_oiljobber.sql) ----------
create or replace function public.get_dashboard_sales_summary(p_company uuid)
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

create or replace function public.get_order_outstanding_amount(p_order uuid)
returns numeric as $$
  with total as (select coalesce(sum(amount),0) t from sale_order_items where sale_order_id=p_order and is_deleted=false),
  paid as (select coalesce(sum(amount),0) p from payment_transactions where sale_order_id=p_order and is_deleted=false)
  select (select t from total) - (select p from paid);
$$ language sql stable security definer;

create or replace function public.get_customer_credit_status(p_customer uuid)
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

-- ---------- 3. invoices ----------
drop index if exists public.uniq_invoices_company_no;
drop index if exists public.uniq_invoices_active_per_order;
alter table public.invoices drop constraint if exists invoices_status_chk;
update public.invoices set invoice_no = 'INV-' || left(id::text, 8) where invoice_no is null;
alter table public.invoices alter column invoice_no set not null;
alter table public.invoices
  drop column if exists customer_id,
  drop column if exists status,
  drop column if exists due_date,
  drop column if exists goods_amount,
  drop column if exists delivery_fee_amount,
  drop column if exists discount_amount,
  drop column if exists subtotal_amount,
  drop column if exists vat_amount,
  drop column if exists total_amount,
  drop column if exists customer_name,
  drop column if exists customer_tax_id,
  drop column if exists customer_address,
  drop column if exists items_snapshot,
  drop column if exists issued_by;

-- ---------- 4. payment_transactions / receipts ----------
alter table public.payment_transactions drop constraint if exists payment_transactions_receipt_fk;
alter table public.payment_transactions drop constraint if exists payment_transactions_method_chk;
drop index if exists public.idx_payment_transactions_order;
alter table public.payment_transactions
  drop column if exists payment_method,
  drop column if exists reference_no,
  drop column if exists slip_url,
  drop column if exists note,
  drop column if exists received_by,
  drop column if exists receipt_id;

drop index if exists public.uniq_receipts_company_no;
update public.receipts set receipt_no = 'RCP-' || left(id::text, 8) where receipt_no is null;
alter table public.receipts alter column receipt_no set not null;
alter table public.receipts
  drop column if exists customer_id,
  drop column if exists payment_transaction_id,
  drop column if exists payment_method,
  drop column if exists reference_no,
  drop column if exists customer_name,
  drop column if exists customer_tax_id,
  drop column if exists customer_address;

-- ---------- 5. sale_orders / sale_order_items ----------
alter table public.sale_orders drop constraint if exists sale_orders_discount_nonneg;
drop index if exists public.idx_sale_orders_sales_user;
alter table public.sale_orders
  drop column if exists delivery_fee_std_per_liter,
  drop column if exists delivery_fee_adjust_per_liter,
  drop column if exists delivery_fee_amount,
  drop column if exists discount_amount,
  drop column if exists discount_note,
  drop column if exists remark,
  drop column if exists sales_user_id;

alter table public.sale_order_items
  drop column if exists base_cost_price,
  drop column if exists payment_extra_per_liter,
  drop column if exists customer_adjust_per_liter,
  drop column if exists sales_fee_per_liter;

-- ---------- 6. customers / users_profile / companies ----------
alter table public.customers drop constraint if exists customers_sales_fee_nonneg;
drop index if exists public.idx_customers_sales_user;
alter table public.customers
  drop column if exists price_adjustment_per_liter,
  drop column if exists sales_fee_per_liter,
  drop column if exists sales_user_id;

drop index if exists public.uniq_users_profile_company_email;
alter table public.users_profile drop column if exists email;

alter table public.companies
  drop column if exists tax_id,
  drop column if exists branch,
  drop column if exists address,
  drop column if exists phone,
  drop column if exists email,
  drop column if exists logo_url;

-- ---------- 7. storage bucket (objects must be removed first) ----------
delete from storage.objects where bucket_id = 'documents';
delete from storage.buckets where id = 'documents';

-- ---------- 8. migration history (so `supabase db push` can re-apply later) ----------
delete from supabase_migrations.schema_migrations
where version in ('20261007100000', '20261007101000', '20261007102000', '20261007103000', '20261007104000', '20261007105000');

commit;
