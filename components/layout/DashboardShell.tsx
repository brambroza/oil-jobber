'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  CampaignOutlined,
  ChevronRight,
  DashboardOutlined,
  LocalShippingOutlined,
  LogoutOutlined,
  Menu as MenuIcon,
  NotificationsNoneOutlined,
  PeopleOutline,
  PriceCheckOutlined,
  ReceiptLongOutlined,
  RequestQuoteOutlined,
  ScannerOutlined,
  SettingsOutlined,
  StoreOutlined,
  TagOutlined,
  TextsmsOutlined,
} from '@mui/icons-material';
import { getSupabaseClient } from '@/lib/supabase/client';

type MenuItem = { label: string; href: string; icon: ReactNode; badge?: string };
type MenuGroup = { title: string; items: MenuItem[] };

type MeProfile = { full_name: string | null; avatar_url: string | null } | null;
type OrderNotification = { id: string; created_at: string; order_status: string; customer_name: string };

const menuGroups: MenuGroup[] = [
  {
    title: 'หลัก',
    items: [
      { label: 'แดชบอร์ด', href: '/dashboard', icon: <DashboardOutlined fontSize='small' /> },
      { label: 'ราคาน้ำมัน อ่านจากภาพ', href: '/dashboard/prices/ocr-upload', icon: <ScannerOutlined fontSize='small' />, badge: '2' },
      { label: 'ข้อมูลน้ำมัน', href: '/dashboard/oil-products', icon: <TagOutlined fontSize='small' /> },
      { label: 'ราคาน้ำมัน', href: '/dashboard/prices', icon: <TagOutlined fontSize='small' /> },
    /*   { label: 'แจ้งราคา LINE', href: '/dashboard/line/broadcast-price', icon: <CampaignOutlined fontSize='small' /> }, */
      { label: 'แสดงราคาขาย', href: '/dashboard/selling-prices', icon: <PriceCheckOutlined fontSize='small' /> },

    ],
  },
  {
    title: 'ปฏิบัติการ',
    items: [
      { label: 'ใบสั่งซื้อ', href: '/dashboard/orders', icon: <ReceiptLongOutlined fontSize='small' />, badge: '7' },
      { label: 'บัญชี', href: '/dashboard/accounting', icon: <RequestQuoteOutlined fontSize='small' /> },

      { label: 'ลูกค้า', href: '/dashboard/customers', icon: <PeopleOutline fontSize='small' /> },
      { label: 'รถขนส่ง', href: '/dashboard/customer-vehicles', icon: <LocalShippingOutlined fontSize='small' /> },
      { label: 'โรงกลั่น', href: '/dashboard/refineries', icon: <StoreOutlined fontSize='small' /> },
      { label: 'คลังน้ำมัน', href: '/dashboard/depots', icon: <StoreOutlined fontSize='small' /> },
    ],
  },

  {
    title: 'LINE',
    items: [
      /*     { label: 'ลูกค้า LINE', href: '/dashboard/line/customers', icon: <TextsmsOutlined fontSize='small' /> }, */
      { label: 'ส่งข่าวสาร LINE', href: '/dashboard/line/news', icon: <CampaignOutlined fontSize='small' /> },
      { label: 'แชท LINE', href: '/dashboard/line/chat', icon: <TextsmsOutlined fontSize='small' /> },
    ],
  },
  {
    title: 'ระบบ',
    items: [
      { label: 'กำหนดราคาขาย', href: '/dashboard/settings/selling-prices', icon: <SettingsOutlined fontSize='small' /> },
      /*    { label: 'ตั้งค่ากฎราคา', href: '/dashboard/settings/price-rules', icon: <SettingsOutlined fontSize='small' /> }, */
      { label: 'โปรไฟล์ผู้ใช้', href: '/dashboard/users', icon: <PeopleOutline fontSize='small' /> },
    ],
  },
];

