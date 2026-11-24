import { supabaseAdmin } from '@/lib/supabase/server';
import { loadOrderDocumentData } from '@/lib/documents/from-order';
import { invoiceContentColumns } from '@/lib/services/invoice-content';
import { advanceOrderStatus } from '@/lib/services/order-status';
import { todayBangkok } from '@/lib/services/quotations';
import { buildTripInvoiceContent, deliveredByItem, parseTripLines, type TripLine } from '@/lib/utils/delivery-trips';
import { validateInvoiceIssueDate } from '@/lib/utils/invoice-dates';
import { canIssueTaxInvoice } from '@/lib/utils/order-status';
import type { DocumentTotals } from '@/lib/documents/types';

/** Columns of `sale_order_deliveries` returned to the UI. */
const TRIP_COLUMNS =
  'id, sale_order_id, trip_no, delivery_record_no, delivered_at, lines, total_liters, vehicle_license_plate, vehicle_driver_name, receiver_name, note, recorded_by, created_at';

/** Active tax invoice of a trip, as shown next to the trip. */
export type TripInvoiceSummary = { id: string; invoice_no: string; issued_at: string; status: string; total_amount: number };

/** One delivery trip with its active invoice. */
export type DeliveryTrip = {
  id: string;
  sale_order_id: string;
  trip_no: number;
  delivery_record_no: string | null;
  delivered_at: string;
  lines: TripLine[];
  total_liters: number;
  vehicle_license_plate: string | null;
  vehicle_driver_name: string | null;
  receiver_name: string | null;
  note: string | null;
  recorded_by: string | null;
  invoice: TripInvoiceSummary | null;
};

type Failure = { error: string; status: number };

/** Normalises a `sale_order_deliveries` row. */
function toTrip(row: Record<string, any>, invoice: TripInvoiceSummary | null): DeliveryTrip {
  return {
    id: String(row.id),
    sale_order_id: String(row.sale_order_id),
    trip_no: Number(row.trip_no || 0),
    delivery_record_no: row.delivery_record_no ?? null,
    delivered_at: String(row.delivered_at),
    lines: parseTripLines(row.lines),
    total_liters: Number(row.total_liters || 0),
    vehicle_license_plate: row.vehicle_license_plate ?? null,
    vehicle_driver_name: row.vehicle_driver_name ?? null,
    receiver_name: row.receiver_name ?? null,
    note: row.note ?? null,
    recorded_by: row.recorded_by ?? null,
    invoice,
  };
}

/**
 * Loads the active trips of some orders with each trip's active invoice.
 * Returns an empty list when the trips table is not migrated yet
 * (`20261123100000_delivery_trips_multi_invoice.sql`), so older screens keep working.
 *
 * @param companyId - tenant scope
 * @param orderIds - sale order ids
 * @returns trips ordered by order then trip number
 */
export async function loadTripsForOrders(companyId: string, orderIds: string[]): Promise<DeliveryTrip[] | { error: string }> {
  if (!orderIds.length) return [];
  const rows: Record<string, any>[] = [];
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from('sale_order_deliveries')
      .select(TRIP_COLUMNS)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .in('sale_order_id', orderIds.slice(i, i + 200))
      .order('trip_no', { ascending: true });
    if (error) {
      if (/sale_order_deliveries/.test(error.message) && /(does not exist|schema cache)/i.test(error.message)) return [];
      return { error: error.message };
    }
    rows.push(...(data ?? []));
  }
  if (!rows.length) return [];

  const invoiceByTrip = new Map<string, TripInvoiceSummary>();
  const tripIds = rows.map((r) => String(r.id));
  for (let i = 0; i < tripIds.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select('id, delivery_id, invoice_no, issued_at, status, total_amount, amount')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .neq('status', 'CANCELLED')
      .in('delivery_id', tripIds.slice(i, i + 200));
    if (error) return { error: error.message };
    for (const inv of data ?? []) {
      invoiceByTrip.set(String(inv.delivery_id), {
        id: String(inv.id),
        invoice_no: String(inv.invoice_no),
        issued_at: String(inv.issued_at),
        status: String(inv.status),
        total_amount: Number(inv.total_amount ?? inv.amount ?? 0),
      });
    }
  }
  return rows.map((row) => toTrip(row, invoiceByTrip.get(String(row.id)) ?? null));
}

/** Trips of one order (see `loadTripsForOrders`). */
export async function loadOrderTrips(companyId: string, orderId: string): Promise<DeliveryTrip[] | { error: string }> {
  return loadTripsForOrders(companyId, [orderId]);
}

