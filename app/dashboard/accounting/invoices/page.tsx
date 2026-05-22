'use client';

import { useEffect, useState } from 'react';
import { Add, Delete, Edit } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Invoice } from '@/types/database';

type InvoiceForm = {
  id?: string;
  sale_order_id: string;
  invoice_no: string;
  issued_at: string;
  amount: number;
};

const emptyForm: InvoiceForm = {
  sale_order_id: '',
  invoice_no: '',
  issued_at: new Date().toISOString().slice(0, 10),
  amount: 0,
};

export default function InvoicesPage() {
  const [companyId, setCompanyId] = useState('');
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<InvoiceForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/accounting/invoice?company_id=${companyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ');
      setRows(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const save = async () => {
    try {
      const payload = { ...form, company_id: companyId };
      const res = await fetch(form.id ? `/api/accounting/invoice/${form.id}` : '/api/accounting/invoice', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      setDrawerOpen(false);
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/accounting/invoice/${deleteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
      setDeleteId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>ใบแจ้งหนี้</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField fullWidth label='Company ID' value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setDrawerOpen(true); }}>เพิ่มใบแจ้งหนี้</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>เลขใบแจ้งหนี้</TableCell>
              <TableCell>Sale Order ID</TableCell>
              <TableCell>วันที่ออก</TableCell>
              <TableCell align='right'>จำนวนเงิน</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.invoice_no}</TableCell>
                <TableCell>{r.sale_order_id}</TableCell>
                <TableCell>{r.issued_at}</TableCell>
                <TableCell align='right'>{Number(r.amount).toFixed(2)}</TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => { setForm({ id: r.id, sale_order_id: r.sale_order_id, invoice_no: r.invoice_no, issued_at: r.issued_at, amount: Number(r.amount) }); setDrawerOpen(true); }}>
                    <Edit fontSize='small' />
                  </IconButton>
                  <IconButton color='error' onClick={() => setDeleteId(r.id)}>
                    <Delete fontSize='small' />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && !loading ? <TableRow><TableCell colSpan={5} align='center'>ไม่มีข้อมูล</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>

      <Drawer anchor='right' open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Stack sx={{ width: { xs: 320, sm: 420 }, p: 2 }} spacing={2}>
          <Typography variant='h6'>{form.id ? 'แก้ไขใบแจ้งหนี้' : 'เพิ่มใบแจ้งหนี้'}</Typography>
          <TextField label='Sale Order ID' value={form.sale_order_id} onChange={(e) => setForm((p) => ({ ...p, sale_order_id: e.target.value }))} />
          <TextField label='เลขใบแจ้งหนี้' value={form.invoice_no} onChange={(e) => setForm((p) => ({ ...p, invoice_no: e.target.value }))} />
          <TextField label='วันที่ออก' type='date' value={form.issued_at} onChange={(e) => setForm((p) => ({ ...p, issued_at: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <TextField label='จำนวนเงิน' type='number' value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) }))} />
          <Button variant='contained' onClick={() => void save()} disabled={!companyId || !form.sale_order_id || !form.invoice_no}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบใบแจ้งหนี้นี้ใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void remove()}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
