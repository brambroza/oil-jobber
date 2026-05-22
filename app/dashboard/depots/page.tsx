'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Delete, Edit } from '@mui/icons-material';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, IconButton, Stack, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { Depot } from '@/types/database';

type DepotForm = { id?: string; code: string; name: string; pickup_cost_per_liter: number };
const emptyForm: DepotForm = { code: '', name: '', pickup_cost_per_liter: 0 };
const DEFAULT_COMPANY_ID = process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '';

function normalizeDepotCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '_');
}

export default function DepotsPage() {
  const [companyId, setCompanyId] = useState(DEFAULT_COMPANY_ID);
  const [rows, setRows] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DepotForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const codePreview = useMemo(() => normalizeDepotCode(form.code.trim()), [form.code]);
  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const d = searchDate.trim();
    return rows.filter((r) => {
      const okText =
        !q ||
        (r.code || '').toLowerCase().includes(q) ||
        (r.name || '').toLowerCase().includes(q);
      const okDate = !d || String(r.created_at || '').includes(d) || String(r.updated_at || '').includes(d);
      return okText && okDate;
    });
  }, [rows, searchDate, searchText]);
  const pagedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    const res = await fetch(`/api/depots?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [companyId]);

  const save = async () => {
    setError('');
    const payload = {
      ...form,
      code: normalizeDepotCode(form.code.trim()),
      company_id: companyId,
    };

    const res = await fetch(form.id ? `/api/depots/${form.id}` : '/api/depots', {
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
    const res = await fetch(`/api/depots/${deleteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'ลบไม่สำเร็จ');
    else { setDeleteId(null); await load(); }
  };

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>คลังน้ำมัน</Typography>
      <Typography variant='body2' color='text.secondary'>กำหนด `code` ให้ชัดเจนเพื่อใช้เชื่อมกับโมดูลราคาน้ำมันและสูตรคำนวณราคา</Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          size='small'
          label='ค้นหาคลังน้ำมัน'
          placeholder='Code หรือ ชื่อ'
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: { xs: '100%', md: 280 } }}
        />
        <TextField
          size='small'
          label='ค้นหาตามวันที่'
          placeholder='YYYY-MM-DD'
          value={searchDate}
          onChange={(e) => {
            setSearchDate(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: { xs: '100%', md: 220 } }}
        />
        <TextField
          sx={{ display: 'none' }}
          fullWidth
          label='Company ID'
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          helperText='ตั้งค่า default ได้ที่ NEXT_PUBLIC_DEFAULT_COMPANY_ID'
        />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setOpen(true); }}>เพิ่ม</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>ชื่อคลังน้ำมัน</TableCell>
              <TableCell>ค่ารับขึ้น (บาท/ลิตร)</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.code}</Typography></TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{Number(r.pickup_cost_per_liter).toFixed(4)}</TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => { setForm({ id: r.id, code: r.code, name: r.name, pickup_cost_per_liter: Number(r.pickup_cost_per_liter) }); setOpen(true); }}><Edit fontSize='small' /></IconButton>
                  <IconButton color='error' onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!filteredRows.length && !loading ? <TableRow><TableCell colSpan={4} align='center'>ไม่มีข้อมูล</TableCell></TableRow> : null}
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
        <Stack sx={{ width: { xs: 320, sm: 440 }, p: 2 }} spacing={2}>
          <Typography variant='h6'>{form.id ? 'แก้ไขคลังน้ำมัน' : 'เพิ่มคลังน้ำมัน'}</Typography>
          <TextField
            label='Code'
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
            helperText={codePreview ? `รหัสที่บันทึกจริง: ${codePreview}` : 'เช่น SRIRACHA, SARABURI, BANG_PA_IN'}
          />
          <TextField label='ชื่อคลังน้ำมัน' value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <TextField label='ค่ารับขึ้น (บาท/ลิตร)' type='number' value={form.pickup_cost_per_liter} onChange={(e) => setForm((p) => ({ ...p, pickup_cost_per_liter: Number(e.target.value) }))} />
          <Button variant='contained' onClick={() => void save()} disabled={!form.code.trim() || !form.name.trim()}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบคลังน้ำมันนี้ใช่หรือไม่</DialogContent>
        <DialogActions><Button onClick={() => setDeleteId(null)}>ยกเลิก</Button><Button color='error' onClick={() => void remove()}>ลบ</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
