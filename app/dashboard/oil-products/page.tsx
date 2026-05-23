'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Delete, Edit } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
  TableRow,
  TextField,
  Typography,
  FormControlLabel,
} from '@mui/material';
import { resolveCompanyId as resolveCompanyIdClient } from '@/lib/supabase/company';

type OilProduct = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  color_hex: string;
  is_active: boolean;
};

type OilProductForm = {
  id?: string;
  code: string;
  name: string;
  color_hex: string;
  is_active: boolean;
};

const emptyForm: OilProductForm = { code: '', name: '', color_hex: '#2563EB', is_active: true };

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '_');
}

function normalizeColorHex(value: string): string {
  const raw = String(value ?? '').trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(raw)) return raw;
  return '#2563EB';
}

export default function OilProductsPage() {
  const [companyId, setCompanyId] = useState(resolveCompanyIdClient(undefined) ?? '');
  const [rows, setRows] = useState<OilProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OilProductForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const codePreview = useMemo(() => normalizeCode(form.code.trim()), [form.code]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');

    const res = await fetch(`/api/oil-products?company_id=${companyId}`);
    const data = await res.json();

    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data);

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const save = async () => {
    setError('');
    const payload = {
      ...form,
      company_id: companyId,
      code: normalizeCode(form.code.trim()),
      color_hex: normalizeColorHex(form.color_hex),
    };

    const res = await fetch(form.id ? `/api/oil-products/${form.id}` : '/api/oil-products', {
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

  const remove = async () => {
    if (!deleteId) return;
    setError('');
    const res = await fetch(`/api/oil-products/${deleteId}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) setError(data.error || 'ลบไม่สำเร็จ');
    else {
      setDeleteId(null);
      await load();
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>จัดการข้อมูลน้ำมัน</Typography>
      <Typography variant='body2' color='text.secondary'>จัดการข้อมูลรหัสน้ำมันเพื่อใช้เชื่อมกับราคาและใบสั่งซื้อ</Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField fullWidth label='Company ID' value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setOpen(true); }}>เพิ่มน้ำมัน</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>รหัส</TableCell>
              <TableCell>ชื่อน้ำมัน</TableCell>
              <TableCell>สี</TableCell>
              <TableCell>สถานะใช้งาน</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell><Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.code}</Typography></TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>
                  <Stack direction='row' spacing={1} alignItems='center'>
                    <Box sx={{ width: 22, height: 22, borderRadius: '6px', bgcolor: r.color_hex || '#2563EB', border: '1px solid #cbd5e1' }} />
                    <Typography sx={{ fontFamily: 'monospace' }}>{r.color_hex || '#2563EB'}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Chip size='small' color={r.is_active ? 'success' : 'default'} label={r.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'} />
                </TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => { setForm({ id: r.id, code: r.code, name: r.name, color_hex: r.color_hex || '#2563EB', is_active: r.is_active }); setOpen(true); }}><Edit fontSize='small' /></IconButton>
                  <IconButton color='error' onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && !loading ? <TableRow><TableCell colSpan={5} align='center'>ไม่มีข้อมูลน้ำมัน</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>

      <Drawer anchor='right' open={open} onClose={() => setOpen(false)}>
        <Stack sx={{ width: { xs: 320, sm: 440 }, p: 2 }} spacing={2}>
          <Typography variant='h6'>{form.id ? 'แก้ไขข้อมูลน้ำมัน' : 'เพิ่มข้อมูลน้ำมัน'}</Typography>
          <TextField
            label='รหัส'
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
            helperText={codePreview ? `รหัสที่บันทึกจริง: ${codePreview}` : 'เช่น DIESEL_B7, GASOHOL_95'}
          />
          <TextField label='ชื่อน้ำมัน' value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Stack direction='row' spacing={1.2} alignItems='center'>
            <TextField
              type='color'
              label='เลือกสี'
              value={normalizeColorHex(form.color_hex)}
              onChange={(e) => setForm((p) => ({ ...p, color_hex: normalizeColorHex(e.target.value) }))}
              sx={{ width: 120 }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label='รหัสสี'
              value={form.color_hex}
              onChange={(e) => setForm((p) => ({ ...p, color_hex: normalizeColorHex(e.target.value) }))}
              helperText='รูปแบบ #RRGGBB'
              sx={{ flex: 1 }}
            />
            <Box sx={{ width: 36, height: 36, borderRadius: 1, bgcolor: normalizeColorHex(form.color_hex), border: '1px solid #cbd5e1' }} />
          </Stack>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
            }
            label='สถานะใช้งาน'
          />
          <Button variant='contained' onClick={() => void save()} disabled={!form.code.trim() || !form.name.trim()}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบข้อมูลน้ำมันนี้ใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void remove()}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
