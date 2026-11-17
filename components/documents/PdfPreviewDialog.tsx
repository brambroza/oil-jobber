'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { Close, ContentCopy, Link as LinkIcon, OpenInNew, Send } from '@mui/icons-material';
import type { DocumentType } from '@/lib/documents/types';
import { DEFAULT_VAT_MODE, parseVatMode, supportsVatMode, VAT_MODE_OPTIONS, type VatMode } from '@/lib/documents/vat-mode';

/** `vatMode` = the bill's saved price mode; when omitted the dialog looks it up from the order. */
export type PdfPreviewTarget = { type: DocumentType; id: string; title: string; copy?: boolean; vatMode?: VatMode } | null;

/** Builds the API URL that streams a document PDF. */
export function documentPdfUrl(type: DocumentType, id: string, options: { download?: boolean; copy?: boolean; vatMode?: VatMode } = {}): string {
  const params = new URLSearchParams();
  if (options.download) params.set('download', '1');
  if (options.copy) params.set('copy', '1');
  if (options.vatMode && supportsVatMode(type)) params.set('vat', options.vatMode);
  const query = params.toString();
  return `/api/documents/${type}/${id}${query ? `?${query}` : ''}`;
}

/**
 * Shows a generated PDF in an iframe with actions to open it in a new tab and
 * to send it to the customer's LINE as a file link.
 */
export type PdfSentResult = {
  docNo: string;
  url: string;
  /** Order status after the send (the server may advance it), null for documents that are not milestones. */
  order_status: string | null;
  status_advanced: boolean;
};

