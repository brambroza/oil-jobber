'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LocalGasStationRounded from '@mui/icons-material/LocalGasStationRounded';
import NotificationsRounded from '@mui/icons-material/NotificationsRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CustomerShell from '@/components/layout/CustomerShell';

type HomeData = {
  customer: {
    company_name: string;
    credit_limit: number;
  };
  credit: {
    used_credit: number;
    available_credit: number;
  } | null;
  rounds: Array<{ id: string; refinery_id: string | null; effective_date: string; effective_at: string | null; remark?: string | null; refineries?: { name?: string, image_url?: string } | null }>;
  items: Array<{
    id: string;
    oil_base_price_id: string;
    depot_id?: string | null;
    product_code: string;
    product_name: string;
    color_hex: string;
    base_cost_price: number;
    depots?: { code?: string; name?: string } | null;
  }>;
  allowedPaymentConditions: Array<{
    id: string;
    code: string;
    name: string;
    payment_type: string;
    credit_days: number;
    extra_cost_per_liter?: number;
  }>;
};

type GridDepot = {
  depotKey: string;
  depotCode: string;
  depotName: string;
  products: Array<{ key: string; code: string; name: string, color_hex: string }>;
};

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPrice(v?: number | null) {
  if (v == null) return '-';
  return Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtThaiDateTime(date?: string, time?: string | null): string {
  if (!date) return '-';
  const dt = new Date(`${date}${time ? `T${String(time).slice(11, 19)}` : 'T00:00:00'}`);
  const d = dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
  const t = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${d} ${t} น.`;
}

function productColor(code: string) {
  const c = code.toUpperCase();
  if (c.includes('E20')) return '#23a455';
  if (c === '91') return '#3182f6';
  if (c === '95') return '#f59e0b';
  if (c.includes('B7')) return '#5b4db2';
  if (c.includes('B10')) return '#263b9b';
  return '#475569';
}

export default function CustomerHomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refiners = useMemo(() => {
    if (!data) return [] as Array<{ roundId: string; refineryId: string; refineryName: string; effectiveDate: string; effectiveAt: string | null; refineryImg?: string; }>;
    return data.rounds.map((r) => ({
      roundId: r.id,
      refineryId: String(r.refinery_id ?? ''),
      refineryName: r.refineries?.name || 'ไม่ระบุโรงกลั่น',
      effectiveDate: r.effective_date,
      effectiveAt: r.effective_at,
      refineryImg: r.refineries?.image_url || '',
    }));
  }, [data]);

  const paymentTerms = useMemo(() => {
    if (!data) return [] as Array<{ id: string; label: string; extra: number }>;

    return data.allowedPaymentConditions.map((x) => ({
      id: x.id,
      label: x.payment_type === 'CASH' ? 'เงินสด 0 วัน' : `เครดิต ${x.credit_days} วัน`,
      extra: Number(x.extra_cost_per_liter || 0),
    }));
  }, [data]);

  const depotGrid = useMemo(() => {
    if (!data) return [] as GridDepot[];

    console.log("data", data);

    const m = new Map<string, GridDepot>();

    for (const item of data.items) {
      const depotCode = item.depots?.code || '-';
      const depotName = item.depots?.name || '';
      const depotKey = `${depotCode}__${depotName}`;
      const productKey = `${item.product_code}__${item.product_name}`;
      if (!m.has(depotKey)) {
        m.set(depotKey, {
          depotKey,
          depotCode,
          depotName,
          products: [],
        });
      }
      const target = m.get(depotKey)!;
      if (!target.products.some((p) => p.key === productKey)) {
        target.products.push({ key: productKey, code: item.product_code, name: item.product_name, color_hex: item.color_hex });
      }
    }

    return [...m.values()]
      .map((d) => ({ ...d, products: [...d.products].sort((a, b) => a.code.localeCompare(b.code)) }))
      .sort((a, b) => a.depotCode.localeCompare(b.depotCode));
  }, [data]);

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const item of data.items) {
      const round = data.rounds.find((r) => r.id === item.oil_base_price_id);
      const refineryId = String(round?.refinery_id ?? '');
      const depotKey = `${item.depots?.code || '-'}__${item.depots?.name || ''}`;
      const productKey = `${item.product_code}__${item.product_name}`;
      m.set(`${refineryId}__${depotKey}__${productKey}`, Number(item.base_cost_price || 0));
    }
    return m;
  }, [data]);

  const cheapestCellMap = useMemo(() => {
    const result = new Map<string, string>();
    const bestByProduct = new Map<string, { value: number; cellKey: string }>();

    for (const depot of depotGrid) {
      for (const product of depot.products) {
        for (const r of refiners) {
          const base = priceMap.get(`${r.refineryId}__${depot.depotKey}__${product.key}`);
          if (base == null) continue;

          if (!paymentTerms.length) {
            const value = Number(base);
            if (value < 5) continue;
            const cellKey = `${depot.depotKey}__${r.refineryId}__default`;
            const prev = bestByProduct.get(product.key);
            if (!prev || value < prev.value) {
              bestByProduct.set(product.key, { value, cellKey });
            }
            continue;
          }

          for (const term of paymentTerms) {
            const value = Number(base) + Number(term.extra || 0);
            if (value < 5) continue;
            const cellKey = `${depot.depotKey}__${r.refineryId}__${term.id}`;
            const prev = bestByProduct.get(product.key);
            if (!prev || value < prev.value) {
              bestByProduct.set(product.key, { value, cellKey });
            }
          }
        }
      }
    }

    for (const [productKey, best] of bestByProduct.entries()) {
      result.set(productKey, best.cellKey);
    }

    return result;
  }, [depotGrid, refiners, paymentTerms, priceMap]);

  const latest = useMemo(() => {
    if (!refiners.length) return '-';
    const r = [...refiners].sort((a, b) => `${b.effectiveDate}${b.effectiveAt || ''}`.localeCompare(`${a.effectiveDate}${a.effectiveAt || ''}`))[0];
    return fmtThaiDateTime(r.effectiveDate, r.effectiveAt);
  }, [refiners]);

  const remarkText = useMemo(() => {
    if (!data) return '';
    const remarks = (data.rounds || [])
      .map((r) => String(r.remark || '').trim())
      .filter(Boolean);
    if (!remarks.length) return '';
    return Array.from(new Set(remarks)).join('\n');
  }, [data]);

  const creditUsage = useMemo(() => {
    const limit = Number(data?.customer.credit_limit || 0);
    const used = Number(data?.credit?.used_credit || 0);
    if (!limit) return 0;
    return Math.min(100, Math.max(0, (used / limit) * 100));
  }, [data]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError('');
      const res = await fetch('/api/customer-portal/home', { cache: 'no-store' });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'โหลดข้อมูลลูกค้าไม่สำเร็จ');
        setLoading(false);
        return;
      }

   ;

      setData(json);
      setLoading(false);
    };

    void run();
  }, []);

  if (loading) return <Box sx={{ p: 3 }}><Alert severity='info'>กำลังโหลดข้อมูลลูกค้า...</Alert></Box>;
  if (error) return <Box sx={{ p: 3 }}><Alert severity='error'>{error}</Alert></Box>;
  if (!data) return null;

  return (
    <CustomerShell title='ราคาน้ำมันวันนี้' subtitle={`อัปเดตล่าสุด: ${latest}`}>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5}>
          <Paper sx={{ flex: 2, borderRadius: 2, px: { xs: 1.25, md: 2 }, py: { xs: 1.25, md: 1.5 }, border: '1px solid #d6deea' }}>
            <Stack spacing={{ xs: 1.1, md: 1.6 }}>
              <Stack direction='row' alignItems='center' spacing={1.1}>
                <Avatar sx={{ width: { xs: 44, md: 56 }, height: { xs: 44, md: 56 }, bgcolor: '#e4ecf9', color: '#164494' }}><PersonRounded /></Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12, color: '#64748b' }}>ชื่อลูกค้า</Typography>
                  <Typography sx={{ fontSize: { xs: 18, md: 24 }, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }} noWrap>{data.customer.company_name}</Typography>
                  <Typography sx={{ fontSize: 12, color: '#64748b' }}>รหัสลูกค้า : -</Typography>
                </Box>
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Box sx={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1 }}>
                  <Typography sx={{ fontSize: 12, color: '#64748b' }}>วงเงินที่ได้รับ</Typography>
                  <Typography sx={{ fontSize: { xs: 20, md: 28 }, fontWeight: 800, color: '#1d4ed8', lineHeight: 1.15 }}>{fmtMoney(Number(data.customer.credit_limit || 0))}</Typography>
                  <Typography sx={{ fontSize: 11, color: '#64748b' }}>บาท</Typography>
                </Box>

                <Box sx={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1 }}>
                  <Typography sx={{ fontSize: 12, color: '#64748b' }}>วงเงินที่ใช้ไป</Typography>
                  <Typography sx={{ fontSize: { xs: 20, md: 28 }, fontWeight: 800, color: '#0f9d74', lineHeight: 1.15 }}>{fmtMoney(Number(data.credit?.used_credit || 0))}</Typography>
                  <Stack direction='row' spacing={0.8} alignItems='center' sx={{ mt: 0.4 }}>
                    <LinearProgress variant='determinate' value={creditUsage} sx={{ height: 8, borderRadius: 999, flex: 1, '& .MuiLinearProgress-bar': { borderRadius: 999, bgcolor: '#13a37f' } }} />
                    <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: '#334155', minWidth: 66, textAlign: 'right' }}>{creditUsage.toFixed(2)}%</Typography>
                  </Stack>
                </Box>
              </Stack>
            </Stack>
          </Paper>

          <Paper sx={{ flex: 1, borderRadius: 2, px: 2, py: 1.5, border: '1px solid #d6deea', bgcolor: '#f3f6fb' }}>
            <Stack spacing={1}>
              <Stack direction='row' spacing={1} alignItems='center'>
                <NotificationsRounded sx={{ color: '#1e3a8a' }} />
                <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#1e3a8a' }}>หมายเหตุ</Typography>
              </Stack>
              <Typography sx={{ fontSize: 14, color: '#1e3a8a' }}>
                {remarkText || 'ราคาน้ำมันอาจมีการเปลี่ยนแปลง กรุณาตรวจสอบก่อนทำรายการ'}
              </Typography>
              <Stack direction='row' justifyContent='space-between' alignItems='center' spacing={1}>
                <Chip size='small' color='primary' variant='outlined' label={`เครดิตเทอม ${paymentTerms.length} แบบ`} />
                <Button component={Link} href='/customer/orders' variant='contained' sx={{ textTransform: 'none', bgcolor: '#1d4ed8', '&:hover': { bgcolor: '#1e40af' } }}>
                  สั่งซื้อ
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Stack>

        <Paper sx={{ borderRadius: 2, border: '1px solid #d6deea', overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #dbe4f0', bgcolor: '#f7fafd' }}>
            <Stack direction='row' spacing={1.2} alignItems='center'>
              <LocalGasStationRounded sx={{ color: '#103e8a' }} />
              <Box>
                <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#103e8a' }}>ตารางราคาน้ำมันแยกตามจุดรับน้ำมัน</Typography>
                <Typography sx={{ fontSize: 13, color: '#475569' }}>ประจำวันที่ {latest}</Typography>
              </Box>
            </Stack>
          </Box>

          <Box sx={{ overflowX: 'auto' }}>
            <Table size='small' sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#0f3c8b', color: '#fff', borderRight: '1px solid rgba(255,255,255,0.2)' } }}>
                  <TableCell rowSpan={2} sx={{ fontWeight: 800, width: 170 }}>จุดรับน้ำมัน</TableCell>
                  <TableCell rowSpan={2} sx={{ fontWeight: 800, width: 160 }}>ประเภทน้ำมัน</TableCell>
                  {refiners.map((r) => (
                    <TableCell key={r.refineryId} colSpan={Math.max(paymentTerms.length, 1)} align='center' sx={{ fontWeight: 800, px: 1 }}>
                      <Stack direction='row' spacing={0.8} alignItems='center' justifyContent='center'>
                        <Avatar
                          src={r.refineryImg || undefined}
                          sx={{
                            width: 26,
                            height: 26,
                            bgcolor: 'rgba(219,234,254,0.16)',
                            color: '#dbeafe',
                            border: '1px solid rgba(255,255,255,0.35)',
                          }}
                        >
                          <PersonRounded sx={{ fontSize: 14 }} />
                        </Avatar>
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: 800,
                            maxWidth: 150,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            letterSpacing: 0.2,
                          }}
                        >
                          {r.refineryName}
                        </Typography>
                      </Stack>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow sx={{ '& th': { bgcolor: '#154da8', color: '#fff', borderRight: '1px solid rgba(255,255,255,0.2)', fontSize: 12, py: 0.7 } }}>
                  {refiners.flatMap((r) => (paymentTerms.length ? paymentTerms.map((p) => (
                    <TableCell key={`${r.refineryId}-${p.id}`} align='center'>{p.label}</TableCell>
                  )) : [<TableCell key={`${r.refineryId}-default`} align='center'>ราคาขาย</TableCell>]))}
                </TableRow>
              </TableHead>
              <TableBody
                sx={{
                  '& td': {
                    py: 0.35,
                    px: 1,
                    fontSize: 12.5,
                    lineHeight: 1.2,
                  },
                }}
              >
                {depotGrid.map((depot) => depot.products.map((product, idx) => (
                  <TableRow
                    key={`${depot.depotKey}-${product.key}`}
                    sx={{
                      '& td': { borderColor: '#e2e8f0' },
                      '& .MuiChip-root': { height: 22 },
                      '& .MuiChip-label': { px: 1, fontSize: 11.5, fontWeight: 700 },
                    }}
                  >
                    <TableCell>
                      {idx === 0 ? (
                        <Stack spacing={0.3}>
                          <Stack direction='row' spacing={0.6} alignItems='center'>
                            <PlaceRounded sx={{ color: '#1d4ed8', fontSize: 12 }} />
                            <Typography sx={{ color: '#1e3a8a' }}>{depot.depotCode}({depot.depotName || '-'})</Typography>
                          </Stack>

                        </Stack>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size='small'
                        label={`${product.code}${product.name ? ` ${product.name}` : ''}`}
                        sx={{ bgcolor: product.color_hex ?? '#3182f6', color: '#fff', fontWeight: 700 }}
                      />
                    </TableCell>

                    {refiners.flatMap((r) => {
                      const base = priceMap.get(`${r.refineryId}__${depot.depotKey}__${product.key}`);
                      if (!paymentTerms.length) {
                        const cellKey = `${depot.depotKey}__${r.refineryId}__default`;
                        const isCheapest = cheapestCellMap.get(product.key) === cellKey;
                        return [
                          <TableCell
                            key={`${r.refineryId}-${depot.depotKey}-${product.key}-default`}
                            align='center'
                            sx={{
                              color: product.color_hex ?? '#2563eb',
                              fontWeight: 700,
                              bgcolor: isCheapest ? '#fff7cc' : undefined,
                              animation: isCheapest ? 'priceBlink 1.1s ease-in-out infinite' : undefined,
                              '@keyframes priceBlink': {
                                '0%, 100%': { boxShadow: 'inset 0 0 0 0 rgba(250, 204, 21, 0.0)' },
                                '50%': { boxShadow: 'inset 0 0 0 999px rgba(250, 204, 21, 0.22)' },
                              },
                            }}
                          >
                            <Stack direction='row' spacing={0.5} justifyContent='center' alignItems='center'>
                              <span>{fmtPrice(base)}</span>
                              {isCheapest ? <Chip size='small' label='ถูกสุด' sx={{ height: 16, fontSize: 10, bgcolor: '#facc15', color: '#111827' }} /> : null}
                            </Stack>
                          </TableCell>,
                        ];
                      }
                      return paymentTerms.map((term) => {
                        const value = base == null || base === 0 ? 0 : Number(base) + Number(term.extra || 0);
                        const cellKey = `${depot.depotKey}__${r.refineryId}__${term.id}`;
                        const isCheapest = value != null && cheapestCellMap.get(product.key) === cellKey;
                        return (
                          <TableCell
                            key={`${r.refineryId}-${depot.depotKey}-${product.key}-${term.id}`}
                            align='center'
                            sx={{
                              color: product.color_hex ?? '#2563eb',
                              fontWeight: 700,
                              bgcolor: isCheapest ? '#fff7cc' : undefined,
                              animation: isCheapest ? 'priceBlink 1.1s ease-in-out infinite' : undefined,
                              '@keyframes priceBlink': {
                                '0%, 100%': { boxShadow: 'inset 0 0 0 0 rgba(250, 204, 21, 0.0)' },
                                '50%': { boxShadow: 'inset 0 0 0 999px rgba(250, 204, 21, 0.22)' },
                              },
                            }}
                          >
                            <Stack direction='row' spacing={0.5} justifyContent='center' alignItems='center'>
                              <span>{fmtPrice(value)}</span>
                              {isCheapest ? <Chip size='small' label='ถูกสุด' sx={{ height: 16, fontSize: 10, bgcolor: '#facc15', color: '#111827' }} /> : null}
                            </Stack>
                          </TableCell>
                        );
                      });
                    })}
                  </TableRow>
                )))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      </Stack>
    </CustomerShell>
  );
}
