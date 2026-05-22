'use client';
import { Button, Stack, TextField } from '@mui/material';
import { PageScaffold } from '@/components/common/PageScaffold';

export default function OCRReviewPage() {
  return <PageScaffold title='ตรวจสอบผล OCR' description='แก้ไขราคาก่อนยืนยัน'>
    <Stack spacing={2}>
      <TextField label='สินค้า' defaultValue='ดีเซล B7' />
      <TextField label='ราคาต้นทุน (บาท/ลิตร)' defaultValue='31.50' />
      <Button variant='contained'>ยืนยันราคา</Button>
    </Stack>
  </PageScaffold>;
}
