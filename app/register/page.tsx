'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { supabaseClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName.trim()) return setError('กรุณาระบุชื่อผู้ใช้งาน');
    if (password.length < 6) return setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    if (password !== confirmPassword) return setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');

    setLoading(true);
    const { error: signUpError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);

    if (signUpError) {
      setError('สมัครสมาชิกไม่สำเร็จ: ' + signUpError.message);
      return;
    }

    setSuccess('สมัครสมาชิกสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี');
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        background: 'linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%)',
      }}
    >
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 460, border: '1px solid #e5e7eb', borderRadius: 3, p: 3 }}>
        <Stack spacing={2.2} component='form' onSubmit={onSubmit}>
          <Box>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>สมัครสมาชิก</Typography>
            <Typography sx={{ fontSize: 13, color: '#6b7280', mt: 0.5 }}>สร้างบัญชีเพื่อเข้าใช้งานระบบ</Typography>
          </Box>

          {error ? <Alert severity='error'>{error}</Alert> : null}
          {success ? <Alert severity='success'>{success}</Alert> : null}

          <TextField label='ชื่อผู้ใช้งาน' value={fullName} onChange={(e) => setFullName(e.target.value)} required fullWidth size='small' />
          <TextField label='อีเมล' type='email' value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth size='small' />
          <TextField label='รหัสผ่าน' type='password' value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth size='small' />
          <TextField label='ยืนยันรหัสผ่าน' type='password' value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required fullWidth size='small' />

          <Button
            type='submit'
            variant='contained'
            disabled={loading}
            sx={{
              bgcolor: '#111827',
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': { bgcolor: '#0b1220' },
            }}
          >
            {loading ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก'}
          </Button>

          <Typography sx={{ fontSize: 13, color: '#6b7280' }}>
            มีบัญชีอยู่แล้ว?{' '}
            <Link href='/login' style={{ color: '#111827', fontWeight: 600, textDecoration: 'none' }}>
              เข้าสู่ระบบ
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
