'use client';
import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material';

export default function LiffOrderPage() {
  return <Stack spacing={2} sx={{ p: 2, maxWidth: 640, mx: 'auto' }}>
    <Typography variant='h5'>สั่งซื้อน้ำมัน</Typography>
    <TextField select label='ประเภทน้ำมัน' defaultValue='B7'><MenuItem value='B7'>ดีเซล B7</MenuItem><MenuItem value='B10'>ดีเซล B10</MenuItem></TextField>
    <TextField label='ปริมาณ (ลิตร)' type='number' defaultValue='10000' />
    <TextField label='สถานที่ส่ง' defaultValue='คลังลูกค้า A' />
    <TextField label='จุดรับ (Depot)' defaultValue='SRIRACHA' />
    <TextField label='เงื่อนไขชำระเงิน' defaultValue='CASH_CREDIT_7_DAYS' />
    <Button variant='contained'>ยืนยันคำสั่งซื้อ</Button>
  </Stack>;
}
