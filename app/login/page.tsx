'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { VisibilityOffOutlined, VisibilityOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) {
      setError('เข้าสู่ระบบไม่สำเร็จ: ' + signInError.message);
      return;
    }

    const nextPath = new URLSearchParams(window.location.search).get('next');
    let redirectPath = '/dashboard';
    if (nextPath && (nextPath.startsWith('/dashboard') || nextPath.startsWith('/customer'))) {
      redirectPath = nextPath;
    }
    router.replace(redirectPath);
    router.refresh();
  };

  const onForgotPassword = async () => {
    const targetEmail = forgotEmail.trim() || email.trim();
    setError('');
    setSuccess('');

    if (!targetEmail) {
      setError('กรุณาระบุอีเมลสำหรับกู้คืนรหัสผ่าน');
      return;
    }

    setForgotLoading(true);
    const { error: resetError } = await getSupabaseClient().auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setForgotLoading(false);

    if (resetError) {
      setError('ส่งอีเมลกู้คืนรหัสผ่านไม่สำเร็จ: ' + resetError.message);
      return;
    }

    setForgotOpen(false);
    setSuccess('ส่งอีเมลสำหรับตั้งรหัสผ่านใหม่แล้ว กรุณาตรวจสอบกล่องจดหมาย');
  };

  const search = typeof window !== 'undefined' ? window.location.search : '';
  const params = new URLSearchParams(search);
  const nextPath = params.get('next');
  const errorCode = params.get('error');
  const lineErrorText = errorCode?.startsWith('line_') ? ({
    line_not_configured: 'LINE Login ยังไม่ถูกตั้งค่าในระบบ',
    line_invalid_state: 'LINE Login หมดอายุหรือ state ไม่ถูกต้อง กรุณาลองใหม่',
    line_missing_code: 'ไม่ได้รับรหัสยืนยันจาก LINE',
    line_token_failed: 'ยืนยัน token กับ LINE ไม่สำเร็จ',
    line_profile_failed: 'โหลดโปรไฟล์ LINE ไม่สำเร็จ',
    line_user_not_found: 'ไม่พบ LINE user id',
    line_not_mapped_customer: 'LINE นี้ยังไม่ถูกผูกกับลูกค้าในระบบ',
    line_customer_portal_missing: 'ลูกค้ายังไม่มีบัญชีเข้าใช้งานพอร์ทัล',
    line_auth_user_missing: 'ไม่พบบัญชี Auth ของลูกค้า',
    line_generate_link_failed: 'สร้าง session login ไม่สำเร็จ',
    line_session_create_failed: 'ยืนยัน session login ไม่สำเร็จ',
    line_user_session_missing: 'สร้าง session แล้วแต่ไม่พบผู้ใช้',
  } as Record<string, string>)[errorCode] || 'LINE Login ไม่สำเร็จ' : '';
  const lineLoginHref = nextPath && (nextPath.startsWith('/dashboard') || nextPath.startsWith('/customer'))
    ? `/api/auth/line/start?next=${encodeURIComponent(nextPath)}`
    : '/api/auth/line/start';

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
          {success ? <Alert severity='success'>{success}</Alert> : null}
          {!error && lineErrorText ? <Alert severity='warning'>{lineErrorText}</Alert> : null}

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
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete='current-password'
            required
            fullWidth
            size='small'
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

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type='button'
              variant='text'
              onClick={() => {
                setForgotEmail(email);
                setForgotOpen(true);
                setError('');
                setSuccess('');
              }}
              sx={{ px: 0, color: '#374151', textTransform: 'none', fontWeight: 600 }}
            >
              ลืมรหัสผ่าน?
            </Button>
          </Box>

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

          <Button
            component='a'
            href={lineLoginHref}
            variant='outlined'
            sx={{
              borderColor: '#16a34a',
              color: '#166534',
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': { borderColor: '#15803d', bgcolor: '#f0fdf4' },
            }}
          >
            เข้าสู่ระบบด้วย LINE
          </Button>

          <Typography sx={{ fontSize: 13, color: '#6b7280' }}>
            ยังไม่มีบัญชี?{' '}
            <Link href='/register' style={{ color: '#111827', fontWeight: 600, textDecoration: 'none' }}>
              สมัครสมาชิก
            </Link>
          </Typography>
        </Stack>
      </Paper>

      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)} maxWidth='xs' fullWidth>
        <DialogTitle>ลืมรหัสผ่าน</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography sx={{ fontSize: 13, color: '#6b7280' }}>
              ระบุอีเมลของบัญชี ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้
            </Typography>
            <TextField
              label='อีเมล'
              type='email'
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              autoComplete='email'
              fullWidth
              size='small'
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForgotOpen(false)}>ยกเลิก</Button>
          <Button variant='contained' disabled={forgotLoading} onClick={() => void onForgotPassword()}>
            {forgotLoading ? 'กำลังส่ง...' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