/** Loads one active trip by id. */
export async function loadTrip(companyId: string, deliveryId: string): Promise<DeliveryTrip | null> {
  const { data } = await supabaseAdmin
    .from('sale_order_deliveries')
    .select(TRIP_COLUMNS)
    .eq('id', deliveryId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!data) return null;
  const trips = await loadOrderTrips(companyId, String(data.sale_order_id));
  if ('error' in trips) return toTrip(data, null);
  return trips.find((t) => t.id === deliveryId) ?? toTrip(data, null);
}

/** The order's active "whole order" tax invoice (old style, `delivery_id` null), if any. */
export async function loadFullOrderInvoice(companyId: string, orderId: string): Promise<{ id: string; invoice_no: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_no')
    .eq('company_id', companyId)
    .eq('sale_order_id', orderId)
    .eq('is_deleted', false)
    .neq('status', 'CANCELLED')
    .is('delivery_id', null)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ? { id: String(data.id), invoice_no: String(data.invoice_no) } : null;
}

/** Order items (id, liters, name) used to check trip liters. */
export async function loadOrderItemsForTrips(companyId: string, orderId: string) {
  const { data, error } = await supabaseAdmin
    .from('sale_order_items')
    .select('id, product_code, product_name, liters, created_at')
    .eq('company_id', companyId)
    .eq('sale_order_id', orderId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) return { error: error.message };
  return (data ?? []).map((it) => ({
    id: String(it.id),
    product_code: String(it.product_code || ''),
    product_name: String(it.product_name || it.product_code || ''),
    liters: Number(it.liters || 0),
  }));
}

/**
 * Keeps the order's single delivery fields (delivered_at, delivery_record_no,
 * receiver, note) as a summary of its trips: latest trip time and receiver,
 * first trip's DR number. Moves the order to DELIVERED once every liter has
 * been delivered.
 *
 * @param companyId - tenant scope
 * @param orderId - sale order id
 * @param userId - staff user
 * @returns whether the status moved to DELIVERED
 */
export async function syncOrderDeliverySummary(companyId: string, orderId: string, userId: string): Promise<{ advanced: boolean } | Failure> {
  const [trips, items] = await Promise.all([loadOrderTrips(companyId, orderId), loadOrderItemsForTrips(companyId, orderId)]);
  if ('error' in trips) return { error: trips.error, status: 400 };
  if ('error' in items) return { error: items.error, status: 400 };

  if (!trips.length) {
    const { error } = await supabaseAdmin
      .from('sale_orders')
      .update({ delivered_at: null, delivery_record_no: null, delivery_receiver_name: null, delivery_record_note: null, delivery_recorded_by: null, updated_by: userId })
      .eq('id', orderId)
      .eq('company_id', companyId);
    if (error) return { error: error.message, status: 400 };
    return { advanced: false };
  }

  const latest = trips.reduce((a, b) => (b.delivered_at > a.delivered_at ? b : a));
  const summary = {
    delivered_at: latest.delivered_at,
    delivery_record_no: trips[0].delivery_record_no,
    delivery_receiver_name: latest.receiver_name,
    delivery_record_note: latest.note,
    delivery_recorded_by: latest.recorded_by,
  };
  const delivered = deliveredByItem(trips);
  const complete = items.length > 0 && items.every((it) => (delivered.get(it.id) || 0) + 0.005 >= it.liters);
  if (complete) {
    const result = await advanceOrderStatus(companyId, orderId, userId, 'DELIVERED', summary, 'บันทึกการส่งของครบทุกลิตร');
    if ('error' in result) return result;
    return { advanced: result.advanced };
  }
  const { error } = await supabaseAdmin.from('sale_orders').update({ ...summary, updated_by: userId }).eq('id', orderId).eq('company_id', companyId);
  if (error) return { error: error.message, status: 400 };
  return { advanced: false };
}

/** Date part (Asia/Bangkok) of a timestamp. */
function bangkokDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/**
 * Builds the content of a trip's tax invoice from the live order: the order's
 * printed lines at the trip's liters, discount spread by liters, and the
 * remainder on the trip that completes the order.
 *
 * @param companyId - tenant scope
 * @param trip - the trip
 * @param excludeInvoiceId - invoice to leave out of "other trips" (when re-snapshotting it)
 */
