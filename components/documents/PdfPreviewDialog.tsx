'use client';

import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';
import { OpenInNew, Send } from '@mui/icons-material';
import type { DocumentType } from '@/lib/documents/types';

export type PdfPreviewTarget = { type: DocumentType; id: string; title: string; copy?: boolean } | null;

/** Builds the API URL that streams a document PDF. */
export function documentPdfUrl(type: DocumentType, id: string, options: { download?: boolean; copy?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (options.download) params.set('download', '1');
  if (options.copy) params.set('copy', '1');
  const query = params.toString();
  return `/api/documents/${type}/${id}${query ? `?${query}` : ''}`;
}

/**
 * Shows a generated PDF in an iframe with actions to open it in a new tab and
 * to send it to the customer's LINE as a file link.
 */
export function PdfPreviewDialog({ target, onClose, onNotify }: {
  target: PdfPreviewTarget;
  onClose: () => void;
  onNotify?: (message: string, severity: 'success' | 'error' | 'info' | 'warning') => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const sendLine = async () => {
    if (!target) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/documents/${target.type}/${target.id}/send-line`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ส่ง LINE ไม่สำเร็จ');
      onNotify?.(`ส่ง ${target.title} ${data.docNo} ทาง LINE แล้ว`, 'success');
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      onNotify?.(message, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onClose={onClose} maxWidth='lg' fullWidth>
      <DialogTitle>{target?.title ?? 'เอกสาร'}</DialogTitle>
      <DialogContent sx={{ p: 0, height: { xs: '74vh', md: '82vh' }, bgcolor: '#e5e7eb' }}>
        {error ? <Alert severity='error' sx={{ m: 1 }}>{error}</Alert> : null}
        {target ? (
          <iframe
            key={`${target.type}-${target.id}-${target.copy ? 'copy' : 'orig'}`}
            title={target.title}
            src={documentPdfUrl(target.type, target.id, { copy: target.copy })}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        ) : null}
      </DialogContent>
      <DialogActions>
        <Stack direction='row' spacing={1} sx={{ flex: 1 }}>
          {target ? (
            <Button
              component='a'
              href={documentPdfUrl(target.type, target.id, { download: true, copy: target.copy })}
              startIcon={<OpenInNew />}
              variant='outlined'
            >
              ดาวน์โหลด PDF
            </Button>
          ) : null}
          <Button variant='contained' color='success' startIcon={<Send />} onClick={() => void sendLine()} disabled={!target || sending}>
            {sending ? 'กำลังส่ง...' : 'ส่งไฟล์ให้ลูกค้าทาง LINE'}
          </Button>
        </Stack>
        <Button onClick={onClose}>ปิด</Button>
      </DialogActions>
    </Dialog>
  );
}
