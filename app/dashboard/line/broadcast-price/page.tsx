'use client';
import { Button, Stack, TextField } from '@mui/material';
import { PageScaffold } from '@/components/common/PageScaffold';

export default function BroadcastPricePage() {
  return <PageScaffold title='บรอดแคสต์ราคาน้ำมัน'>
    <Stack spacing={2}>
      <TextField label='หัวข้อ' defaultValue='อัปเดตราคาน้ำมันวันนี้' />
      <TextField label='ข้อความ' multiline minRows={4} defaultValue='ราคาน้ำมันวันนี้...' />
      <Button variant='contained'>ส่งไปยังลูกค้า LINE</Button>
    </Stack>
  </PageScaffold>;
}
