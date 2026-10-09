'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';

type CompanyForm = {
  name: string;
  tax_id: string;
  branch: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
  /** ค่าขนส่งเพิ่มส่วนกลาง บาท/ลิตร (รวม VAT) เก็บเป็น string เพื่อให้พิมพ์ทศนิยมได้ */
  delivery_fee_surcharge_per_liter: string;
};

const empty: CompanyForm = {
  name: '',
  tax_id: '',
  branch: 'สำนักงานใหญ่',
  address: '',
  phone: '',
  email: '',
  logo_url: '',
  delivery_fee_surcharge_per_liter: '0',
};

/** Seller details printed on every document (ใบสั่งซื้อ / ใบกำกับภาษี / ใบเสร็จ). */
export default function CompanySettingsPage() {
  const [form, setForm] = useState<CompanyForm>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const run = async () => {
      const res = await fetch('/api/companies/me', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'โหลดข้อมูลบริษัทไม่สำเร็จ');
        return;
      }
      setForm({
        name: data?.name || '',
        tax_id: data?.tax_id || '',
        branch: data?.branch || 'สำนักงานใหญ่',
        address: data?.address || '',
        phone: data?.phone || '',
        email: data?.email || '',
        logo_url: data?.logo_url || '',
        delivery_fee_surcharge_per_liter: String(Number(data?.delivery_fee_surcharge_per_liter || 0)),
      });
    };
    void run();
  }, []);

  const surchargeValue = Number(form.delivery_fee_surcharge_per_liter);
  const surchargeInvalid = !Number.isFinite(surchargeValue) || surchargeValue < 0;

  const save = async () => {
    if (surchargeInvalid) {
      setError('ค่าขนส่งเพิ่มส่วนกลางต้องเป็นตัวเลขและไม่ติดลบ');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const res = await fetch('/api/companies/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, delivery_fee_surcharge_per_liter: surchargeValue }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) setError(data.error || 'บันทึกไม่สำเร็จ');
    else setNotice('บันทึกข้อมูลบริษัทแล้ว ข้อมูลนี้จะแสดงบนเอกสารทุกใบ และค่าขนส่งเพิ่มจะมีผลกับบิลจัดส่งที่สร้างใหม่');
  };

  const field = (key: keyof CompanyForm, label: string, extra: Record<string, unknown> = {}) => (
    <TextField id={`company-${key}`} size='small' label={label} value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} fullWidth {...extra} />
  );

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>ข้อมูลบริษัท (ผู้ขาย)</Typography>
      <Typography variant='body2' color='text.secondary'>ชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีที่จะพิมพ์บนใบสั่งซื้อ ใบกำกับภาษี และใบเสร็จรับเงิน</Typography>
      {error ? <Alert severity='error' onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert severity='success' onClose={() => setNotice('')}>{notice}</Alert> : null}
      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            {field('name', 'ชื่อบริษัท')}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              {field('tax_id', 'เลขประจำตัวผู้เสียภาษี')}
              {field('branch', 'สาขา (เช่น สำนักงานใหญ่ / สาขาที่ 00001)')}
            </Stack>
            {field('address', 'ที่อยู่', { multiline: true, minRows: 2 })}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              {field('phone', 'โทรศัพท์')}
              {field('email', 'อีเมล')}
            </Stack>
            {field('logo_url', 'URL โลโก้ (ไม่บังคับ)')}
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant='h6'>ค่าขนส่งเพิ่มส่วนกลาง</Typography>
            <Typography variant='body2' color='text.secondary'>
              บวกเพิ่มจากค่าขนส่งมาตรฐานของคลังในทุกบิลที่จัดส่ง (ไม่คิดเมื่อลูกค้ารับเอง) โดยไม่ต้องแก้ค่าขนส่งของลูกค้าแต่ละราย
              เช่น น้ำมันโลกขึ้น ใส่ 0.01 = บวก 0.01 บาท/ลิตร ใส่ 0 เพื่อปิด
              ค่านี้จะถูกบันทึกลงบิล ณ เวลาสร้าง บิลเดิมไม่เปลี่ยน
            </Typography>
            <TextField
              id='company-delivery-fee-surcharge'
              size='small'
              type='number'
              label='ค่าขนส่งเพิ่ม (บาท/ลิตร รวม VAT)'
              value={form.delivery_fee_surcharge_per_liter}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setForm((p) => ({ ...p, delivery_fee_surcharge_per_liter: e.target.value }))}
              inputProps={{ step: '0.01', min: 0 }}
              error={surchargeInvalid}
              helperText={surchargeInvalid ? 'ต้องเป็นตัวเลขและไม่ติดลบ' : `ปัจจุบัน ${surchargeValue > 0 ? `+${surchargeValue.toFixed(2)}` : '0.00'} บาท/ลิตร`}
              sx={{ maxWidth: 360 }}
            />
          </Stack>
        </CardContent>
      </Card>
      <Stack direction='row' justifyContent='flex-end'>
        <Button variant='contained' onClick={() => void save()} disabled={saving || !form.name.trim() || surchargeInvalid}>บันทึก</Button>
      </Stack>
    </Stack>
  );
}
