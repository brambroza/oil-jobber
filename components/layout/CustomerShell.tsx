'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import MenuRounded from '@mui/icons-material/MenuRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import OpacityRounded from '@mui/icons-material/OpacityRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import SellRounded from '@mui/icons-material/SellRounded';
import DirectionsCarFilledRounded from '@mui/icons-material/DirectionsCarFilledRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import {
  Avatar,
  Badge,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
};

type MeData = {
  email: string;
  customer_name: string | null;
  display_name: string;
  avatar_url: string;
};

type Noti = {
  id: string;
  title: string;
  message: string;
  category: string;
  source_role: string | null;
  is_read: boolean;
  created_at: string;
};

const sidebarWidth = 244;
const topbarHeight = 64;

export default function CustomerShell({ children, title = 'พอร์ทัลลูกค้า', subtitle = 'Oil Jobber' }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [notifications, setNotifications] = useState<Noti[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const displayName = useMemo(() => me?.display_name || me?.customer_name || me?.email || 'ลูกค้า', [me]);

  const loadProfile = async () => {
    const res = await fetch('/api/customer-portal/me', { cache: 'no-store' });
    const json = await res.json();
    if (res.ok) setMe(json);
  };

  const loadNotifications = async () => {
    const res = await fetch('/api/customer-portal/notifications', { cache: 'no-store' });
    const json = await res.json();
    if (res.ok) {
      setNotifications(json.notifications || []);
      setUnreadCount(Number(json.unread_count || 0));
    }
  };

  useEffect(() => {
    void loadProfile();
    void loadNotifications();
  }, []);

  const markAllRead = async () => {
    await fetch('/api/customer-portal/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await loadNotifications();
  };

  const onLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const sideContent = (
    <Stack sx={{ height: '100%', bgcolor: '#f8fbff' }}>
      <Box sx={{ p: 2, bgcolor: '#0b2f6f', color: '#fff' }}>
        <Stack direction='row' spacing={1} alignItems='center'>
          <OpacityRounded />
          <Typography fontWeight={800}>Customer Portal</Typography>
        </Stack>
      </Box>
      <List sx={{ px: 1, py: 1 }}>
        <ListItemButton component={Link} href='/customer' onClick={() => setMobileOpen(false)}>
          <ListItemIcon><SellRounded sx={{ color: '#1d4ed8' }} /></ListItemIcon>
          <ListItemText primary='ราคาน้ำมันวันนี้' />
        </ListItemButton>
        <ListItemButton component={Link} href='/customer/orders' onClick={() => setMobileOpen(false)}>
          <ListItemIcon><ReceiptLongRounded sx={{ color: '#1d4ed8' }} /></ListItemIcon>
          <ListItemText primary='เมนูสั่งซื้อ' />
        </ListItemButton>
        <ListItemButton component={Link} href='/customer/vehicles' onClick={() => setMobileOpen(false)}>
          <ListItemIcon><DirectionsCarFilledRounded sx={{ color: '#1d4ed8' }} /></ListItemIcon>
          <ListItemText primary='รถบรรทุกของฉัน' />
        </ListItemButton>
        <ListItemButton component={Link} href='/customer/settings' onClick={() => setMobileOpen(false)}>
          <ListItemIcon><SettingsRounded sx={{ color: '#1d4ed8' }} /></ListItemIcon>
          <ListItemText primary='ตั้งค่าโปรไฟล์' />
        </ListItemButton>
      </List>
      <Box sx={{ mt: 'auto', p: 1.5 }}>
        <Divider sx={{ mb: 1.2 }} />
        <Button fullWidth variant='outlined' startIcon={<LogoutRounded />} onClick={() => void onLogout()}>
          ออกจากระบบ
        </Button>
      </Box>
    </Stack>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#eff3f8' }}>
      <Box
        sx={{
          position: 'fixed',
          zIndex: 1300,
          top: 0,
          left: 0,
          right: 0,
          height: `${topbarHeight}px`,
          px: { xs: 1.5, md: 2.5 },
          py: 1.2,
          background: 'linear-gradient(90deg, #0a2f6e 0%, #08265a 100%)',
          color: '#fff',
          boxShadow: '0 2px 8px rgba(8,38,90,0.35)',
        }}
      >
        <Stack direction='row' alignItems='center' justifyContent='space-between'>
          <Stack direction='row' spacing={1} alignItems='center'>
            <IconButton onClick={() => setMobileOpen(true)} sx={{ color: '#fff', display: { md: 'none' } }}><MenuRounded /></IconButton>
            <IconButton onClick={() => setSidebarOpen((v) => !v)} sx={{ color: '#fff', display: { xs: 'none', md: 'inline-flex' } }}>
              {sidebarOpen ? <ChevronLeftRounded /> : <ChevronRightRounded />}
            </IconButton>
            <OpacityRounded />
            <Box>
              <Typography fontWeight={800}>{title}</Typography>
              <Typography fontSize={12} sx={{ opacity: 0.85 }}>{subtitle}</Typography>
            </Box>
          </Stack>

          <Stack direction='row' spacing={0.8} alignItems='center'>
            <IconButton sx={{ color: '#fff' }} onClick={() => setNotifOpen(true)}>
              <Badge badgeContent={unreadCount} color='error'>
                <NotificationsNoneRounded />
              </Badge>
            </IconButton>

            <Button onClick={(e) => setProfileAnchor(e.currentTarget)} sx={{ color: '#fff', textTransform: 'none', borderRadius: 999, px: 1 }}>
              <Stack direction='row' spacing={1} alignItems='center'>
                <Avatar src={me?.avatar_url || undefined} sx={{ width: 30, height: 30, bgcolor: '#dbeafe', color: '#1e3a8a' }}>
                  <PersonRounded fontSize='small' />
                </Avatar>
                <Typography sx={{ display: { xs: 'none', md: 'block' }, maxWidth: 170, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayName}
                </Typography>
              </Stack>
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={() => setProfileAnchor(null)}
      >
        <MenuItem component={Link} href='/customer/settings' onClick={() => setProfileAnchor(null)}>ตั้งค่าโปรไฟล์</MenuItem>
        <MenuItem onClick={() => { setProfileAnchor(null); void onLogout(); }}>ออกจากระบบ</MenuItem>
      </Menu>

      <Drawer anchor='right' open={notifOpen} onClose={() => setNotifOpen(false)}>
        <Box sx={{ width: { xs: '100vw', sm: 420 }, p: 1.5 }}>
          <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mb: 1 }}>
            <Typography fontWeight={800}>การแจ้งเตือน</Typography>
            <Button size='small' onClick={() => void markAllRead()}>อ่านทั้งหมด</Button>
          </Stack>
          <Stack spacing={1}>
            {notifications.map((n) => (
              <Paper key={n.id} variant='outlined' sx={{ p: 1.2, borderColor: n.is_read ? '#e2e8f0' : '#93c5fd', bgcolor: n.is_read ? '#fff' : '#eff6ff' }}>
                <Typography fontSize={13} fontWeight={700}>{n.title}</Typography>
                <Typography fontSize={12} color='text.secondary'>{n.message}</Typography>
                <Typography fontSize={11} color='text.disabled' sx={{ mt: 0.4 }}>{new Date(n.created_at).toLocaleString('th-TH')}</Typography>
              </Paper>
            ))}
            {!notifications.length ? <Typography color='text.secondary'>ยังไม่มีการแจ้งเตือน</Typography> : null}
          </Stack>
        </Box>
      </Drawer>

      <Box sx={{ display: 'flex', pt: `${topbarHeight}px`, minHeight: '100vh' }}>
        <Box
          sx={{
            width: sidebarOpen ? { md: sidebarWidth } : { md: 0 },
            display: { xs: 'none', md: 'block' },
            overflow: 'hidden',
            borderRight: sidebarOpen ? '1px solid #d7e1ef' : 'none',
            bgcolor: '#fff',
            height: `calc(100vh - ${topbarHeight}px)`,
            position: 'fixed',
            top: `${topbarHeight}px`,
            left: 0,
            zIndex: 1200,
            transition: 'width 0.2s ease',
          }}
        >
          {sideContent}
        </Box>

        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: sidebarWidth } }}>
          {sideContent}
        </Drawer>

        <Box
          sx={{
            flex: 1,
            p: { xs: 1.25, md: 2.5 },
            pb: { xs: 10, md: 2.5 },
            ml: { md: sidebarOpen ? `${sidebarWidth}px` : 0 },
            transition: 'margin-left 0.2s ease',
            minWidth: 0,
          }}
        >
          {children}
        </Box>
      </Box>

      <Paper
        elevation={8}
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1400,
          borderTop: '1px solid #dbe4f0',
          borderRadius: 0,
        }}
      >
        <BottomNavigation showLabels value={pathname}>
          <BottomNavigationAction label='ราคา' value='/customer' icon={<SellRounded />} component={Link} href='/customer' />
          <BottomNavigationAction label='สั่งซื้อ' value='/customer/orders' icon={<ReceiptLongRounded />} component={Link} href='/customer/orders' />
          <BottomNavigationAction label='รถ' value='/customer/vehicles' icon={<DirectionsCarFilledRounded />} component={Link} href='/customer/vehicles' />
          <BottomNavigationAction label='ตั้งค่า' value='/customer/settings' icon={<SettingsRounded />} component={Link} href='/customer/settings' />
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
