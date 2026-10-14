'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import SignatureUploader from '@/components/common/SignatureUploader';

type Props = { open: boolean; onClose: () => void };

/**
 * Lets the logged-in staff user upload or remove their own signature. Saved
 * through `PATCH /api/users-profile/me`, so every role (SALES included) can
 * manage it without the users module.
 */
export default function MySignatureDialog({ open, onClose }: Props) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setDirty(false);
    fetch('/api/users-profile/me', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ');
        if (!cancelled) setValue(data?.signature_url ?? null);
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const save = async () => {
    setSaving(true);
    setError('');
    const res = await fetch('/api/users-profile/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature_url: value }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'บันทึกไม่สำเร็จ');
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='xs'>
      <DialogTitle>ลายเซ็นของฉัน</DialogTitle>
      <DialogContent>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          ลายเซ็นนี้จะถูกวางในใบสั่งขาย (ช่องพนักงานขาย) และใบเสร็จรับเงิน (ช่องผู้รับเงิน) ที่คุณเป็นผู้ออก
        </Typography>
        {error ? <Alert severity='error' sx={{ mb: 2 }}>{error}</Alert> : null}
        <SignatureUploader value={value} onChange={(next) => { setValue(next); setDirty(true); }} disabled={loading || saving} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ปิด</Button>
        <Button variant='contained' onClick={() => void save()} disabled={!dirty || loading || saving}>บันทึก</Button>
      </DialogActions>
    </Dialog>
  );
}
