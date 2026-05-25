'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Refresh, Search, Send } from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { PageScaffold } from '@/components/common/PageScaffold';

type LineCustomer = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  profile_image_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
};

type LineMessage = {
  id: string;
  line_customer_id: string;
  direction: 'IN' | 'OUT';
  message_type: string;
  message_text: string | null;
  created_at: string;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function LineChatPage() {
  const [companyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');

  const [customers, setCustomers] = useState<LineCustomer[]>([]);
  const [messages, setMessages] = useState<LineMessage[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const messagesRef = useRef<HTMLDivElement | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const name = (c.display_name || '').toLowerCase();
      const uid = (c.line_user_id || '').toLowerCase();
      const last = (c.last_message || '').toLowerCase();
      return name.includes(q) || uid.includes(q) || last.includes(q);
    });
  }, [customers, query]);

  const loadCustomers = async () => {
    if (!companyId) {
      setError('ไม่พบ DEFAULT_COMPANY_ID กรุณาตั้งค่าใน .env');
      return;
    }
    setLoadingCustomers(true);

    const res = await fetch(`/api/line/customers?company_id=${companyId}`);
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'โหลดรายชื่อลูกค้า LINE ไม่สำเร็จ');
    } else {
      setCustomers(data || []);
      if (!selectedCustomerId && data?.length) {
        setSelectedCustomerId(data[0].id);
      }
    }

    setLoadingCustomers(false);
  };

  const loadMessages = async (lineCustomerId: string) => {
    if (!lineCustomerId) return;
    setLoadingMessages(true);

    const res = await fetch(`/api/line/messages?company_id=${companyId}&line_customer_id=${lineCustomerId}&limit=300`);
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'โหลดข้อความไม่สำเร็จ');
    } else {
      setMessages(data || []);
    }

    setLoadingMessages(false);
  };

  useEffect(() => {
    void loadCustomers();
  }, [companyId]);

  useEffect(() => {
    if (!selectedCustomerId) return;
    void loadMessages(selectedCustomerId);
  }, [selectedCustomerId]);

  useEffect(() => {
    const onVisibleOrFocus = () => {
      if (document.visibilityState !== 'visible') return;
      void loadCustomers();
      if (selectedCustomerId) void loadMessages(selectedCustomerId);
    };
    window.addEventListener('focus', onVisibleOrFocus);
    document.addEventListener('visibilitychange', onVisibleOrFocus);
    return () => {
      window.removeEventListener('focus', onVisibleOrFocus);
      document.removeEventListener('visibilitychange', onVisibleOrFocus);
    };
  }, [selectedCustomerId, companyId]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  const onSend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!selectedCustomerId) return;
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError('');

    const res = await fetch('/api/line/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, line_customer_id: selectedCustomerId, text }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'ส่งข้อความไม่สำเร็จ');
    } else {
      setDraft('');
      setMessages((prev) => [...prev, data]);
      void loadCustomers();
    }

    setSending(false);
  };

  return (
    <PageScaffold title='LINE Chat' description='สนทนากับลูกค้าผ่าน LINE OA'>
      <Stack spacing={1.5}>
        {error ? <Alert severity='error'>{error}</Alert> : null}

        <Paper variant='outlined' sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} sx={{ minHeight: 620 }}>
            <Box sx={{ width: { xs: '100%', md: 330 }, borderRight: { xs: 'none', md: '1px solid' }, borderColor: 'divider' }}>
              <Stack spacing={1} sx={{ p: 1.25 }}>
                <TextField
                  size='small'
                  placeholder='ค้นหาลูกค้า LINE'
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position='start'>
                        <Search fontSize='small' />
                      </InputAdornment>
                    ),
                  }}
                />
                <Stack direction='row' justifyContent='space-between' alignItems='center'>
                  <Typography variant='caption' color='text.secondary'>ลูกค้า {filteredCustomers.length} ราย</Typography>
                  <Stack direction='row' spacing={0.5} alignItems='center'>
                    {loadingCustomers ? <CircularProgress size={14} /> : null}
                    <IconButton
                      size='small'
                      onClick={() => {
                        void loadCustomers();
                        if (selectedCustomerId) void loadMessages(selectedCustomerId);
                      }}
                    >
                      <Refresh fontSize='small' />
                    </IconButton>
                  </Stack>
                </Stack>
              </Stack>
              <Divider />

              <List disablePadding sx={{ maxHeight: { xs: 280, md: 560 }, overflowY: 'auto' }}>
                {filteredCustomers.map((c) => {
                  const selected = c.id === selectedCustomerId;
                  return (
                    <ListItemButton key={c.id} selected={selected} onClick={() => setSelectedCustomerId(c.id)} sx={{ alignItems: 'flex-start', py: 1.2 }}>
                      <Avatar src={c.profile_image_url || undefined} sx={{ width: 36, height: 36, mr: 1.1 }}>
                        {(c.display_name || 'U').slice(0, 1).toUpperCase()}
                      </Avatar>
                      <ListItemText
                        primary={
                          <Stack direction='row' justifyContent='space-between' spacing={1}>
                            <Typography variant='body2' sx={{ fontWeight: 600 }} noWrap>
                              {c.display_name || c.line_user_id}
                            </Typography>
                            {c.last_message_at ? (
                              <Typography variant='caption' color='text.secondary'>
                                {formatTime(c.last_message_at)}
                              </Typography>
                            ) : null}
                          </Stack>
                        }
                        secondary={
                          <Typography variant='caption' color='text.secondary' noWrap>
                            {c.last_message || c.line_user_id}
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  );
                })}
                {!filteredCustomers.length && !loadingCustomers ? (
                  <Box sx={{ px: 2, py: 5, textAlign: 'center' }}>
                    <Typography variant='body2' color='text.secondary'>ยังไม่มีลูกค้า LINE</Typography>
                    <Typography variant='caption' color='text.disabled'>ระบบจะแสดงลูกค้าเมื่อมีข้อความเข้าผ่าน webhook</Typography>
                  </Box>
                ) : null}
              </List>
            </Box>

            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#fafafa' }}>
                <Stack direction='row' spacing={1} alignItems='center'>
                  <Avatar src={selectedCustomer?.profile_image_url || undefined} sx={{ width: 32, height: 32 }}>
                    {(selectedCustomer?.display_name || 'U').slice(0, 1).toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography variant='body2' sx={{ fontWeight: 700 }}>
                      {selectedCustomer?.display_name || 'เลือกห้องแชท'}
                    </Typography>
                {/*     <Typography variant='caption' color='text.secondary'>
                      {selectedCustomer?.line_user_id || 'ยังไม่ได้เลือกลูกค้า'}
                    </Typography> */}
                  </Box>
                </Stack>
                {selectedCustomer ? <Chip size='small' label='เชื่อมต่อ LINE OA' color='success' variant='outlined' /> : null}
              </Stack>

              <Box ref={messagesRef} sx={{ flex: 1, overflowY: 'auto', p: 2, bgcolor: '#f8fafc' }}>
                {loadingMessages ? (
                  <Stack alignItems='center' sx={{ py: 4 }}><CircularProgress size={20} /></Stack>
                ) : null}

                {!messages.length && selectedCustomerId && !loadingMessages ? (
                  <Stack alignItems='center' sx={{ py: 6 }}>
                    <Typography variant='body2' color='text.secondary'>ยังไม่มีข้อความในห้องนี้</Typography>
                  </Stack>
                ) : null}

                <Stack spacing={1.2}>
                  {messages.map((m) => {
                    const out = m.direction === 'OUT';
                    return (
                      <Stack key={m.id} alignItems={out ? 'flex-end' : 'flex-start'}>
                        <Box
                          sx={{
                            maxWidth: '75%',
                            px: 1.4,
                            py: 1,
                            borderRadius: 2,
                            bgcolor: out ? '#111827' : '#ffffff',
                            color: out ? '#ffffff' : 'text.primary',
                            border: out ? 'none' : '1px solid',
                            borderColor: 'divider',
                            boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
                          }}
                        >
                          <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>{m.message_text || '-'}</Typography>
                        </Box>
                        <Typography variant='caption' color='text.secondary' sx={{ mt: 0.25, px: 0.5 }}>
                          {formatDateTime(m.created_at)}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              </Box>

              <Divider />
              <Box component='form' onSubmit={onSend} sx={{ p: 1.25 }}>
                <Stack direction='row' spacing={1}>
                  <TextField
                    fullWidth
                    size='small'
                    placeholder={selectedCustomerId ? 'พิมพ์ข้อความ...' : 'เลือกห้องแชทก่อนส่งข้อความ'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={!selectedCustomerId || sending}
                  />
                  <IconButton
                    type='submit'
                    color='primary'
                    disabled={!selectedCustomerId || !draft.trim() || sending}
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
                  >
                    <Send fontSize='small' />
                  </IconButton>
                </Stack>
              </Box>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </PageScaffold>
  );
}
