'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Delete, Edit } from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  FormGroup,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { Customer, PaymentCondition } from '@/types/database';

type MasterRefinery = { id: string; name: string };
type MasterDepot = { id: string; code: string; name: string; refineries?: { name?: string } | null };
type MasterOilProduct = { id: string; code: string; name: string };
type LineCustomer = {
  id: string;
  customer_id: string | null;
  line_user_id: string;
  display_name: string | null;
  profile_image_url: string | null;
};

type CustomerWithPayment = Customer & {
  payment_conditions?: { name?: string; code?: string } | null;
};
type OutstandingRow = { customer_id: string; outstanding_amount: number };

type CustomerAccessForm = {
  allowed_refinery_ids: string[];
  allowed_depot_ids: string[];
  allowed_oil_product_ids: string[];
  allowed_payment_condition_ids: string[];
  can_place_order: boolean;
};

type CustomerForm = {
  id?: string;
  company_name: string;
  tax_id: string;
  address: string;
  phone: string;
  credit_limit: number;
  status: string;
};

const emptyForm: CustomerForm = {
  company_name: '',
  tax_id: '',
  address: '',
  phone: '',
  credit_limit: 0,
  status: 'ACTIVE',
};

const emptyAccess: CustomerAccessForm = {
  allowed_refinery_ids: [],
  allowed_depot_ids: [],
  allowed_oil_product_ids: [],
  allowed_payment_condition_ids: [],
  can_place_order: true,
};

