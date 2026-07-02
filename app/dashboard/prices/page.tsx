'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Delete, Edit } from '@mui/icons-material';
import {
  Alert,
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
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

type BasePriceRow = {
  id: string;
  refinery_id: string | null;
  refinery_name: string;
  effective_date: string;
  effective_at: string | null;
  expires_date?: string | null;
  expires_at?: string | null;
  confirmed: boolean;
  item_count: number;
};

type Refinery = { id: string; name: string; active: boolean };
type Depot = { id: string; code: string; name: string; refinery_id: string | null };
type OilProduct = { id: string; code: string; name: string; is_active: boolean };
type EditItem = { depot_id: string; product_code: string; product_name: string; price: number | string };

function todayDdMmYyyy(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function nowHHmm(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function ddMmYyyyToIso(value: string): string {
  const [dd, mm, yyyy] = String(value || '').split('/');
  if (!dd || !mm || !yyyy) return '';
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDdMmYyyy(value: string): string {
  const [yyyy, mm, dd] = String(value || '').split('-');
  if (!yyyy || !mm || !dd) return '';
  return `${dd}/${mm}/${yyyy}`;
}

export default function PricesPage() {
  const [companyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');
  const [rows, setRows] = useState<BasePriceRow[]>([]);
  const [refineries, setRefineries] = useState<Refinery[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [products, setProducts] = useState<OilProduct[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchRefinery, setSearchRefinery] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [openEditor, setOpenEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refineryId, setRefineryId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayDdMmYyyy());
  const [effectiveTime, setEffectiveTime] = useState(nowHHmm());
  const [expiresDate, setExpiresDate] = useState('');
  const [expiresTime, setExpiresTime] = useState('');
  const [items, setItems] = useState<EditItem[]>([]);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);
  const refineryDepots = useMemo(
    () => depots.filter((d) => d.refinery_id === refineryId),
    [depots, refineryId],
  );
  const filteredRows = useMemo(() => {
    const text = searchRefinery.trim().toLowerCase();
    const dateText = searchDate.trim();
    return rows.filter((r) => {
      const okText = !text || (r.refinery_name || '').toLowerCase().includes(text);
      const okDate = !dateText || String(r.effective_date || '').includes(dateText);
      return okText && okDate;
    });
  }, [rows, searchRefinery, searchDate]);
  const pagedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const loadMasters = async () => {
    const [r1, r2, r3] = await Promise.all([
      fetch(`/api/refineries?company_id=${companyId}`),
      fetch(`/api/depots?company_id=${companyId}`),
      fetch(`/api/oil-products?company_id=${companyId}`),
    ]);
    const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
    if (r1.ok) setRefineries(d1 || []);
    if (r2.ok) setDepots(d2 || []);
    if (r3.ok) setProducts(d3 || []);
  };

  const loadPrices = async () => {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/prices?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!companyId) return;
    void loadMasters();
    void loadPrices();
  }, [companyId]);

  const openCreate = () => {
    setEditingId(null);
    setRefineryId('');
    setEffectiveDate(todayDdMmYyyy());
    setEffectiveTime(nowHHmm());
    setExpiresDate('');
    setExpiresTime('');
    setItems([{ depot_id: '', product_code: '', product_name: '', price: 0 }]);
    setOpenEditor(true);
  };

  const buildItemsForRefinery = (nextRefineryId: string): EditItem[] => {
    const nextDepots = depots.filter((d) => d.refinery_id === nextRefineryId);
    return nextDepots.flatMap((depot) => (
      activeProducts.map((product) => ({
        depot_id: depot.id,
        product_code: product.code,
        product_name: product.name,
        price: 0,
      }))
    ));
  };

  const openEdit = async (id: string) => {
    const res = await fetch(`/api/prices/${id}?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'โหลดรายละเอียดไม่สำเร็จ');
      return;
    }

    setEditingId(id);
    setRefineryId(String(data.base.refinery_id ?? ''));

    const at = String(data.base.effective_at ?? '');
    if (at.includes('T')) {
      const [d, t] = at.split('T');
      const [yyyy, mm, dd] = d.split('-');
      setEffectiveDate(`${dd}/${mm}/${yyyy}`);
      setEffectiveTime((t || '00:00').slice(0, 5));
    } else {
      setEffectiveDate(todayDdMmYyyy());
      setEffectiveTime(nowHHmm());
    }
    const expAt = String(data.base.expires_at ?? '');
    if (expAt.includes('T')) {
      const [d, t] = expAt.split('T');
      const [yyyy, mm, dd] = d.split('-');
      setExpiresDate(`${dd}/${mm}/${yyyy}`);
      setExpiresTime((t || '00:00').slice(0, 5));
    } else {
      setExpiresDate('');
      setExpiresTime('');
    }

    setItems(
      (data.items || []).map((x: any) => ({
        depot_id: x.depot_id,
        product_code: x.product_code,
        product_name: x.product_name,
        price: Number(x.base_cost_price ?? 0),
      })),
    );

    setOpenEditor(true);
  };

  const save = async () => {
    const payload = {
      company_id: companyId,
      refinery_id: refineryId,
      effective_date: effectiveDate,
      effective_time: effectiveTime,
      expires_date: expiresDate,
      expires_time: expiresTime,
      rows: items.map((item) => ({ ...item, price: Number(item.price || 0) })),
    };

    const res = await fetch(editingId ? `/api/prices/${editingId}` : '/api/prices/confirm', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'บันทึกไม่สำเร็จ');
      return;
    }
    setOpenEditor(false);
    await loadPrices();
  };

  const remove = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/prices/${deleteId}?company_id=${companyId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'ลบไม่สำเร็จ');
    else {
      setDeleteId(null);
      await loadPrices();
    }
  };

  function formatDate(isoDate: string): string {
    if (!isoDate) return '-';
    const [yyyy, mm, dd] = isoDate.split('-');
    if (!yyyy || !mm || !dd) return isoDate;
    return `${dd}/${mm}/${yyyy}`;
  }


  return (
    <Stack spacing={2}>
      <Typography variant='h4'>ราคาน้ำมัน</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          size='small'
          label='ค้นหาโรงกลั่น'
          value={searchRefinery}
          onChange={(e) => {
            setSearchRefinery(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: { xs: '100%', md: 240 } }}
        />
        <TextField
          size='small'
          label='ค้นหาวันที่'
          placeholder='YYYY-MM-DD หรือ DD/MM/YYYY'
          value={searchDate}
          onChange={(e) => {
            setSearchDate(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: { xs: '100%', md: 220 } }}
        />
        <Button variant='outlined' onClick={() => void loadPrices()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={openCreate}>เพิ่มราคาน้ำมัน</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1, border: 0.1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>โรงกลั่น</TableCell>
              <TableCell>วันที่มีผล</TableCell>
              <TableCell>เวลา</TableCell>
              <TableCell>ราคาขายถึงเวลา</TableCell>
              <TableCell>จำนวนรายการ</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.refinery_name}</TableCell>
                <TableCell>{formatDate(r.effective_date)}</TableCell>
                <TableCell>{r.effective_at ? String(r.effective_at).slice(11, 16) : '-'}</TableCell>
                <TableCell>{r.expires_at ? `${formatDate(String(r.expires_at).slice(0, 10))} ${String(r.expires_at).slice(11, 16)}` : '-'}</TableCell>
                <TableCell>{r.item_count}</TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => void openEdit(r.id)}><Edit fontSize='small' /></IconButton>
                  <IconButton color='error' onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!filteredRows.length && !loading ? <TableRow><TableCell colSpan={6} align='center'>ไม่มีข้อมูลราคา</TableCell></TableRow> : null}
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

      <Drawer anchor='right' open={openEditor} onClose={() => setOpenEditor(false)}>
        <Stack spacing={2} sx={{ width: { xs: '100%', sm: 840 }, p: 2 }}>
          <Typography variant='h6'>{editingId ? 'แก้ไขราคาน้ำมัน' : 'เพิ่มราคาน้ำมัน'}</Typography>
          <TextField
            select
            label='โรงกลั่น'
            value={refineryId}
            onChange={(e) => {
              const nextRefineryId = e.target.value;
              setRefineryId(nextRefineryId);
              setItems(buildItemsForRefinery(nextRefineryId));
            }}
          >
            {refineries.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
          </TextField>
          <Stack direction='row' spacing={1}>
            <TextField label='วันที่มีผล (dd/MM/yyyy)' value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            <TextField label='เวลา' type='time' value={effectiveTime} onChange={(e) => setEffectiveTime(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField
              label='วันออก'
              type='date'
              value={ddMmYyyyToIso(expiresDate)}
              onChange={(e) => setExpiresDate(isoToDdMmYyyy(e.target.value))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField label='เวลาออก' type='time' value={expiresTime} onChange={(e) => setExpiresTime(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Stack>

          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>คลัง</TableCell>
                <TableCell>รหัสน้ำมัน</TableCell>
                <TableCell>ราคา</TableCell>
                <TableCell align='right'>-</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it, idx) => (
                <TableRow key={`edit-item-${idx}`}>
                  <TableCell>
                    <TextField
                      select
                      value={it.depot_id}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], depot_id: e.target.value };
                        setItems(next);
                      }}
                      sx={{ minWidth: 150 }}
                    >
                      {refineryDepots.map((d) => <MenuItem key={d.id} value={d.id}>{d.code} - {d.name}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      value={it.product_code}
                      onChange={(e) => {
                        const p = activeProducts.find((x) => x.code === e.target.value);
                        const next = [...items];
                        next[idx] = { ...next[idx], product_code: e.target.value, product_name: p?.name ?? '' };
                        setItems(next);
                      }}
                      sx={{ minWidth: 160 }}
                    >
                      {activeProducts.map((p) => <MenuItem key={p.id} value={p.code}>{p.code} - {p.name}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      type='number'
                      value={it.price}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], price: Number(e.target.value || 0) };
                        setItems(next);
                      }}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], price: e.target.value };
                        setItems(next);
                      }}
                    />
                  </TableCell>
                  <TableCell align='right'>
                    <Button color='error' onClick={() => setItems(items.filter((_, i) => i !== idx))}>ลบ</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Button variant='outlined' onClick={() => setItems([...items, { depot_id: '', product_code: '', product_name: '', price: 0 }])}>เพิ่มแถว</Button>
          <Button variant='contained' onClick={() => void save()} disabled={!refineryId || !items.length}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบชุดราคานี้ใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void remove()}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
