-- Order totals now include the delivery fee; cancelled/draft orders no longer
-- count toward outstanding or used credit. Signatures stay the same.

create or replace function public.get_order_total_amount(p_order uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sum(amount) from public.sale_order_items
                   where sale_order_id = p_order and is_deleted = false), 0)
       + coalesce((select delivery_fee_amount from public.sale_orders where id = p_order), 0);
$$;

create or replace function public.get_order_outstanding_amount(p_order uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select order_status from public.sale_orders where id = p_order) in ('CANCELLED', 'DRAFT') then 0
    else public.get_order_total_amount(p_order)
       - coalesce((select sum(amount) from public.payment_transactions
                   where sale_order_id = p_order and is_deleted = false), 0)
  end;
$$;

create or replace function public.get_customer_credit_status(p_customer uuid)
returns table(customer_id uuid, credit_limit numeric, used_credit numeric, available_credit numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with active_orders as (
    select so.id
    from public.sale_orders so
    where so.customer_id = p_customer
      and so.is_deleted = false
      and so.order_status not in ('CANCELLED', 'DRAFT')
  ), o as (
    select coalesce(sum(public.get_order_total_amount(ao.id)), 0) as total from active_orders ao
  ), p as (
    select coalesce(sum(pt.amount), 0) as paid
    from public.payment_transactions pt
    join active_orders ao on ao.id = pt.sale_order_id
    where pt.is_deleted = false
  )
  select c.id,
         c.credit_limit,
         (select total from o) - (select paid from p),
         c.credit_limit - ((select total from o) - (select paid from p))
  from public.customers c
  where c.id = p_customer;
end;
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
           coalesce(sum(soi.amount), 0) + so.delivery_fee_amount as total
    from public.sale_orders so
    left join public.sale_order_items soi on soi.sale_order_id = so.id and soi.is_deleted = false
    where so.company_id = p_company
      and so.is_deleted = false
      and so.order_status not in ('CANCELLED', 'DRAFT')
    group by so.id, so.due_date, so.created_at, so.delivery_fee_amount
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