const drawerWidth = 240;
const topbarHeight = 56;

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const companyId = process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userLabel, setUserLabel] = useState('ผู้ใช้');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifAnchorEl, setNotifAnchorEl] = useState<null | HTMLElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const supabaseClient = getSupabaseClient();
      const { data } = await supabaseClient.auth.getUser();
      const user = data.user;
      if (!mounted || !user) return;

      const fromMeta = (user.user_metadata?.full_name as string | undefined) || user.email || 'ผู้ใช้';
      setUserLabel(fromMeta);

      const profileRes = await fetch(`/api/users-profile/me?user_id=${user.id}`);
      if (!profileRes.ok) return;
      const profile = (await profileRes.json()) as MeProfile;

      if (!mounted || !profile) return;
      if (profile.full_name) setUserLabel(profile.full_name);
      if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
    };

    void loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const avatarText = useMemo(() => {
    const trimmed = userLabel.trim();
    if (!trimmed) return 'U';
    const chunks = trimmed.split(' ').filter(Boolean);
    if (chunks.length >= 2) return `${chunks[0][0]}${chunks[1][0]}`.toUpperCase();
    return trimmed.slice(0, 2).toUpperCase();
  }, [userLabel]);

  const currentPage = useMemo(() => {
    for (const g of menuGroups) {
      for (const item of g.items) {
        if (pathname === item.href || pathname.startsWith(item.href + '/')) return item.label;
      }
    }
    return 'แดชบอร์ด';
  }, [pathname]);

  const onLogout = async () => {
    const supabaseClient = getSupabaseClient();
    await supabaseClient.auth.signOut();
    window.location.href = '/login';
  };

  const openProfileMenu = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const closeProfileMenu = () => setAnchorEl(null);
  const openNotifMenu = async (event: React.MouseEvent<HTMLElement>) => {
    setNotifAnchorEl(event.currentTarget);
    setUnreadCount(0);
    if (companyId) {
      const key = `orders_notif_last_seen_${companyId}`;
      localStorage.setItem(key, new Date().toISOString());
    }
  };
  const closeNotifMenu = () => setNotifAnchorEl(null);

  useEffect(() => {
    if (!companyId) return;
    const key = `orders_notif_last_seen_${companyId}`;
    const fetchNotifs = async () => {
      const since = localStorage.getItem(key) || '';
      const qs = since ? `&since=${encodeURIComponent(since)}` : '';
      const res = await fetch(`/api/orders/notifications?company_id=${companyId}${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      const items = (data.items || []) as OrderNotification[];
      setNotifications(items);
      setUnreadCount(Number(data.unread_count || 0));
    };

    void fetchNotifs();
    const timer = setInterval(() => void fetchNotifs(), 15000);
    return () => clearInterval(timer);
  }, [companyId]);

  const sidebar = (
    <Box sx={{ height: '100%', bgcolor: '#ffffff' }}>
      <Box sx={{ px: 2, py: 2.2 }}>
        <Stack direction='row' spacing={1} alignItems='center'>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#0f172a' }} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '.01em' }}>OilJobber</Typography>
        </Stack>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.2 }}>ระบบจัดการน้ำมัน</Typography>
      </Box>
      <Divider sx={{ borderColor: '#eef2f7' }} />
      <List dense sx={{ py: 1 }}>
        {menuGroups.map((group) => (
          <Box key={group.title} sx={{ mb: 0.5 }}>
            <Typography sx={{ px: 2, py: 0.7, fontSize: 10, letterSpacing: '.08em', color: 'text.disabled' }}>{group.title}</Typography>
            {group.items.map((item) => {
              const selected = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <ListItemButton
                  key={`${item.href}-${item.label}`}
                  component={Link}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  sx={{
                    mx: 1,
                    px: 1.2,
                    py: 0.85,
                    borderRadius: 1.4,
                    color: selected ? '#0f172a' : '#475569',
                    bgcolor: selected ? '#f1f5f9' : 'transparent',
                    '&:hover': { bgcolor: selected ? '#e2e8f0' : '#f8fafc' },
                  }}
                >
                  <Box sx={{ width: 18, mr: 1, opacity: selected ? 1 : 0.72, color: selected ? '#0f172a' : '#64748b' }}>{item.icon}</Box>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontSize: 13, fontWeight: selected ? 600 : 400, noWrap: true }}
                  />
                  {item.badge ? (
                    <Box sx={{ ml: 1, px: 0.8, py: 0.2, borderRadius: 4, bgcolor: item.label.includes('OCR') ? '#fff7ed' : '#fee2e2', color: item.label.includes('OCR') ? '#b45309' : '#991b1b', fontSize: 10, fontWeight: 600 }}>
                      {item.badge}
                    </Box>
                  ) : null}
                </ListItemButton>
              );
            })}
          </Box>
        ))}
      </List>
    </Box>
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#f8fafc',
        '--dashboard-drawer-width': `${drawerWidth}px`,
        '--dashboard-topbar-height': `${topbarHeight}px`,
      }}
    >
      <AppBar
        position='fixed'
        elevation={0}
        sx={{
          width: { md: 'calc(100% - var(--dashboard-drawer-width))' },
          ml: { md: 'var(--dashboard-drawer-width)' },
          bgcolor: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(10px)',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: '#e2e8f0',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          height: 'var(--dashboard-topbar-height)',
          justifyContent: 'center',
        }}
      >
        <Toolbar variant='dense' sx={{ minHeight: 'var(--dashboard-topbar-height) !important', px: { xs: 1, md: 3 } }}>
          <IconButton sx={{ display: { md: 'none' }, mr: 0.5 }} onClick={() => setMobileOpen(true)}>
            <MenuIcon fontSize='small' />
          </IconButton>
          <Stack direction='row' spacing={0.75} alignItems='center'>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>หน้าหลัก</Typography>
            <ChevronRight sx={{ fontSize: 13, color: 'text.disabled' }} />
            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{currentPage}</Typography>
          </Stack>
          <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              size='small'
              variant='outlined'
              startIcon={<ScannerOutlined sx={{ fontSize: 14 }} />}
              sx={{ fontSize: 12, borderRadius: 1.5, textTransform: 'none' }}
              component={Link}
              href='/dashboard/prices/ocr-upload'
            >
              อัปโหลด OCR
            </Button>
            {/*    <Button
              size='small'
              variant='contained'
              startIcon={<PriceCheckOutlined sx={{ fontSize: 14 }} />}
              sx={{ fontSize: 12, borderRadius: 1.5, bgcolor: '#0f172a', textTransform: 'none', '&:hover': { bgcolor: '#1e293b' } }}
              component={Link}
              href='/dashboard/line/broadcast-price'
            >
              แจ้งราคา
            </Button> */}
            <IconButton onClick={(e) => void openNotifMenu(e)}>
              <Badge color='error' badgeContent={unreadCount > 99 ? '99+' : unreadCount} invisible={unreadCount <= 0}>
                <NotificationsNoneOutlined fontSize='small' />
              </Badge>
            </IconButton>
            <Menu
              anchorEl={notifAnchorEl}
              open={Boolean(notifAnchorEl)}
              onClose={closeNotifMenu}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              PaperProps={{ sx: { mt: 0.7, minWidth: 320, maxWidth: 360, borderRadius: 2 } }}
            >
              <Box sx={{ px: 1.5, py: 1 }}>
                <Typography variant='body2' sx={{ fontWeight: 700 }}>แจ้งเตือนคำสั่งซื้อใหม่</Typography>
              </Box>
              <Divider />
              {!notifications.length ? (
                <MenuItem disabled sx={{ opacity: 1 }}>
                  <Typography variant='body2' color='text.secondary'>ยังไม่มีคำสั่งซื้อใหม่</Typography>
                </MenuItem>
              ) : notifications.map((n) => (
                <MenuItem
                  key={n.id}
                  component={Link}
                  href='/dashboard/orders'
                  onClick={closeNotifMenu}
                  sx={{ py: 1.1, alignItems: 'flex-start' }}
                >
                  <Stack spacing={0.25}>
                    <Typography variant='body2' sx={{ fontWeight: 600 }} noWrap>
                      ลูกค้า: {n.customer_name}
                    </Typography>
                    <Typography variant='caption' color='text.secondary' noWrap>
                      ออเดอร์ #{n.id.slice(0, 8)} • {n.order_status}
                    </Typography>
                    <Typography variant='caption' color='text.disabled'>
                      {new Date(n.created_at).toLocaleString('th-TH')}
                    </Typography>
                  </Stack>
                </MenuItem>
              ))}
            </Menu>
            <IconButton onClick={openProfileMenu} sx={{ p: 0 }}>
              <Avatar src={avatarUrl ?? undefined} sx={{ width: 32, height: 32, fontSize: 11, bgcolor: '#e2e8f0', color: '#334155' }}>
                {avatarText}
              </Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={closeProfileMenu}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              PaperProps={{ sx: { mt: 0.7, minWidth: 180, borderRadius: 2 } }}
            >
              <Box sx={{ px: 1.5, py: 1 }}>
                <Typography variant='body2' sx={{ fontWeight: 600 }} noWrap>{userLabel}</Typography>
              </Box>
              <Divider />
              <MenuItem
                component={Link}
                href='/dashboard/users'
                onClick={closeProfileMenu}
                sx={{ fontSize: 13 }}
              >
                โปรไฟล์
              </MenuItem>
              <MenuItem
                onClick={async () => {
                  closeProfileMenu();
                  await onLogout();
                }}
                sx={{ fontSize: 13, color: '#b91c1c' }}
              >
                <LogoutOutlined sx={{ fontSize: 16, mr: 1 }} />
                ออกจากระบบ
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      <Box component='nav'>
        <Drawer
          variant='temporary'
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth, borderRight: '1px solid #e2e8f0' } }}
        >
          {sidebar}
        </Drawer>
        <Drawer
          variant='permanent'
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              width: 'var(--dashboard-drawer-width)',
              boxSizing: 'border-box',
              borderRight: '1px solid #e2e8f0',
              bgcolor: '#fff',
            },
          }}
          open
        >
          {sidebar}
        </Drawer>
      </Box>

      <Box
        component='main'
        sx={{
          minHeight: '100vh',
          pt: 'var(--dashboard-topbar-height)',
          pl: { md: 'var(--dashboard-drawer-width)' },
        }}
      >
        <Box sx={{ p: { xs: 1.5, md: 2.5 }, maxWidth: '100%', overflowX: 'hidden' }}>{children}</Box>
      </Box>
    </Box>
  );
}
