'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Delete, Edit } from '@mui/icons-material';
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

type Refinery = {
  id: string;
  name: string;
  contact_info: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type RefineryForm = {
  id?: string;
  name: string;
  contact_info: string;
  active: boolean;
};

const emptyForm: RefineryForm = { name: '', contact_info: '', active: true };

export default function RefineriesPage() {
  const [companyId, setCompanyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');
  const [rows, setRows] = useState<Refinery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RefineryForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const d = searchDate.trim();
    return rows.filter((r) => {
      const okText =
        !q ||
        (r.name || '').toLowerCase().includes(q) ||
        (r.contact_info || '').toLowerCase().includes(q) ||
        (r.active ? 'ใช้งาน' : 'ปิดใช้งาน').includes(q);
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
    const res = await fetch(`/api/refineries?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [companyId]);

  const save = async () => {
    setError('');
    const payload = {
      company_id: companyId,
      name: form.name,
      contact_info: form.contact_info || null,
      active: form.active,
    };

    const res = await fetch(form.id ? `/api/refineries/${form.id}` : '/api/refineries', {
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
    const res = await fetch(`/api/refineries/${deleteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'ลบไม่สำเร็จ');
    else { setDeleteId(null); await load(); }
  };

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>จัดการโรงกลั่น</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          size='small'
          label='ค้นหาโรงกลั่น'
          placeholder='ชื่อโรงกลั่น, ข้อมูลติดต่อ'
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
     {/*    <TextField fullWidth label='Company ID' value={companyId} onChange={(e) => setCompanyId(e.target.value)} /> */}
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setOpen(true); }}>เพิ่มโรงกลั่น</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>ชื่อโรงกลั่น</TableCell>
              <TableCell>ข้อมูลติดต่อ</TableCell>
              <TableCell>สถานะใช้งาน</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.contact_info ?? '-'}</TableCell>
                <TableCell><Chip size='small' color={r.active ? 'success' : 'default'} label={r.active ? 'ใช้งาน' : 'ปิดใช้งาน'} /></TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => { setForm({ id: r.id, name: r.name, contact_info: r.contact_info ?? '', active: r.active }); setOpen(true); }}><Edit fontSize='small' /></IconButton>
                  <IconButton color='error' onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!filteredRows.length && !loading ? <TableRow><TableCell colSpan={4} align='center'>ไม่มีข้อมูลโรงกลั่น</TableCell></TableRow> : null}
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
          <Typography variant='h6'>{form.id ? 'แก้ไขโรงกลั่น' : 'เพิ่มโรงกลั่น'}</Typography>
          <TextField label='ชื่อโรงกลั่น' value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <TextField label='ข้อมูลติดต่อ' value={form.contact_info} onChange={(e) => setForm((p) => ({ ...p, contact_info: e.target.value }))} />
          <TextField select label='สถานะใช้งาน' value={form.active ? 'true' : 'false'} onChange={(e) => setForm((p) => ({ ...p, active: e.target.value === 'true' }))}>
            <MenuItem value='true'>ใช้งาน</MenuItem>
            <MenuItem value='false'>ปิดใช้งาน</MenuItem>
          </TextField>
          <Button variant='contained' onClick={() => void save()} disabled={!form.name.trim()}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบข้อมูลโรงกลั่นนี้ใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void remove()}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
