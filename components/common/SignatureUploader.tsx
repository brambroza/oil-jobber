'use client';

import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { CloudUploadOutlined, DeleteOutline } from '@mui/icons-material';

/** Max rendered size of the stored signature (keeps the data URI small and the PDF crisp). */
const MAX_WIDTH = 600;
const MAX_HEIGHT = 240;

/**
 * Reads an image file, scales it down to at most 600×240 px and returns a PNG
 * data URI. PNG keeps transparent backgrounds, which look right on paper.
 */
export async function fileToSignatureDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('กรุณาเลือกไฟล์ภาพ (PNG หรือ JPG)');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับการย่อภาพ');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/png');
  if (dataUrl.length > 400_000) throw new Error('ไฟล์ลายเซ็นใหญ่เกินไป กรุณาใช้ภาพที่เล็กลง');
  return dataUrl;
}

type Props = {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
};

/**
 * Drop zone + preview for a staff signature image. Emits a PNG data URI (or
 * null when removed); the caller saves it to `users_profile.signature_url`.
 */
export default function SignatureUploader({ value, onChange, disabled }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState('');

  const applyFile = async (file?: File | null) => {
    if (!file) return;
    setLocalError('');
    try {
      onChange(await fileToSignatureDataUrl(file));
    } catch (e) {
      setLocalError((e as Error).message);
    }
  };

  return (
    <Stack spacing={1}>
      <Typography variant='body2' color='text.secondary'>ลายเซ็นสำหรับเอกสาร PDF (ลากไฟล์มาวาง หรือเลือกไฟล์ภาพ)</Typography>
      <Box
        onDragOver={(e) => { if (disabled) return; e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { if (disabled) return; e.preventDefault(); setDragActive(false); void applyFile(e.dataTransfer.files?.[0]); }}
        sx={{ border: '1px dashed', borderColor: dragActive ? '#0f172a' : 'divider', bgcolor: dragActive ? '#f8fafc' : 'transparent', borderRadius: 2, p: 2 }}
      >
        <Stack spacing={1} alignItems='center'>
          <Box
            sx={{
              width: 220,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '1px solid',
              borderColor: 'text.primary',
              backgroundImage: 'linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 75%, #f1f5f9 75%), linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 75%, #f1f5f9 75%)',
              backgroundSize: '12px 12px',
              backgroundPosition: '0 0, 6px 6px',
            }}
          >
            {value
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={value} alt='ลายเซ็น' style={{ maxWidth: 200, maxHeight: 70, objectFit: 'contain' }} />
              : <Typography variant='caption' color='text.disabled'>ยังไม่มีลายเซ็น</Typography>}
          </Box>
          <Typography variant='caption' color='text.secondary'>แนะนำภาพลายเซ็นบนพื้นขาวหรือพื้นโปร่งใส (PNG) ระบบย่อให้อัตโนมัติ ไม่เกิน 300 KB</Typography>
          <Stack direction='row' spacing={1}>
            <Button component='label' size='small' variant='outlined' disabled={disabled} startIcon={<CloudUploadOutlined fontSize='small' />}>
              เลือกไฟล์
              <input hidden type='file' accept='image/png,image/jpeg' onChange={(e) => { void applyFile(e.target.files?.[0]); e.target.value = ''; }} />
            </Button>
            {value ? (
              <Button size='small' color='error' variant='text' disabled={disabled} startIcon={<DeleteOutline fontSize='small' />} onClick={() => onChange(null)}>
                ลบลายเซ็น
              </Button>
            ) : null}
          </Stack>
          {localError ? <Typography variant='caption' color='error'>{localError}</Typography> : null}
        </Stack>
      </Box>
    </Stack>
  );
}
