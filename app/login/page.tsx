'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { supabaseClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) {
      setError('เข้าสู่ระบบไม่สำเร็จ: ' + signInError.message);
      return;
    }

    const nextPath = searchParams.get('next');
    const redirectPath = nextPath && nextPath.startsWith('/') ? nextPath : '/dashboard';
    router.replace(redirectPath);
    router.refresh();
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
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>เข้าสู่ระบบ</Typography>
            <Typography sx={{ fontSize: 13, color: '#6b7280', mt: 0.5 }}>Oil Jobber Management Platform</Typography>
          </Box>

          {error ? <Alert severity='error'>{error}</Alert> : null}

          <TextField
            label='อีเมล'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete='email'
            required
            fullWidth
            size='small'
          />
          <TextField
            label='รหัสผ่าน'
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete='current-password'
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
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </Button>

          <Typography sx={{ fontSize: 13, color: '#6b7280' }}>
            ยังไม่มีบัญชี?{' '}
            <Link href='/register' style={{ color: '#111827', fontWeight: 600, textDecoration: 'none' }}>
              สมัครสมาชิก
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
