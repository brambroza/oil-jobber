-- Uses the enum values added in 20261009140000_order_status_document_milestones.sql.

-- ---------- delivery record running number ----------
create or replace function public.assign_delivery_record_no()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  doc_date date;
  doc_prefix text;
  next_run integer;
begin
  if new.delivered_at is null or nullif(btrim(new.delivery_record_no), '') is not null then
    return new;
  end if;

  doc_date := timezone('Asia/Bangkok', new.delivered_at)::date;
  doc_prefix := 'DR-' || to_char(doc_date, 'YYMMDD');

  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || ':' || doc_prefix, 0));

  select coalesce(max(right(so.delivery_record_no, 4)::integer), 0) + 1
    into next_run
  from public.sale_orders so
  where so.company_id = new.company_id
    and so.delivery_record_no ~ ('^' || doc_prefix || '[0-9]{4}$');

  if next_run > 9999 then
    raise exception 'เลขบันทึกการส่งของของวันที่ % เกิน 9999 รายการแล้ว', doc_date;
  end if;

  new.delivery_record_no := doc_prefix || lpad(next_run::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_assign_delivery_record_no on public.sale_orders;
create trigger trg_assign_delivery_record_no
before insert or update of delivered_at on public.sale_orders
for each row execute function public.assign_delivery_record_no();

-- ---------- payment RPC: PO_SENT also moves to PAID when fully paid ----------
create or replace function public.record_order_payment(
  p_company uuid,
  p_order uuid,
  p_amount numeric,
  p_paid_at date,
  p_method text,
  p_reference text,
  p_slip_url text,
  p_note text,
  p_user uuid,
  p_issue_receipt boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sale_orders%rowtype;
  v_cust public.customers%rowtype;
  v_outstanding numeric;
  v_payment_id uuid;
  v_receipt_id uuid;
  v_receipt_no text;
  v_new_status public.order_status;
begin
  select * into v_order
  from public.sale_orders
  where id = p_order and company_id = p_company and is_deleted = false
  for update;

  if not found then
    raise exception 'ไม่พบคำสั่งซื้อ';
  end if;
  if v_order.order_status in ('DRAFT', 'CANCELLED') then
    raise exception 'สถานะคำสั่งซื้อไม่สามารถรับชำระได้';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'จำนวนเงินต้องมากกว่า 0';
  end if;
  if p_method not in ('CASH', 'TRANSFER', 'CHEQUE') then
    raise exception 'วิธีชำระเงินไม่ถูกต้อง';
  end if;

  v_outstanding := public.get_order_outstanding_amount(p_order);
  if p_amount > v_outstanding + 0.005 then
    raise exception 'ยอดชำระเกินยอดค้าง (คงค้าง % บาท)', to_char(v_outstanding, 'FM999,999,999,990.00');
  end if;

  insert into public.payment_transactions
    (company_id, sale_order_id, paid_at, amount, payment_method, reference_no, slip_url, note, received_by, created_by)
  values
    (p_company, p_order, coalesce(p_paid_at, current_date), p_amount, p_method, nullif(btrim(p_reference), ''),
     nullif(btrim(p_slip_url), ''), nullif(btrim(p_note), ''), p_user, p_user)
  returning id into v_payment_id;

  if p_issue_receipt then
    select * into v_cust from public.customers where id = v_order.customer_id;

    insert into public.receipts
      (company_id, sale_order_id, customer_id, payment_transaction_id, issued_at, amount, payment_method, reference_no,
       customer_name, customer_tax_id, customer_address, created_by)
    values
      (p_company, p_order, v_order.customer_id, v_payment_id, coalesce(p_paid_at, current_date), p_amount, p_method,
       nullif(btrim(p_reference), ''), v_cust.company_name, v_cust.tax_id, v_cust.address, p_user)
    returning id, receipt_no into v_receipt_id, v_receipt_no;

    update public.payment_transactions set receipt_id = v_receipt_id where id = v_payment_id;
  end if;

  v_outstanding := public.get_order_outstanding_amount(p_order);
  v_new_status := v_order.order_status;

  if v_outstanding <= 0.005
     and v_order.order_status in ('SUBMITTED', 'ADMIN_REVIEW', 'CONFIRMED', 'PO_SENT', 'REFINERY_BOOKED', 'WAITING_PAYMENT') then
    v_new_status := 'PAID';
    update public.sale_orders
      set order_status = 'PAID', updated_by = p_user
      where id = p_order;
    insert into public.sale_order_status_logs (company_id, sale_order_id, from_status, to_status, note, created_by)
      values (p_company, p_order, v_order.order_status, 'PAID', 'ชำระครบจากการรับชำระเงิน', p_user);
    update public.invoices
      set status = 'PAID', updated_by = p_user
      where sale_order_id = p_order and is_deleted = false and status = 'ISSUED';
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'receipt_id', v_receipt_id,
    'receipt_no', v_receipt_no,
    'outstanding_after', v_outstanding,
    'order_status', v_new_status
  );
end;
$$;
