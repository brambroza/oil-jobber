'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Delete, Edit, Remove } from '@mui/icons-material';
import {
  Alert,
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
  Snackbar,
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
} from '@mui/material';
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

type MasterCustomer = { id: string; company_name: string };
type MasterRefinery = { id: string; name: string };
type MasterDepot = { id: string; code: string; name: string };
type MasterProduct = { code: string; name: string; is_active: boolean };
type MasterPaymentCondition = { id: string; name: string; payment_type: string; credit_days: number };
type CustomerAccess = { allowed_payment_condition_ids?: string[] | null } | null;

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
  items: [{ ...emptyItem }],
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
    severity: 'success' | 'error' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const subTotal = useMemo(
    () => form.items.reduce((sum, it) => sum + Number(it.unit_price || 0) * Number(it.liters || 0), 0),
    [form.items],
  );
  const vatAmount = useMemo(() => subTotal * 0.07, [subTotal]);
  const grandTotal = useMemo(() => subTotal + vatAmount, [subTotal, vatAmount]);
  const totalLiters = useMemo(() => form.items.reduce((sum, it) => sum + Number(it.liters || 0), 0), [form.items]);

  const filteredPaymentConditions = useMemo(() => {
    const allowed = customerAccess?.allowed_payment_condition_ids ?? [];
    if (!allowed.length) return paymentConditions;
    const allowedSet = new Set(allowed.map((x) => String(x)));
    return paymentConditions.filter((pc) => allowedSet.has(pc.id));
  }, [paymentConditions, customerAccess]);

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

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    const res = await fetch(`/api/orders?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data);
    setLoading(false);
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

    if (r1.ok) setCustomers((d1 || []).map((x: any) => ({ id: x.id, company_name: x.company_name })));
    if (r2.ok) setRefineries((d2 || []).map((x: any) => ({ id: x.id, name: x.name })));
    if (r3.ok) setDepots((d3 || []).map((x: any) => ({ id: x.id, code: x.code, name: x.name })));
    if (r4.ok) setProducts((d4 || []).map((x: any) => ({ code: x.code, name: x.name, is_active: Boolean(x.is_active) })));
    if (r5.ok) {
      setPaymentConditions(
        (d5 || []).map((x: any) => ({
          id: x.id,
          name: x.name,
          payment_type: x.payment_type,
          credit_days: Number(x.credit_days || 0),
        })),
      );
    }
  };

  useEffect(() => {
    void load();
    void loadMasters();
  }, [companyId]);

  useEffect(() => {
    const run = async () => {
      if (!form.customer_id || !companyId) {
        setCustomerAccess(null);
        return;
      }
      const res = await fetch(`/api/customer-portal/access/${form.customer_id}?company_id=${companyId}`);
      const data = await res.json();
      if (!res.ok) return;
      setCustomerAccess(data.access || null);
    };
    void run();
  }, [form.customer_id, companyId]);

  useEffect(() => {
    if (!filteredPaymentConditions.length) return;
    setForm((prev) => {
      const hasCurrent = filteredPaymentConditions.some((x) => x.id === prev.payment_condition_id);
      if (hasCurrent) return prev;
      return { ...prev, payment_condition_id: filteredPaymentConditions[0].id };
    });
  }, [filteredPaymentConditions]);

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

    const res = await fetch(form.id ? `/api/orders/${form.id}` : '/api/orders', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'บันทึกไม่สำเร็จ');
    else {
      if (data.line_warning) setError(String(data.line_warning));
      setOpen(false);
      setForm(emptyForm);
      await load();
    }
  };

  const openEdit = async (id: string) => {
    const res = await fetch(`/api/orders/${id}?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'โหลดข้อมูลใบสั่งซื้อไม่สำเร็จ');
      return;
    }

    setForm({
      id: data.id,
      order_no: data.order_no || '',
      payment_condition_id: data.payment_condition_id || '',
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
      setSnack({ open: true, message: String(data.line_warning), severity: 'error' });
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
    const res = await fetch(`/api/orders/${deleteId}?company_id=${companyId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'ลบไม่สำเร็จ');
    else {
      setDeleteId(null);
      await load();
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
          <Button variant="outlined" onClick={() => void load()} sx={{ borderRadius: 1, width: { xs: '100%', md: 'auto' } }}>
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
                    <IconButton size="small" color="error" onClick={() => setDeleteId(r.id)}>
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
              top: 0,
              zIndex: 5,
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
              p: 2
            }} >
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <TextField
                    size="small"
                    select
                    label="ลูกค้า"
                    value={form.customer_id}
                    onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value }))}
                    fullWidth
                  >
                    {customers.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.company_name}
                      </MenuItem>
                    ))}
                  </TextField>
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
                    label="เลขจองโรงกลั่น"
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
                  <TextField size="small" label="โรงกลั่นที่ลูกค้าเลือก" value={form.refinery_summary || '-'} InputProps={{ readOnly: true }} fullWidth />
                  <TextField size="small" label="คลังที่ลูกค้าเลือก" value={form.depot_summary || '-'} InputProps={{ readOnly: true }} fullWidth />
                </Stack>
                <FormControl fullWidth>
                  <FormLabel sx={{ color: '#334155', fontWeight: 800, mb: 0.7 }}>เครดิตที่เลือก</FormLabel>
                  <RadioGroup
                    row
                    value={form.payment_condition_id || ''}
                    onChange={(e) => setForm((p) => ({ ...p, payment_condition_id: e.target.value }))}
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
                <Table size="small" stickyHeader sx={{ minWidth: 980 }}>
                  <TableHead>
                    <TableRow sx={{ '& th': { bgcolor: '#f8fafc', color: '#334155', fontWeight: 900, whiteSpace: 'nowrap' } }}>
                      <TableCell>โรงกลั่น</TableCell>
                      <TableCell>คลัง</TableCell>
                      <TableCell>รหัสน้ำมัน</TableCell>
                      <TableCell align="right">ราคาขาย/ลิตร</TableCell>
                      <TableCell align="right">จำนวนที่ซื้อ</TableCell>
                      <TableCell align="right">รวม</TableCell>
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
                            value={it.refinery_id}
                            onChange={(e) => updateItem(idx, { refinery_id: e.target.value })}
                            sx={{ minWidth: 160 }}
                          >
                            {refineries.map((r) => (
                              <MenuItem key={r.id} value={r.id}>
                                {r.name}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            value={it.depot_id}
                            onChange={(e) => updateItem(idx, { depot_id: e.target.value })}
                            sx={{ minWidth: 190 }}
                          >
                            {depots.map((d) => (
                              <MenuItem key={d.id} value={d.id}>
                                {d.code} - {d.name}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            value={it.product_code}
                            onChange={(e) => {
                              const p = products.find((x) => x.code === e.target.value);
                              updateItem(idx, { product_code: e.target.value, product_name: p?.name || '' });
                            }}
                            sx={{ minWidth: 190 }}
                          >
                            {products
                              .filter((p) => p.is_active)
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
                            onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value || 0) })}
                            sx={{ width: 140 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            type="number"
                            value={it.liters}
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
                            onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                            disabled={form.items.length <= 1}
                          >
                            <Remove fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={() => setForm((p) => ({ ...p, items: [...p.items, { ...emptyItem }] }))}
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
                    <Typography fontWeight={900}>ยอดรวมสุทธิ</Typography>
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

      <Snackbar
        open={snack.open}
        autoHideDuration={2600}
        onClose={() => setSnack((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnack((p) => ({ ...p, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
