'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
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
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Delete, Edit, Image as ImageIcon, Send } from '@mui/icons-material';
import { ActionSnackbar, type ActionSnackbarSeverity } from '@/components/common/ActionSnackbar';
import { PageScaffold } from '@/components/common/PageScaffold';

type LineCustomer = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  customers?: { company_name?: string | null; is_deleted?: boolean | null } | Array<{ company_name?: string | null; is_deleted?: boolean | null }> | null;
};

type NewsBroadcast = {
  id: string;
  seq: number;
  title: string;
  descriptions: string;
  sent_at: string | null;
  status: string;
  created_at: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  recipient_ids: string[];
  image_urls: string[];
};

type FormState = {
  id?: string;
  seq: number;
  title: string;
  descriptions: string;
  recipient_ids: string[];
  image_urls: string[];
};

const emptyForm: FormState = {
  seq: 1,
  title: '',
  descriptions: '',
  recipient_ids: [],
  image_urls: [],
};

function statusColor(status: string) {
  if (status === 'SENT') return 'success';
  if (status === 'PARTIAL') return 'warning';
  if (status === 'SENDING') return 'secondary';
  return 'default';
}

function getLineCustomerName(customer: LineCustomer) {
  const linkedCustomer = Array.isArray(customer.customers) ? customer.customers[0] : customer.customers;
  return linkedCustomer?.company_name || customer.display_name || customer.line_user_id;
}

