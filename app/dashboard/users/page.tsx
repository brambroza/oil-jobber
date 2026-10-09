'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, CloudUploadOutlined, Delete, Edit } from '@mui/icons-material';
import SignatureUploader from '@/components/common/SignatureUploader';
import {
  Alert,
  Avatar,
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
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { UserProfile, UserRole } from '@/types/database';
import { ALL_ROLES } from '@/lib/auth/permissions';
import { RequireModule } from '@/components/common/RequireModule';
import { useCurrentUser } from '@/components/layout/CurrentUserProvider';

const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: 'ผู้ดูแลสูงสุด',
  ADMIN: 'ผู้ดูแลระบบ',
  OWNER: 'เจ้าของกิจการ',
  SALES_MANAGER: 'ผู้จัดการฝ่ายขาย',
  SALES: 'พนักงานขาย',
  ACCOUNTING: 'บัญชี',
  OPERATION: 'ปฏิบัติการ',
};

type CreateForm = { email: string; password: string; full_name: string; role: UserRole };
type EditForm = { id: string; full_name: string; email: string; role: UserRole; avatar_url: string; signature_url: string | null; password: string };

const emptyCreate: CreateForm = { email: '', password: '', full_name: '', role: 'SALES' };

/** Staff user management: create login + profile, edit role/name, reset password, disable. */
function UsersProfileContent() {
  const me = useCurrentUser();
  const [rows, setRows] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const createValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email) && createForm.password.length >= 8 && createForm.full_name.trim().length > 0,
    [createForm],
  );

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await fetch('/api/users-profile', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const createUser = async () => {
    setSaving(true);
    setError('');
    const res = await fetch('/api/users-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'สร้างผู้ใช้ไม่สำเร็จ');
      return;
    }
    setCreateOpen(false);
    setCreateForm(emptyCreate);
    setNotice(`สร้างผู้ใช้ ${data.full_name || data.email} แล้ว`);
    await load();
  };

  const saveEdit = async () => {
    if (!editForm) return;
    setSaving(true);
    setError('');
    const payload: Record<string, unknown> = {
      full_name: editForm.full_name || null,
      role: editForm.role,
      avatar_url: editForm.avatar_url || null,
      signature_url: editForm.signature_url,
      email: editForm.email || undefined,
      password: editForm.password || undefined,
    };
    const res = await fetch(`/api/users-profile/${editForm.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'บันทึกไม่สำเร็จ');
      return;
    }
    setEditForm(null);
    setNotice('บันทึกข้อมูลผู้ใช้แล้ว');
    await load();
  };

  const remove = async () => {
    if (!deleteId) return;
    setError('');
    const res = await fetch(`/api/users-profile/${deleteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'ปิดใช้งานไม่สำเร็จ');
    else {
      setDeleteId(null);
      setNotice('ปิดใช้งานผู้ใช้แล้ว');
      await load();
    }
  };

  const applyImageFile = (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditForm((p) => (p ? { ...p, avatar_url: String(reader.result || '') } : p));
    };
    reader.readAsDataURL(file);
  };

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>จัดการผู้ใช้งาน</Typography>
      <Typography variant='body2' color='text.secondary'>สร้างบัญชีพนักงาน กำหนดบทบาท (เช่น พนักงานขาย) รีเซ็ตรหัสผ่าน และปิดใช้งาน</Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setCreateForm(emptyCreate); setCreateOpen(true); }}>สร้างผู้ใช้</Button>
      </Stack>

      {error ? <Alert severity='error' onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert severity='success' onClose={() => setNotice('')}>{notice}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>ผู้ใช้</TableCell>
              <TableCell>อีเมล</TableCell>
              <TableCell>บทบาท</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>
                  <Stack direction='row' spacing={1} alignItems='center'>
                    <Avatar src={r.avatar_url ?? undefined} sx={{ width: 28, height: 28, fontSize: 11 }}>
                      {String(r.full_name || 'U').slice(0, 2).toUpperCase()}
                    </Avatar>
                    <Typography fontSize={13} fontWeight={600}>{r.full_name ?? '-'}</Typography>
                    {me?.userId === r.id ? <Chip size='small' label='คุณ' /> : null}
                  </Stack>
                </TableCell>
                <TableCell>{r.email ?? '-'}</TableCell>
                <TableCell>
                  <Chip size='small' label={`${roleLabels[r.role] ?? r.role} (${r.role})`} color={r.role === 'SALES' ? 'primary' : r.role === 'SALES_MANAGER' ? 'secondary' : 'default'} variant='outlined' />
                </TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => setEditForm({ id: r.id, full_name: r.full_name ?? '', email: r.email ?? '', role: r.role, avatar_url: r.avatar_url ?? '', signature_url: r.signature_url ?? null, password: '' })}>
                    <Edit fontSize='small' />
                  </IconButton>
                  <IconButton color='error' disabled={me?.userId === r.id} onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && !loading ? <TableRow><TableCell colSpan={4} align='center'>ไม่มีข้อมูล</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth='sm'>
        <DialogTitle>สร้างผู้ใช้ใหม่</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id='create-user-email' label='อีเมล (ใช้เข้าสู่ระบบ)' type='email' value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} autoFocus />
            <TextField id='create-user-password' label='รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)' type='password' value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))} />
            <TextField id='create-user-name' label='ชื่อ-นามสกุล' value={createForm.full_name} onChange={(e) => setCreateForm((p) => ({ ...p, full_name: e.target.value }))} />
            <TextField id='create-user-role' select label='บทบาท' value={createForm.role} onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value as UserRole }))}>
              {ALL_ROLES.map((role) => <MenuItem key={role} value={role}>{roleLabels[role]} ({role})</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>ยกเลิก</Button>
          <Button variant='contained' disabled={!createValid || saving} onClick={() => void createUser()}>สร้างผู้ใช้</Button>
        </DialogActions>
      </Dialog>

      <Drawer anchor='right' open={Boolean(editForm)} onClose={() => setEditForm(null)}>
        {editForm ? (
          <Stack sx={{ width: { xs: 330, sm: 460 }, p: 2 }} spacing={2}>
            <Typography variant='h6'>แก้ไขผู้ใช้</Typography>
            <TextField label='ชื่อ-นามสกุล' value={editForm.full_name} onChange={(e) => setEditForm((p) => (p ? { ...p, full_name: e.target.value } : p))} />
            <TextField label='อีเมล' type='email' value={editForm.email} onChange={(e) => setEditForm((p) => (p ? { ...p, email: e.target.value } : p))} />
            <TextField select label='บทบาท' value={editForm.role} disabled={me?.userId === editForm.id} onChange={(e) => setEditForm((p) => (p ? { ...p, role: e.target.value as UserRole } : p))}>
              {ALL_ROLES.map((role) => <MenuItem key={role} value={role}>{roleLabels[role]} ({role})</MenuItem>)}
            </TextField>
            <TextField label='รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' type='password' value={editForm.password} onChange={(e) => setEditForm((p) => (p ? { ...p, password: e.target.value } : p))} helperText='อย่างน้อย 8 ตัวอักษร' />

            <Stack spacing={1}>
              <Typography variant='body2' color='text.secondary'>รูปโปรไฟล์ (ลากไฟล์มาวาง หรือเลือกไฟล์ภาพ)</Typography>
              <Box
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => { e.preventDefault(); setDragActive(false); applyImageFile(e.dataTransfer.files?.[0]); }}
                sx={{ border: '1px dashed', borderColor: dragActive ? '#0f172a' : 'divider', bgcolor: dragActive ? '#f8fafc' : 'transparent', borderRadius: 2, p: 2 }}
              >
                <Stack spacing={1} alignItems='center'>
                  <Avatar src={editForm.avatar_url || undefined} sx={{ width: 64, height: 64 }}>
                    {String(editForm.full_name || 'U').slice(0, 2).toUpperCase()}
                  </Avatar>
                  <Typography variant='caption' color='text.secondary'>รองรับไฟล์ภาพ JPG/PNG/WebP</Typography>
                  <Button component='label' size='small' variant='outlined' startIcon={<CloudUploadOutlined fontSize='small' />}>
                    เลือกไฟล์
                    <input hidden type='file' accept='image/*' onChange={(e) => applyImageFile(e.target.files?.[0])} />
                  </Button>
                </Stack>
              </Box>
            </Stack>
            <SignatureUploader value={editForm.signature_url} onChange={(next) => setEditForm((p) => (p ? { ...p, signature_url: next } : p))} />
            <Button variant='contained' onClick={() => void saveEdit()} disabled={saving || (editForm.password.length > 0 && editForm.password.length < 8)}>บันทึก</Button>
          </Stack>
        ) : null}
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการปิดใช้งาน</DialogTitle>
        <DialogContent>ผู้ใช้นี้จะเข้าสู่ระบบไม่ได้อีก ต้องการปิดใช้งานใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void remove()}>ปิดใช้งาน</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default function UsersProfilePage() {
  return (
    <RequireModule module='users'>
      <UsersProfileContent />
    </RequireModule>
  );
}
