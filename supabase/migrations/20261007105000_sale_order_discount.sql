-- Per-order bill discount (baht, VAT-inclusive) entered by sales, shown as a
-- separate line before the net total. Totals/outstanding/credit subtract it.

alter table public.sale_orders
  add column if not exists discount_amount numeric(14,2) not null default 0,
  add column if not exists discount_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sale_orders_discount_nonneg') then
    alter table public.sale_orders
      add constraint sale_orders_discount_nonneg check (discount_amount >= 0);
  end if;
end $$;

comment on column public.sale_orders.discount_amount is 'ส่วนลดท้ายบิล บาท (รวม VAT) หักจากยอดน้ำมัน + ค่าขนส่ง';

alter table public.invoices
  add column if not exists discount_amount numeric(14,2) not null default 0;

-- Order total = items + delivery fee - discount (never below 0).
create or replace function public.get_order_total_amount(p_order uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0,
       coalesce((select sum(amount) from public.sale_order_items
                 where sale_order_id = p_order and is_deleted = false), 0)
     + coalesce((select delivery_fee_amount from public.sale_orders where id = p_order), 0)
     - coalesce((select discount_amount from public.sale_orders where id = p_order), 0));
$$;

create or replace function public.get_dashboard_sales_summary(p_company uuid)
returns table(daily_sales numeric, monthly_sales numeric, total_orders bigint, outstanding numeric, overdue numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with order_sum as (
    select so.id, so.due_date, so.created_at,
           greatest(0, coalesce(sum(soi.amount), 0) + so.delivery_fee_amount - so.discount_amount) as total
    from public.sale_orders so
    left join public.sale_order_items soi on soi.sale_order_id = so.id and soi.is_deleted = false
    where so.company_id = p_company
      and so.is_deleted = false
      and so.order_status not in ('CANCELLED', 'DRAFT')
    group by so.id, so.due_date, so.created_at, so.delivery_fee_amount, so.discount_amount
  ), paid as (
    select sale_order_id, coalesce(sum(amount), 0) as amt
    from public.payment_transactions
    where company_id = p_company and is_deleted = false
    group by sale_order_id
  )
  select
    coalesce((select sum(total) from order_sum where (timezone('Asia/Bangkok', created_at))::date = (timezone('Asia/Bangkok', now()))::date), 0),
    coalesce((select sum(total) from order_sum where date_trunc('month', timezone('Asia/Bangkok', created_at)) = date_trunc('month', timezone('Asia/Bangkok', now()))), 0),
    (select count(*) from order_sum),
    coalesce((select sum(o.total - coalesce(p.amt, 0)) from order_sum o left join paid p on p.sale_order_id = o.id), 0),
    coalesce((select sum(o.total - coalesce(p.amt, 0)) from order_sum o left join paid p on p.sale_order_id = o.id where o.due_date < current_date), 0);
end;
$$;
