'use client';

import { useEffect, useState } from 'react';
import { Add, Delete, Edit } from '@mui/icons-material';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { PaymentCondition } from '@/types/database';

type PCForm = {
  id?: string;
  code: string;
  name: string;
  payment_type: 'CASH' | 'CREDIT';
  credit_days: number;
  extra_cost_per_liter: number;
};

const emptyForm: PCForm = {
  code: '',
  name: '',
  payment_type: 'CASH',
  credit_days: 0,
  extra_cost_per_liter: 0,
};

export default function SellingPricesPage() {
  const [companyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');
  const [rows, setRows] = useState<PaymentCondition[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PCForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    const res = await fetch(`/api/payment-conditions?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [companyId]);

  const save = async () => {
    const res = await fetch(form.id ? `/api/payment-conditions/${form.id}` : '/api/payment-conditions', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, company_id: companyId }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'บันทึกไม่สำเร็จ');
    else { setOpen(false); setForm(emptyForm); await load(); }
  };

  const remove = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/payment-conditions/${deleteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'ลบไม่สำเร็จ');
    else { setDeleteId(null); await load(); }
  };

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>กำหนดราคาขายตามเครดิต/การชำระเงิน</Typography>
      <Typography variant='body2' color='text.secondary'>กำหนดประเภทการชำระเงิน (เงินสด/เครดิต), จำนวนวันเครดิต และค่าบวกเพิ่มต่อ ลิตร</Typography>

      <Stack direction='row' spacing={1}>
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setOpen(true); }}>เพิ่มเงื่อนไข</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>รหัส</TableCell>
              <TableCell>ชื่อเงื่อนไข</TableCell>
              <TableCell>ประเภทชำระ</TableCell>
              <TableCell>Credit Day</TableCell>
              <TableCell>ค่าบวกเพิ่ม (บาท/ลิตร)</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.payment_type}</TableCell>
                <TableCell>{r.credit_days}</TableCell>
                <TableCell>{Number(r.extra_cost_per_liter).toFixed(4)}</TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => { setForm({ id: r.id, code: r.code, name: r.name, payment_type: r.payment_type, credit_days: r.credit_days, extra_cost_per_liter: Number(r.extra_cost_per_liter) }); setOpen(true); }}><Edit fontSize='small' /></IconButton>
                  <IconButton color='error' onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && !loading ? <TableRow><TableCell colSpan={6} align='center'>ไม่มีข้อมูล</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>

      <Drawer anchor='right' open={open} onClose={() => setOpen(false)}>
        <Stack sx={{ width: { xs: 320, sm: 460 }, p: 2 }} spacing={2}>
          <Typography variant='h6'>{form.id ? 'แก้ไขเงื่อนไข' : 'เพิ่มเงื่อนไข'}</Typography>
          <TextField label='รหัส' value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
          <TextField label='ชื่อเงื่อนไข' value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <TextField select label='ประเภทการชำระเงิน' value={form.payment_type} onChange={(e) => setForm((p) => ({ ...p, payment_type: e.target.value as 'CASH' | 'CREDIT' }))}>
            <MenuItem value='CASH'>เงินสด</MenuItem>
            <MenuItem value='CREDIT'>เครดิต</MenuItem>
          </TextField>
          <TextField label='Credit Day' type='number' value={form.credit_days} onChange={(e) => setForm((p) => ({ ...p, credit_days: Number(e.target.value) }))} disabled={form.payment_type === 'CASH'} />
          <TextField label='ค่าบวกเพิ่ม (บาท/ลิตร)' type='number' value={form.extra_cost_per_liter} onChange={(e) => setForm((p) => ({ ...p, extra_cost_per_liter: Number(e.target.value) }))} />
          <Button variant='contained' onClick={() => void save()} disabled={!form.code || !form.name}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบเงื่อนไขนี้ใช่หรือไม่</DialogContent>
        <DialogActions><Button onClick={() => setDeleteId(null)}>ยกเลิก</Button><Button color='error' onClick={() => void remove()}>ลบ</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
