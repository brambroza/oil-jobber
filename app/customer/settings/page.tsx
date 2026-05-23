'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import SaveRounded from '@mui/icons-material/SaveRounded';
import DeleteForeverRounded from '@mui/icons-material/DeleteForeverRounded';
import UploadRounded from '@mui/icons-material/UploadRounded';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CustomerShell from '@/components/layout/CustomerShell';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type MeData = {
  email: string;
  customer_name: string | null;
  display_name: string;
  avatar_url: string;
};

type CustomerData = {
  id: string;
  company_name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  credit_limit: number;
  status: string;
};

export default function CustomerSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [me, setMe] = useState<MeData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');

    const [meRes, customerRes] = await Promise.all([
      fetch('/api/customer-portal/me', { cache: 'no-store' }),
      fetch('/api/customer-portal/customer', { cache: 'no-store' }),
    ]);

    const [meJson, customerJson] = await Promise.all([meRes.json(), customerRes.json()]);

    if (!meRes.ok) {
      setError(meJson.error || 'โหลดโปรไฟล์ไม่สำเร็จ');
      setLoading(false);
      return;
    }

    if (!customerRes.ok) {
      setError(customerJson.error || 'โหลดข้อมูลลูกค้าไม่สำเร็จ');
      setLoading(false);
      return;
    }

    setMe(meJson);
    setCustomer(customerJson);

    setDisplayName(meJson.display_name || meJson.customer_name || '');
    setAvatarUrl(meJson.avatar_url || '');
    setCompanyName(customerJson.company_name || '');
    setTaxId(customerJson.tax_id || '');
    setAddress(customerJson.address || '');
    setPhone(customerJson.phone || '');

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const onAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('ไฟล์รูปไม่ถูกต้อง กรุณาเลือกไฟล์ภาพ');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(String(reader.result || ''));
      setError('');
    };
    reader.onerror = () => setError('อ่านไฟล์รูปไม่สำเร็จ');
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    const [meRes, customerRes] = await Promise.all([
      fetch('/api/customer-portal/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, avatar_url: avatarUrl }),
      }),
      fetch('/api/customer-portal/customer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          tax_id: taxId,
          address,
          phone,
        }),
      }),
    ]);

    const [meJson, customerJson] = await Promise.all([meRes.json(), customerRes.json()]);

    if (!meRes.ok) {
      setError(meJson.error || 'บันทึกโปรไฟล์ไม่สำเร็จ');
      setSaving(false);
      return;
    }

    if (!customerRes.ok) {
      setError(customerJson.error || 'บันทึกข้อมูลลูกค้าไม่สำเร็จ');
      setSaving(false);
      return;
    }

    setSuccess('บันทึกข้อมูลเรียบร้อย');
    setSaving(false);
    await load();
  };

  const onDeleteCustomer = async () => {
    setError('');
    const res = await fetch('/api/customer-portal/customer', { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'ลบบัญชีลูกค้าไม่สำเร็จ');
      return;
    }

    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <CustomerShell title='ตั้งค่าโปรไฟล์' subtitle='จัดการข้อมูลบัญชีลูกค้า'>
      <Stack spacing={1.5} sx={{ maxWidth: 860 }}>
        {error ? <Alert severity='error'>{error}</Alert> : null}
        {success ? <Alert severity='success'>{success}</Alert> : null}
        {loading ? <Alert severity='info'>กำลังโหลดโปรไฟล์...</Alert> : null}

        <Paper sx={{ borderRadius: 2, border: '1px solid #d7e1ef', p: { xs: 1.5, md: 2 } }}>
          <Stack spacing={2}>
            <Typography sx={{ fontSize: 18, fontWeight: 800 }}>โปรไฟล์ผู้ใช้งาน</Typography>

            <Stack direction='row' spacing={1.2} alignItems='center'>
              <Avatar src={avatarUrl || undefined} sx={{ width: 64, height: 64 }} />
              <Box>
                <Typography fontWeight={800}>{displayName || me?.customer_name || '-'}</Typography>
                <Typography color='text.secondary'>{me?.email || '-'}</Typography>
              </Box>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component='label' variant='outlined' startIcon={<UploadRounded />} sx={{ width: { xs: '100%', sm: 'fit-content' } }}>
                อัปโหลดรูป Avatar
                <input hidden accept='image/*' type='file' onChange={onAvatarUpload} />
              </Button>
              <Button variant='text' color='inherit' onClick={() => setAvatarUrl('')} sx={{ width: { xs: '100%', sm: 'fit-content' } }}>
                ล้างรูป
              </Button>
            </Stack>

            <TextField label='ชื่อที่แสดง' value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <TextField label='Avatar URL (ตัวเลือก)' value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder='https://...' />
          </Stack>
        </Paper>

        <Paper sx={{ borderRadius: 2, border: '1px solid #d7e1ef', p: { xs: 1.5, md: 2 } }}>
          <Stack spacing={2}>
            <Typography sx={{ fontSize: 18, fontWeight: 800 }}>ข้อมูลบริษัท</Typography>
            <TextField label='ชื่อบริษัท' value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            <TextField label='เลขประจำตัวผู้เสียภาษี' value={taxId} onChange={(e) => setTaxId(e.target.value)} />
            <TextField label='เบอร์โทร' value={phone} onChange={(e) => setPhone(e.target.value)} />
            <TextField label='ที่อยู่' value={address} onChange={(e) => setAddress(e.target.value)} multiline minRows={3} />
            <TextField label='สถานะ' value={customer?.status || '-'} InputProps={{ readOnly: true }} />
            <TextField label='วงเงินเครดิต' value={Number(customer?.credit_limit || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} InputProps={{ readOnly: true }} />
          </Stack>
        </Paper>

        <Stack direction='row' justifyContent='space-between' spacing={1}>
          <Button color='error' variant='outlined' startIcon={<DeleteForeverRounded />} onClick={() => setDeleteOpen(true)}>
            ลบข้อมูลลูกค้าของฉัน
          </Button>
          <Button variant='contained' startIcon={<SaveRounded />} onClick={() => void onSave()} disabled={saving || !companyName.trim()}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}
          </Button>
        </Stack>
      </Stack>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>ยืนยันลบข้อมูลลูกค้า</DialogTitle>
        <DialogContent>การลบจะปิดสิทธิ์เข้าใช้งานพอร์ทัลลูกค้านี้ทันที ต้องการดำเนินการต่อหรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void onDeleteCustomer()}>ยืนยันลบ</Button>
        </DialogActions>
      </Dialog>
    </CustomerShell>
  );
}
