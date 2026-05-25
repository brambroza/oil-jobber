'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { CameraAltOutlined, UploadFileOutlined } from '@mui/icons-material';
import { PageScaffold } from '@/components/common/PageScaffold';

type Depot = { id: string; code: string; name: string };
type OilProduct = { id: string; code: string; name: string; is_active: boolean };
type Refinery = { id: string; name: string; active: boolean };

type PriceRow = {
  depot_id: string;
  depot_code: string;
  product_code: string;
  product_name: string;
  price: number;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const base64 = value.includes(',') ? value.split(',')[1] : value;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

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

function cleanRaw(raw: string): string {
  return raw.replace(/\r/g, '').replace(/\s+/g, ' ').replace(/\*+/g, '').trim();
}

function parseIrpc(raw: string): Array<{ depotCode: string; prices: Record<string, number> }> {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const headerLine = lines.find((l) => l.includes('IRPC-PRICE')) || '';
  const productsPart = headerLine.split(':')[1] || 'G95/G91/B7';
  const products = productsPart.split('/').map((s) => s.trim()).filter(Boolean);

  const result: Array<{ depotCode: string; prices: Record<string, number> }> = [];
  const buildRow = (depotCode: string, vals: number[]) => {
    const prices: Record<string, number> = {};
    products.forEach((p, idx) => {
      prices[p] = vals[idx] ?? 0;
    });
    result.push({ depotCode, prices });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // case 1: depot and prices in the same line, e.g. "BI : 0.0000/0.0000/35.0748"
    const sameLine = line.match(/^([A-Z]{2,10})\s*:\s*([0-9.]+)\/([0-9.]+)\/([0-9.]+)/);
    if (sameLine) {
      buildRow(sameLine[1].trim(), [Number(sameLine[2]), Number(sameLine[3]), Number(sameLine[4])]);
      continue;
    }

    // case 2: depot code line only, next line has prices, e.g. "RY" then ":37.9720/..."
    const depotOnly = line.match(/^([A-Z]{2,10})$/);
    if (depotOnly && i + 1 < lines.length) {
      const next = lines[i + 1];
      const nextPrice = next.match(/^:?\s*([0-9.]+)\/([0-9.]+)\/([0-9.]+)/);
      if (nextPrice) {
        buildRow(depotOnly[1].trim(), [Number(nextPrice[1]), Number(nextPrice[2]), Number(nextPrice[3])]);
        i += 1; // consume next line
      }
    }
  }

  return result;
}

function parseCartex(raw: string): Array<{ depotCode: string; prices: Record<string, number> }> {
  const oneLine = cleanRaw(raw);
  const headerMatch = oneLine.match(/Price\s*=\s*([A-Z0-9/ ]+)-/i);
  const products = (headerMatch?.[1] || 'ULG/G95/G91/E20/B7/B20')
    .replace(/\s+/g, '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  const regex = /([A-Z]{2,10})\s*=\s*([0-9._ ]+)-/g;
  const result: Array<{ depotCode: string; prices: Record<string, number> }> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(oneLine)) !== null) {
    const depotCode = match[1].trim();
    const nums = match[2].replace(/\s+/g, '').split('_').map((n) => Number(n || 0));
    const prices: Record<string, number> = {};
    products.forEach((p, idx) => {
      prices[p] = nums[idx] ?? 0;
    });
    result.push({ depotCode, prices });
  }

  return result;
}