export function PdfPreviewDialog({ target, onClose, onNotify, onSent }: {
  target: PdfPreviewTarget;
  onClose: () => void;
  onNotify?: (message: string, severity: 'success' | 'error' | 'info' | 'warning') => void;
  /** Called after a successful LINE send so the caller can refresh order data. */
  onSent?: (target: NonNullable<PdfPreviewTarget>, result: PdfSentResult) => void;
}) {
  const [sending, setSending] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');
  /** ลิงก์ล่าสุดที่ส่ง LINE หรือสร้างให้คัดลอก (แสดงให้พนักงานดู/คัดลอก) */
  const [sentLink, setSentLink] = useState<{ docNo: string; url: string; sent: boolean } | null>(null);
  /** null while the bill's saved mode is being looked up. */
  const [vatMode, setVatMode] = useState<VatMode | null>(DEFAULT_VAT_MODE);
  const showVatMode = Boolean(target && supportsVatMode(target.type));

  // Each newly opened document starts at the price mode saved on the bill.
  useEffect(() => {
    setError('');
    setSentLink(null);
    if (!target || !supportsVatMode(target.type)) { setVatMode(DEFAULT_VAT_MODE); return; }
    if (target.vatMode) { setVatMode(target.vatMode); return; }
    let active = true;
    setVatMode(null);
    fetch(`/api/orders/${target.id}`, { cache: 'no-store' })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((order) => { if (active) setVatMode(parseVatMode(order?.price_vat_mode)); })
      .catch(() => { if (active) setVatMode(DEFAULT_VAT_MODE); });
    return () => { active = false; };
  }, [target?.type, target?.id, target?.vatMode]);

  const sendLine = async () => {
    if (!target) return;
    setSending(true);
    setError('');
    setSentLink(null);
    try {
      const res = await fetch(`/api/documents/${target.type}/${target.id}/send-line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vatMode ? { vat_mode: vatMode } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ส่ง LINE ไม่สำเร็จ');
      onNotify?.(`ส่ง ${target.title} ${data.docNo} ทาง LINE แล้ว`, 'success');
      if (data.url) setSentLink({ docNo: String(data.docNo || ''), url: String(data.url), sent: true });
      onSent?.(target, {
        docNo: String(data.docNo || ''),
        url: String(data.url || ''),
        order_status: data.order_status ?? null,
        status_advanced: Boolean(data.status_advanced),
      });
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      onNotify?.(message, 'error');
    } finally {
      setSending(false);
    }
  };

  /** Copies a link to the clipboard. */
  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onNotify?.('คัดลอกลิงก์แล้ว', 'success');
    } catch {
      onNotify?.('คัดลอกไม่สำเร็จ กรุณาคัดลอกจากข้อความลิงก์ด้านบน', 'info');
    }
  };

  /** Copies the shown link again. */
  const copySentLink = async () => {
    if (sentLink) await copyToClipboard(sentLink.url);
  };

  /**
   * Creates the same customer link the LINE send uses (no LINE message, no
   * status change) and copies it.
   */
  const copyLink = async () => {
    if (!target) return;
    setCopying(true);
    setError('');
    try {
      const res = await fetch(`/api/documents/${target.type}/${target.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vatMode ? { vat_mode: vatMode } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างลิงก์ไม่สำเร็จ');
      const url = String(data.url || '');
      setSentLink({ docNo: String(data.docNo || ''), url, sent: false });
      await copyToClipboard(url);
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      onNotify?.(message, 'error');
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onClose={onClose} maxWidth='lg' fullWidth>
      <DialogTitle sx={{ pr: 7 }}>
        {target?.title ?? 'เอกสาร'}
        <IconButton
          aria-label='ปิด'
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 10, color: '#fff', bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' } }}
          size='small'
        >
          <Close fontSize='small' />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, height: { xs: '74vh', md: '82vh' }, bgcolor: '#e5e7eb' }}>
        {error ? <Alert severity='error' sx={{ m: 1 }}>{error}</Alert> : null}
        {sentLink ? (
          <Alert
            severity='success'
            sx={{ m: 1, '& .MuiAlert-message': { minWidth: 0, flex: 1 } }}
            onClose={() => setSentLink(null)}
            action={(
              <Stack direction='row' spacing={0.5} alignItems='center'>
                <IconButton size='small' aria-label='คัดลอกลิงก์' onClick={() => void copySentLink()}><ContentCopy fontSize='small' /></IconButton>
                <IconButton size='small' aria-label='เปิดลิงก์' component='a' href={sentLink.url} target='_blank' rel='noopener noreferrer'><OpenInNew fontSize='small' /></IconButton>
              </Stack>
            )}
          >
            {sentLink.sent ? `ส่ง ${sentLink.docNo} ทาง LINE แล้ว · ลิงก์ที่ลูกค้าได้รับ:` : `คัดลอกลิงก์ ${sentLink.docNo} แล้ว:`}{' '}
            <Box component='span' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{sentLink.url}</Box>
          </Alert>
        ) : null}
        {target && vatMode ? (
          <iframe
            key={`${target.type}-${target.id}-${target.copy ? 'copy' : 'orig'}-${vatMode}`}
            title={target.title}
            src={documentPdfUrl(target.type, target.id, { copy: target.copy, vatMode })}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        ) : null}
      </DialogContent>
      <DialogActions>
        <Stack direction='row' spacing={1} sx={{ flex: 1, flexWrap: 'wrap', rowGap: 1 }}>
          {showVatMode ? (
            <ToggleButtonGroup
              size='small'
              exclusive
              color='primary'
              value={vatMode ?? DEFAULT_VAT_MODE}
              disabled={!vatMode}
              onChange={(_, value: VatMode | null) => { if (value) setVatMode(value); }}
              aria-label='รูปแบบราคา'
            >
              {VAT_MODE_OPTIONS.map((option) => (
                <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          ) : null}
          {target ? (
            <Button
              component='a'
              href={documentPdfUrl(target.type, target.id, { download: true, copy: target.copy, vatMode: vatMode ?? undefined })}
              startIcon={<OpenInNew />}
              variant='outlined'
            >
              ดาวน์โหลด PDF
            </Button>
          ) : null}
          <Button variant='contained' color='success' startIcon={<Send />} onClick={() => void sendLine()} disabled={!target || sending || copying}>
            {sending ? 'กำลังส่ง...' : 'ส่งไฟล์ให้ลูกค้าทาง LINE'}
          </Button>
          <Button variant='outlined' color='success' startIcon={<LinkIcon />} onClick={() => void copyLink()} disabled={!target || !vatMode || sending || copying}>
            {copying ? 'กำลังสร้างลิงก์...' : 'คัดลอกลิงก์'}
          </Button>
        </Stack>
        <Button variant='outlined' color='error' startIcon={<Close />} onClick={onClose}>ปิด</Button>
      </DialogActions>
    </Dialog>
  );
}
