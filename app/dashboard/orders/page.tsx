'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Delete, Edit, Remove } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { OrderStatus } from '@/types/database';

type OrderRow = {
  id: string;
  customer_id: string;
  order_status: OrderStatus;
  delivery_location: string | null;
  refinery_booking_number: string | null;
  due_date: string | null;
  customers?: { company_name?: string } | null;
};

type MasterCustomer = { id: string; company_name: string };
type MasterRefinery = { id: string; name: string };
type MasterDepot = { id: string; code: string; name: string };
type MasterProduct = { code: string; name: string; is_active: boolean };

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
  customer_id: string;
  order_status: OrderStatus;
  delivery_location: string;
  refinery_booking_number: string;
  due_date: string;
  items: OrderItemForm[];
};

const statuses: OrderStatus[] = [
  'DRAFT', 'SUBMITTED', 'ADMIN_REVIEW', 'CONFIRMED', 'REFINERY_BOOKED',
  'WAITING_PAYMENT', 'PAID', 'PICKUP_READY', 'DELIVERING', 'COMPLETED', 'CANCELLED',
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
  due_date: '',
  items: [{ ...emptyItem }],
};

function statusColor(status: OrderStatus): 'default' | 'warning' | 'success' | 'error' | 'info' {
  if (['COMPLETED', 'PAID'].includes(status)) return 'success';
  if (['CANCELLED'].includes(status)) return 'error';
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
  return Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrdersPage() {
  const [companyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<MasterCustomer[]>([]);
  const [refineries, setRefineries] = useState<MasterRefinery[]>([]);
  const [depots, setDepots] = useState<MasterDepot[]>([]);
  const [products, setProducts] = useState<MasterProduct[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const subTotal = useMemo(() => form.items.reduce((sum, it) => sum + (Number(it.unit_price || 0) * Number(it.liters || 0)), 0), [form.items]);
  const totalLiters = useMemo(() => form.items.reduce((sum, it) => sum + Number(it.liters || 0), 0), [form.items]);
  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const d = searchDate.trim();
    return rows.filter((r) => {
      const customer = (r.customers?.company_name || '').toLowerCase();
      const status = statusThai(r.order_status).toLowerCase();
      const orderId = r.id.toLowerCase();
      const delivery = (r.delivery_location || '').toLowerCase();
      const booking = (r.refinery_booking_number || '').toLowerCase();

      const okText = !q || customer.includes(q) || status.includes(q) || orderId.includes(q) || delivery.includes(q) || booking.includes(q);
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
    const [r1, r2, r3, r4] = await Promise.all([
      fetch(`/api/customers?company_id=${companyId}`),
      fetch(`/api/refineries?company_id=${companyId}`),
      fetch(`/api/depots?company_id=${companyId}`),
      fetch(`/api/oil-products?company_id=${companyId}`),
    ]);

    const [d1, d2, d3, d4] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json()]);

    if (r1.ok) setCustomers((d1 || []).map((x: any) => ({ id: x.id, company_name: x.company_name })));
    if (r2.ok) setRefineries((d2 || []).map((x: any) => ({ id: x.id, name: x.name })));
    if (r3.ok) setDepots((d3 || []).map((x: any) => ({ id: x.id, code: x.code, name: x.name })));
    if (r4.ok) setProducts((d4 || []).map((x: any) => ({ code: x.code, name: x.name, is_active: Boolean(x.is_active) })));
  };

  useEffect(() => {
    void load();
    void loadMasters();
  }, [companyId]);

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
      customer_id: data.customer_id,
      order_status: data.order_status,
      delivery_location: data.delivery_location || '',
      refinery_booking_number: data.refinery_booking_number || '',
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
    <Stack spacing={2}>
      <Typography variant='h4'>ใบสั่งซื้อ</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          size='small'
          label='ค้นหา'
          placeholder='ลูกค้า, สถานะ, เลขออเดอร์, สถานที่ส่ง, เลขจอง'
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: { xs: '100%', md: 320 } }}
        />
        <TextField
          size='small'
          label='ค้นหาวันที่กำหนดชำระ'
          placeholder='YYYY-MM-DD'
          value={searchDate}
          onChange={(e) => {
            setSearchDate(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: { xs: '100%', md: 220 } }}
        />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setOpen(true); }}>เพิ่มใบสั่งซื้อ</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Order ID</TableCell>
              <TableCell>ลูกค้า</TableCell>
              <TableCell>สถานที่ส่ง</TableCell>
              <TableCell>กำหนดชำระ</TableCell>
              <TableCell>สถานะ</TableCell>
              <TableCell>เลขจองโรงกลั่น</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.id.slice(0, 8)}</TableCell>
                <TableCell>{r.customers?.company_name || r.customer_id}</TableCell>
                <TableCell>{r.delivery_location || '-'}</TableCell>
                <TableCell>{r.due_date || '-'}</TableCell>
                <TableCell><Chip size='small' label={statusThai(r.order_status)} color={statusColor(r.order_status)} /></TableCell>
                <TableCell>{r.refinery_booking_number || '-'}</TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => void openEdit(r.id)}><Edit fontSize='small' /></IconButton>
                  <IconButton color='error' onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!filteredRows.length && !loading ? <TableRow><TableCell colSpan={7} align='center'>ไม่มีข้อมูลใบสั่งซื้อ</TableCell></TableRow> : null}
          </TableBody>
        </Table>
        <TablePagination
          component='div'
          count={filteredRows.length}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 15, 20, 25]}
          labelRowsPerPage='แถวต่อหน้า'
        />
      </Box>

      <Drawer anchor='right' open={open} onClose={() => setOpen(false)}>
        <Stack spacing={2} sx={{ width: { xs: 360, sm: 1080 }, p: 2.5 }}>
          <Typography variant='h6'>{form.id ? 'แก้ไขใบสั่งซื้อ' : 'เพิ่มใบสั่งซื้อ'}</Typography>

          <Typography variant='subtitle2' color='text.secondary'>ส่วนหัวบิล (Header)</Typography>
          <Stack spacing={1} direction={{ xs: 'column', md: 'row' }}>
            <TextField
              select
              label='ลูกค้า'
              value={form.customer_id}
              onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value }))}
              sx={{ minWidth: 260 }}
            >
              {customers.map((c) => <MenuItem key={c.id} value={c.id}>{c.company_name}</MenuItem>)}
            </TextField>
            <TextField select label='สถานะออเดอร์' value={form.order_status} onChange={(e) => setForm((p) => ({ ...p, order_status: e.target.value as OrderStatus }))} sx={{ minWidth: 220 }}>
              {statuses.map((status) => <MenuItem key={status} value={status}>{statusThai(status)}</MenuItem>)}
            </TextField>
            <TextField label='สถานที่ส่ง' value={form.delivery_location} onChange={(e) => setForm((p) => ({ ...p, delivery_location: e.target.value }))} sx={{ flex: 1 }} />
          </Stack>
          <Stack spacing={1} direction={{ xs: 'column', md: 'row' }}>
            <TextField label='เลขจองโรงกลั่น' value={form.refinery_booking_number} onChange={(e) => setForm((p) => ({ ...p, refinery_booking_number: e.target.value }))} sx={{ minWidth: 240 }} />
            <TextField label='กำหนดชำระ' type='date' value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ minWidth: 220 }} />
          </Stack>

          <Typography variant='subtitle2' color='text.secondary'>รายละเอียดสินค้า (Detail)</Typography>
          <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>โรงกลั่น</TableCell>
                  <TableCell>คลัง</TableCell>
                  <TableCell>รหัสน้ำมัน</TableCell>
                  <TableCell align='right'>ราคาขาย/ลิตร</TableCell>
                  <TableCell align='right'>จำนวนที่ซื้อ (ลิตร)</TableCell>
                  <TableCell align='right'>รวม</TableCell>
                  <TableCell align='right'>จัดการ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {form.items.map((it, idx) => (
                  <TableRow key={`item-${idx}`}>
                    <TableCell>
                      <TextField
                        select
                        size='small'
                        value={it.refinery_id}
                        onChange={(e) => updateItem(idx, { refinery_id: e.target.value })}
                        sx={{ minWidth: 150 }}
                      >
                        {refineries.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        size='small'
                        value={it.depot_id}
                        onChange={(e) => updateItem(idx, { depot_id: e.target.value })}
                        sx={{ minWidth: 170 }}
                      >
                        {depots.map((d) => <MenuItem key={d.id} value={d.id}>{d.code} - {d.name}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        size='small'
                        value={it.product_code}
                        onChange={(e) => {
                          const p = products.find((x) => x.code === e.target.value);
                          updateItem(idx, { product_code: e.target.value, product_name: p?.name || '' });
                        }}
                        sx={{ minWidth: 170 }}
                      >
                        {products.filter((p) => p.is_active).map((p) => <MenuItem key={p.code} value={p.code}>{p.code} - {p.name}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    <TableCell align='right'>
                      <TextField
                        size='small'
                        type='number'
                        value={it.unit_price}
                        onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value || 0) })}
                        sx={{ width: 140 }}
                      />
                    </TableCell>
                    <TableCell align='right'>
                      <TextField
                        size='small'
                        type='number'
                        value={it.liters}
                        onChange={(e) => updateItem(idx, { liters: Number(e.target.value || 0) })}
                        sx={{ width: 140 }}
                      />
                    </TableCell>
                    <TableCell align='right'>{money(Number(it.unit_price || 0) * Number(it.liters || 0))}</TableCell>
                    <TableCell align='right'>
                      <IconButton color='error' onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}>
                        <Remove fontSize='small' />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          <Button variant='outlined' startIcon={<Add />} onClick={() => setForm((p) => ({ ...p, items: [...p.items, { ...emptyItem }] }))}>
            เพิ่มรายการน้ำมัน
          </Button>

          <Box sx={{ ml: 'auto', minWidth: 320, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#fafafa' }}>
            <Typography variant='subtitle2' sx={{ mb: 1 }}>ท้ายบิล</Typography>
            <Stack direction='row' justifyContent='space-between'><Typography color='text.secondary'>รวมปริมาณ</Typography><Typography>{money(totalLiters)} ลิตร</Typography></Stack>
            <Stack direction='row' justifyContent='space-between'><Typography color='text.secondary'>รวมเงินทั้งสิ้น</Typography><Typography sx={{ fontWeight: 700, fontSize: 18 }}>{money(subTotal)} บาท</Typography></Stack>
          </Box>

          <Button variant='contained' onClick={() => void save()} disabled={!form.customer_id || !form.items.length}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบใบสั่งซื้อนี้ใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void remove()}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
