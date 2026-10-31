'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowBack, ChatBubbleOutline, Groups, Refresh, Search, Send } from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { formatDateTime } from '@/lib/utils/date-format';
import {
  formatClockTime,
  formatConversationTime,
  groupMessagesByDay,
  sortConversations,
} from '@/lib/utils/line-chat';

type LineCustomer = {
  id: string;
  customer_id: string | null;
  line_user_id: string;
  group_id: string | null;
  display_name: string | null;
  profile_image_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_direction: string | null;
};

type LineMessage = {
  id: string;
  line_customer_id: string;
  direction: 'IN' | 'OUT';
  message_type: string;
  message_text: string | null;
  created_at: string;
};

type RoomFilter = 'ALL' | 'DIRECT' | 'GROUP';

const ROOM_FILTERS: { value: RoomFilter; label: string }[] = [
  { value: 'ALL', label: 'ทั้งหมด' },
  { value: 'DIRECT', label: 'ส่วนตัว' },
  { value: 'GROUP', label: 'กลุ่ม' },
];

const POLL_INTERVAL_MS = 15000;
const MAX_MESSAGE_LENGTH = 5000; // LINE text message limit
const BOTTOM_THRESHOLD_PX = 80;
const OUT_BUBBLE_COLOR = '#dcf5e4';

/** Fallback name; raw LINE ids are not meaningful to staff. */
function roomName(customer: LineCustomer): string {
  return customer.display_name || (customer.group_id ? 'กลุ่ม LINE' : 'ลูกค้า LINE');
}

/** Conversation picture, with a group icon when a group has none. */
function RoomAvatar({ customer, size }: { customer: LineCustomer; size: number }) {
  return (
    <Avatar src={customer.profile_image_url || undefined} sx={{ width: size, height: size, fontSize: size * 0.42, bgcolor: '#e2e8f0', color: '#334155' }}>
      {customer.group_id ? <Groups sx={{ fontSize: size * 0.6 }} /> : roomName(customer).slice(0, 1).toUpperCase()}
    </Avatar>
  );
}

/** Centered placeholder for empty panes. */
function EmptyPane({ title, hint }: { title: string; hint?: string }) {
  return (
    <Stack alignItems='center' justifyContent='center' spacing={0.5} sx={{ height: '100%', px: 3, py: 6, textAlign: 'center' }}>
      <ChatBubbleOutline sx={{ fontSize: 32, color: 'text.disabled', mb: 0.5 }} />
      <Typography variant='body2' color='text.secondary'>{title}</Typography>
      {hint ? <Typography variant='caption' color='text.disabled'>{hint}</Typography> : null}
    </Stack>
  );
}

