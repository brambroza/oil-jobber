'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Add, Delete, Edit, Remove } from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  createFilterOptions,
} from '@mui/material';
import { ActionSnackbar, type ActionSnackbarSeverity } from '@/components/common/ActionSnackbar';
import type { OrderStatus } from '@/types/database';

type OrderRow = {
  id: string;
  order_no?: string | null;
  customer_id: string;
  order_status: OrderStatus;
  delivery_location: string | null;
  refinery_summary?: string | null;
  depot_summary?: string | null;
  selected_credit_label?: string | null;
  refinery_booking_number: string | null;
  delivery_order_no?: string | null;
  delivery_order_file_url?: string | null;
  due_date: string | null;
  total_liters?: number;
  total_amount?: number;
  customers?: { company_name?: string } | null;
};

type MasterCustomer = {
  id: string;
  company_name: string;
  tax_id?: string | null;
  phone?: string | null;
  payment_condition_id?: string | null;
};
type MasterRefinery = { id: string; name: string };
type MasterDepot = { id: string; code: string; name: string; refinery_id?: string | null };
type MasterProduct = { code: string; name: string; is_active: boolean };
type MasterPaymentCondition = {
  id: string;
  name: string;
  payment_type: string;
  credit_days: number;
  extra_cost_per_liter: number;
};
type CustomerAccess = {
  allowed_refinery_ids?: string[] | null;
  allowed_depot_ids?: string[] | null;
  allowed_payment_condition_ids?: string[] | null;
} | null;

type CustomerPriceOption = {
  refinery_id: string | null;
  depot_id: string;
  product_code: string;
  product_name: string;
  base_cost_price: number;
};

type OrderItemForm = {
  refinery_id: string;
  depot_id: string;
  product_code: string;
  product_name: string;
  unit_price: number;
  liters: number;
};

type OrderForm = {
  id?: string;
  order_no?: string;
  payment_condition_id?: string;
  refinery_summary?: string;
  depot_summary?: string;
  selected_refinery_id: string;
  selected_depot_id: string;
  customer_id: string;
  order_status: OrderStatus;
  delivery_location: string;
  refinery_booking_number: string;
  delivery_order_no: string;
  delivery_order_file_url: string;
  due_date: string;
  items: OrderItemForm[];
};

const statuses: OrderStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'ADMIN_REVIEW',
  'CONFIRMED',
  'REFINERY_BOOKED',
  'WAITING_PAYMENT',
  'PAID',
  'PICKUP_READY',
  'DELIVERING',
  'COMPLETED',
  'CANCELLED',
];

const filterCustomerOptions = createFilterOptions<MasterCustomer>({
  stringify: (customer) => [customer.company_name, customer.tax_id, customer.phone].filter(Boolean).join(' '),
});

