'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { EditOutlined, VisibilityOutlined } from '@mui/icons-material';
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
import { PageScaffold } from '@/components/common/PageScaffold';

type PriceRound = {
  id: string;
  refinery_name: string;
  effective_date: string;
  effective_at: string | null;
  expires_date?: string | null;
  expires_at?: string | null;
  remark?: string | null;
  item_count: number;
};

type PriceItem = {
  id: string;
  depot_id: string;
  product_code: string;
  product_name: string;
  base_cost_price: number;
  depots?: { code?: string; name?: string } | null;
};

type PaymentCondition = {
  id: string;
  code: string;
  name: string;
  payment_type: 'CASH' | 'CREDIT';
  credit_days: number;
  extra_cost_per_liter: number;
};

type OilProduct = {
  id: string;
  code: string;
  name: string;
};

type PriceRoundDetail = {
  base: {
    id: string;
    refinery_id: string | null;
    effective_date: string;
    effective_at: string | null;
    expires_date?: string | null;
    expires_at?: string | null;
    remark?: string | null;
    refineries?: { name?: string; image_url?: string } | null;
  };
  items: PriceItem[];
};
type LineCustomer = {
  id: string;
  customer_id?: string | null;
  line_user_id: string;
  display_name: string | null;
  profile_image_url: string | null;
  customers?: { company_name?: string } | null;
};

type CustomerAccess = {
  allowed_refinery_ids?: string[] | null;
  allowed_depot_ids?: string[] | null;
  allowed_oil_product_ids?: string[] | null;
  allowed_payment_condition_ids?: string[] | null;
} | null;

function formatDate(isoDate: string): string {
  if (!isoDate) return '-';
  const [yyyy, mm, dd] = isoDate.split('-');
  if (!yyyy || !mm || !dd) return isoDate;
  return `${dd}/${mm}/${yyyy}`;
}

function formatTime(isoDateTime?: string | null): string {
  if (!isoDateTime) return '-';
  if (isoDateTime.includes('T')) return isoDateTime.slice(11, 16);
  return isoDateTime.slice(0, 5);
}

function formatMoney(value: number): string {
  return Number(value || 0).toFixed(2);
}