export async function buildTripInvoiceFromOrder(companyId: string, trip: DeliveryTrip, excludeInvoiceId?: string) {
  const doc = await loadOrderDocumentData(companyId, trip.sale_order_id);
  if ('error' in doc) return doc;
  const { data: others, error } = await supabaseAdmin
    .from('invoices')
    .select('id, delivery_id, total_amount, amount, totals_snapshot')
    .eq('company_id', companyId)
    .eq('sale_order_id', trip.sale_order_id)
    .eq('is_deleted', false)
    .neq('status', 'CANCELLED')
    .not('delivery_id', 'is', null);
  if (error) return { error: error.message, status: 400 };
  const otherInvoices = (others ?? [])
    .filter((inv) => String(inv.delivery_id) !== trip.id && String(inv.id) !== excludeInvoiceId)
    .map((inv) => ({
      liters: Number((inv.totals_snapshot as Partial<DocumentTotals> | null)?.total_liters ?? 0),
      net_incl_vat: Number(inv.total_amount ?? inv.amount ?? 0),
    }));
  const content = buildTripInvoiceContent(doc, trip.lines, otherInvoices);
  if (!content.items.length) return { error: 'เที่ยวนี้ไม่มีรายการสินค้าที่ตรงกับใบสั่งขาย', status: 422 };
  return { doc, content };
}

/**
 * Issues the tax invoice of one delivery trip (IV-YY####). The issue date
 * defaults to the delivery date when that date is allowed (same year, not in
 * the future), otherwise today. Refused when the order already has a "whole
 * order" invoice or the trip already has an active invoice.
 *
 * @param companyId - tenant scope
 * @param userId - staff user issuing the invoice
 * @param deliveryId - trip id
 * @param issuedAt - optional issue date `YYYY-MM-DD`
 */
export async function issueTripInvoice(
  companyId: string,
  userId: string,
  deliveryId: string,
  issuedAt?: string,
): Promise<{ invoice: Record<string, any> } | Failure> {
  const trip = await loadTrip(companyId, deliveryId);
  if (!trip) return { error: 'ไม่พบเที่ยวส่งของ', status: 404 };
  if (trip.invoice) return { error: `เที่ยวนี้ออกใบกำกับภาษี ${trip.invoice.invoice_no} แล้ว`, status: 409 };

  const { data: order, error: orderError } = await supabaseAdmin
    .from('sale_orders')
    .select('id, customer_id, order_status, due_date')
    .eq('id', trip.sale_order_id)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (orderError) return { error: orderError.message, status: 400 };
  if (!order) return { error: 'ไม่พบคำสั่งซื้อ', status: 404 };
  if (order.order_status === 'CANCELLED') return { error: 'คำสั่งซื้อถูกยกเลิกแล้ว ออกใบกำกับภาษีไม่ได้', status: 422 };
  if (!canIssueTaxInvoice(order.order_status)) return { error: 'คำสั่งซื้อยังไม่ผ่านการอนุมัติ ต้องอนุมัติก่อนจึงออกใบกำกับภาษีได้', status: 422 };

  const full = await loadFullOrderInvoice(companyId, trip.sale_order_id);
  if (full) return { error: `ใบสั่งขายนี้ออกใบกำกับภาษีทั้งใบแล้ว (${full.invoice_no}) ยกเลิกใบนั้นก่อนจึงออกตามเที่ยวได้`, status: 409 };

  const today = todayBangkok();
  let date = issuedAt;
  if (!date) {
    const tripDate = bangkokDate(trip.delivered_at);
    date = validateInvoiceIssueDate(tripDate, { today }) ? today : tripDate;
  }
  const dateError = validateInvoiceIssueDate(date, { today });
  if (dateError) return { error: dateError, status: 422 };

  const built = await buildTripInvoiceFromOrder(companyId, trip);
  if ('error' in built) return built;
  const { doc, content } = built;

  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .insert({
      company_id: companyId,
      sale_order_id: trip.sale_order_id,
      delivery_id: trip.id,
      customer_id: order.customer_id,
      issued_at: date,
      due_date: order.due_date,
      status: doc.outstanding_amount <= 0.005 ? 'PAID' : 'ISSUED',
      ...invoiceContentColumns({ customer: doc.customer, items: content.items, totals: content.totals, note: null }),
      content_overridden: false,
      issued_by: userId,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single();
  if (error) {
    if (/uniq_invoices_active_per_delivery/.test(error.message)) return { error: 'เที่ยวนี้ออกใบกำกับภาษีแล้ว', status: 409 };
    return { error: error.message, status: 400 };
  }
  return { invoice };
}

/** True when the order has at least one active trip invoice. */
export async function hasTripInvoices(companyId: string, orderId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('invoices')
    .select('invoice_no')
    .eq('company_id', companyId)
    .eq('sale_order_id', orderId)
    .eq('is_deleted', false)
    .neq('status', 'CANCELLED')
    .not('delivery_id', 'is', null)
    .limit(1)
    .maybeSingle();
  return data ? String(data.invoice_no) : null;
}