export default function CustomersPage() {
  const [companyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');
  const [rows, setRows] = useState<CustomerWithPayment[]>([]);
  const [paymentConditions, setPaymentConditions] = useState<PaymentCondition[]>([]);
  const [refineries, setRefineries] = useState<MasterRefinery[]>([]);
  const [depots, setDepots] = useState<MasterDepot[]>([]);
  const [oilProducts, setOilProducts] = useState<MasterOilProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'portal' | 'login' | 'line-map'>('portal');
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [accessForm, setAccessForm] = useState<CustomerAccessForm>(emptyAccess);
  const [portalUserId, setPortalUserId] = useState<string | null>(null);
  const [portalEmail, setPortalEmail] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [lineCustomers, setLineCustomers] = useState<LineCustomer[]>([]);
  const [outstandingRows, setOutstandingRows] = useState<OutstandingRow[]>([]);
  const [selectedLineCustomerId, setSelectedLineCustomerId] = useState('');
  const [lineMapSaving, setLineMapSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isEdit = useMemo(() => Boolean(form.id), [form.id]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const d = searchDate.trim();
    return rows.filter((r) => {
      const okText =
        !q ||
        (r.company_name || '').toLowerCase().includes(q) ||
        (r.tax_id || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.address || '').toLowerCase().includes(q) ||
        (r.payment_conditions?.name || '').toLowerCase().includes(q) ||
        (r.payment_conditions?.code || '').toLowerCase().includes(q);
      const okDate = !d || String(r.created_at || '').includes(d) || String(r.updated_at || '').includes(d);
      return okText && okDate;
    });
  }, [rows, searchText, searchDate]);

  const pagedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('th-TH', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  );

  const outstandingByCustomer = useMemo(() => {
    return outstandingRows.reduce<Record<string, number>>((acc, row) => {
      if (!row.customer_id) return acc;
      acc[row.customer_id] = (acc[row.customer_id] || 0) + Number(row.outstanding_amount || 0);
      return acc;
    }, {});
  }, [outstandingRows]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const [customerRes, paymentRes, refineryRes, depotRes, productRes, outstandingRes] = await Promise.all([
        fetch(`/api/customers?company_id=${companyId}`),
        fetch(`/api/payment-conditions?company_id=${companyId}`),
        fetch(`/api/refineries?company_id=${companyId}`),
        fetch(`/api/depots?company_id=${companyId}`),
        fetch(`/api/oil-products?company_id=${companyId}`),
        fetch(`/api/accounting/outstanding?company_id=${companyId}`),
      ]);

      const [customerData, paymentData, refineryData, depotData, productData, outstandingData] = await Promise.all([
        customerRes.json(),
        paymentRes.json(),
        refineryRes.json(),
        depotRes.json(),
        productRes.json(),
        outstandingRes.json(),
      ]);

      if (!customerRes.ok) throw new Error(customerData.error || 'โหลดข้อมูลลูกค้าไม่สำเร็จ');
      if (!paymentRes.ok) throw new Error(paymentData.error || 'โหลดเงื่อนไขชำระเงินไม่สำเร็จ');
      if (!refineryRes.ok) throw new Error(refineryData.error || 'โหลดโรงกลั่นไม่สำเร็จ');
      if (!depotRes.ok) throw new Error(depotData.error || 'โหลดคลังไม่สำเร็จ');
      if (!productRes.ok) throw new Error(productData.error || 'โหลดสินค้าน้ำมันไม่สำเร็จ');
      if (!outstandingRes.ok) throw new Error(outstandingData.error || 'โหลดยอดค้างชำระไม่สำเร็จ');

      setRows(customerData);
      setPaymentConditions(paymentData);
      setRefineries(refineryData);
      setDepots(depotData);
      setOilProducts(productData);
      setOutstandingRows(outstandingData || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadLineCustomers = async () => {
    if (!companyId) return;
    const res = await fetch(`/api/line/customers?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'โหลดรายการ LINE ไม่สำเร็จ');
    setLineCustomers(data || []);
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  useEffect(() => {
    void loadLineCustomers();
  }, [companyId]);

  const loadAccess = async (customerId: string) => {
    const res = await fetch(`/api/customer-portal/access/${customerId}?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'โหลดสิทธิ์ลูกค้าไม่สำเร็จ');

    setAccessForm({
      allowed_refinery_ids: data.access?.allowed_refinery_ids ?? [],
      allowed_depot_ids: data.access?.allowed_depot_ids ?? [],
      allowed_oil_product_ids: data.access?.allowed_oil_product_ids ?? [],
      allowed_payment_condition_ids: data.access?.allowed_payment_condition_ids ?? [],
      can_place_order: Boolean(data.access?.can_place_order ?? true),
    });
    setPortalUserId(data.portal_user?.auth_user_id ?? null);
  };

  const onSave = async () => {
    try {
      const payload = {
        company_id: companyId,
        company_name: form.company_name,
        tax_id: form.tax_id || null,
        address: form.address || null,
        phone: form.phone || null,
        credit_limit: form.credit_limit,
        status: form.status,
      };
      const res = await fetch(form.id ? `/api/customers/${form.id}` : '/api/customers', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกข้อมูลลูกค้าไม่สำเร็จ');

      const customerId = form.id || data.id;
      const accessRes = await fetch(`/api/customer-portal/access/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, ...accessForm }),
      });
      const accessData = await accessRes.json();
      if (!accessRes.ok) throw new Error(accessData.error || 'บันทึกสิทธิ์ลูกค้าไม่สำเร็จ');

      setDrawerOpen(false);
      setForm(emptyForm);
      setAccessForm(emptyAccess);
      setPortalUserId(null);
      setPortalEmail('');
      setPortalPassword('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onCreatePortalUser = async () => {
    if (!form.id) return;

    try {
      const res = await fetch('/api/customer-portal/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          customer_id: form.id,
          email: portalEmail,
          password: portalPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างผู้ใช้ลูกค้าไม่สำเร็จ');

      setPortalUserId(data.auth_user_id);
      setPortalPassword('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/customers/${deleteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
      setDeleteId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onSaveLineMapping = async () => {
    if (!form.id) return;
    if (!selectedLineCustomerId) {
      setError('กรุณาเลือกผู้ใช้ LINE ก่อนบันทึก');
      return;
    }
    setLineMapSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/line/customers/${selectedLineCustomerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, customer_id: form.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกการผูก LINE ไม่สำเร็จ');
      await loadLineCustomers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLineMapSaving(false);
    }
  };

  const toggleInArray = (items: string[], value: string): string[] => {
    if (items.includes(value)) return items.filter((x) => x !== value);
    return [...items, value];
  };

  const AccessCheckboxGroup = ({
    title,
    helper,
    selected,
    options,
    searchable = false,
    maxHeight = 260,
    onChange,
  }: {
    title: string;
    helper: string;
    selected: string[];
    options: Array<{ id: string; label: string; group?: string }>;
    searchable?: boolean;
    maxHeight?: number;
    onChange: (next: string[]) => void;
  }) => {
    const [q, setQ] = useState('');
    const qv = q.trim().toLowerCase();
    const shown = qv ? options.filter((x) => `${x.group || ''} ${x.label}`.toLowerCase().includes(qv)) : options;

    return (
      <Paper variant='outlined' sx={{ p: 1.25, borderColor: '#dbe4f0', borderRadius: 2 }}>
        <Stack spacing={0.8}>
          <Stack direction='row' justifyContent='space-between' alignItems='center' spacing={1}>
            <Stack spacing={0.2}>
              <Typography fontWeight={700}>{title}</Typography>
              <Typography variant='caption' color='text.secondary'>เลือกแล้ว {selected.length} รายการ</Typography>
            </Stack>
            <Stack direction='row' spacing={0.5}>
              <Button size='small' onClick={() => onChange(options.map((o) => o.id))}>เลือกทั้งหมด</Button>
              <Button size='small' color='inherit' onClick={() => onChange([])}>ล้าง</Button>
            </Stack>
          </Stack>
          <Typography variant='caption' color='text.secondary'>{helper}</Typography>
          {searchable ? (
            <TextField
              size='small'
              placeholder='ค้นหาในรายการนี้'
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          ) : null}
          <FormGroup sx={{ maxHeight, overflowY: 'auto', pr: 0.5, border: '1px solid #edf2f7', borderRadius: 1, p: 0.6 }}>
            {shown.map((opt, idx) => {
              const prev = shown[idx - 1];
              const showGroup = Boolean(opt.group) && (idx === 0 || prev?.group !== opt.group);
              return (
                <Box key={opt.id}>
                  {showGroup ? (
                    <Typography
                      variant='caption'
                      sx={{
                        color: '#1e3a8a',
                        fontWeight: 800,
                        mt: 0.5,
                        mb: 0.2,
                        display: 'block',
                        position: 'sticky',
                        top: 0,
                        zIndex: 1,
                        bgcolor: '#f8fbff',
                        py: 0.2,
                      }}
                    >
                      {opt.group}
                    </Typography>
                  ) : null}
                  <FormControlLabel
                    control={<Checkbox size='small' checked={selected.includes(opt.id)} onChange={() => onChange(toggleInArray(selected, opt.id))} />}
                    label={<Typography variant='body2'>{opt.label}</Typography>}
                  />
                </Box>
              );
            })}
            {!shown.length ? <Typography variant='caption' color='text.secondary'>ไม่พบข้อมูล</Typography> : null}
          </FormGroup>
        </Stack>
      </Paper>
    );
  };

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>จัดการลูกค้า</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          size='small'
          label='ค้นหา'
          placeholder='บริษัท, เลขภาษี, เบอร์โทร, เงื่อนไขชำระเงิน'
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: { xs: '100%', md: 320 } }}
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
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setAccessForm(emptyAccess); setPortalUserId(null); setPortalEmail(''); setPortalPassword(''); setSelectedLineCustomerId(''); setDrawerTab('portal'); setDrawerOpen(true); }}>เพิ่มลูกค้า</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>บริษัท</TableCell>
              <TableCell>เลขภาษี</TableCell>
              <TableCell>ที่อยู่</TableCell>
              <TableCell>เบอร์โทร</TableCell>
              <TableCell align='right'>วงเงินเครดิต</TableCell>
              <TableCell align='right'>ยอดเงินคงเหลือ</TableCell>
              {/*     <TableCell>เงื่อนไขชำระเงิน</TableCell> */}
              <TableCell>สถานะ</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.company_name}</TableCell>
                <TableCell>{r.tax_id ?? '-'}</TableCell>
                <TableCell sx={{ minWidth: 180 }}>{r.address ?? '-'}</TableCell>
                <TableCell>{r.phone ?? '-'}</TableCell>
                <TableCell align='right'>{currencyFormatter.format(Number(r.credit_limit || 0))}</TableCell>
                <TableCell align='right'>

                  <Chip size='small' label={currencyFormatter.format(Number(r.credit_limit || 0) - Number(outstandingByCustomer[r.id] || 0))} color={r.status === 'ACTIVE' ? 'warning' : 'default'} />

                </TableCell>
                {/*     <TableCell>{r.payment_conditions?.name ?? '-'}</TableCell> */}
                <TableCell><Chip size='small' label={r.status} color={r.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => {
                    setForm({
                      id: r.id,
                      company_name: r.company_name,
                      tax_id: r.tax_id ?? '',
                      address: r.address ?? '',
                      phone: r.phone ?? '',
                      credit_limit: Number(r.credit_limit),
                      status: r.status,
                    });
                    void loadAccess(r.id);
                    const mapped = lineCustomers.find((lc) => lc.customer_id === r.id);
                    setSelectedLineCustomerId(mapped?.id || '');
                    setDrawerTab('portal');
                    setDrawerOpen(true);
                  }}><Edit fontSize='small' /></IconButton>
                  <IconButton color='error' onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!filteredRows.length && !loading ? <TableRow><TableCell colSpan={9} align='center'>ไม่มีข้อมูล</TableCell></TableRow> : null}
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

      <Drawer anchor='right' open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Stack spacing={2} sx={{ width: { xs: '100vw', sm: 700, md: 1120 }, maxWidth: '100vw', p: { xs: 1.25, md: 2.5 } }}>

          <Typography variant='h6'>{isEdit ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}</Typography>
          <Paper variant='outlined' sx={{ p: 1.25, borderColor: '#dbe4f0', borderRadius: 2 }}>
            <Stack spacing={1.1}>
              <TextField size='small' label='บริษัท' value={form.company_name} onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))} required />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField size='small' label='เลขภาษี' value={form.tax_id} onChange={(e) => setForm((p) => ({ ...p, tax_id: e.target.value }))} fullWidth />
                <TextField size='small' label='เบอร์โทร' value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} fullWidth />
              </Stack>
              <TextField size='small' label='ที่อยู่' multiline minRows={3} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField size='small' label='วงเงินเครดิต' type='number' value={form.credit_limit} onChange={(e) => setForm((p) => ({ ...p, credit_limit: Number(e.target.value) }))} fullWidth />
                <Box sx={{ display: 'flex', alignItems: 'center', px: 1, border: '1px solid #dbe4f0', borderRadius: 1, minHeight: 40, flex: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size='small'
                        checked={form.status === 'ACTIVE'}
                        onChange={(e) => setForm((p) => ({ ...p, status: e.target.checked ? 'ACTIVE' : 'INACTIVE' }))}
                      />
                    }
                    label={<Typography variant='body2'>{form.status === 'ACTIVE' ? 'สถานะ: ใช้งาน' : 'สถานะ: ปิดใช้งาน'}</Typography>}
                    sx={{ m: 0 }}
                  />
                </Box>
              </Stack>
            </Stack>
          </Paper>

          <Divider />
          <Tabs value={drawerTab} onChange={(_, v) => setDrawerTab(v)} sx={{ borderBottom: '1px solid #e2e8f0' }}>
            <Tab value='portal' label='สิทธิ์ลูกค้าในพอร์ทัล' />
            <Tab value='login' label='บัญชี Login ลูกค้า' />
            <Tab value='line-map' label='ผูก LINE กับลูกค้า' />
          </Tabs>

          {drawerTab === 'portal' ? (
            <Stack spacing={1.2}>
              <Stack direction='row' spacing={1} alignItems='center'>
                <Switch checked={accessForm.can_place_order} onChange={(e) => setAccessForm((p) => ({ ...p, can_place_order: e.target.checked }))} />
                <Typography>อนุญาตให้สั่งซื้อ</Typography>
              </Stack>

              <AccessCheckboxGroup
                title='โรงกลั่นที่เห็นได้'
                helper='ถ้าไม่เลือก = เห็นทุกโรงกลั่น'
                selected={accessForm.allowed_refinery_ids}
                options={refineries.map((r) => ({ id: r.id, label: r.name }))}
                onChange={(next) => setAccessForm((p) => ({ ...p, allowed_refinery_ids: next }))}
              />

              <AccessCheckboxGroup
                title='คลังที่เห็นได้'
                helper='ถ้าไม่เลือก = เห็นทุกคลัง'
                selected={accessForm.allowed_depot_ids}
                options={depots
                  .map((d) => ({ id: d.id, label: `${d.code} - ${d.name}`, group: d.refineries?.name || 'ไม่ระบุโรงกลั่น' }))
                  .sort((a, b) => `${a.group}|${a.label}`.localeCompare(`${b.group}|${b.label}`))}
                searchable
                maxHeight={320}
                onChange={(next) => setAccessForm((p) => ({ ...p, allowed_depot_ids: next }))}
              />

              <AccessCheckboxGroup
                title='น้ำมันที่เห็นได้'
                helper='ถ้าไม่เลือก = เห็นทุกชนิด'
                selected={accessForm.allowed_oil_product_ids}
                options={oilProducts.map((p) => ({ id: p.id, label: `${p.code} - ${p.name}` }))}
                onChange={(next) => setAccessForm((p) => ({ ...p, allowed_oil_product_ids: next }))}
              />

              <AccessCheckboxGroup
                title='เครดิตเทอมที่เห็นได้'
                helper='ถ้าไม่เลือก = เห็นทุกเทอม'
                selected={accessForm.allowed_payment_condition_ids}
                options={paymentConditions.map((pc) => ({ id: pc.id, label: `${pc.name} (${pc.payment_type}${pc.credit_days ? ` ${pc.credit_days} วัน` : ''})` }))}
                onChange={(next) => setAccessForm((p) => ({ ...p, allowed_payment_condition_ids: next }))}
              />
            </Stack>
          ) : drawerTab === 'login' ? (
            <Paper variant='outlined' sx={{ p: 1.25, borderColor: '#dbe4f0', borderRadius: 2 }}>
              <Stack spacing={1.1}>
                {portalUserId ? <Alert severity='success'>สร้างบัญชีแล้ว (Auth User ID: {portalUserId})</Alert> : <Alert severity='info'>ยังไม่มีบัญชีพอร์ทัลสำหรับลูกค้ารายนี้</Alert>}
                <TextField size='small' label='อีเมลสำหรับลูกค้า' value={portalEmail} onChange={(e) => setPortalEmail(e.target.value)} placeholder='customer@example.com' />
                <TextField size='small' label='รหัสผ่านเริ่มต้น' value={portalPassword} onChange={(e) => setPortalPassword(e.target.value)} type='password' helperText='อย่างน้อย 8 ตัวอักษร' />
                <Button variant='outlined' disabled={!form.id || !portalEmail || !portalPassword || Boolean(portalUserId)} onClick={() => void onCreatePortalUser()}>
                  สร้างบัญชีลูกค้า
                </Button>
              </Stack>
            </Paper>
          ) : (
            <Paper variant='outlined' sx={{ p: 1.25, borderColor: '#dbe4f0', borderRadius: 2 }}>
              <Stack spacing={1.1}>
                <Alert severity='info'>เลือกบัญชี LINE แล้วผูกกับลูกค้ารายนี้ เพื่อใช้ส่งแจ้งเตือน/ติดตามออเดอร์</Alert>
                <TextField
                  select
                  size='small'
                  label='LINE User'
                  value={selectedLineCustomerId}
                  onChange={(e) => setSelectedLineCustomerId(e.target.value)}
                  helperText='แสดงเฉพาะรายการที่ยังไม่ผูก หรือผูกกับลูกค้ารายนี้อยู่แล้ว'
                >
                  <MenuItem value=''>-- เลือกผู้ใช้ LINE --</MenuItem>
                  {lineCustomers
                    .filter((lc) => !lc.customer_id || lc.customer_id === form.id)
                    .map((lc) => (
                      <MenuItem key={lc.id} value={lc.id}>
                        <Stack direction='row' spacing={1} alignItems='center' sx={{ minWidth: 0 }}>
                          <Avatar src={lc.profile_image_url || undefined} sx={{ width: 24, height: 24 }}>
                            {(lc.display_name || lc.line_user_id || 'U').slice(0, 1).toUpperCase()}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant='body2' noWrap sx={{ fontWeight: 600 }}>
                              {lc.display_name || '-'}
                            </Typography>
                            {/*  <Typography variant='caption' color='text.secondary' noWrap>
                              {lc.line_user_id}
                            </Typography> */}
                          </Box>
                        </Stack>
                      </MenuItem>
                    ))}
                </TextField>
                <Button variant='contained' disabled={!form.id || !selectedLineCustomerId || lineMapSaving} onClick={() => void onSaveLineMapping()}>
                  {lineMapSaving ? 'กำลังบันทึก...' : 'บันทึกการผูก LINE'}
                </Button>
              </Stack>
            </Paper>
          )}

          <Button variant='contained' onClick={() => void onSave()} disabled={!companyId || !form.company_name}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบข้อมูลลูกค้านี้ใช่หรือไม่</DialogContent>
        <DialogActions><Button onClick={() => setDeleteId(null)}>ยกเลิก</Button><Button color='error' onClick={() => void onDelete()}>ลบ</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
