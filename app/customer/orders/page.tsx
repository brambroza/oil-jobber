'use client';

import { useEffect, useMemo, useState } from 'react';
import Add from '@mui/icons-material/Add';
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import LocalShipping from '@mui/icons-material/LocalShipping';
import DirectionsCar from '@mui/icons-material/DirectionsCar';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
  FormControl,
  FormControlLabel,
  FormLabel,
} from '@mui/material';
import Link from 'next/link';
import CustomerShell from '@/components/layout/CustomerShell';

type OrderRow = {
  id: string;
  order_no?: string | null;
  order_status: string;
  requested_delivery_date: string | null;
  customer_po_no: string | null;
  receive_method: string | null;
  delivery_order_no?: string | null;
  delivery_order_file_url?: string | null;
  created_at: string;
  total_liters: number;
  total_amount: number;
};

type PriceHome = {
  rounds: Array<{ id: string; refinery_id: string | null; refineries?: { name?: string } | null }>;
  allowedPaymentConditions?: Array<{
    id: string;
    code: string;
    name: string;
    payment_type: string;
    credit_days: number;
    extra_cost_per_liter?: number;
  }>;
  items: Array<{
    oil_base_price_id: string;
    depot_id?: string | null;
    product_code: string;
    product_name: string;
    base_cost_price: number;
    depots?: { id?: string; code?: string; name?: string } | null;
  }>;
};

type ProductChoice = {
  key: string;
  product_code: string;
  product_name: string;
  refinery_id: string | null;
  depot_id: string | null;
  unit_price: number;
};

type FormItem = ProductChoice & { selected: boolean; liters: number };
type DepotChoice = {
  depot_id: string | null;
  depot_label: string;
  refinery_id: string | null;
  refinery_name: string;
  unit_price: number;
};

type FormState = {
  id?: string;
  requested_delivery_date: string;
  customer_po_no: string;
  delivery_note: string;
  receive_method: string;
  delivery_location: string;
  customer_vehicle_id: string;
  vehicle_license_plate: string;
  vehicle_driver_name: string;
  vehicle_driver_phone: string;
  vehicle_pickup_license_number: string;
  payment_condition_id: string;
  order_no: string;
  selected_depot_id: string;
  items: FormItem[];
};

type CustomerVehicle = {
  id: string;
  license_plate: string;
  driver_name: string | null;
  driver_phone: string | null;
  pickup_license_number: string | null;
};

type DepotOption = {
  depot_id: string;
  depot_label: string;
  refinery_id: string | null;
  refinery_name: string;
};

type PaymentOption = {
  id: string;
  code: string;
  name: string;
  payment_type: string;
  credit_days: number;
  extra_cost_per_liter?: number;
};

const receiveMethods = [
  { code: 'DELIVER_BY_TRUCK', label: 'จัดส่งให้ทางรถ', icon: <LocalShipping /> },
  { code: 'PICKUP_BY_TRUCK', label: 'รับเองทางรถ', icon: <DirectionsCar /> },
  /*   { code: 'PICKUP_BY_BARGE', label: 'รับเองทางเรือ', icon: <Sailing /> },
    { code: 'ARRANGE_TRANSPORT', label: 'จัดหาเรือเองให้', icon: <SupportAgent /> }, */
];