export default function OCRUploadPage() {
  const [companyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');
  const [refineries, setRefineries] = useState<Refinery[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [products, setProducts] = useState<OilProduct[]>([]);

  const [refineryId, setRefineryId] = useState('');
  const [fileName, setFileName] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [base64Image, setBase64Image] = useState('');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [openReview, setOpenReview] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(todayDdMmYyyy());
  const [effectiveTime, setEffectiveTime] = useState(nowHHmm());
  const [expiresDate, setExpiresDate] = useState(todayDdMmYyyy());
  const [expiresTime, setExpiresTime] = useState('');
  const [remark, setRemark] = useState('');
  const [rows, setRows] = useState<PriceRow[]>([]);

  const canSubmit = useMemo(() => Boolean(base64Image && refineryId) && !loading, [base64Image, refineryId, loading]);

  const loadMasters = async () => {
    if (!companyId) return;
    const [r1, r2, r3] = await Promise.all([
      fetch(`/api/refineries?company_id=${companyId}`),
      fetch(`/api/depots?company_id=${companyId}`),
      fetch(`/api/oil-products?company_id=${companyId}`),
    ]);
    const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
    if (r1.ok) setRefineries((d1 || []).filter((x: Refinery) => x.active));
    if (r2.ok) setDepots(d2 || []);
    if (r3.ok) setProducts((d3 || []).filter((x: OilProduct) => x.is_active));
  };

  useEffect(() => { void loadMasters(); }, [companyId]);

  const onSelectFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const base64 = await fileToBase64(file);
      setBase64Image(base64);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const buildRowsByMapping = (parsed: Array<{ depotCode: string; prices: Record<string, number> }>): PriceRow[] => {
    const depotMap = new Map(depots.map((d) => [d.code.toUpperCase(), d]));
    const productMap = new Map(products.map((p) => [p.code.toUpperCase(), p]));

    const out: PriceRow[] = [];
    for (const entry of parsed) {
      const depot = depotMap.get(entry.depotCode.toUpperCase());
      if (!depot) continue;

      for (const [productCodeRaw, price] of Object.entries(entry.prices)) {
        const productCode = productCodeRaw.toUpperCase();
        const product = productMap.get(productCode);
        if (!product) continue;
        out.push({
          depot_id: depot.id,
          depot_code: depot.code,
          product_code: product.code,
          product_name: product.name,
          price: Number(price || 0),
        });
      }
    }
    return out;
  };

  const parseByRefinery = (raw: string): PriceRow[] => {
    const refinery = refineries.find((r) => r.id === refineryId);
    if (!refinery) return [];

    const name = refinery.name.toUpperCase();
    if (name.includes('IRPC')) return buildRowsByMapping(parseIrpc(raw));
    if (name.includes('CARTEX')) return buildRowsByMapping(parseCartex(raw));

    // fallback: attempt both
    const irpc = buildRowsByMapping(parseIrpc(raw));
    if (irpc.length) return irpc;
    return buildRowsByMapping(parseCartex(raw));
  };

  const onSubmit = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/ocr/typhoon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ส่ง OCR ไม่สำเร็จ');

      const text = String(data.rawText ?? '');
      setRawText(text);
      const mapped = parseByRefinery(text);
      setRows(mapped);
      setRemark('');
      setOpenReview(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onConfirmSave = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/prices/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          refinery_id: refineryId,
          effective_date: effectiveDate,
          effective_time: effectiveTime,
          expires_date: expiresDate,
          expires_time: expiresTime,
          remark,
          rows,
          raw_text: rawText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกราคาไม่สำเร็จ');

      setOpenReview(false);
      setError('');
      alert(`บันทึกราคาเรียบร้อย จำนวน ${data.inserted} รายการ`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const refineryTitle = refineries.find((r) => r.id === refineryId)?.name || '-';

  return (
    <PageScaffold title='อัปโหลดภาพราคา' description='เลือกภาพ > เลือกโรงกลั่น > ตรวจสอบแมพคลัง/รหัสน้ำมัน > ยืนยันบันทึกราคา'>
      <Stack spacing={2}>
        <TextField select label='โรงกลั่น' value={refineryId} onChange={(e) => setRefineryId(e.target.value)}>
          {refineries.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
        </TextField>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button component='label' variant='outlined' startIcon={<UploadFileOutlined />}>เลือกไฟล์ภาพ
            <input hidden type='file' accept='image/*' onChange={onSelectFile} />
          </Button>
          <Button component='label' variant='contained' startIcon={<CameraAltOutlined />}>ถ่ายภาพ
            <input hidden type='file' accept='image/*' capture='environment' onChange={onSelectFile} />
          </Button>
        </Stack>

        {fileName ? <Typography variant='body2' color='text.secondary'>ไฟล์ที่เลือก: {fileName}</Typography> : null}
        {previewUrl ? <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1, width: 'fit-content', maxWidth: '100%' }}><Box component='img' src={previewUrl} alt='OCR Preview' sx={{ width: '100%', maxWidth: 420, borderRadius: 1, display: 'block' }} /></Box> : null}

        <Button variant='contained' onClick={onSubmit} disabled={!canSubmit} sx={{ width: { xs: '100%', sm: 'auto' } }}>
          {loading ? <><CircularProgress size={18} sx={{ mr: 1 }} />กำลังส่ง OCR...</> : 'อ่านไฟล์ภาพ และแมพราคา'}
        </Button>

        {error ? <Alert severity='error'>{error}</Alert> : null}
      </Stack>

      <Dialog open={openReview} onClose={() => setOpenReview(false)} maxWidth='lg' fullWidth>
        <DialogTitle>ตรวจสอบราคาก่อนยืนยัน - โรงกลั่น: {refineryTitle}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label='วันที่มีผล (dd/MM/yyyy)' value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
              <TextField label='เวลา' type='time' value={effectiveTime} onChange={(e) => setEffectiveTime(e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField
                label='วันหมดอายุ'
                type='date'
                value={ddMmYyyyToIso(expiresDate)}
                onChange={(e) => setExpiresDate(isoToDdMmYyyy(e.target.value))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField label='เวลาหมดอายุ' type='time' value={expiresTime} onChange={(e) => setExpiresTime(e.target.value)} InputLabelProps={{ shrink: true }} />
            </Stack>
            <TextField
              label='หมายเหตุ (Remark)'
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              multiline
              minRows={2}
              placeholder='เช่น รอบราคาจากประกาศพิเศษ / มีเงื่อนไขเพิ่มเติม'
            />

            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>คลัง</TableCell>
                  <TableCell>รหัสน้ำมัน</TableCell>
                  <TableCell>ชื่อน้ำมัน</TableCell>
                  <TableCell align='right'>ราคา</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={`${r.depot_code}-${r.product_code}-${idx}`}>
                    <TableCell>{r.depot_code}</TableCell>
                    <TableCell>{r.product_code}</TableCell>
                    <TableCell>{r.product_name}</TableCell>
                    <TableCell align='right'>
                      <TextField
                        value={r.price}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx] = { ...next[idx], price: Number(e.target.value || 0) };
                          setRows(next);
                        }}
                        type='number'
                        size='small'
                        sx={{ width: 120 }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length ? <TableRow><TableCell colSpan={4} align='center'>ไม่พบข้อมูลที่แมพได้จาก OCR กรุณาตรวจรูปแบบข้อความ</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenReview(false)}>ยกเลิก</Button>
          <Button variant='contained' onClick={() => void onConfirmSave()} disabled={!rows.length || loading}>ยืนยันบันทึกราคา</Button>
        </DialogActions>
      </Dialog>
    </PageScaffold>
  );
}