export default function SellingPricesPage() {
  const [companyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');
  const [rounds, setRounds] = useState<PriceRound[]>([]);
  const [paymentConditions, setPaymentConditions] = useState<PaymentCondition[]>([]);
  const [oilProducts, setOilProducts] = useState<OilProduct[]>([]);
  const [selected, setSelected] = useState<PriceRoundDetail | null>(null);
  const [lineCustomers, setLineCustomers] = useState<LineCustomer[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [openSendDialog, setOpenSendDialog] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [openRemarkDialog, setOpenRemarkDialog] = useState(false);
  const [remarkDraft, setRemarkDraft] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingView, setLoadingView] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const accessCache = useMemo(() => new Map<string, CustomerAccess>(), []);
  const productIdByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of oilProducts) {
      map.set(String(product.code || '').trim().toUpperCase(), String(product.id || '').trim());
    }
    return map;
  }, [oilProducts]);

  const sortedConditions = useMemo(
    () =>
      [...paymentConditions].sort((a, b) => {
        if (a.payment_type !== b.payment_type) return a.payment_type === 'CASH' ? -1 : 1;
        if (a.credit_days !== b.credit_days) return a.credit_days - b.credit_days;
        return a.code.localeCompare(b.code);
      }),
    [paymentConditions],
  );
  const groupedSelectedItems = useMemo(() => {
    const list = selected?.items ?? [];
    const groups = new Map<string, { depotCode: string; depotName: string; items: PriceItem[] }>();

    for (const item of list) {
      const depotCode = item.depots?.code?.trim() || '-';
      const depotName = item.depots?.name?.trim() || '';
      const key = `${depotCode}__${depotName}`;
      if (!groups.has(key)) {
        groups.set(key, { depotCode, depotName, items: [] });
      }
      groups.get(key)?.items.push(item);
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => a.product_code.localeCompare(b.product_code)),
      }))
      .sort((a, b) => a.depotCode.localeCompare(b.depotCode));
  }, [selected]);
  const filteredRounds = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const d = searchDate.trim();
    return rounds.filter((r) => {
      const okText =
        !q ||
        (r.refinery_name || '').toLowerCase().includes(q) ||
        String(r.id || '').toLowerCase().includes(q);
      const okDate =
        !d ||
        String(r.effective_date || '').includes(d) ||
        String(r.effective_at || '').includes(d);
      return okText && okDate;
    });
  }, [rounds, searchDate, searchText]);



  const pagedRounds = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRounds.slice(start, start + rowsPerPage);
  }, [filteredRounds, page, rowsPerPage]);

  const load = async () => {
    if (!companyId) {
      setError('ไม่พบ DEFAULT_COMPANY_ID กรุณาตั้งค่าใน .env');
      return;
    }

    setLoading(true);
    setError('');

    const [rRounds, rConditions, rProducts] = await Promise.all([
      fetch(`/api/prices?company_id=${companyId}`),
      fetch(`/api/payment-conditions?company_id=${companyId}`),
      fetch(`/api/oil-products?company_id=${companyId}`),
    ]);

    const [dRounds, dConditions, dProducts] = await Promise.all([rRounds.json(), rConditions.json(), rProducts.json()]);

    if (!rRounds.ok) {
      setError(dRounds.error || 'โหลดรอบราคาน้ำมันไม่สำเร็จ');
    } else {
      setRounds(dRounds || []);
    }

    if (!rConditions.ok) {
      setError((prev) => prev || dConditions.error || 'โหลดเงื่อนไขชำระเงินไม่สำเร็จ');
    } else {
      setPaymentConditions((dConditions || []).map((x: any) => ({ ...x, extra_cost_per_liter: Number(x.extra_cost_per_liter || 0) })));
    }

    if (!rProducts.ok) {
      setError((prev) => prev || dProducts.error || 'โหลดสินค้าน้ำมันไม่สำเร็จ');
    } else {
      setOilProducts(dProducts || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const openView = async (id: string) => {
    setLoadingView(true);
    setError('');

    const res = await fetch(`/api/prices/${id}?company_id=${companyId}`);
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'โหลดรายละเอียดราคาขายไม่สำเร็จ');
      setLoadingView(false);
      return;
    }

    setSelected({
      base: data.base,
      items: (data.items || []).map((x: any) => ({ ...x, base_cost_price: Number(x.base_cost_price || 0) })),
    });
    setLoadingView(false);
  };

  const openRemarkEditor = () => {
    setRemarkDraft(String(selected?.base.remark || '').trim());
    setOpenRemarkDialog(true);
  };

  const saveRemark = async () => {
    if (!selected) return;
    setSavingRemark(true);
    setError('');

    const res = await fetch(`/api/prices/${selected.base.id}?company_id=${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId,
        effective_date: String(selected.base.effective_date || '').includes('-') ? formatDate(selected.base.effective_date) : String(selected.base.effective_date || ''),
        effective_time: selected.base.effective_at ? formatTime(selected.base.effective_at) : '',
        expires_date: selected.base.expires_date ? (String(selected.base.expires_date || '').includes('-') ? formatDate(selected.base.expires_date) : String(selected.base.expires_date || '')) : '',
        expires_time: selected.base.expires_at ? formatTime(selected.base.expires_at) : '',
        refinery_id: selected.base.refinery_id,
        remark: remarkDraft,
        rows: selected.items.map((item) => ({
          depot_id: item.depot_id,
          product_code: item.product_code,
          product_name: item.product_name,
          price: item.base_cost_price,
        })),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'บันทึกหมายเหตุไม่สำเร็จ');
      setSavingRemark(false);
      return;
    }

    const nextRemark = remarkDraft.trim();
    setSelected((prev) => prev ? ({ ...prev, base: { ...prev.base, remark: nextRemark || null } }) : prev);
    setRounds((prev) => prev.map((r) => (r.id === selected.base.id ? { ...r, remark: nextRemark || null } : r)));
    setOpenRemarkDialog(false);
    setSavingRemark(false);
  };

  const loadLineCustomers = async () => {
    const res = await fetch(`/api/line/customers?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'โหลดรายชื่อลูกค้า LINE ไม่สำเร็จ');
      return;
    }
    setLineCustomers(data || []);
  };

  const loadCustomerAccess = async (customerId: string): Promise<CustomerAccess> => {
    const cached = accessCache.get(customerId);
    if (cached !== undefined) return cached;

    const res = await fetch(`/api/customer-portal/access/${customerId}?company_id=${companyId}`);
    const data = await res.json();
    const access: CustomerAccess = res.ok ? (data.access ?? null) : null;
    accessCache.set(customerId, access);
    return access;
  };

  const toggleCustomer = (id: string, checked: boolean) => {
    setSelectedCustomerIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const openBroadcastDialog = async () => {
    await loadLineCustomers();
    setSelectedCustomerIds([]);
    setOpenSendDialog(true);
  };

  const selectAll = () => setSelectedCustomerIds(lineCustomers.map((c) => c.id));
  const clearAll = () => setSelectedCustomerIds([]);

  const normalizeIds = (values?: string[] | null) => (values || []).map((x) => String(x || '').trim()).filter(Boolean);

  const isAllowedByAccess = (access: CustomerAccess, baseRefineryId: string, depotId: string, productCode: string) => {
    const refineryIds = normalizeIds(access?.allowed_refinery_ids);
    const depotIds = normalizeIds(access?.allowed_depot_ids);
    const productIds = normalizeIds(access?.allowed_oil_product_ids);

    if (refineryIds.length && !refineryIds.includes(baseRefineryId)) return false;
    if (depotIds.length && !depotIds.includes(depotId)) return false;
    if (productIds.length) {
      const productId = productIdByCode.get(String(productCode || '').trim().toUpperCase()) || '';
      if (!productId || !productIds.includes(productId)) return false;
    }
    return true;
  };

  const getVisibleDataForAccess = (access: CustomerAccess) => {
    if (!selected) return null;

    const baseRefineryId = String(selected.base.refinery_id || '').trim();
    if (normalizeIds(access?.allowed_refinery_ids).length && !baseRefineryId) return null;

    const visiblePaymentConditions = (() => {
      const allowedIds = normalizeIds(access?.allowed_payment_condition_ids);
      if (!allowedIds.length) return sortedConditions;
      return sortedConditions.filter((pc) => allowedIds.includes(pc.id));
    })();

    const visibleGroups = groupedSelectedItems
      .map((group) => {
        const items = group.items.filter((item) => isAllowedByAccess(access, baseRefineryId, String(item.depot_id || '').trim(), String(item.product_code || '').trim()));
        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);

    if (!visibleGroups.length) return null;

    return {
      visibleGroups,
      visiblePaymentConditions: visiblePaymentConditions.length
        ? visiblePaymentConditions
        : [{ id: 'base', name: 'ราคาขาย', extra_cost_per_liter: 0 } as any],
    };
  };

  const buildBroadcastMessage = (access: CustomerAccess): string => {
    if (!selected) return '';
    const visibleData = getVisibleDataForAccess(access);
    if (!visibleData) return '';
    const { visibleGroups, visiblePaymentConditions } = visibleData;
    const remark = String(selected.base.remark || '').trim();
    const header = `อัปเดตราคาขาย ${selected.base.refineries?.name || '-'} วันที่ ${formatDate(selected.base.effective_date)} เวลา ${formatTime(selected.base.effective_at)}`;
    const lines: string[] = [header, ''];
    for (const g of visibleGroups.slice(0, 4)) {
      const visibleItems = g.items.filter((it) => Number(it.base_cost_price || 0) > 0);
      if (!visibleItems.length) continue;
      lines.push(`${g.depotCode}${g.depotName ? ` (${g.depotName})` : ''}`);
      for (const item of visibleItems.slice(0, 3)) {
        lines.push(`${item.product_code} ${item.product_name || ''}`.trim());
        const visiblePrices = visiblePaymentConditions.map((pc: any) => Number(item.base_cost_price || 0) + Number(pc.extra_cost_per_liter || 0));
        const cheapestPrice = visiblePrices.length ? Math.min(...visiblePrices) : null;
        const parts = visiblePaymentConditions.map((pc: any, idx: number) => {
          const price = visiblePrices[idx] ?? 0;
          const isCheapest = cheapestPrice != null && Math.abs(price - cheapestPrice) < 0.0001;
          return `${pc.name}: ${price.toFixed(2)}${isCheapest ? ' (ถูกสุด)' : ''}`;
        });
        lines.push(parts.join(' | '));
      }
    }
    lines.push('');
    lines.push(`ราคาถึง: ${selected.base.expires_date ? formatDate(selected.base.expires_date) : '-'} ${formatTime(selected.base.expires_at)}`);
    if (remark) {
      lines.push('', 'หมายเหตุ', remark);
    }
    lines.push('', 'ดูรายละเอียดเพิ่มเติมในระบบ');
    return lines.join('\n');
  };

  const buildPriceFlexMessages = (access: CustomerAccess) => {
    if (!selected) return [] as Array<Record<string, unknown>>;
    const visibleData = getVisibleDataForAccess(access);
    if (!visibleData) return [] as Array<Record<string, unknown>>;
    const { visibleGroups, visiblePaymentConditions } = visibleData;
    const refineryName = selected.base.refineries?.name || '-';
    const effectiveText = `${formatDate(selected.base.effective_date)} ${formatTime(selected.base.effective_at)} น.`;
    const expireText = `${selected.base.expires_date ? formatDate(selected.base.expires_date) : '-'} ${formatTime(selected.base.expires_at)} น.`;
    const remark = String(selected.base.remark || '').trim();
    const conditionsToUse = visiblePaymentConditions;

    const groupBlocks = visibleGroups.slice(0, 5).map((group) => {
      const visibleItems = group.items.filter((it) => Number(it.base_cost_price || 0) > 0);
      if (!visibleItems.length) return null;
      const conditionBlocks = conditionsToUse.map((pc: any) => {
        const productRows = visibleItems.slice(0, 4).map((item) => {
          const basePrice = Number(item.base_cost_price || 0) + Number(pc.extra_cost_per_liter || 0);
          const allPrices = conditionsToUse.map((condition: any) => Number(item.base_cost_price || 0) + Number(condition.extra_cost_per_liter || 0));
          const cheapestPrice = allPrices.length ? Math.min(...allPrices) : null;
          const isCheapest = cheapestPrice != null && Math.abs(basePrice - cheapestPrice) < 0.0001;

          return {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            margin: 'sm',
            contents: [
              { type: 'text', text: item.product_code, size: 'xs', color: '#1e3a8a', weight: 'bold', flex: 2 },
              { type: 'text', text: item.product_name || '-', size: 'xxs', color: '#334155', flex: 5, wrap: true },
              {
                type: 'box',
                layout: 'horizontal',
                spacing: 'xs',
                justifyContent: 'flex-start',
                flex: 4,
                contents: [
                  { type: 'text', text: basePrice.toFixed(2), size: 'sm', color: '#111827', weight: 'bold', align: 'start', flex: 3 },
                  isCheapest ? {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '2px',
                    cornerRadius: '4px',
                    backgroundColor: '#facc15',
                    flex: 1,
                    contents: [
                      { type: 'text', text: 'ถูกสุด', size: 'xxs', color: '#111827', weight: 'bold', align: 'center' },
                    ],
                  } : null,
                ].filter(Boolean),
              },
            ],
          };
        });

        return {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          paddingAll: '10px',
          cornerRadius: '10px',
          backgroundColor: '#f8fafc',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              contents: [
                { type: 'text', text: 'เงื่อนไขการชำระเงิน', size: 'xxs', color: '#64748b', flex: 5 },
                { type: 'text', text: pc.name, size: 'xs', color: '#111827', weight: 'bold', align: 'end', flex: 5, wrap: true },
              ],
            },
            { type: 'separator', margin: 'sm', color: '#e2e8f0' },
            ...productRows,
          ],
        };
      });

      return {
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        paddingAll: '10px',
        backgroundColor: '#eef2ff',
        cornerRadius: '10px',
        contents: [
          {
            type: 'text',
            text: `${group.depotCode}${group.depotName ? ` (${group.depotName})` : ''}`,
            size: 'sm',
            weight: 'bold',
            color: '#1e3a8a',
            wrap: true,
          },
          ...conditionBlocks,
        ],
      };
    });
    const safeGroupBlocks = groupBlocks.filter((b: any) => {
      const contents = b?.contents;
      return Array.isArray(contents) && contents.length > 0;
    });

    if (!safeGroupBlocks.length) return [] as Array<Record<string, unknown>>;

    return [{
      type: 'flex',
      altText: `ราคาน้ำมัน ${refineryName} มีผล ${effectiveText} หมดอายุ ${expireText}`,
      contents: {
        type: 'bubble',
        size: 'mega',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            { type: 'text', text: refineryName, size: 'lg', weight: 'bold', color: '#1e3a8a' },
            { type: 'text', text: `อัปเดต ${effectiveText}`, size: 'xs', color: '#64748b' },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'sm',
              paddingAll: '8px',
              backgroundColor: '#fff1f2',
              cornerRadius: '8px',
              contents: [
                { type: 'text', text: 'วันหมดอายุราคา', size: 'xxs', color: '#64748b' },
                { type: 'text', text: expireText, size: 'xs', color: '#dc2626', weight: 'bold' },
              ],
            },

            ...safeGroupBlocks,

            remark ? {
              type: 'box',
              layout: 'vertical',
              margin: 'sm',
              paddingAll: '8px',
              backgroundColor: '#f8fafc',
              cornerRadius: '8px',
              contents: [
                { type: 'text', text: 'หมายเหตุ', size: 'xxs', color: '#64748b' },
                { type: 'text', text: remark, size: 'xs', color: '#334155', weight: 'bold', wrap: true },
              ],
            } : null,
          ].filter(Boolean),
        },
      },
    }];
  };

  const sendToLineOA = async () => {
    if (!selected || !selectedCustomerIds.length) return;
    setSending(true);
    setSendResult(null);
    const recipients = lineCustomers
      .filter((c) => selectedCustomerIds.includes(c.id))
      .map((c) => ({ lineUserId: c.line_user_id, lineCustomerId: c.id }));
    let success = 0;
    let fail = 0;
    for (const recipient of recipients) {
      const lc = lineCustomers.find((x) => x.id === recipient.lineCustomerId);
      const customerId = String(lc?.customer_id || '').trim();
      const access = customerId ? await loadCustomerAccess(customerId) : null;
      const visibleData = getVisibleDataForAccess(access);
      if (!visibleData) {
        fail += 1;
        continue;
      }

      const res = await fetch('/api/line/broadcast-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          title: `ราคาขาย ${selected.base.refineries?.name || '-'}`,
          message: buildBroadcastMessage(access),
          messages: buildPriceFlexMessages(access),
          recipients: [recipient],
        }),
      });
      const data = await res.json();
      if (res.ok && data?.ok !== false) success += 1;
      else fail += 1;
    }
    if (fail > 0) setSendResult({ ok: false, message: `ส่งสำเร็จ ${success} รายการ, ไม่สำเร็จ ${fail} รายการ` });
    else {
      setSendResult({ ok: true, message: `ส่งสำเร็จ ${success} ราย` });
      setOpenSendDialog(false);
    }
    setSending(false);
  };

  return (
    <PageScaffold
      title='แสดงราคาขาย'
      description='ดูรอบบันทึกราคาน้ำมัน และคำนวณราคาขายแยกตามเงื่อนไขชำระเงิน/เครดิต'
    >
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent='space-between'>
          <Stack direction='row' spacing={1} alignItems='center'>
            <Chip label={`รอบราคา ${rounds.length} รอบ`} size='small' variant='outlined' />
            <Chip label={`เงื่อนไขชำระเงิน ${sortedConditions.length} แบบ`} size='small' variant='outlined' />
          </Stack>
          <Button variant='outlined' onClick={() => void load()} disabled={loading}>รีเฟรช</Button>
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <TextField
            size='small'
            label='ค้นหา'
            placeholder='โรงกลั่น หรือ รหัสรอบราคา'
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: { xs: '100%', md: 300 } }}
          />
          <TextField
            size='small'
            label='ค้นหาตามวันที่'
            placeholder='YYYY-MM-DD หรือ DD/MM/YYYY'
            value={searchDate}
            onChange={(e) => {
              setSearchDate(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: { xs: '100%', md: 220 } }}
          />
        </Stack>

        {error ? <Alert severity='error'>{error}</Alert> : null}
        {loading ? <Alert severity='info'>กำลังโหลดข้อมูล...</Alert> : null}

        <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>วันที่</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>เวลา</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ราคาถึงวันที่</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ราคาถึงเวลา</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>โรงกลั่น</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>หมายเหตุ</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>จำนวนรายการ</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align='right'>ดูรายละเอียด</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedRounds.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{formatDate(r.effective_date)}</TableCell>
                  <TableCell>{formatTime(r.effective_at)}</TableCell>
                  <TableCell>{r.expires_date ? formatDate(r.expires_date) : '-'}</TableCell>
                  <TableCell>{formatTime(r.expires_at)}</TableCell>
                  <TableCell>{r.refinery_name || '-'}</TableCell>
                  <TableCell sx={{ maxWidth: 280 }}>
                    <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', color: 'text.secondary' }}>
                      {String(r.remark || '').trim() || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>{r.item_count}</TableCell>
                  <TableCell align='right'>
                    <Button

                      size='small'
                      variant='contained'
                      startIcon={<VisibilityOutlined fontSize='small' />}
                      onClick={() => void openView(r.id)}
                      disabled={loadingView}
                      sx={{ textTransform: 'none' }}
                    >
                      ดูราคาขาย
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filteredRounds.length && !loading ? (
                <TableRow>
                  <TableCell colSpan={8} align='center'>
                    ไม่มีรอบบันทึกราคาน้ำมัน
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <TablePagination
            component='div'
            count={filteredRounds.length}
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

        <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth='xl' fullWidth>
          <DialogTitle>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent='space-between'>
              <Stack direction='row' spacing={1} alignItems='center' sx={{ flexWrap: 'wrap' }}>
                <Typography variant='h6'>
                  {selected?.base.refineries?.name || '-'} | วันที่ {selected ? formatDate(selected.base.effective_date) : '-'} เวลา {selected ? formatTime(selected.base.effective_at) : '-'}
                </Typography>
                <Chip label={`รายการ ${selected?.items.length || 0}`} size='small' />
              </Stack>
              <Button
                size='small'
                variant='outlined'
                startIcon={<EditOutlined fontSize='small' />}
                onClick={openRemarkEditor}
                disabled={!selected}
                sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, textTransform: 'none' }}
              >
                แก้ไขหมายเหตุ
              </Button>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Stack spacing={1.5}>
              <Alert severity='info'>สูตรคำนวณในตารางนี้: ราคาขาย = ราคาฐาน + extra_cost_per_liter ตามเงื่อนไขชำระเงิน</Alert>
              {String(selected?.base.remark || '').trim() ? (
                <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f8fafc' }}>
                  <Stack spacing={0.5}>
                    <Typography variant='caption' sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      หมายเหตุเพิ่มเติม
                    </Typography>
                    <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', color: 'text.primary', fontWeight: 600 }}>
                      {String(selected?.base.remark || '').trim()}
                    </Typography>
                  </Stack>
                </Box>
              ) : null}
              <Divider />
              <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Table size='small' stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ minWidth: 140, fontWeight: 700 }}>คลัง</TableCell>
                      <TableCell sx={{ minWidth: 120, fontWeight: 700 }}>รหัสน้ำมัน</TableCell>
                      <TableCell sx={{ minWidth: 130, fontWeight: 700 }}>ราคาฐาน</TableCell>
                      {sortedConditions.map((pc) => (
                        <TableCell key={pc.id} sx={{ minWidth: 170, fontWeight: 700 }}>
                          <Stack spacing={0.2}>
                            <Typography variant='caption' sx={{ fontWeight: 700 }}>
                              {pc.name} ({pc.payment_type}{pc.credit_days > 0 ? ` ${pc.credit_days} วัน` : ''})
                            </Typography>
                            <Typography variant='caption' color='text.secondary'>
                              +{formatMoney(pc.extra_cost_per_liter)} บาท/ลิตร
                            </Typography>
                          </Stack>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {String(selected?.base.remark || '').trim() ? (
                      <TableRow>
                        <TableCell
                          colSpan={3 + sortedConditions.length}
                          sx={{ bgcolor: '#f8fafc', borderTop: '1px solid', borderTopColor: 'divider' }}
                        >
                          <Stack spacing={0.4}>
                            <Typography variant='caption' sx={{ color: 'text.secondary', fontWeight: 700 }}>
                              Remark
                            </Typography>
                            <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', fontWeight: 600 }}>
                              {String(selected?.base.remark || '').trim()}
                            </Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {groupedSelectedItems.map((group) => (
                      <Fragment key={`group-${group.depotCode}-${group.depotName}`}>
                        <TableRow key={`group-${group.depotCode}-${group.depotName}`}>
                          <TableCell
                            colSpan={3 + sortedConditions.length}
                            sx={{ bgcolor: '#f8fafc', borderTop: '1px solid', borderTopColor: 'divider' }}
                          >
                            <Stack direction='row' spacing={1} alignItems='center'>
                              <Chip size='small' label={group.depotCode} sx={{ fontWeight: 700 }} />
                              <Typography variant='body2' sx={{ fontWeight: 600 }}>
                                {group.depotName || 'ไม่ระบุชื่อคลัง'}
                              </Typography>
                            </Stack>
                          </TableCell>
                        </TableRow>
                        {group.items.map((it) => (
                          <TableRow key={it.id} hover>
                            <TableCell sx={{ color: 'text.secondary' }}>{it.depots?.code || '-'}</TableCell>
                            <TableCell>{it.product_code}</TableCell>
                            <TableCell>{formatMoney(it.base_cost_price)}</TableCell>
                            {sortedConditions.map((pc) => {
                              const sellingPrice = Number(it.base_cost_price || 0) + Number(pc.extra_cost_per_liter || 0);
                              return <TableCell key={`${it.id}-${pc.id}`}>{formatMoney(sellingPrice)}</TableCell>;
                            })}
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                    {!groupedSelectedItems.length ? (
                      <TableRow>
                        <TableCell colSpan={3 + sortedConditions.length} align='center'>ไม่มีข้อมูลรายการราคา</TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setSelected(null)}>ปิด</Button>
            <Button variant='contained' onClick={() => void openBroadcastDialog()} disabled={!selected}>
              ส่งราคาไปลูกค้าผ่าน LINE OA
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={openRemarkDialog} onClose={() => setOpenRemarkDialog(false)} maxWidth='sm' fullWidth>
          <DialogTitle>แก้ไขหมายเหตุ</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <TextField
                label='หมายเหตุ'
                value={remarkDraft}
                onChange={(e) => setRemarkDraft(e.target.value)}
                multiline
                minRows={4}
                fullWidth
                placeholder='พิมพ์หมายเหตุของรอบราคานี้'
              />
              <Alert severity='info'>การบันทึกจะอัปเดตเฉพาะหมายเหตุ โดยไม่เปลี่ยนรายการราคาเดิม</Alert>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setOpenRemarkDialog(false)} disabled={savingRemark}>ยกเลิก</Button>
            <Button variant='contained' onClick={() => void saveRemark()} disabled={savingRemark}>
              {savingRemark ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={openSendDialog} onClose={() => setOpenSendDialog(false)} maxWidth='md' fullWidth>
          <DialogTitle>เลือกลูกค้าสำหรับส่งราคา LINE OA</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5}>
              {sendResult ? <Alert severity={sendResult.ok ? 'success' : 'error'}>{sendResult.message}</Alert> : null}
              <Stack direction='row' spacing={1}>
                <Button size='small' variant='outlined' onClick={selectAll}>เลือกทั้งหมด</Button>
                <Button size='small' variant='outlined' onClick={clearAll}>ล้างการเลือก</Button>
                <Chip size='small' label={`เลือกแล้ว ${selectedCustomerIds.length} / ${lineCustomers.length}`} />
              </Stack>
              <Box sx={{ maxHeight: 380, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Table size='small'>
                  <TableHead>
                    <TableRow>
                      <TableCell width={48}>เลือก</TableCell>
                      <TableCell>ชื่อลูกค้า LINE</TableCell>
                      <TableCell>บริษัทลูกค้า</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lineCustomers.map((c) => {
                      const checked = selectedCustomerIds.includes(c.id);
                      return (
                        <TableRow key={c.id} hover>
                          <TableCell padding='checkbox'>
                            <Checkbox checked={checked} onChange={(e) => toggleCustomer(c.id, e.target.checked)} />
                          </TableCell>
                          <TableCell>{c.display_name || '-'}</TableCell>
                          <TableCell>{c.customers?.company_name || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                    {!lineCustomers.length ? <TableRow><TableCell colSpan={3} align='center'>ไม่พบลูกค้า LINE</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setOpenSendDialog(false)}>ปิด</Button>
            <Button variant='contained' onClick={() => void sendToLineOA()} disabled={!selectedCustomerIds.length || sending}>
              {sending ? 'กำลังส่ง...' : 'ส่งราคา'}
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </PageScaffold>
  );
}