export default function LineChatPage() {
  const [companyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');

  const [customers, setCustomers] = useState<LineCustomer[]>([]);
  const [messages, setMessages] = useState<LineMessage[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [mobilePane, setMobilePane] = useState<'list' | 'chat'>('list');

  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const [query, setQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('ALL');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesRequestRef = useRef(0);
  const stickToBottomRef = useRef(true);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inFilter = customers.filter((c) => {
      if (roomFilter === 'DIRECT') return !c.group_id;
      if (roomFilter === 'GROUP') return Boolean(c.group_id);
      return true;
    });
    if (!q) return inFilter;
    return inFilter.filter((c) => {
      const name = (c.display_name || '').toLowerCase();
      const uid = (c.line_user_id || '').toLowerCase();
      const last = (c.last_message || '').toLowerCase();
      return name.includes(q) || uid.includes(q) || last.includes(q);
    });
  }, [customers, query, roomFilter]);

  const messageGroups = useMemo(() => groupMessagesByDay(messages), [messages]);

  const loadCustomers = async ({ silent = false } = {}) => {
    if (!companyId) {
      setError('ไม่พบ DEFAULT_COMPANY_ID กรุณาตั้งค่าใน .env');
      return;
    }
    if (!silent) setLoadingCustomers(true);

    try {
      const res = await fetch(`/api/line/customers?company_id=${companyId}`);
      const data = await res.json();

      if (res.ok) {
        const sorted = sortConversations<LineCustomer>(data || []);
        setCustomers(sorted);
        setSelectedCustomerId((current) => current || sorted[0]?.id || '');
      } else if (!silent) {
        setError(data.error || 'โหลดรายชื่อลูกค้า LINE ไม่สำเร็จ');
      }
    } catch {
      if (!silent) setError('โหลดรายชื่อลูกค้า LINE ไม่สำเร็จ');
    } finally {
      if (!silent) setLoadingCustomers(false);
    }
  };

  const loadMessages = async (lineCustomerId: string, { silent = false } = {}) => {
    if (!lineCustomerId) return;
    // Only the latest request may write: a slow reply must not fill another room.
    const requestId = ++messagesRequestRef.current;
    if (!silent) setLoadingMessages(true);

    try {
      const res = await fetch(`/api/line/messages?company_id=${companyId}&line_customer_id=${lineCustomerId}&limit=300`);
      const data = await res.json();
      if (requestId !== messagesRequestRef.current) return;

      if (res.ok) {
        setMessages(data || []);
      } else if (!silent) {
        setError(data.error || 'โหลดข้อความไม่สำเร็จ');
      }
    } catch {
      if (!silent && requestId === messagesRequestRef.current) setError('โหลดข้อความไม่สำเร็จ');
    } finally {
      if (requestId === messagesRequestRef.current) setLoadingMessages(false);
    }
  };

  const refreshAll = ({ silent = false } = {}) => {
    void loadCustomers({ silent });
    if (selectedCustomerId) void loadMessages(selectedCustomerId, { silent });
  };

  const selectConversation = (id: string) => {
    setMobilePane('chat');
    if (id === selectedCustomerId) return;
    // A half-typed reply must not carry over and reach the wrong customer.
    setDraft('');
    setMessages([]);
    setSelectedCustomerId(id);
  };

  useEffect(() => {
    void loadCustomers();
  }, [companyId]);

  useEffect(() => {
    if (!selectedCustomerId) return;
    stickToBottomRef.current = true;
    void loadMessages(selectedCustomerId);
  }, [selectedCustomerId]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refreshAll({ silent: true });
    };
    const timer = window.setInterval(refreshIfVisible, POLL_INTERVAL_MS);
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [selectedCustomerId, companyId]);

  useEffect(() => {
    if (!messagesRef.current || !stickToBottomRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, mobilePane]);

  const onMessagesScroll = () => {
    const box = messagesRef.current;
    if (!box) return;
    stickToBottomRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < BOTTOM_THRESHOLD_PX;
  };

  const onSend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!selectedCustomerId) return;
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError('');

    try {
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
        stickToBottomRef.current = true;
        messagesRequestRef.current += 1;
        setLoadingMessages(false);
        setMessages((prev) => [...prev, data]);
        void loadCustomers({ silent: true });
      }
    } catch {
      setError('ส่งข้อความไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  };

  const onDraftKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void onSend();
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant='h4'>LINE Chat</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>สนทนากับลูกค้าผ่าน LINE OA</Typography>
      </Box>

      {error ? <Alert severity='error' onClose={() => setError('')}>{error}</Alert> : null}

      <Paper
        variant='outlined'
        sx={{
          display: 'flex',
          overflow: 'hidden',
          borderRadius: 1.5,
          minHeight: 480,
          height: {
            xs: 'calc(100dvh - var(--dashboard-topbar-height) - 96px)',
            md: 'calc(100dvh - var(--dashboard-topbar-height) - 112px)',
          },
        }}
      >
        <Box
          sx={{
            display: { xs: mobilePane === 'list' ? 'flex' : 'none', md: 'flex' },
            flexDirection: 'column',
            flexShrink: 0,
            width: { xs: '100%', md: 340 },
            borderRight: { xs: 'none', md: '1px solid' },
            borderColor: { md: 'divider' },
          }}
        >
          <Stack spacing={1.25} sx={{ p: 1.5 }}>
            <Stack direction='row' alignItems='center' justifyContent='space-between'>
              <Typography variant='subtitle2' sx={{ fontWeight: 700 }}>
                ห้องแชท
                <Typography component='span' variant='caption' color='text.secondary' sx={{ ml: 0.75 }}>
                  {filteredCustomers.length}
                </Typography>
              </Typography>
              <Tooltip title='รีเฟรช'>
                <span>
                  <IconButton size='small' aria-label='รีเฟรช' disabled={loadingCustomers} onClick={() => refreshAll()}>
                    {loadingCustomers ? <CircularProgress size={16} /> : <Refresh fontSize='small' />}
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
            <TextField
              size='small'
              placeholder='ค้นหาชื่อหรือข้อความ'
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
            <Stack direction='row' spacing={0.75}>
              {ROOM_FILTERS.map((filter) => (
                <Chip
                  key={filter.value}
                  size='small'
                  label={filter.label}
                  color={roomFilter === filter.value ? 'primary' : 'default'}
                  variant={roomFilter === filter.value ? 'filled' : 'outlined'}
                  onClick={() => setRoomFilter(filter.value)}
                />
              ))}
            </Stack>
          </Stack>
          <Divider />

          <List disablePadding sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {filteredCustomers.map((c) => (
              <ListItemButton
                key={c.id}
                selected={c.id === selectedCustomerId}
                onClick={() => selectConversation(c.id)}
                sx={{
                  gap: 1.25,
                  px: 1.5,
                  py: 1.1,
                  '&.Mui-selected, &.Mui-selected:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                <RoomAvatar customer={c} size={42} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction='row' justifyContent='space-between' alignItems='baseline' spacing={1}>
                    <Typography variant='body2' sx={{ fontWeight: 600 }} noWrap>{roomName(c)}</Typography>
                    {c.last_message_at ? (
                      <Typography variant='caption' color='text.secondary' sx={{ flexShrink: 0, fontSize: 11 }}>
                        {formatConversationTime(c.last_message_at)}
                      </Typography>
                    ) : null}
                  </Stack>
                  <Typography variant='caption' color='text.secondary' noWrap component='div'>
                    {c.last_message
                      ? `${c.last_message_direction === 'OUT' ? 'คุณ: ' : ''}${c.last_message}`
                      : 'ยังไม่มีข้อความ'}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
            {!filteredCustomers.length && !loadingCustomers ? (
              customers.length ? (
                <EmptyPane title='ไม่พบห้องแชทที่ตรงกับเงื่อนไข' />
              ) : (
                <EmptyPane title='ยังไม่มีลูกค้า LINE' hint='ระบบจะแสดงลูกค้าเมื่อมีข้อความเข้าผ่าน webhook' />
              )
            ) : null}
          </List>
        </Box>

        <Stack sx={{ display: { xs: mobilePane === 'chat' ? 'flex' : 'none', md: 'flex' }, flex: 1, minWidth: 0 }}>
          {selectedCustomer ? (
            <>
              <Stack
                direction='row'
                alignItems='center'
                spacing={1.25}
                sx={{ px: { xs: 1, md: 2 }, py: 1.1, borderBottom: '1px solid', borderColor: 'divider' }}
              >
                <IconButton size='small' aria-label='กลับไปรายการแชท' onClick={() => setMobilePane('list')} sx={{ display: { md: 'none' } }}>
                  <ArrowBack fontSize='small' />
                </IconButton>
                <RoomAvatar customer={selectedCustomer} size={36} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant='body2' sx={{ fontWeight: 700 }} noWrap>{roomName(selectedCustomer)}</Typography>
                  <Typography variant='caption' color='text.secondary' component='div'>
                    {selectedCustomer.group_id ? 'กลุ่ม LINE' : 'แชทส่วนตัว'}
                  </Typography>
                </Box>
                <Chip
                  size='small'
                  variant='outlined'
                  color={selectedCustomer.customer_id ? 'success' : 'default'}
                  label={selectedCustomer.customer_id ? 'ผูกลูกค้าแล้ว' : 'ยังไม่ผูกลูกค้า'}
                />
              </Stack>

              <Box ref={messagesRef} onScroll={onMessagesScroll} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 1.5, md: 3 }, py: 2, bgcolor: '#f6f7f9' }}>
                {loadingMessages && !messages.length ? (
                  <Stack alignItems='center' sx={{ py: 4 }}><CircularProgress size={20} /></Stack>
                ) : null}

                {!messages.length && !loadingMessages ? <EmptyPane title='ยังไม่มีข้อความในห้องนี้' /> : null}

                {messageGroups.map((group) => (
                  <Box key={group.key}>
                    <Stack alignItems='center' sx={{ my: 1.5 }}>
                      <Typography variant='caption' sx={{ px: 1.25, py: 0.25, borderRadius: 5, fontSize: 11, color: 'text.secondary', bgcolor: '#e5e7eb' }}>
                        {group.label}
                      </Typography>
                    </Stack>
                    {group.items.map(({ message: m, startsRun, endsRun }) => {
                      const out = m.direction === 'OUT';
                      return (
                        <Stack
                          key={m.id}
                          direction={out ? 'row-reverse' : 'row'}
                          alignItems='flex-end'
                          spacing={0.75}
                          sx={{ mt: startsRun ? 1.25 : 0.375 }}
                        >
                          {!out ? (
                            <Box sx={{ width: 28, flexShrink: 0, alignSelf: 'flex-start' }}>
                              {startsRun ? <RoomAvatar customer={selectedCustomer} size={28} /> : null}
                            </Box>
                          ) : null}
                          <Box
                            title={formatDateTime(m.created_at)}
                            sx={{
                              maxWidth: { xs: '78%', md: '65%' },
                              px: 1.5,
                              py: 0.875,
                              borderRadius: '14px',
                              ...(startsRun ? (out ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }) : {}),
                              bgcolor: out ? OUT_BUBBLE_COLOR : '#ffffff',
                              border: out ? 'none' : '1px solid',
                              borderColor: 'divider',
                            }}
                          >
                            <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                              {m.message_text || '-'}
                            </Typography>
                          </Box>
                          {endsRun ? (
                            <Typography variant='caption' color='text.secondary' sx={{ flexShrink: 0, fontSize: 10.5 }}>
                              {formatClockTime(m.created_at)}
                            </Typography>
                          ) : null}
                        </Stack>
                      );
                    })}
                  </Box>
                ))}
              </Box>

              <Box component='form' onSubmit={onSend} sx={{ p: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
                <Stack direction='row' spacing={1} alignItems='flex-end'>
                  <TextField
                    fullWidth
                    multiline
                    maxRows={4}
                    size='small'
                    placeholder='พิมพ์ข้อความ (Enter เพื่อส่ง)'
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onDraftKeyDown}
                    // readOnly, not disabled: disabling would drop keyboard focus after each send.
                    InputProps={{ readOnly: sending }}
                    inputProps={{ maxLength: MAX_MESSAGE_LENGTH, 'aria-label': 'ข้อความ' }}
                  />
                  <IconButton
                    type='submit'
                    aria-label='ส่งข้อความ'
                    disabled={!draft.trim() || sending}
                    sx={{
                      borderRadius: 2,
                      width: 40,
                      height: 40,
                      flexShrink: 0,
                      bgcolor: 'primary.main',
                      color: '#ffffff',
                      '&:hover': { bgcolor: '#1f2937' },
                      '&.Mui-disabled': { bgcolor: '#e5e7eb' },
                    }}
                  >
                    {sending ? <CircularProgress size={18} color='inherit' /> : <Send fontSize='small' />}
                  </IconButton>
                </Stack>
              </Box>
            </>
          ) : (
            <EmptyPane title='เลือกห้องแชทเพื่อเริ่มสนทนา' />
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
