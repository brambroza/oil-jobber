'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VisibilityOffOutlined, VisibilityOutlined } from '@mui/icons-material';
import { Alert, Box, Button, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (password !== confirmPassword) {
      setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);
    const { error: updateError } = await getSupabaseClient().auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError('ตั้งรหัสผ่านใหม่ไม่สำเร็จ: ' + updateError.message);
      return;
    }

    setSuccess('ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว กำลังไปหน้าเข้าสู่ระบบ');
    setPassword('');
    setConfirmPassword('');
    window.setTimeout(() => {
      router.replace('/login');
      router.refresh();
    }, 1000);
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
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 420, border: '1px solid #e5e7eb', borderRadius: 3, p: 3 }}>
        <Stack spacing={2.2} component='form' onSubmit={onSubmit}>
          <Box>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>ตั้งรหัสผ่านใหม่</Typography>
            <Typography sx={{ fontSize: 13, color: '#6b7280', mt: 0.5 }}>กรอกรหัสผ่านใหม่สำหรับบัญชีของคุณ</Typography>
          </Box>

          {error ? <Alert severity='error'>{error}</Alert> : null}
          {success ? <Alert severity='success'>{success}</Alert> : null}

          <TextField
            label='รหัสผ่านใหม่'
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete='new-password'
            required
            fullWidth
            size='small'
            helperText='อย่างน้อย 8 ตัวอักษร'
            InputProps={{
              endAdornment: (
                <InputAdornment position='end'>
                  <IconButton
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    edge='end'
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <VisibilityOffOutlined fontSize='small' /> : <VisibilityOutlined fontSize='small' />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label='ยืนยันรหัสผ่านใหม่'
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete='new-password'
            required
            fullWidth
            size='small'
          />

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
            {loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
          </Button>

          <Typography sx={{ fontSize: 13, color: '#6b7280' }}>
            กลับไป{' '}
            <Link href='/login' style={{ color: '#111827', fontWeight: 600, textDecoration: 'none' }}>
              เข้าสู่ระบบ
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