export default function LineNewsPage() {
  const companyId = process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '';
  const [rows, setRows] = useState<NewsBroadcast[]>([]);
  const [lineCustomers, setLineCustomers] = useState<LineCustomer[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: ActionSnackbarSeverity }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showSnack = (message: string, severity: ActionSnackbarSeverity) => {
    setSnack({ open: true, message, severity });
  };

  const nextSeq = useMemo(() => Math.max(0, ...rows.map((row) => Number(row.seq || 0))) + 1, [rows]);
  const selectedAll = lineCustomers.length > 0 && form.recipient_ids.length === lineCustomers.length;
  const selectedSome = form.recipient_ids.length > 0 && !selectedAll;

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const [newsRes, customerRes] = await Promise.all([
        fetch(`/api/line/news-broadcasts?company_id=${companyId}`),
        fetch(`/api/line/customers/linked?company_id=${companyId}`),
      ]);
      const [newsData, customerData] = await Promise.all([newsRes.json(), customerRes.json()]);
      if (!newsRes.ok) throw new Error(newsData.error || 'โหลดข่าวสาร LINE ไม่สำเร็จ');
      if (!customerRes.ok) throw new Error(customerData.error || 'โหลดลูกค้า LINE ไม่สำเร็จ');
      setRows(newsData);
      setLineCustomers(customerData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const openNew = () => {
    setForm({ ...emptyForm, seq: nextSeq });
    setOpen(true);
    setError('');
    showSnack('พร้อมสร้างข่าวสาร LINE ใหม่', 'info');
  };

  const openEdit = (row: NewsBroadcast) => {
    setForm({
      id: row.id,
      seq: Number(row.seq || 1),
      title: row.title || '',
      descriptions: row.descriptions || '',
      recipient_ids: row.recipient_ids || [],
      image_urls: row.image_urls || [],
    });
    setOpen(true);
    setError('');
    showSnack(`กำลังแก้ไขข่าวสาร “${row.title}”`, 'info');
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (form.image_urls.length + files.length > 4) {
      const message = 'แนบรูปภาพได้สูงสุด 4 รูปต่อข่าวสาร (รวมกับข้อความแล้วไม่เกิน 5 รายการตามข้อจำกัด LINE)';
      setError(message);
      showSnack(message, 'warning');
      return;
    }
    if (files.some((file) => !file.type.startsWith('image/'))) {
      const message = 'กรุณาเลือกไฟล์ภาพเท่านั้น';
      setError(message);
      showSnack(message, 'error');
      return;
    }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      const message = 'ไฟล์ภาพต้องมีขนาดไม่เกิน 10 MB';
      setError(message);
      showSnack(message, 'error');
      return;
    }

    setUploadingImage(true);
    setError('');
    try {
      const urls = await Promise.all(files.map(async (file) => {
        const data = new FormData();
        data.append('company_id', companyId);
        data.append('file', file);
        const response = await fetch('/api/line/news-broadcasts/upload-image', { method: 'POST', body: data });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'อัปโหลดรูปภาพไม่สำเร็จ');
        return String(result.url);
      }));
      setForm((prev) => ({ ...prev, image_urls: [...prev.image_urls, ...urls] }));
      showSnack(`อัปโหลดรูปภาพสำเร็จ ${urls.length} รูป`, 'success');
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showSnack(message, 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleRecipient = (id: string) => {
    setForm((prev) => ({
      ...prev,
      recipient_ids: prev.recipient_ids.includes(id)
        ? prev.recipient_ids.filter((item) => item !== id)
        : [...prev.recipient_ids, id],
    }));
  };

  const submit = async (action: 'DRAFT' | 'SEND_NOW') => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        company_id: companyId,
        seq: form.seq,
        title: form.title,
        descriptions: form.descriptions,
        image_urls: form.image_urls,
        recipient_ids: form.recipient_ids,
        status: 'DRAFT',
        action,
      };

      if (form.id) {
        const updateRes = await fetch(`/api/line/news-broadcasts/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const updateData = await updateRes.json();
        if (!updateRes.ok) throw new Error(updateData.error || 'บันทึกข่าวสาร LINE ไม่สำเร็จ');

        if (action === 'SEND_NOW') {
          const sendRes = await fetch(`/api/line/news-broadcasts/${form.id}/send`, { method: 'POST' });
          const sendData = await sendRes.json();
          if (!sendRes.ok && sendRes.status !== 207) throw new Error(sendData.error || 'ส่งข่าวสาร LINE ไม่สำเร็จ');
          showSnack(
            sendRes.status === 207 ? 'ส่งข่าวสารบางรายการไม่สำเร็จ กรุณาตรวจสอบสถานะ' : 'ส่งข่าวสาร LINE เรียบร้อยแล้ว',
            sendRes.status === 207 ? 'warning' : 'success',
          );
        } else {
          showSnack('บันทึก Draft เรียบร้อยแล้ว', 'success');
        }
      } else {
        const res = await fetch('/api/line/news-broadcasts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok && res.status !== 207) throw new Error(data.error || 'บันทึกข่าวสาร LINE ไม่สำเร็จ');
        const message = action === 'SEND_NOW'
          ? (res.status === 207 ? 'ส่งข่าวสารบางรายการไม่สำเร็จ กรุณาตรวจสอบสถานะ' : 'ส่งข่าวสาร LINE เรียบร้อยแล้ว')
          : 'บันทึก Draft เรียบร้อยแล้ว';
        showSnack(message, res.status === 207 ? 'warning' : 'success');
      }

      setOpen(false);
      await load();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showSnack(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendExisting = async (row: NewsBroadcast) => {
    const isResend = ['SENT', 'PARTIAL'].includes(row.status);
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/line/news-broadcasts/${row.id}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error || 'ส่งข่าวสาร LINE ไม่สำเร็จ');
      showSnack(
        res.status === 207
          ? `${isResend ? 'ส่งข่าวสารซ้ำ' : 'ส่งข่าวสาร'}บางรายการไม่สำเร็จ กรุณาตรวจสอบสถานะ`
          : `${isResend ? 'ส่งข่าวสาร LINE ซ้ำ' : 'ส่งข่าวสาร LINE'} เรียบร้อยแล้ว`,
        res.status === 207 ? 'warning' : 'success',
      );
      await load();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showSnack(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/line/news-broadcasts/${deleteId}?company_id=${companyId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      const message = data.error || 'ลบข่าวสาร LINE ไม่สำเร็จ';
      setError(message);
      showSnack(message, 'error');
      return;
    }
    setDeleteId(null);
    showSnack('ลบข่าวสาร LINE เรียบร้อยแล้ว', 'success');
    await load();
  };

  const removeImage = (index: number) => {
    setForm((prev) => ({ ...prev, image_urls: prev.image_urls.filter((_, itemIndex) => itemIndex !== index) }));
    showSnack(`นำรูปที่ ${index + 1} ออกจากข่าวสารแล้ว`, 'warning');
  };

  const openDeleteDialog = (id: string) => {
    setDeleteId(id);
    showSnack('กรุณายืนยันการลบข่าวสาร', 'warning');
  };

  const selectedCustomerNames = useMemo(() => {
    const selected = new Set(form.recipient_ids);
    return lineCustomers
      .filter((customer) => selected.has(customer.id))
      .map((customer) => getLineCustomerName(customer));
  }, [form.recipient_ids, lineCustomers]);

  return (
    <PageScaffold title='ส่งข่าวสาร LINE'>
      <Stack spacing={2}>
        <Stack direction='row' justifyContent='flex-end' spacing={1}>
          <Button variant='contained' startIcon={<Add />} onClick={openNew}>สร้างข่าวสาร</Button>
        </Stack>
        {error ? <Alert severity='error'>{error}</Alert> : null}
        {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

        <Paper variant='outlined' sx={{ overflowX: 'auto', borderColor: '#dbe4f0' }}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell width={90}>Seq</TableCell>
                <TableCell>หัวข้อ</TableCell>
                <TableCell>ผู้รับ</TableCell>
                <TableCell>สถานะ</TableCell>
                <TableCell align='right'>จัดการ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.seq}</TableCell>
                  <TableCell>
                    <Typography fontWeight={700}>{row.title}</Typography>
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block', maxWidth: 520 }} noWrap>
                      {row.descriptions}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction='row' spacing={0.5} flexWrap='wrap'>
                      <Chip size='small' label={`ทั้งหมด ${row.recipient_count}`} />
                      <Chip size='small' color='success' label={`ส่งแล้ว ${row.sent_count}`} />
                      {row.failed_count ? <Chip size='small' color='warning' label={`ผิดพลาด ${row.failed_count}`} /> : null}
                    </Stack>
                  </TableCell>
                  <TableCell><Chip size='small' color={statusColor(row.status) as any} label={row.status} /></TableCell>
                  <TableCell align='right'>
                    <IconButton
                      size='small'
                      aria-label='แก้ไขข่าวสาร'
                      title='แก้ไขข่าวสาร'
                      disabled={saving || row.status === 'SENDING'}
                      onClick={() => openEdit(row)}
                    >
                      <Edit fontSize='small' />
                    </IconButton>
                 {/*    <IconButton
                      size='small'
                      color='primary'
                      aria-label={['SENT', 'PARTIAL'].includes(row.status) ? 'ส่งข่าวสาร LINE ซ้ำ' : 'ส่งข่าวสาร LINE'}
                      title={['SENT', 'PARTIAL'].includes(row.status) ? 'ส่ง LINE อีกครั้ง' : 'ส่ง LINE'}
                      disabled={saving || row.status === 'SENDING'}
                      onClick={() => void sendExisting(row)}
                    >
                      <Send fontSize='small' />
                    </IconButton> */}
                    <IconButton size='small' color='error' onClick={() => openDeleteDialog(row.id)}><Delete fontSize='small' /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && !loading ? (
                <TableRow><TableCell colSpan={5} align='center'>ยังไม่มีข่าวสาร LINE</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Paper>
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth='lg' fullWidth>
        <DialogTitle>{form.id ? 'แก้ไขข่าวสาร LINE' : 'สร้างข่าวสาร LINE'}</DialogTitle>
        <DialogContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ pt: 1 }}>
            <Stack spacing={1.5} sx={{ flex: 1.2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  size='small'
                  label='Seq'
                  type='number'
                  value={form.seq}
                  onChange={(e) => setForm((prev) => ({ ...prev, seq: Number(e.target.value || 0) }))}
                  sx={{ maxWidth: { sm: 140 } }}
                />
                <TextField
                  size='small'
                  label='หัวข้อ'
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  fullWidth
                />
              </Stack>
              <TextField
                size='small'
                label='รายละเอียด'
                value={form.descriptions}
                onChange={(e) => setForm((prev) => ({ ...prev, descriptions: e.target.value }))}
                multiline
                minRows={6}
                placeholder='พิมพ์รายละเอียดข่าวสาร แยกบรรทัดได้'
              />
              <Paper variant='outlined' sx={{ p: 1.25, borderColor: '#dbe4f0' }}>
                <Stack spacing={1}>
                  <Stack direction='row' alignItems='center' justifyContent='space-between' gap={1}>
                    <Typography fontWeight={700}>รูปภาพประกอบ ({form.image_urls.length}/4)</Typography>
                    <Button
                      size='small'
                      component='label'
                      startIcon={<ImageIcon />}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? 'กำลังอัปโหลด...' : 'แนบรูปภาพ'}
                      <input hidden type='file' accept='image/*' multiple onChange={uploadImage} />
                    </Button>
                  </Stack>
                  {form.image_urls.length ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
                      {form.image_urls.map((url, index) => (
                        <Box key={url}>
                          <Box component='img' src={url} alt={`รูปภาพประกอบ ${index + 1}`} sx={{ display: 'block', width: '100%', height: 120, objectFit: 'cover', borderRadius: 1 }} />
                          <Button size='small' color='error' onClick={() => removeImage(index)}>ลบรูปที่ {index + 1}</Button>
                        </Box>
                      ))}
                    </Box>
                  ) : <Typography variant='body2' color='text.secondary'>เลือกรูปได้สูงสุด 4 รูป รูปละไม่เกิน 10 MB</Typography>}
                </Stack>
              </Paper>
              <Paper variant='outlined' sx={{ p: 1.25, borderColor: '#dbe4f0' }}>
                <Stack spacing={1}>
                  <Stack direction='row' alignItems='center' justifyContent='space-between'>
                    <Typography fontWeight={700}>เลือกผู้รับ LINE</Typography>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={selectedAll}
                          indeterminate={selectedSome}
                          onChange={(e) => setForm((prev) => ({ ...prev, recipient_ids: e.target.checked ? lineCustomers.map((customer) => customer.id) : [] }))}
                        />
                      }
                      label='เลือกทั้งหมด'
                    />
                  </Stack>
                  <Divider />
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 0.75, maxHeight: 280, overflowY: 'auto' }}>
                    {lineCustomers.map((customer) => {
                      const label = getLineCustomerName(customer);
                      return (
                        <FormControlLabel
                          key={customer.id}
                          control={<Checkbox size='small' checked={form.recipient_ids.includes(customer.id)} onChange={() => toggleRecipient(customer.id)} />}
                          label={<Typography variant='body2'>{label}</Typography>}
                        />
                      );
                    })}
                    {!lineCustomers.length ? <Typography variant='body2' color='text.secondary'>ยังไม่มีลูกค้า LINE</Typography> : null}
                  </Box>
                </Stack>
              </Paper>
            </Stack>

            <Paper variant='outlined' sx={{ width: { xs: '100%', md: 360 }, borderColor: '#dbe4f0', overflow: 'hidden', alignSelf: 'flex-start' }}>
              <Box sx={{ bgcolor: '#0f3b82', color: '#fff', p: 2 }}>
                <Typography variant='caption' sx={{ color: '#bfdbfe', fontWeight: 800 }}>ข่าวสาร #{form.seq || '-'}</Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, mt: 0.5 }}>
                  {form.title || 'หัวข้อข่าวสาร'}
                </Typography>
              </Box>
              <Stack spacing={1.2} sx={{ p: 2 }}>
                {form.image_urls.map((url, index) => <Box key={url} component='img' src={url} alt={`รูปภาพประกอบ ${index + 1}`} sx={{ width: '100%', maxHeight: 180, borderRadius: 1, objectFit: 'cover' }} />)}
                <Typography variant='caption' color='text.secondary' fontWeight={800}>Oil Jobber Update</Typography>
                {(form.descriptions || 'รายละเอียดข่าวสารจะแสดงตรงนี้').split('\n').map((line, idx) => (
                  <Typography key={`${line}-${idx}`} variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>
                    {line}
                  </Typography>
                ))}
              </Stack>
              <Box sx={{ bgcolor: '#f8fafc', p: 1.5 }}>
                <Typography variant='caption' color='text.secondary'>
                  ผู้รับ {form.recipient_ids.length} รายการ{selectedCustomerNames.length ? `: ${selectedCustomerNames.slice(0, 3).join(', ')}${selectedCustomerNames.length > 3 ? '...' : ''}` : ''}
                </Typography>
              </Box>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button disabled={saving} onClick={() => void submit('DRAFT')}>บันทึก Draft</Button>
          <Button disabled={saving} variant='contained' startIcon={<Send />} onClick={() => void submit('SEND_NOW')}>ส่งทันที</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ลบข่าวสาร LINE</DialogTitle>
        <DialogContent>ต้องการลบข่าวสารนี้หรือไม่?</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' variant='contained' onClick={() => void deleteRow()}>ลบ</Button>
        </DialogActions>
      </Dialog>

      <ActionSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </PageScaffold>
  );
}
