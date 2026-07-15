'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
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
import { display } from '@mui/system';
import { ActionSnackbar, type ActionSnackbarSeverity } from '@/components/common/ActionSnackbar';

type Refinery = {
  id: string;
  name: string;
  contact_info: string | null;
  image_url: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type RefineryForm = {
  id?: string;
  name: string;
  contact_info: string;
  image_url: string;
  active: boolean;
};

const emptyForm: RefineryForm = { name: '', contact_info: '', image_url: '', active: true };

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
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: ActionSnackbarSeverity }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showSnack = (message: string, severity: ActionSnackbarSeverity) => {
    setSnack({ open: true, message, severity });
  };
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

  const load = async (showFeedback = false) => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/refineries?company_id=${companyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ');
      setRows(data);
      if (showFeedback) showSnack('รีเฟรชข้อมูลโรงกลั่นเรียบร้อยแล้ว', 'info');
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showSnack(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [companyId]);

  const save = async () => {
    const wasEditing = Boolean(form.id);
    setError('');
    try {
      const payload = {
        company_id: companyId,
        name: form.name,
        contact_info: form.contact_info || null,
        image_url: form.image_url || null,
        active: form.active,
      };

      const res = await fetch(form.id ? `/api/refineries/${form.id}` : '/api/refineries', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      setOpen(false);
      setForm(emptyForm);
      await load();
      showSnack(wasEditing ? 'แก้ไขข้อมูลโรงกลั่นเรียบร้อยแล้ว' : 'เพิ่มโรงกลั่นเรียบร้อยแล้ว', 'success');
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showSnack(message, 'error');
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    setError('');
    try {
      const res = await fetch(`/api/refineries/${deleteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
      setDeleteId(null);
      await load();
      showSnack('ลบข้อมูลโรงกลั่นเรียบร้อยแล้ว', 'success');
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showSnack(message, 'error');
    }
  };

  const onUploadImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      const message = 'ไฟล์รูปไม่ถูกต้อง กรุณาเลือกไฟล์ภาพ';
      setError(message);
      showSnack(message, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((p) => ({ ...p, image_url: String(reader.result || '') }));
      showSnack('เลือกรูปโรงกลั่นเรียบร้อยแล้ว', 'success');
    };
    reader.onerror = () => {
      const message = 'อ่านไฟล์รูปไม่สำเร็จ';
      setError(message);
      showSnack(message, 'error');
    };
    reader.readAsDataURL(file);
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
        <Button variant='outlined' onClick={() => void load(true)}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setOpen(true); showSnack('พร้อมเพิ่มโรงกลั่นใหม่', 'info'); }}>เพิ่มโรงกลั่น</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>ชื่อโรงกลั่น</TableCell>
              <TableCell>รูปภาพ</TableCell>
              <TableCell>ข้อมูลติดต่อ</TableCell>
              <TableCell>สถานะใช้งาน</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.name}</TableCell>
                <TableCell>
                  {r.image_url ? <Box component='img' src={r.image_url} alt={r.name} sx={{ width: 44, height: 44, borderRadius: 1, objectFit: 'cover', border: '1px solid #e2e8f0' }} /> : '-'}
                </TableCell>
                <TableCell>{r.contact_info ?? '-'}</TableCell>
                <TableCell><Chip size='small' color={r.active ? 'success' : 'default'} label={r.active ? 'ใช้งาน' : 'ปิดใช้งาน'} /></TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => { setForm({ id: r.id, name: r.name, contact_info: r.contact_info ?? '', image_url: r.image_url ?? '', active: r.active }); setOpen(true); showSnack(`กำลังแก้ไข “${r.name}”`, 'info'); }}><Edit fontSize='small' /></IconButton>
                  <IconButton color='error' onClick={() => { setDeleteId(r.id); showSnack('กรุณายืนยันการลบข้อมูลโรงกลั่น', 'warning'); }}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!filteredRows.length && !loading ? <TableRow><TableCell colSpan={5} align='center'>ไม่มีข้อมูลโรงกลั่น</TableCell></TableRow> : null}
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
          <Stack direction='row' spacing={1} alignItems='center'>
            <Button component='label' variant='outlined'>
              อัปโหลดรูป
              <input hidden accept='image/*' type='file' onChange={onUploadImage} />
            </Button>
            <Button variant='text' color='inherit' onClick={() => { setForm((p) => ({ ...p, image_url: '' })); showSnack('ล้างรูปโรงกลั่นแล้ว', 'warning'); }}>ล้างรูป</Button>
          </Stack>
          {form.image_url ? <Box component='img' src={form.image_url} alt='preview' sx={{ width: 96, height: 96, borderRadius: 1, objectFit: 'cover', border: '1px solid #e2e8f0' }} /> : null}
          <TextField sx={{ display : 'none'}} label='Image URL (ตัวเลือก)' value={form.image_url} onChange={(e) => setForm((p) => ({ ...p, image_url: e.target.value }))} />
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

      <ActionSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </Stack>
  );
}
