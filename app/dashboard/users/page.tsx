'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, CloudUploadOutlined, Delete, Edit } from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  Button,
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
} from '@mui/material';
import { UserProfile, UserRole } from '@/types/database';

const roles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'ACCOUNTING', 'OPERATION', 'OWNER'];

type ProfileForm = {
  id?: string;
  full_name: string;
  role: UserRole;
  avatar_url: string;
};

const emptyForm: ProfileForm = { full_name: '', role: 'SALES', avatar_url: '' };

export default function UsersProfilePage() {
  const [companyId, setCompanyId] = useState('');
  const [rows, setRows] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const isEdit = useMemo(() => Boolean(form.id), [form.id]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
 
    const res = await fetch(`/api/users-profile?company_id=${companyId}`);
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
      id: form.id,
      company_id: companyId,
      full_name: form.full_name || null,
      role: form.role,
      avatar_url: form.avatar_url || null,
    };

    const res = await fetch(form.id ? `/api/users-profile/${form.id}` : '/api/users-profile', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) setError(data.error || 'บันทึกไม่สำเร็จ');
    else {
      setDrawerOpen(false);
      setForm(emptyForm);
      await load();
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    setError('');

    const res = await fetch(`/api/users-profile/${deleteId}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) setError(data.error || 'ลบไม่สำเร็จ');
    else {
      setDeleteId(null);
      await load();
    }
  };

  const applyImageFile = (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((p) => ({ ...p, avatar_url: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>จัดการโปรไฟล์ผู้ใช้</Typography>
      <Typography variant='body2' color='text.secondary'>ใช้สำหรับแก้ไขชื่อ, role และ avatar ของผู้ใช้งานที่ login</Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
{/*         <TextField fullWidth label='Company ID' value={companyId} onChange={(e) => setCompanyId(e.target.value)} /> */}
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setDrawerOpen(true); }}>เพิ่มโปรไฟล์</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Avatar</TableCell>
              <TableCell>User ID</TableCell>
              <TableCell>ชื่อ</TableCell>
              <TableCell>Role</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>
                  <Avatar src={r.avatar_url ?? undefined} sx={{ width: 28, height: 28, fontSize: 11 }}>
                    {String(r.full_name || 'U').slice(0, 2).toUpperCase()}
                  </Avatar>
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{r.id}</TableCell>
                <TableCell>{r.full_name ?? '-'}</TableCell>
                <TableCell>{r.role}</TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => {
                    setForm({ id: r.id, full_name: r.full_name ?? '', role: r.role, avatar_url: r.avatar_url ?? '' });
                    setDrawerOpen(true);
                  }}><Edit fontSize='small' /></IconButton>
                  <IconButton color='error' onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && !loading ? <TableRow><TableCell colSpan={5} align='center'>ไม่มีข้อมูล</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>

      <Drawer anchor='right' open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Stack sx={{ width: { xs: 330, sm: 460 }, p: 2 }} spacing={2}>
          <Typography variant='h6'>{isEdit ? 'แก้ไขโปรไฟล์' : 'เพิ่มโปรไฟล์'}</Typography>
          {!isEdit ? <TextField label='User ID (UUID จาก auth.users)' value={form.id ?? ''} onChange={(e) => setForm((p) => ({ ...p, id: e.target.value }))} /> : null}
          <TextField label='ชื่อผู้ใช้' value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
          <TextField select label='Role' value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))}>
            {roles.map((role) => <MenuItem key={role} value={role}>{role}</MenuItem>)}
          </TextField>

          <Stack spacing={1}>
            <Typography variant='body2' color='text.secondary'>รูปโปรไฟล์ (ลากไฟล์มาวาง หรือเลือกไฟล์ภาพ)</Typography>
            <Box
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                applyImageFile(e.dataTransfer.files?.[0]);
              }}
              sx={{
                border: '1px dashed',
                borderColor: dragActive ? '#0f172a' : 'divider',
                bgcolor: dragActive ? '#f8fafc' : 'transparent',
                borderRadius: 2,
                p: 2,
              }}
            >
              <Stack spacing={1} alignItems='center'>
                <Avatar src={form.avatar_url || undefined} sx={{ width: 64, height: 64 }}>
                  {String(form.full_name || 'U').slice(0, 2).toUpperCase()}
                </Avatar>
                <Typography variant='caption' color='text.secondary'>รองรับไฟล์ภาพ JPG/PNG/WebP</Typography>
                <Button component='label' size='small' variant='outlined' startIcon={<CloudUploadOutlined fontSize='small' />}>
                  Browse File
                  <input hidden type='file' accept='image/*' onChange={(e) => applyImageFile(e.target.files?.[0])} />
                </Button>
              </Stack>
            </Box>
            <TextField label='Avatar URL / Data URL' value={form.avatar_url} onChange={(e) => setForm((p) => ({ ...p, avatar_url: e.target.value }))} />
          </Stack>
          <Button variant='contained' onClick={() => void save()} disabled={!companyId || !form.id}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบโปรไฟล์นี้ใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void remove()}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