function calculateDueDate(creditDays: number): string {
  const dueDate = new Date();
  dueDate.setHours(12, 0, 0, 0);
  dueDate.setDate(dueDate.getDate() + Math.max(0, Math.trunc(Number(creditDays) || 0)));

  const year = dueDate.getFullYear();
  const month = String(dueDate.getMonth() + 1).padStart(2, '0');
  const day = String(dueDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const emptyItem: OrderItemForm = {
  refinery_id: '',
  depot_id: '',
  product_code: '',
  product_name: '',
  unit_price: 0,
  liters: 0,
};

const emptyForm: OrderForm = {
  customer_id: '',
  order_status: 'SUBMITTED',
  delivery_location: '',
  refinery_booking_number: '',
  delivery_order_no: '',
  delivery_order_file_url: '',
  due_date: '',
  payment_condition_id: '',
  refinery_summary: '',
  depot_summary: '',
  selected_refinery_id: '',
  selected_depot_id: '',
  items: [],
};

function statusColor(status: OrderStatus): 'default' | 'warning' | 'success' | 'error' | 'info' {
  if (['COMPLETED', 'PAID'].includes(status)) return 'success';
  if (status === 'CANCELLED') return 'error';
  if (['SUBMITTED', 'ADMIN_REVIEW', 'WAITING_PAYMENT'].includes(status)) return 'warning';
  return 'info';
}

function statusThai(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    DRAFT: 'ร่าง',
    SUBMITTED: 'ส่งคำสั่งซื้อ',
    ADMIN_REVIEW: 'รอตรวจสอบ',
    CONFIRMED: 'ยืนยันแล้ว',
    REFINERY_BOOKED: 'จองโรงกลั่นแล้ว',
    WAITING_PAYMENT: 'รอชำระเงิน',
    PAID: 'ชำระแล้ว',
    PICKUP_READY: 'พร้อมรับสินค้า',
    DELIVERING: 'กำลังจัดส่ง',
    COMPLETED: 'เสร็จสิ้น',
    CANCELLED: 'ยกเลิก',
  };
  return map[status] || status;
}

function money(v: number): string {
  return Number(v || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        p: { xs: 1.5, md: 2 },
        border: '1px solid',
        borderColor: '#e5e7eb',
        borderRadius: 3,
        bgcolor: '#fff',
        boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
      }}
    >
      <Stack spacing={0.3} sx={{ mb: 1.5 }}>
        <Typography fontWeight={900}>{title}</Typography>
        {subtitle ? (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
      </Stack>
      {children}
    </Box>
  );
}

export default function OrdersPage() {
  const [companyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<MasterCustomer[]>([]);
  const [refineries, setRefineries] = useState<MasterRefinery[]>([]);
  const [depots, setDepots] = useState<MasterDepot[]>([]);
  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [paymentConditions, setPaymentConditions] = useState<MasterPaymentCondition[]>([]);
  const [customerAccess, setCustomerAccess] = useState<CustomerAccess>(null);
  const [customerPriceOptions, setCustomerPriceOptions] = useState<CustomerPriceOption[]>([]);
  const [customerAccessLoading, setCustomerAccessLoading] = useState(false);
  const [customerAccessCustomerId, setCustomerAccessCustomerId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploadingDo, setUploadingDo] = useState(false);
  const [snack, setSnack] = useState<{
    open: boolean;
    message: string;
    severity: ActionSnackbarSeverity;
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showSnack = (message: string, severity: ActionSnackbarSeverity) => {
    setSnack({ open: true, message, severity });
  };

  const grandTotal = useMemo(
    () => form.items.reduce((sum, it) => sum + Number(it.unit_price || 0) * Number(it.liters || 0), 0),
    [form.items],
  );
  const subTotal = useMemo(() => grandTotal / 1.07, [grandTotal]);
  const vatAmount = useMemo(() => grandTotal - subTotal, [grandTotal, subTotal]);
  const totalLiters = useMemo(() => form.items.reduce((sum, it) => sum + Number(it.liters || 0), 0), [form.items]);
  const selectedDepotId = form.selected_depot_id;
  const selectedRefineryId = form.selected_refinery_id;

  const customerRefineries = useMemo(() => {
    if (!form.customer_id || customerAccessLoading || customerAccessCustomerId !== form.customer_id) return [];
    const allowed = customerAccess?.allowed_refinery_ids ?? [];
    if (!allowed.length) return refineries;

    const allowedSet = new Set(allowed.map(String));
    const existingIds = new Set(form.id ? form.items.map((item) => item.refinery_id).filter(Boolean) : []);
    return refineries.filter((refinery) => allowedSet.has(refinery.id) || existingIds.has(refinery.id));
  }, [refineries, customerAccess, customerAccessLoading, customerAccessCustomerId, form.customer_id, form.id, form.items]);

  const customerDepots = useMemo(() => {
    if (!form.customer_id || customerAccessLoading || customerAccessCustomerId !== form.customer_id) return [];
    const allowed = customerAccess?.allowed_depot_ids ?? [];
    if (!allowed.length) return depots;

    const allowedSet = new Set(allowed.map(String));
    const existingIds = new Set(form.id ? form.items.map((item) => item.depot_id).filter(Boolean) : []);
    return depots.filter((depot) => allowedSet.has(depot.id) || existingIds.has(depot.id));
  }, [depots, customerAccess, customerAccessLoading, customerAccessCustomerId, form.customer_id, form.id, form.items]);

  const filteredDepots = useMemo(
    () => customerDepots.filter((depot) => !selectedRefineryId || depot.refinery_id === selectedRefineryId),
    [customerDepots, selectedRefineryId],
  );

  const filteredPaymentConditions = useMemo(() => {
    if (form.customer_id && (customerAccessLoading || customerAccessCustomerId !== form.customer_id)) return [];
    const allowed = customerAccess?.allowed_payment_condition_ids ?? [];
    if (!allowed.length) return paymentConditions;
    const allowedSet = new Set(allowed.map((x) => String(x)));
    return paymentConditions.filter((pc) => allowedSet.has(pc.id));
  }, [paymentConditions, customerAccess, customerAccessLoading, customerAccessCustomerId, form.customer_id]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const d = searchDate.trim();
    return rows.filter((r) => {
      const customer = (r.customers?.company_name || '').toLowerCase();
      const status = statusThai(r.order_status).toLowerCase();
      const orderId = r.id.toLowerCase();
      const orderNo = String(r.order_no || '').toLowerCase();
      const delivery = (r.delivery_location || '').toLowerCase();
      const refinerySummary = String(r.refinery_summary || '').toLowerCase();
      const depotSummary = String(r.depot_summary || '').toLowerCase();
      const creditLabel = String(r.selected_credit_label || '').toLowerCase();
      const booking = (r.refinery_booking_number || '').toLowerCase();
      const doNo = String(r.delivery_order_no || '').toLowerCase();

      const okText =
        !q ||
        customer.includes(q) ||
        status.includes(q) ||
        orderId.includes(q) ||
        orderNo.includes(q) ||
        delivery.includes(q) ||
        refinerySummary.includes(q) ||
        depotSummary.includes(q) ||
        creditLabel.includes(q) ||
        booking.includes(q) ||
        doNo.includes(q);
      const okDate = !d || String(r.due_date || '').includes(d);
      return okText && okDate;
    });
  }, [rows, searchText, searchDate]);

  const pagedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const load = async (showFeedback = false) => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/orders?company_id=${companyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ');
      setRows(data);
      if (showFeedback) showSnack('รีเฟรชข้อมูลใบสั่งซื้อเรียบร้อยแล้ว', 'info');
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showSnack(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMasters = async () => {
    if (!companyId) return;
    const [r1, r2, r3, r4, r5] = await Promise.all([
      fetch(`/api/customers?company_id=${companyId}`),
      fetch(`/api/refineries?company_id=${companyId}`),
      fetch(`/api/depots?company_id=${companyId}`),
      fetch(`/api/oil-products?company_id=${companyId}`),
      fetch(`/api/payment-conditions?company_id=${companyId}`),
    ]);

    const [d1, d2, d3, d4, d5] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json(), r5.json()]);

    if (r1.ok) {
      setCustomers((d1 || []).map((x: any) => ({
        id: x.id,
        company_name: x.company_name,
        tax_id: x.tax_id,
        phone: x.phone,
        payment_condition_id: x.payment_condition_id,
      })));
    }
    if (r2.ok) setRefineries((d2 || []).map((x: any) => ({ id: x.id, name: x.name })));
    if (r3.ok) {
      setDepots((d3 || []).map((x: any) => ({
        id: x.id,
        code: x.code,
        name: x.name,
        refinery_id: x.refinery_id,
      })));
    }
    if (r4.ok) setProducts((d4 || []).map((x: any) => ({ code: x.code, name: x.name, is_active: Boolean(x.is_active) })));
    if (r5.ok) {
      setPaymentConditions(
        (d5 || []).map((x: any) => ({
          id: x.id,
          name: x.name,
          payment_type: x.payment_type,
          credit_days: Number(x.credit_days || 0),
          extra_cost_per_liter: Number(x.extra_cost_per_liter || 0),
        })),
      );
    }
  };

  useEffect(() => {
    void load();
    void loadMasters();
  }, [companyId]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!form.customer_id || !companyId) {
        setCustomerAccess(null);
        setCustomerPriceOptions([]);
        setCustomerAccessLoading(false);
        setCustomerAccessCustomerId('');
        return;
      }
      setCustomerAccess(null);
      setCustomerPriceOptions([]);
      setCustomerAccessLoading(true);
      setCustomerAccessCustomerId('');
      try {
        const params = new URLSearchParams({ company_id: companyId, customer_id: form.customer_id });
        const res = await fetch(`/api/orders/price-options?${params.toString()}`, { cache: 'no-store' });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(data.error || 'โหลดสิทธิ์และราคาของลูกค้าไม่สำเร็จ');
        setCustomerAccess(data.access || null);
        setCustomerPriceOptions((data.price_options || []).map((option: any) => ({
          refinery_id: option.refinery_id || null,
          depot_id: String(option.depot_id || ''),
          product_code: String(option.product_code || ''),
          product_name: String(option.product_name || ''),
          base_cost_price: Number(option.base_cost_price || 0),
        })));
        setCustomerAccessCustomerId(form.customer_id);
      } catch (caughtError) {
        if (active) {
          setCustomerAccess(null);
          setCustomerPriceOptions([]);
          setCustomerAccessCustomerId('');
          setError((caughtError as Error).message);
        }
      } finally {
        if (active) setCustomerAccessLoading(false);
      }
    };
    void run();

    return () => {
      active = false;
    };
  }, [form.customer_id, companyId]);

  const buildPricedItems = useCallback((
    currentItems: OrderItemForm[],
    depotId: string,
    paymentConditionId: string,
    preserveLiters: boolean,
  ): OrderItemForm[] => {
    const depot = depots.find((item) => item.id === depotId);
    const paymentCondition = paymentConditions.find((condition) => condition.id === paymentConditionId);
    const extraCost = Number(paymentCondition?.extra_cost_per_liter || 0);
    const bestPriceByProduct = new Map<string, CustomerPriceOption>();

    for (const option of customerPriceOptions) {
      if (option.depot_id !== depotId || option.base_cost_price <= 0) continue;
      const key = `${option.product_code}__${option.product_name}`;
      const current = bestPriceByProduct.get(key);
      if (!current || option.base_cost_price < current.base_cost_price) bestPriceByProduct.set(key, option);
    }

    const litersByProduct = new Map(
      currentItems.map((item) => [`${item.product_code}__${item.product_name}`, Number(item.liters || 0)]),
    );

    return [...bestPriceByProduct.values()]
      .sort((a, b) => a.product_code.localeCompare(b.product_code))
      .map((option) => ({
        refinery_id: option.refinery_id || depot?.refinery_id || '',
        depot_id: depotId,
        product_code: option.product_code,
        product_name: option.product_name,
        unit_price: Number((option.base_cost_price * 1.07 + extraCost).toFixed(2)),
        liters: preserveLiters
          ? litersByProduct.get(`${option.product_code}__${option.product_name}`) || 0
          : 0,
      }));
  }, [customerPriceOptions, depots, paymentConditions]);

  useEffect(() => {
    if (!filteredPaymentConditions.length) return;
    setForm((prev) => {
      if (!prev.customer_id || prev.id) return prev;

      const customerDefaultPaymentId = customers.find((customer) => customer.id === prev.customer_id)?.payment_condition_id;
      const currentCondition = filteredPaymentConditions.find((condition) => condition.id === prev.payment_condition_id);
      const customerDefaultCondition = filteredPaymentConditions.find((condition) => condition.id === customerDefaultPaymentId);
      const nextCondition = currentCondition ?? customerDefaultCondition ?? filteredPaymentConditions[0];
      const paymentChanged = nextCondition.id !== prev.payment_condition_id;
      const dueDate = paymentChanged || !prev.due_date
        ? calculateDueDate(nextCondition.credit_days)
        : prev.due_date;
      const items = paymentChanged && prev.selected_depot_id
        ? buildPricedItems(prev.items, prev.selected_depot_id, nextCondition.id, true)
        : prev.items;

      if (!paymentChanged && dueDate === prev.due_date && items === prev.items) return prev;
      return { ...prev, payment_condition_id: nextCondition.id, due_date: dueDate, items };
    });
  }, [filteredPaymentConditions, customers, form.customer_id, buildPricedItems]);

  const selectPaymentCondition = (paymentConditionId: string) => {
    const paymentCondition = filteredPaymentConditions.find((condition) => condition.id === paymentConditionId);
    setForm((prev) => ({
      ...prev,
      payment_condition_id: paymentConditionId,
      due_date: !prev.id && paymentCondition ? calculateDueDate(paymentCondition.credit_days) : prev.due_date,
      items: prev.selected_depot_id
        ? buildPricedItems(prev.items, prev.selected_depot_id, paymentConditionId, true)
        : prev.items,
    }));
  };

  const selectRefinery = (refinery: MasterRefinery | null) => {
    setForm((prev) => ({
      ...prev,
      refinery_summary: refinery?.name ?? '',
      depot_summary: '',
      selected_refinery_id: refinery?.id ?? '',
      selected_depot_id: '',
      items: [],
    }));
  };

  const selectDepot = (depot: MasterDepot | null) => {
    const refinery = refineries.find((item) => item.id === depot?.refinery_id);
    setForm((prev) => {
      const previousDepotId = prev.selected_depot_id;
      return {
        ...prev,
        refinery_summary: refinery?.name ?? prev.refinery_summary,
        depot_summary: depot ? `${depot.code} - ${depot.name}` : '',
        selected_refinery_id: depot?.refinery_id || prev.selected_refinery_id,
        selected_depot_id: depot?.id || '',
        items: depot && prev.payment_condition_id
          ? buildPricedItems(prev.items, depot.id, prev.payment_condition_id || '', previousDepotId === depot.id)
          : [],
      };
    });
  };

  const save = async () => {
    const cleanedItems = form.items
      .filter((it) => it.product_code && it.liters > 0)
      .map((it) => ({
        refinery_id: it.refinery_id || null,
        depot_id: it.depot_id || null,
        product_code: it.product_code,
        product_name: it.product_name,
        unit_price: Number(it.unit_price || 0),
        liters: Number(it.liters || 0),
      }));

    if (!cleanedItems.length) {
      const message = 'กรุณาระบุรายการน้ำมันและจำนวนลิตรอย่างน้อย 1 รายการ';
      setError(message);
      showSnack(message, 'warning');
      return;
    }

    const payload = {
      company_id: companyId,
      customer_id: form.customer_id,
      order_status: form.order_status,
      delivery_location: form.delivery_location || null,
      refinery_booking_number: form.refinery_booking_number || null,
      delivery_order_no: form.delivery_order_no || null,
      delivery_order_file_url: form.delivery_order_file_url || null,
      payment_condition_id: form.payment_condition_id || null,
      due_date: form.due_date || null,
      items: cleanedItems,
    };

    const wasEditing = Boolean(form.id);
    try {
      const res = await fetch(form.id ? `/api/orders/${form.id}` : '/api/orders', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      const lineWarning = data.line_warning ? String(data.line_warning) : '';
      setOpen(false);
      setForm(emptyForm);
      await load();
      if (lineWarning) {
        setError(lineWarning);
        showSnack(lineWarning, 'warning');
      } else {
        showSnack(wasEditing ? 'แก้ไขใบสั่งซื้อเรียบร้อยแล้ว' : 'เพิ่มใบสั่งซื้อเรียบร้อยแล้ว', 'success');
      }
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showSnack(message, 'error');
    }
  };

  const openEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/orders/${id}?company_id=${companyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดข้อมูลใบสั่งซื้อไม่สำเร็จ');

      setForm({
      id: data.id,
      order_no: data.order_no || '',
      payment_condition_id: data.payment_condition_id || '',
      selected_refinery_id: String(data.sale_order_items?.find((it: any) => it.refinery_id)?.refinery_id || ''),
      selected_depot_id: String(data.sale_order_items?.find((it: any) => it.depot_id)?.depot_id || ''),
      refinery_summary: Array.from(
        new Set((data.sale_order_items || []).map((it: any) => String(it.refineries?.name || '').trim()).filter(Boolean)),
      ).join(', '),
      depot_summary: Array.from(
        new Set(
          (data.sale_order_items || [])
            .map((it: any) => (it.depots?.code ? `${it.depots.code}${it.depots?.name ? ` - ${it.depots.name}` : ''}` : ''))
            .filter(Boolean),
        ),
      ).join(', '),
      customer_id: data.customer_id,
      order_status: data.order_status,
      delivery_location: data.delivery_location || '',
      refinery_booking_number: data.refinery_booking_number || '',
      delivery_order_no: data.delivery_order_no || '',
      delivery_order_file_url: data.delivery_order_file_url || '',
      due_date: data.due_date || '',
      items: (data.sale_order_items || []).map((it: any) => ({
        refinery_id: it.refinery_id || '',
        depot_id: it.depot_id || '',
        product_code: it.product_code || '',
        product_name: it.product_name || '',
        unit_price: Number(it.unit_price || 0),
        liters: Number(it.liters || 0),
      })),
      });

      setOpen(true);
      showSnack('โหลดใบสั่งซื้อสำหรับแก้ไขเรียบร้อยแล้ว', 'info');
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showSnack(message, 'error');
    }
  };

  const patchOrderQuick = async (patch: Record<string, unknown>) => {
    if (!form.id) return;
    const actionLabel = patch.order_status === 'CONFIRMED'
      ? 'กำลังส่งอนุมัติ...'
      : patch.order_status === 'PAID'
        ? 'กำลังบันทึกการชำระเงิน...'
        : 'กำลังส่งข้อมูล...';
    setSnack({ open: true, message: actionLabel, severity: 'info' });

    const res = await fetch(`/api/orders/${form.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'อัปเดตคำสั่งซื้อไม่สำเร็จ');
      setSnack({ open: true, message: data.error || 'อัปเดตคำสั่งซื้อไม่สำเร็จ', severity: 'error' });
      return;
    }
    if (data.line_warning) {
      setError(String(data.line_warning));
      setSnack({ open: true, message: String(data.line_warning), severity: 'warning' });
    } else {
      const doneLabel = patch.order_status === 'CONFIRMED'
        ? 'อนุมัติคำสั่งซื้อเรียบร้อย'
        : patch.order_status === 'PAID'
          ? 'บันทึกการชำระเงินเรียบร้อย'
          : 'อัปเดตข้อมูลเรียบร้อย';
      setSnack({ open: true, message: doneLabel, severity: 'success' });
    }
    await load();
    await openEdit(form.id);
  };

  const onUploadDoFile = async (file: File) => {
    if (!file) return;
    setUploadingDo(true);
    setSnack({ open: true, message: 'กำลังอัปโหลดเอกสาร DO...', severity: 'info' });
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('company_id', companyId);
      if (form.id) fd.append('order_id', form.id);

      const res = await fetch('/api/orders/upload-do', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'อัปโหลดไฟล์ DO ไม่สำเร็จ');
        setSnack({ open: true, message: data.error || 'อัปโหลดไฟล์ DO ไม่สำเร็จ', severity: 'error' });
        return;
      }

      setForm((p) => ({ ...p, delivery_order_file_url: String(data.url || '') }));
      setSnack({ open: true, message: 'อัปโหลดไฟล์ DO สำเร็จ', severity: 'success' });
    } finally {
      setUploadingDo(false);
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/orders/${deleteId}?company_id=${companyId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
      setDeleteId(null);
      await load();
      showSnack('ลบใบสั่งซื้อเรียบร้อยแล้ว', 'success');
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showSnack(message, 'error');
    }
  };

  const updateItem = (idx: number, patch: Partial<OrderItemForm>) => {
    setForm((prev) => {
      const next = [...prev.items];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, items: next };
    });
  };

  return (
    <Stack spacing={2.2} sx={{ p: { xs: 1.5, md: 2.5 }, bgcolor: '#f8fafc', minHeight: '100%' }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          borderRadius: 1,
          border: '1px solid',
          borderColor: '#e5e7eb',
          bgcolor: '#fff',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5}>
          <Box>
            <Typography variant="h5" fontWeight={900}>
              ใบสั่งซื้อ
            </Typography>
            <Typography variant="body2" color="text.secondary">
              จัดการคำสั่งซื้อ ตรวจสอบเครดิต แนบ DO และติดตามสถานะ
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => {
              setForm(emptyForm);
              setOpen(true);
              showSnack('พร้อมเพิ่มใบสั่งซื้อใหม่', 'info');
            }}
            sx={{ borderRadius: 2, minHeight: 40, width: { xs: '100%', md: 'auto' } }}
          >
            เพิ่มใบสั่งซื้อ
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} sx={{ mt: 2 }} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            size="small"
            label="ค้นหา"
            placeholder="ลูกค้า, สถานะ, เลขออเดอร์, เลขจอง, DO"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setPage(0);
            }}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            label="วันที่กำหนดชำระ"
            placeholder="YYYY-MM-DD"
            value={searchDate}
            onChange={(e) => {
              setSearchDate(e.target.value);
              setPage(0);
            }}
            sx={{ width: { xs: '100%', md: 220 } }}
          />
          <Button variant="outlined" onClick={() => void load(true)} sx={{ borderRadius: 1, width: { xs: '100%', md: 'auto' } }}>
            รีเฟรช
          </Button>
        </Stack>
      </Paper>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {loading ? <Alert severity="info">กำลังโหลด...</Alert> : null}

      <TableContainer
        component={Paper}
        sx={{
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 10px 28px rgba(15,23,42,0.06)',
          maxHeight: { xs: 'calc(100vh - 300px)', md: 'calc(100vh - 240px)' },
          overflowX: 'auto',
        }}
      >
        <Table size="small" stickyHeader sx={{ minWidth: { xs: 860, md: 1180, lg: 1320 } }}>
          <TableHead>
            <TableRow
              sx={{
                '& th': {
                  bgcolor: '#f8fafc',
                  fontWeight: 900,
                  color: '#334155',
                  whiteSpace: 'nowrap',
                },
              }}
            >
              {/*  <TableCell sx={{ minWidth: 90 }}>Order ID</TableCell> */}
              <TableCell sx={{ minWidth: 140 }}>เลขคำสั่งซื้อ</TableCell>
              <TableCell>ลูกค้า</TableCell>
              {/*     <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>โรงกลั่น</TableCell> */}
              <TableCell sx={{ minWidth: 140 }}>คลังรับน้ำมัน</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>เครดิต</TableCell>
              <TableCell align="right">ลิตร</TableCell>
              <TableCell align="right">ยอดรวม</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>กำหนดชำระ</TableCell>
              <TableCell>สถานะ</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>เลขจอง</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>DO</TableCell>
              <TableCell align="right" sx={{ width: 88, minWidth: 88 }}>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.map((r) => (
              <TableRow
                key={r.id}
                hover
                sx={{
                  '& td': {
                    whiteSpace: 'nowrap',
                    borderColor: '#f1f5f9',
                  },
                }}
              >
                {/*    <TableCell>{r.id.slice(0, 8)}</TableCell> */}
                <TableCell sx={{ fontWeight: 800 }}>{r.order_no || '-'}</TableCell>
                <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customers?.company_name || r.customer_id}</TableCell>
                {/*  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.refinery_summary || '-'}</TableCell> */}
                <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.depot_summary || '-'} ({r.refinery_summary || '-'})</TableCell>
                <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.selected_credit_label || '-'}</TableCell>
                <TableCell align="right">{Number(r.total_liters || 0).toLocaleString('th-TH')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>
                  {money(Number(r.total_amount || 0))}
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{r.due_date || '-'}</TableCell>
                <TableCell>
                  <Chip size="small" label={statusThai(r.order_status)} color={statusColor(r.order_status)} />
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{r.refinery_booking_number || '-'}</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{r.delivery_order_no || '-'}</TableCell>
                <TableCell align="right" sx={{ width: 88, minWidth: 88 }}>
                  <Tooltip title="แก้ไข">
                    <IconButton size="small" onClick={() => void openEdit(r.id)}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="ลบ">
                    <IconButton size="small" color="error" onClick={() => { setDeleteId(r.id); showSnack('กรุณายืนยันการลบใบสั่งซื้อ', 'warning'); }}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!filteredRows.length && !loading ? (
              <TableRow>
                <TableCell colSpan={13} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                  ไม่มีข้อมูลใบสั่งซื้อ
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper elevation={0} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
        <TablePagination
          component="div"
          count={filteredRows.length}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 15, 20, 25, 50]}
          labelRowsPerPage="แถวต่อหน้า"
        />
      </Paper>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: '96vw', lg: 1180 }, bgcolor: '#f8fafc' } }}
      >
        <Stack sx={{ minHeight: '100%' }}>
          <Box
            sx={{
              position: 'sticky',
              top:10,
              zIndex: 110,
              bgcolor: '#fff',
              borderBottom: '1px solid #e5e7eb',
              px: { xs: 2, md: 3 },
              py: 2,
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
              <Box>
                <Typography variant="h6" fontWeight={900}>
                  {form.id ? 'แก้ไขใบสั่งซื้อ' : 'เพิ่มใบสั่งซื้อ'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {form.order_no ? `เลขคำสั่งซื้อ: ${form.order_no}` : 'สร้างคำสั่งซื้อใหม่'}
                </Typography>
              </Box>
              <Chip size="small" label={statusThai(form.order_status)} color={statusColor(form.order_status)} />
            </Stack>
          </Box>

          <Stack spacing={2} sx={{ p: { xs: 2, md: 3 } }}>

            <Card sx={{
              borderRadius: 1, border: '1px solid',
              borderColor: '#e5e7eb',
           
              bgcolor: '#fff',
              boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
              p: 2, 
              
            }} >
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <Autocomplete
                    size="small"
                    options={customers}
                    value={customers.find((customer) => customer.id === form.customer_id) ?? null}
                    onChange={(_, customer) => {
                      const customerId = customer?.id ?? '';
                      if (customerId === form.customer_id) return;
                      setCustomerAccess(null);
                      setCustomerPriceOptions([]);
                      setCustomerAccessLoading(Boolean(customer));
                      setCustomerAccessCustomerId('');
                      setForm((previous) => ({
                        ...previous,
                        customer_id: customerId,
                        payment_condition_id: previous.id ? previous.payment_condition_id : '',
                        due_date: previous.id ? previous.due_date : '',
                        refinery_summary: previous.id ? previous.refinery_summary : '',
                        depot_summary: previous.id ? previous.depot_summary : '',
                        selected_refinery_id: previous.id ? previous.selected_refinery_id : '',
                        selected_depot_id: previous.id ? previous.selected_depot_id : '',
                        items: previous.id
                          ? previous.items
                          : [],
                      }));
                    }}
                    getOptionLabel={(customer) => customer.company_name || customer.id}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    filterOptions={filterCustomerOptions}
                    noOptionsText="ไม่พบลูกค้า"
                    autoHighlight
                    openOnFocus
                    fullWidth
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="ลูกค้า"
                        placeholder="ค้นหาชื่อ เลขผู้เสียภาษี หรือเบอร์โทร"
                      />
                    )}
                  />
                  <TextField
                    size="small"
                    select
                    label="สถานะออเดอร์"
                    value={form.order_status}
                    onChange={(e) => setForm((p) => ({ ...p, order_status: e.target.value as OrderStatus }))}
                    fullWidth
                  >
                    {statuses.map((status) => (
                      <MenuItem key={status} value={status}>
                        {statusThai(status)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    size="small"
                    label="กำหนดชำระ"
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <TextField
                    size="small"
                    label="ตั๋วโรงกลั่น"
                    value={form.refinery_booking_number}
                    onChange={(e) => setForm((p) => ({ ...p, refinery_booking_number: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    label="DO (Delivery Order)"
                    value={form.delivery_order_no}
                    onChange={(e) => setForm((p) => ({ ...p, delivery_order_no: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    label="สถานที่ส่ง"
                    value={form.delivery_location}
                    onChange={(e) => setForm((p) => ({ ...p, delivery_location: e.target.value }))}
                    fullWidth
                  />
                </Stack>
              </Stack>
            </Card>

            <Card sx={{
              borderRadius: 1, border: '1px solid',
              borderColor: '#e5e7eb',

              bgcolor: '#fff',
              boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
              p: 2
            }} >
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <Autocomplete
                    size="small"
                    options={customerRefineries}
                    value={refineries.find((refinery) => refinery.id === selectedRefineryId) ?? null}
                    onChange={(_, refinery) => selectRefinery(refinery)}
                    getOptionLabel={(refinery) => refinery.name || refinery.id}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    noOptionsText={form.customer_id ? 'ไม่พบโรงกลั่นตามสิทธิ์ลูกค้า' : 'กรุณาเลือกลูกค้าก่อน'}
                    loading={customerAccessLoading}
                    loadingText="กำลังโหลดสิทธิ์ลูกค้า..."
                    disabled={!form.customer_id || customerAccessLoading}
                    autoHighlight
                    openOnFocus
                    fullWidth
                    renderInput={(params) => (
                      <TextField {...params} label="โรงกลั่น" placeholder="ค้นหาโรงกลั่น" />
                    )}
                  />
                  <Autocomplete
                    size="small"
                    options={filteredDepots}
                    value={depots.find((depot) => depot.id === selectedDepotId) ?? null}
                    onChange={(_, depot) => selectDepot(depot)}
                    getOptionLabel={(depot) => `${depot.code} - ${depot.name}`}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    noOptionsText={selectedRefineryId ? 'ไม่พบคลังตามสิทธิ์ลูกค้า' : 'กรุณาเลือกโรงกลั่นก่อน'}
                    loading={customerAccessLoading}
                    loadingText="กำลังโหลดสิทธิ์ลูกค้า..."
                    disabled={!form.customer_id || !selectedRefineryId || customerAccessLoading}
                    autoHighlight
                    openOnFocus
                    fullWidth
                    renderInput={(params) => (
                      <TextField {...params} label="คลัง" placeholder="ค้นหารหัสหรือชื่อคลัง" />
                    )}
                  />
                </Stack>
                <FormControl fullWidth>
                  <FormLabel sx={{ color: '#334155', fontWeight: 800, mb: 0.7 }}>เครดิตที่เลือก</FormLabel>
                  <RadioGroup
                    row
                    value={form.payment_condition_id || ''}
                    onChange={(e) => selectPaymentCondition(e.target.value)}
                    sx={{ gap: 0.8, flexWrap: 'wrap' }}
                  >
                    {filteredPaymentConditions.map((pc) => (
                      <FormControlLabel
                        key={pc.id}
                        value={pc.id}
                        control={<Radio size="small" />}
                        label={`${pc.name} (${pc.payment_type}${pc.credit_days ? ` ${pc.credit_days} วัน` : ''})`}
                        sx={{
                          m: 0,
                          px: 1,
                          py: 0.3,
                          border: '1px solid',
                          borderColor: form.payment_condition_id === pc.id ? '#bfdbfe' : '#e5e7eb',
                          borderRadius: 999,
                          bgcolor: form.payment_condition_id === pc.id ? '#eff6ff' : '#fff',
                          '& .MuiFormControlLabel-label': {
                            fontSize: 12.5,
                            color: '#334155',
                            fontWeight: form.payment_condition_id === pc.id ? 800 : 500,
                          },
                          '& .MuiRadio-root': { p: 0.4, color: '#94a3b8' },
                          '& .Mui-checked': { color: '#2563eb' },
                        }}
                      />
                    ))}
                  </RadioGroup>
                  {!filteredPaymentConditions.length ? (
                    <Typography sx={{ mt: 0.5, fontSize: 12, color: '#64748b' }}>
                      ลูกค้ารายนี้ยังไม่มีสิทธิ์เครดิตเทอม
                    </Typography>
                  ) : null}
                </FormControl>
              </Stack>
            </Card>

            <Card sx={{
              borderRadius: 1, border: '1px solid',
              borderColor: '#e5e7eb',

              bgcolor: '#fff',
              boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
              p: 2
            }} >
              <Stack spacing={1.2} direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }}>
                <Button component="label" variant="outlined" disabled={uploadingDo} sx={{ borderRadius: 2, minWidth: 130 }}>
                  {uploadingDo ? 'กำลังอัปโหลด...' : 'แนบไฟล์ DO'}
                  <input
                    hidden
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void onUploadDoFile(file);
                    }}
                  />
                </Button>
                <TextField
                  size="small"
                  label="ลิงก์/ไฟล์แนบ DO"
                  value={form.delivery_order_file_url}
                  onChange={(e) => setForm((p) => ({ ...p, delivery_order_file_url: e.target.value }))}
                  sx={{ flex: 1 }}
                />
                <Button
                  variant="contained"
                  color="info"
                  onClick={() =>
                    void patchOrderQuick({
                      delivery_order_no: form.delivery_order_no || null,
                      delivery_order_file_url: form.delivery_order_file_url || null,
                    })
                  }
                  disabled={!form.id || (!form.delivery_order_no && !form.delivery_order_file_url)}
                  sx={{ borderRadius: 2 }}
                >
                  ส่ง DO
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => void patchOrderQuick({ order_status: 'CONFIRMED', payment_condition_id: form.payment_condition_id || null })}
                  disabled={!form.id}
                  sx={{ borderRadius: 1 }}
                >
                  อนุมัติ
                </Button>
                <Button
                  variant="contained"
                  color="warning"
                  onClick={() => void patchOrderQuick({ order_status: 'PAID', payment_condition_id: form.payment_condition_id || null })}
                  disabled={!form.id}
                  sx={{ borderRadius: 1 }}
                >
                  ชำระเงิน
                </Button>
              </Stack>
            </Card>

            <Card sx={{
              borderRadius: 1, border: '1px solid',
              borderColor: '#e5e7eb',

              bgcolor: '#fff',
              boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
              p: 2
            }} >
              <TableContainer
                sx={{
                  border: '1px solid',
                  borderColor: '#e2e8f0',
                  borderRadius: 1.5,
                  maxHeight: 420,
                }}
              >
                <Table size="small" stickyHeader sx={{ minWidth: 680 }}>
                  <TableHead>
                    <TableRow sx={{ '& th': { bgcolor: '#f8fafc', color: '#334155', fontWeight: 900, whiteSpace: 'nowrap' } }}>
                      <TableCell>รหัสน้ำมัน</TableCell>
                      <TableCell align="right">ราคาขาย/ลิตร (รวม VAT)</TableCell>
                      <TableCell align="right">จำนวนที่ซื้อ</TableCell>
                      <TableCell align="right">รวม (รวม VAT)</TableCell>
                      <TableCell align="right">จัดการ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {form.items.map((it, idx) => (
                      <TableRow key={`item-${idx}`} sx={{ '& td': { borderColor: '#f1f5f9' } }}>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            value={it.product_code}
                            onChange={(e) => {
                              const p = products.find((x) => x.code === e.target.value);
                              const priceOption = customerPriceOptions
                                .filter((option) => option.depot_id === selectedDepotId && option.product_code === e.target.value)
                                .reduce<CustomerPriceOption | null>(
                                  (best, option) => !best || option.base_cost_price < best.base_cost_price ? option : best,
                                  null,
                                );
                              const paymentCondition = paymentConditions.find(
                                (condition) => condition.id === form.payment_condition_id,
                              );
                              const unitPrice = priceOption
                                ? priceOption.base_cost_price * 1.07 + Number(paymentCondition?.extra_cost_per_liter || 0)
                                : 0;
                              updateItem(idx, {
                                refinery_id: priceOption?.refinery_id || it.refinery_id,
                                depot_id: selectedDepotId || it.depot_id,
                                product_code: e.target.value,
                                product_name: p?.name || priceOption?.product_name || '',
                                unit_price: Number(unitPrice.toFixed(2)),
                              });
                            }}
                            sx={{ minWidth: 190 }}
                          >
                            {products
                              .filter((p) => p.is_active && (
                                p.code === it.product_code
                                || customerPriceOptions.some(
                                  (option) => option.depot_id === selectedDepotId && option.product_code === p.code,
                                )
                              ))
                              .map((p) => (
                                <MenuItem key={p.code} value={p.code}>
                                  {p.code} - {p.name}
                                </MenuItem>
                              ))}
                          </TextField>
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            type="number"
                            value={it.unit_price}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value || 0) })}
                            sx={{ width: 140 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            type="number"
                            value={it.liters}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateItem(idx, { liters: Number(e.target.value || 0) })}
                            sx={{ width: 140 }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>
                          {money(Number(it.unit_price || 0) * Number(it.liters || 0))}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            color="error"
                            onClick={() => {
                              setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
                              showSnack(`ลบรายการน้ำมันที่ ${idx + 1} แล้ว`, 'warning');
                            }}
                            disabled={form.items.length <= 1}
                          >
                            <Remove fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!form.items.length ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          {selectedDepotId
                            ? form.payment_condition_id
                              ? 'ไม่พบรายการน้ำมันที่มีราคาปัจจุบันสำหรับคลังและสิทธิ์ของลูกค้ารายนี้'
                              : 'กรุณาเลือกเครดิต เพื่อแสดงรายการน้ำมันพร้อมราคา'
                            : 'กรุณาเลือกโรงกลั่นและคลัง เพื่อแสดงรายการน้ำมันพร้อมราคา'}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </TableContainer>

              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={() => {
                  setForm((p) => {
                    return {
                      ...p,
                      items: [
                        ...p.items,
                        {
                          ...emptyItem,
                          refinery_id: p.selected_refinery_id,
                          depot_id: p.selected_depot_id,
                        },
                      ],
                    };
                  });
                  showSnack('เพิ่มรายการน้ำมันแล้ว', 'info');
                }}
                disabled={!selectedDepotId || !form.payment_condition_id}
                sx={{ mt: 1.5, borderRadius: 1 }}
              >
                เพิ่มรายการน้ำมัน
              </Button>
            </Card>

            <SectionCard title="สรุปท้ายบิล">
              <Box sx={{ ml: 'auto', width: { xs: '100%', md: 420 } }}>
                <Stack spacing={0.8}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography color="text.secondary">รวมปริมาณ</Typography>
                    <Typography>{money(totalLiters)} ลิตร</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography color="text.secondary">ยอดก่อน VAT</Typography>
                    <Typography>{money(subTotal)} บาท</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography color="text.secondary">VAT 7%</Typography>
                    <Typography>{money(vatAmount)} บาท</Typography>
                  </Stack>
                  <Divider />
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography fontWeight={900}>ยอดรวมสุทธิ (รวม VAT)</Typography>
                    <Typography fontWeight={900} fontSize={22}>
                      {money(grandTotal)} บาท
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
            </SectionCard>
          </Stack>

          <Box
            sx={{
              mt: 'auto',
              position: 'sticky',
              bottom: 0,
              zIndex: 4,
              bgcolor: '#fff',
              borderTop: '1px solid #e5e7eb',
              p: 2,
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
              <Button variant="outlined" onClick={() => setOpen(false)} sx={{ borderRadius: 2 }}>
                ยกเลิก
              </Button>
              <Button variant="contained" onClick={() => void save()} disabled={!form.customer_id || !form.items.length} sx={{ borderRadius: 2 }}>
                บันทึกใบสั่งซื้อ
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบใบสั่งซื้อนี้ใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color="error" onClick={() => void remove()}>
            ลบ
          </Button>
        </DialogActions>
      </Dialog>

      <ActionSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </Stack>
  );
}