function money(v: number) {
  return Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function receiveMethodThai(code?: string | null): string {
  const map: Record<string, string> = {
    DELIVER_BY_TRUCK: 'จัดส่งให้ทางรถ',
    PICKUP_BY_TRUCK: 'รับเองทางรถ',
    PICKUP_BY_BARGE: 'รับเองทางเรือ',
    ARRANGE_TRANSPORT: 'จัดหาเรือเองให้',
  };
  if (!code) return '-';
  return map[code] || code;
}

function orderStatusThai(status?: string | null): string {
  const map: Record<string, string> = {
    DRAFT: 'แบบร่าง',
    SUBMITTED: 'ส่งสั่งซื้อแล้ว',
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
  if (!status) return '-';
  return map[status] || status;
}

function paymentExtraById(paymentOptions: PaymentOption[], paymentConditionId: string): number {
  const selected = paymentOptions.find((p) => p.id === paymentConditionId);
  return Number(selected?.extra_cost_per_liter || 0);
}

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState<number | 'all'>(15);
  const [choices, setChoices] = useState<ProductChoice[]>([]);
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [depotChoicesByProduct, setDepotChoicesByProduct] = useState<Record<string, DepotChoice[]>>({});
  const [depotOptions, setDepotOptions] = useState<DepotOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [form, setForm] = useState<FormState>({
    requested_delivery_date: new Date().toISOString().slice(0, 10),
    customer_po_no: '',
    order_no: '',
    delivery_note: '',
    receive_method: 'DELIVER_BY_TRUCK',
    delivery_location: '',
    customer_vehicle_id: '',
    vehicle_license_plate: '',
    vehicle_driver_name: '',
    vehicle_driver_phone: '',
    vehicle_pickup_license_number: '',
    payment_condition_id: '',
    selected_depot_id: '',
    items: [],
  });

  const selectedCount = useMemo(() => form.items.filter((x) => x.selected && x.liters > 0).length, [form.items]);
  const totalLiters = useMemo(() => form.items.filter((x) => x.selected).reduce((s, x) => s + Number(x.liters || 0), 0), [form.items]);
  const totalAmount = useMemo(
    () => form.items.filter((x) => x.selected).reduce((s, x) => s + Number(x.liters || 0) * Number(x.unit_price || 0), 0),
    [form.items],
  );
  const selectedDepotRefinery = useMemo(() => {
    if (!form.selected_depot_id) return null;
    return depotOptions.find((d) => d.depot_id === form.selected_depot_id) || null;
  }, [depotOptions, form.selected_depot_id]);
  const visibleItemEntries = useMemo(() => {
    if (!form.selected_depot_id) return [] as Array<{ idx: number; item: FormItem }>;
    return form.items
      .map((item, idx) => ({ idx, item }))
      .filter(({ item }) => (depotChoicesByProduct[item.key] || []).some((d) => (d.depot_id || '') === form.selected_depot_id));
  }, [form.items, form.selected_depot_id, depotChoicesByProduct]);
  const pagedOrders = useMemo(() => {
    if (rowsPerPage === 'all') return orders;
    const start = page * rowsPerPage;
    return orders.slice(start, start + rowsPerPage);
  }, [orders, page, rowsPerPage]);

  const recalcItemsByDepotAndPayment = (
    items: FormItem[],
    selectedDepotId: string,
    paymentConditionId: string,
  ): FormItem[] => {
    const extra = paymentExtraById(paymentOptions, paymentConditionId);
    return items.map((it) => {
      const depotOpt = (depotChoicesByProduct[it.key] || []).find((d) => (d.depot_id || '') === selectedDepotId);
      const base = Number(depotOpt?.unit_price || 0);
      const nextUnitPrice = base > 0 ? base + extra : 0;
      return {
        ...it,
        refinery_id: depotOpt?.refinery_id ?? it.refinery_id,
        depot_id: selectedDepotId || '',
        unit_price: nextUnitPrice,
      };
    });
  };

  useEffect(() => {
    if (!paymentOptions.length) return;
    setForm((prev) => (prev.payment_condition_id ? prev : { ...prev, payment_condition_id: paymentOptions[0].id }));
  }, [paymentOptions]);

  useEffect(() => {
    // On slower environments (e.g. Vercel), choices may load after opening "new order".
    // Keep new-order form items in sync without touching edit flow.
    if (!open) return;
    if (form.id) return;
    if (form.items.length > 0) return;
    if (!choices.length) return;
    setForm((prev) => ({
      ...prev,
      items: choices.map((c) => ({ ...c, selected: false, liters: 0 })),
    }));
  }, [open, form.id, form.items.length, choices]);

  const loadOrders = async () => {
    setLoading(true);
    setError('');
    const res = await fetch('/api/customer-portal/orders', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดคำสั่งซื้อไม่สำเร็จ');
    else setOrders(data || []);
    setLoading(false);
  };

  const loadChoices = async () => {
    const res = await fetch('/api/customer-portal/home', { cache: 'no-store' });
    const raw = await res.json();
    const data = raw as PriceHome;
    if (!res.ok) {
      setError((raw as any).error || 'โหลดรายการสินค้าไม่สำเร็จ');
      return;
    }

    const roundsById = new Map<string, { refinery_id: string | null; refinery_name: string }>(
      (data.rounds || []).map((r: any) => [r.id, { refinery_id: r.refinery_id ?? null, refinery_name: r.refineries?.name || '-' }]),
    );
    const bestByProduct = new Map<string, ProductChoice>();
    const depotMapByProduct = new Map<string, DepotChoice[]>();
    const depotOptionMap = new Map<string, DepotOption>();

    for (const item of data.items || []) {
      const round = roundsById.get(item.oil_base_price_id);
      const refineryId = round?.refinery_id ?? null;
      const key = `${item.product_code}__${item.product_name}`;
      const price = Number(item.base_cost_price || 0);
      if (price <= 0) continue;

      const current = bestByProduct.get(key);
      if (!current || price < current.unit_price) {
        bestByProduct.set(key, {
          key,
          product_code: item.product_code,
          product_name: item.product_name,
          refinery_id: refineryId,
          depot_id: item.depot_id ?? null,
          unit_price: price,
        });
      }

      const depotLabel = item.depots?.code ? `${item.depots.code}${item.depots?.name ? ` - ${item.depots.name}` : ''}` : '-';
      if (item.depot_id) {
        depotOptionMap.set(String(item.depot_id), {
          depot_id: String(item.depot_id),
          depot_label: depotLabel,
          refinery_id: refineryId,
          refinery_name: round?.refinery_name || '-',
        });
      }
      const list = depotMapByProduct.get(key) ?? [];
      const existing = list.find((x) => x.depot_id === (item.depot_id ?? null));
      if (!existing || price < existing.unit_price) {
        const filtered = list.filter((x) => x.depot_id !== (item.depot_id ?? null));
        filtered.push({
          depot_id: item.depot_id ?? null,
          depot_label: depotLabel,
          refinery_id: refineryId,
          refinery_name: round?.refinery_name || '-',
          unit_price: price,
        });
        depotMapByProduct.set(key, filtered);
      }
    }

    const list = [...bestByProduct.values()].sort((a, b) => a.product_code.localeCompare(b.product_code));
    setChoices(list);
    setDepotOptions(
      [...depotOptionMap.values()].sort((a, b) => `${a.refinery_name}|${a.depot_label}`.localeCompare(`${b.refinery_name}|${b.depot_label}`)),
    );
    setDepotChoicesByProduct(
      Object.fromEntries(
        [...depotMapByProduct.entries()].map(([k, v]) => [k, v.sort((a, b) => `${a.refinery_name}|${a.depot_label}`.localeCompare(`${b.refinery_name}|${b.depot_label}`))]),
      ),
    );
    const nextPaymentOptions = (data.allowedPaymentConditions || []).map((x) => ({
      id: String(x.id),
      code: String(x.code || ''),
      name: String(x.name || ''),
      payment_type: String(x.payment_type || ''),
      credit_days: Number(x.credit_days || 0),
      extra_cost_per_liter: Number(x.extra_cost_per_liter || 0),
    }));
    setPaymentOptions(nextPaymentOptions);
    setForm((prev) => {
      if (prev.payment_condition_id) return prev;
      return { ...prev, payment_condition_id: nextPaymentOptions[0]?.id || '' };
    });
  };

  const loadVehicles = async () => {
    const res = await fetch('/api/customer-portal/vehicles', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'โหลดข้อมูลรถไม่สำเร็จ');
      return;
    }
    setVehicles(data || []);
  };

  useEffect(() => {
    void loadOrders();
    void loadChoices();
    void loadVehicles();
  }, []);

  const openNew = () => {
    setForm({
      requested_delivery_date: new Date().toISOString().slice(0, 10),
      customer_po_no: '',
      order_no: '',
      delivery_note: '',
      receive_method: 'DELIVER_BY_TRUCK',
      delivery_location: '',
      customer_vehicle_id: '',
      vehicle_license_plate: '',
      vehicle_driver_name: '',
      vehicle_driver_phone: '',
      vehicle_pickup_license_number: '',
      payment_condition_id: paymentOptions[0]?.id || '',
      selected_depot_id: '',
      items: choices.map((c) => ({ ...c, selected: false, liters: 0 })),
    });
    setOpen(true);
  };

  const openEdit = async (id: string) => {
    const [detailRes] = await Promise.all([fetch(`/api/customer-portal/orders/${id}`, { cache: 'no-store' })]);
    const detail = await detailRes.json();
    if (!detailRes.ok) {
      setError(detail.error || 'โหลดรายละเอียดคำสั่งซื้อไม่สำเร็จ');
      return;
    }

    const itemMap = new Map<string, any>(
      (detail.sale_order_items || [])
        .filter((x: any) => !x.is_deleted)
        .map((x: any) => [`${x.product_code}__${x.product_name}`, x]),
    );
    const selectedDepotId = String(detail.sale_order_items?.find((x: any) => !x.is_deleted && x.depot_id)?.depot_id || '');
    setForm({
      id: detail.id,
      order_no: detail.order_no,
      requested_delivery_date: detail.requested_delivery_date || '',
      customer_po_no: detail.customer_po_no || '',
      delivery_note: detail.delivery_note || '',
      receive_method: detail.receive_method || 'DELIVER_BY_TRUCK',
      delivery_location: detail.delivery_location || '',
      customer_vehicle_id: detail.customer_vehicle_id || '',
      vehicle_license_plate: detail.vehicle_license_plate || '',
      vehicle_driver_name: detail.vehicle_driver_name || '',
      vehicle_driver_phone: detail.vehicle_driver_phone || '',
      vehicle_pickup_license_number: detail.vehicle_pickup_license_number || '',
      payment_condition_id: detail.payment_condition_id || paymentOptions[0]?.id || '',
      selected_depot_id: selectedDepotId,
      items: choices.map((c) => {
        const ex: any = itemMap.get(c.key);
        return {
          ...c,
          selected: Boolean(ex),
          liters: Number(ex?.liters || 0),
          unit_price: Number(ex?.unit_price || c.unit_price),
          refinery_id: ex?.refinery_id ?? c.refinery_id,
          depot_id: ex?.depot_id ?? c.depot_id,
        };
      }),
    });
    setOpen(true);
  };

  const onSave = async () => {
    const payload = {
      requested_delivery_date: form.requested_delivery_date || null,
      customer_po_no: form.customer_po_no || null,
      delivery_note: form.delivery_note || null,
      receive_method: form.receive_method,
      delivery_location: form.delivery_location || null,
      customer_vehicle_id: form.customer_vehicle_id || null,
      vehicle_license_plate: form.vehicle_license_plate || null,
      vehicle_driver_name: form.vehicle_driver_name || null,
      vehicle_driver_phone: form.vehicle_driver_phone || null,
      vehicle_pickup_license_number: form.vehicle_pickup_license_number || null,
      payment_condition_id: form.payment_condition_id || null,
      items: form.items
        .filter((x) => x.selected && Number(x.liters) > 0)
        .map((x) => ({
          refinery_id: x.refinery_id,
          depot_id: x.depot_id,
          product_code: x.product_code,
          product_name: x.product_name,
          liters: Number(x.liters),
          unit_price: Number(x.unit_price),
        })),
    };

    const res = await fetch(form.id ? `/api/customer-portal/orders/${form.id}` : '/api/customer-portal/orders', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'บันทึกคำสั่งซื้อไม่สำเร็จ');
      setSnack({ open: true, message: data.error || 'บันทึกคำสั่งซื้อไม่สำเร็จ', severity: 'error' });
      return;
    }

    setOpen(false);
    setSnack({ open: true, message: 'สั่งซื้อเรียบร้อยแล้ว', severity: 'success' });
    await loadVehicles();
    await loadOrders();
  };

  const onDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/customer-portal/orders/${deleteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'ลบคำสั่งซื้อไม่สำเร็จ');
      return;
    }
    setDeleteId(null);
    await loadOrders();
  };

  return (
    <CustomerShell title='เมนูสั่งซื้อ' subtitle='สร้างและติดตามคำสั่งซื้อ'>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent='space-between' alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
          <Typography sx={{ display: { xs: 'none', md: 'flex' }, fontSize: 28, fontWeight: 800, color: '#0f2f6e' }}>เมนูสั่งซื้อ</Typography>
          <Stack direction='row' spacing={1}>
            <Button component={Link} href='/customer' variant='outlined'>กลับหน้าราคา</Button>
            <Button variant='contained' startIcon={<Add />} onClick={openNew}>สั่งซื้อใหม่</Button>
          </Stack>
        </Stack>

        {error ? <Alert severity='error'>{error}</Alert> : null}
        {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

        <Paper sx={{ borderRadius: 1, overflow: 'hidden', border: '1px solid #d8e0eb' }}>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>เลขที่คำสั่งซื้อ</TableCell>
                  <TableCell>วันที่สั่งซื้อ</TableCell>
                  {/* <TableCell>PO ลูกค้า</TableCell> */}
                  <TableCell>วิธีรับ</TableCell>
                  <TableCell>เอกสาร DO</TableCell>
                  <TableCell align='right'>รวมเงิน</TableCell>
                  <TableCell align='right'>รวมลิตร</TableCell>
                  <TableCell>สถานะ</TableCell>
                  <TableCell align='right'>จัดการ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedOrders.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.order_no || r.id.slice(0, 8)}</TableCell>
                    <TableCell>{r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH') : '-'}</TableCell>
                    <TableCell>{receiveMethodThai(r.receive_method)}</TableCell>
                    <TableCell>
                      {r.delivery_order_no || r.delivery_order_file_url ? (
                        <Stack spacing={0.3}>
                          <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{r.delivery_order_no || '-'}</Typography>
                          {r.delivery_order_file_url ? (
                            <Button
                              size='small'
                              variant='outlined'
                              onClick={() => setPdfViewerUrl(r.delivery_order_file_url || null)}
                              sx={{ alignSelf: 'flex-start', minWidth: 0, px: 1, py: 0.1, fontSize: 11 }}
                            >
                              เปิดเอกสาร DO
                            </Button>
                          ) : null}
                        </Stack>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell align='right'>{money(Number(r.total_amount || 0))}</TableCell>
                    <TableCell align='right'>{Number(r.total_liters || 0).toLocaleString('th-TH')}</TableCell>
                    <TableCell>{orderStatusThai(r.order_status)}</TableCell>
                    <TableCell align='right'>
                      <IconButton onClick={() => void openEdit(r.id)}><Edit fontSize='small' /></IconButton>
                      <IconButton color='error' onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {!orders.length && !loading ? <TableRow><TableCell colSpan={9} align='center'>ยังไม่มีคำสั่งซื้อ</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </Box>
          <Stack sx={{ display: { xs: 'flex', md: 'none' }, p: 1 }} spacing={0.9}>
            {pagedOrders.map((r) => (
              <Card
                key={r.id}
                variant='outlined'
                sx={{
                  borderColor: '#e2e8f0',
                  borderRadius: 2,
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  bgcolor: '#fff',
                }}
              >
                <CardContent sx={{ p: 1.15, '&:last-child': { pb: 1.15 } }}>
                  <Stack spacing={0.65}>
                    <Stack direction='row' justifyContent='space-between' alignItems='flex-start'
                      sx={{ px: 1, py: 0.9, borderBottom: '1px solid #e2e8f0' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#1e3a8a', lineHeight: 1.2 }}>
                          {r.order_no || r.id.slice(0, 8)}
                        </Typography>
                        <Stack direction='row' spacing={0.5} alignItems='center' sx={{ mt: 0.35 }}>
                          <CalendarTodayOutlined sx={{ fontSize: 12, color: '#94a3b8' }} />
                          <Typography sx={{ fontSize: 12, color: '#64748b' }}>
                            {r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH') : '-'}
                          </Typography>
                        </Stack>
                      </Box>
                      <Box sx={{ px: 1.1, py: 0.35, borderRadius: 999, bgcolor: '#dbeafe' }}>
                        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                          {orderStatusThai(r.order_status)}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction='row' justifyContent='space-between' spacing={1}>
                      <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>วิธีรับ</Typography>
                      <Typography sx={{ fontSize: 12.5, color: '#1f2937' }}>{receiveMethodThai(r.receive_method)}</Typography>
                    </Stack>

                    <Stack direction='row' justifyContent='space-between' spacing={1}>
                      <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>รวมลิตร</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{Number(r.total_liters || 0).toLocaleString('th-TH')} L</Typography>
                    </Stack>
                    <Stack direction='row' justifyContent='space-between' spacing={1}>
                      <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>รวมเงิน</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{money(Number(r.total_amount || 0))}</Typography>
                    </Stack>

                    {/*    <Stack direction='row' justifyContent='space-between' spacing={1}>
                      <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>สถานะ</Typography>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>{orderStatusThai(r.order_status)}</Typography>
                    </Stack> */}
                    {r.delivery_order_no || r.delivery_order_file_url ? (
                      <Stack spacing={0.35}>
                        <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>เอกสาร DO</Typography>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{r.delivery_order_no || '-'}</Typography>
                        {r.delivery_order_file_url ? (
                          <Button
                            size='small'
                            variant='outlined'
                            onClick={() => setPdfViewerUrl(r.delivery_order_file_url || null)}
                            sx={{ alignSelf: 'flex-start', minWidth: 0, px: 1, py: 0.1, fontSize: 11, borderColor: '#cbd5e1', color: '#334155' }}
                          >
                            เปิดเอกสาร DO
                          </Button>
                        ) : null}
                      </Stack>
                    ) : null}
                    <Stack direction='row' justifyContent='flex-end' spacing={0.75} sx={{ pt: 0.1 }}>
                      <IconButton onClick={() => void openEdit(r.id)} sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
                        <Edit fontSize='small' />
                      </IconButton>
                      <IconButton color='error' onClick={() => setDeleteId(r.id)} sx={{ border: '1px solid #fecaca', borderRadius: 1.5 }}>
                        <Delete fontSize='small' />
                      </IconButton>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
            {!orders.length && !loading ? <Alert severity='info'>ยังไม่มีคำสั่งซื้อ</Alert> : null}
          </Stack>
          <TablePagination
            component='div'
            count={orders.length}
            page={page}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            rowsPerPage={rowsPerPage === 'all' ? Math.max(orders.length, 1) : rowsPerPage}
            onRowsPerPageChange={(e) => {
              const value = e.target.value === 'all' ? 'all' : Number(e.target.value);
              setRowsPerPage(value);
              setPage(0);
            }}
            rowsPerPageOptions={[
              { label: '15', value: 15 },
              { label: '25', value: 25 },
              { label: '30', value: 30 },
              { label: 'all', value: 'all' as any },
            ]}
            labelRowsPerPage='แถวต่อหน้า'
          />
        </Paper>
      </Stack>

      <Drawer
        anchor='right'
        open={open}
        onClose={() => setOpen(false)}
        sx={{
          zIndex: 1600,
          '& .MuiDrawer-paper': {
            zIndex: 1600,
            top: '64px',
            height: 'calc(100% - 64px)',
          },
        }}
      >
        <Stack spacing={2} sx={{ width: { xs: '100vw', sm: 700, md: 1120 }, maxWidth: '100vw', p: { xs: 1.25, md: 2.5 }, pb: { xs: 11, md: 2.5 } }}>
          <Typography variant='h6'>{form.order_no ? `แก้ไขคำสั่งซื้อ ${form.order_no}` : 'รายละเอียดเพิ่มเติมสำหรับคำสั่งซื้อ'}</Typography>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2}>
            <TextField sx={{ display: 'none' }} label='วันที่ต้องการให้จัดส่ง' type='date' value={form.requested_delivery_date} onChange={(e) => setForm((p) => ({ ...p, requested_delivery_date: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField sx={{ display: 'none' }} label='เลขที่ใบสั่งซื้อ (ตัวเลือก)' value={form.customer_po_no} onChange={(e) => setForm((p) => ({ ...p, customer_po_no: e.target.value }))} fullWidth />
            <TextField sx={{ display: 'none' }} label='รายละเอียดจัดส่ง' value={form.delivery_note} onChange={(e) => setForm((p) => ({ ...p, delivery_note: e.target.value }))} multiline minRows={3} fullWidth />
          </Stack>
          <Paper sx={{ border: '1px solid #d7e0ea', p: 1.5 }}>
            <FormControl fullWidth>
              <FormLabel sx={{ mb: 0.8, color: '#0f172a', fontWeight: 700 }}>เงื่อนไขการชำระเงิน</FormLabel>
              <RadioGroup
                row
                value={form.payment_condition_id}
                onChange={(e) => {
                  const nextPaymentId = e.target.value;
                  setForm((p) => {
                    if (!p.selected_depot_id) {
                      return { ...p, payment_condition_id: nextPaymentId };
                    }
                    return {
                      ...p,
                      payment_condition_id: nextPaymentId,
                      items: recalcItemsByDepotAndPayment(p.items, p.selected_depot_id, nextPaymentId),
                    };
                  });
                }}
                sx={{ gap: 0.8, flexWrap: 'wrap' }}
              >
                {paymentOptions.map((p) => (
                  <FormControlLabel
                    key={p.id}
                    value={p.id}
                    control={<Radio size='small' />}
                    label={`${p.name} (${p.payment_type}${p.credit_days ? ` ${p.credit_days} วัน` : ''})`}
                    sx={{
                      m: 0,
                      px: 1.1,
                      py: 0.3,
                      borderRadius: 1.2,
                      border: '1px solid',
                      borderColor: form.payment_condition_id === p.id ? '#bfdbfe' : '#e5e7eb',
                      bgcolor: form.payment_condition_id === p.id ? '#f8fbff' : '#fff',
                      '& .MuiFormControlLabel-label': {
                        fontSize: 13,
                        color: '#334155',
                        fontWeight: form.payment_condition_id === p.id ? 600 : 500,
                      },
                      '& .MuiRadio-root': {
                        p: 0.45,
                        color: '#94a3b8',
                      },
                      '& .Mui-checked': {
                        color: '#2563eb',
                      },
                    }}
                  />
                ))}
              </RadioGroup>
            </FormControl>
          </Paper>

          <Paper sx={{ border: '1px solid #d7e0ea', p: 1.5 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2}>
              <TextField
                select
                label='เลือกคลังรับน้ำมัน'
                value={form.selected_depot_id}
                SelectProps={{
                  MenuProps: {
                    disablePortal: true,
                  },
                }}
                onChange={(e) => {
                  const depotId = e.target.value;
                  setForm((p) => {
                    const nextItems = recalcItemsByDepotAndPayment(p.items, depotId, p.payment_condition_id).map((it) => ({
                      ...it,
                      selected: false,
                      liters: 0,
                    }));
                    return { ...p, selected_depot_id: depotId, items: nextItems };
                  });
                }}
                fullWidth
                helperText='เลือกรับน้ำมันจากคลังเดียว เพื่อแสดงเฉพาะน้ำมันของคลังนั้น'
              >
                {depotOptions.map((d) => (
                  <MenuItem key={d.depot_id} value={d.depot_id}>
                    {d.depot_label} ({d.refinery_name})
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label='โรงกลั่นของคลัง'
                value={selectedDepotRefinery?.refinery_name || '-'}
                InputProps={{ readOnly: true }}
                sx={{ minWidth: 280 }}
              />
            </Stack>
          </Paper>

          <Paper sx={{ border: '1px solid #d7e0ea' }}>
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <Table size='small'>
                <TableHead>
                  <TableRow sx={{ '& th': { bgcolor: '#2f6175', color: '#fff' } }}>
                    <TableCell width={48}><Checkbox size='small' /></TableCell>
                    <TableCell width={180}>รหัสสินค้า</TableCell>
                    <TableCell>รายละเอียดสินค้า</TableCell>
                    <TableCell width={140}>ราคาต่อลิตร</TableCell>
                    <TableCell width={150}>จำนวนเงิน</TableCell>
                    <TableCell width={180}>ปริมาณสินค้า (L)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleItemEntries.map(({ item: it, idx }) => (
                    <TableRow key={it.key}>
                      <TableCell>
                        <Checkbox checked={it.selected} onChange={(e) => setForm((p) => {
                          const next = [...p.items];
                          next[idx] = { ...next[idx], selected: e.target.checked };
                          return { ...p, items: next };
                        })} />
                      </TableCell>
                      <TableCell>{it.product_code}</TableCell>
                      <TableCell>{it.product_name}</TableCell>
                      <TableCell>{money(Number(it.unit_price || 0))}</TableCell>
                      <TableCell>{money(Number(it.liters || 0) * Number(it.unit_price || 0))}</TableCell>
                      <TableCell>
                        <TextField
                          size='small'
                          type='number'
                          placeholder='ใส่ปริมาณสินค้า'
                          value={it.liters || ''}
                          onChange={(e) => setForm((p) => {
                            const next = [...p.items];
                            next[idx] = { ...next[idx], liters: Number(e.target.value || 0), selected: true };
                            return { ...p, items: next };
                          })}
                          inputProps={{ min: 0 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {!form.selected_depot_id ? <TableRow><TableCell colSpan={6} align='center'>กรุณาเลือกคลังรับน้ำมันก่อน</TableCell></TableRow> : null}
                  {form.selected_depot_id && !visibleItemEntries.length ? <TableRow><TableCell colSpan={6} align='center'>คลังนี้ยังไม่มีรายการน้ำมันที่ได้รับสิทธิ์</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </Box>
            <Stack sx={{ display: { xs: 'flex', md: 'none' }, p: 1 }} spacing={1}>
              {visibleItemEntries.map(({ item: it, idx }) => (
                <Card key={it.key} variant='outlined' sx={{ borderColor: '#d7e0ea' }}>
                  <CardContent sx={{ p: 1.1, '&:last-child': { pb: 1.1 } }}>
                    <Stack spacing={0.7}>
                      <Stack direction='row' justifyContent='space-between' alignItems='center' spacing={1}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{it.product_code}</Typography>
                        <Checkbox checked={it.selected} onChange={(e) => setForm((p) => {
                          const next = [...p.items];
                          next[idx] = { ...next[idx], selected: e.target.checked };
                          return { ...p, items: next };
                        })} />
                      </Stack>
                      <Typography sx={{ fontSize: 12.5, color: '#475569' }}>{it.product_name}</Typography>
                      <Stack direction='row' justifyContent='space-between' spacing={1}>
                        <Typography sx={{ fontSize: 12, color: '#64748b' }}>ราคาต่อลิตร</Typography>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{money(Number(it.unit_price || 0))}</Typography>
                      </Stack>
                      <Stack direction='row' justifyContent='space-between' spacing={1}>
                        <Typography sx={{ fontSize: 12, color: '#64748b' }}>จำนวนเงิน</Typography>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{money(Number(it.liters || 0) * Number(it.unit_price || 0))}</Typography>
                      </Stack>
                      <TextField
                        size='small'
                        type='number'
                        label='ปริมาณสินค้า (L)'
                        value={it.liters || ''}
                        onChange={(e) => setForm((p) => {
                          const next = [...p.items];
                          next[idx] = { ...next[idx], liters: Number(e.target.value || 0), selected: true };
                          return { ...p, items: next };
                        })}
                        inputProps={{ min: 0 }}
                      />
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {!form.selected_depot_id ? <Alert severity='info'>กรุณาเลือกคลังรับน้ำมันก่อน</Alert> : null}
              {form.selected_depot_id && !visibleItemEntries.length ? <Alert severity='warning'>คลังนี้ยังไม่มีรายการน้ำมันที่ได้รับสิทธิ์</Alert> : null}
            </Stack>
            <Box sx={{ bgcolor: '#2f6175', color: '#fff', px: 1.5, py: 0.8 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent='space-between' spacing={0.5}>
                <Typography>รายการสินค้าที่เลือกไว้ {selectedCount} ผลิตภัณฑ์</Typography>
                <Typography>จำนวนเงินรวม {money(totalAmount)}</Typography>
                <Typography>ปริมาณรวม {Number(totalLiters).toLocaleString('th-TH')} L</Typography>
              </Stack>
            </Box>
          </Paper>

          <Stack spacing={1}>
            <Typography sx={{ fontSize: 32, fontWeight: 800 }}>วิธีการรับ</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              {receiveMethods.map((m) => (
                <Card key={m.code} sx={{ flex: 1, border: form.receive_method === m.code ? '2px solid #2563eb' : '1px solid #cfd8e3', bgcolor: form.receive_method === m.code ? '#ebf2ff' : '#fff' }}>
                  <CardActionArea onClick={() => setForm((p) => ({ ...p, receive_method: m.code, customer_vehicle_id: m.code === 'PICKUP_BY_TRUCK' ? p.customer_vehicle_id : '', vehicle_license_plate: m.code === 'PICKUP_BY_TRUCK' ? p.vehicle_license_plate : '', vehicle_driver_name: m.code === 'PICKUP_BY_TRUCK' ? p.vehicle_driver_name : '', vehicle_driver_phone: m.code === 'PICKUP_BY_TRUCK' ? p.vehicle_driver_phone : '', vehicle_pickup_license_number: m.code === 'PICKUP_BY_TRUCK' ? p.vehicle_pickup_license_number : '' }))}>
                    <CardContent>
                      <Stack spacing={1} alignItems='center'>
                        {m.icon}
                        <Typography>{m.label}</Typography>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              ))}
            </Stack>
          </Stack>

          {form.receive_method === 'PICKUP_BY_TRUCK' ? (
            <Paper sx={{ border: '1px solid #d7e0ea', p: 1.5 }}>
              <Stack spacing={1.2}>
                <Typography sx={{ fontWeight: 800 }}>ข้อมูลรถสำหรับรับเอง</Typography>
                <TextField
                  select
                  label='เลือกรถบรรทุกของฉัน (ถ้ามี)'
                  value={form.customer_vehicle_id}
                  SelectProps={{
                    MenuProps: {
                      disablePortal: true,
                    },
                  }}
                  onChange={(e) => {
                    const id = e.target.value;
                    const selected = vehicles.find((v) => v.id === id);
                    setForm((p) => ({
                      ...p,
                      customer_vehicle_id: id,
                      vehicle_license_plate: selected?.license_plate || p.vehicle_license_plate,
                      vehicle_driver_name: selected?.driver_name || p.vehicle_driver_name,
                      vehicle_driver_phone: selected?.driver_phone || p.vehicle_driver_phone,
                      vehicle_pickup_license_number: selected?.pickup_license_number || p.vehicle_pickup_license_number,
                    }));
                  }}
                  helperText='ถ้าไม่มีรถในรายการ สามารถคีย์ข้อมูลใหม่ด้านล่างได้ ระบบจะบันทึกเข้ารายการรถของคุณให้อัตโนมัติ'
                >
                  <MenuItem value=''>ไม่เลือกรถ (คีย์ใหม่)</MenuItem>
                  {vehicles.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.license_plate}{v.driver_name ? ` - ${v.driver_name}` : ''}
                    </MenuItem>
                  ))}
                </TextField>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2}>
                  <TextField
                    label='ทะเบียนรถ'
                    value={form.vehicle_license_plate}
                    onChange={(e) => setForm((p) => ({ ...p, customer_vehicle_id: '', vehicle_license_plate: e.target.value }))}
                    required
                    fullWidth
                  />
                  <TextField
                    label='ชื่อคนขับ'
                    value={form.vehicle_driver_name}
                    onChange={(e) => setForm((p) => ({ ...p, customer_vehicle_id: '', vehicle_driver_name: e.target.value }))}
                    fullWidth
                  />
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2}>
                  <TextField
                    label='เบอร์คนขับ'
                    value={form.vehicle_driver_phone}
                    onChange={(e) => setForm((p) => ({ ...p, customer_vehicle_id: '', vehicle_driver_phone: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    label='เลขใบอนุญาตรับสินค้า'
                    value={form.vehicle_pickup_license_number}
                    onChange={(e) => setForm((p) => ({ ...p, customer_vehicle_id: '', vehicle_pickup_license_number: e.target.value }))}
                    fullWidth
                  />
                </Stack>
              </Stack>
            </Paper>
          ) : null}

          <TextField label='เพิ่มเติม' value={form.delivery_location} onChange={(e) => setForm((p) => ({ ...p, delivery_location: e.target.value }))} />

          <Box
            sx={{
              position: 'sticky',
              bottom: 0,
              py: 1,
              bgcolor: '#fff',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <Stack direction='row' spacing={1} justifyContent='flex-end'>
              <Button onClick={() => setOpen(false)}>ยกเลิก</Button>
              <Button variant='contained' onClick={() => void onSave()} disabled={!form.payment_condition_id || !form.selected_depot_id || !selectedCount || (form.receive_method === 'PICKUP_BY_TRUCK' && !form.vehicle_license_plate.trim())}>บันทึกคำสั่งซื้อ</Button>
            </Stack>
          </Box>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบคำสั่งซื้อ</DialogTitle>
        <DialogContent>ต้องการลบคำสั่งซื้อนี้ใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void onDelete()}>ลบ</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(pdfViewerUrl)} onClose={() => setPdfViewerUrl(null)} maxWidth='lg' fullWidth>
        <DialogTitle>เอกสาร DO</DialogTitle>
        <DialogContent sx={{ p: 0, height: { xs: '70vh', md: '80vh' } }}>
          {pdfViewerUrl ? (
            <iframe
              src={pdfViewerUrl}
              title='DO PDF Viewer'
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPdfViewerUrl(null)}>ปิด</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={2600}
        onClose={() => setSnack((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnack((p) => ({ ...p, open: false }))} severity={snack.severity} variant='filled' sx={{ width: '100%' }}>
          {snack.message}
        </Alert>
      </Snackbar>
    </CustomerShell>
  );
}
