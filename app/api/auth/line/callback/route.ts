import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { getDefaultHomeByContext, getUserContext } from '@/lib/auth/user-context';
import { resolveCompanyId } from '@/lib/supabase/company';
import { supabaseAdmin } from '@/lib/supabase/server';
import { pushLineMessage } from '@/lib/services/line';

type LineTokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

type LineProfile = {
  userId?: string;
  displayName?: string;
  pictureUrl?: string;
};

type LineFriendshipStatus = {
  friendFlag?: boolean;
};

type GenerateLinkData = {
  properties?: {
    email_otp?: string;
  };
};

function getOrigin(req: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return req.nextUrl.origin;
}

function toLoginRedirect(req: NextRequest, code: string) {
  const url = new URL('/login', getOrigin(req));
  url.searchParams.set('error', code);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const channelId = (process.env.LINE_LOGIN_CHANNEL_ID || '').trim();
  const channelSecret = (process.env.LINE_LOGIN_CHANNEL_SECRET || '').trim();
  if (!channelId || !channelSecret) {
    return toLoginRedirect(req, 'line_not_configured');
  }

  const requestState = req.nextUrl.searchParams.get('state') || '';
  const stateCookie = req.cookies.get('line_oauth_state')?.value || '';
  const nextCookie = req.cookies.get('line_oauth_next')?.value || '';
  const safeNext = nextCookie.startsWith('/dashboard') || nextCookie.startsWith('/customer') ? nextCookie : null;

  if (!requestState || !stateCookie || requestState !== stateCookie) {
    return toLoginRedirect(req, 'line_invalid_state');
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return toLoginRedirect(req, 'line_missing_code');
  }

  const origin = getOrigin(req);
  const redirectUri = `${origin}/api/auth/line/callback`;

  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: channelId,
      client_secret: channelSecret,
    }).toString(),
  });

  if (!tokenRes.ok) {
    return toLoginRedirect(req, 'line_token_failed');
  }

  const tokenData = (await tokenRes.json()) as LineTokenResponse;
  const accessToken = String(tokenData.access_token || '').trim();
  if (!accessToken) {
    return toLoginRedirect(req, 'line_no_access_token');
  }
  const refreshToken = String(tokenData.refresh_token || '').trim();
  const expiresIn = Number(tokenData.expires_in || 0);

  const friendshipRes = await fetch('https://api.line.me/friendship/v1/status', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!friendshipRes.ok) {
    return toLoginRedirect(req, 'line_friendship_check_failed');
  }

  const friendship = (await friendshipRes.json()) as LineFriendshipStatus;
  if (!friendship.friendFlag) {
    return toLoginRedirect(req, 'line_not_friend');
  }

  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileRes.ok) {
    return toLoginRedirect(req, 'line_profile_failed');
  }

  const profile = (await profileRes.json()) as LineProfile;
  const lineUserId = String(profile.userId || '').trim();
  if (!lineUserId) {
    return toLoginRedirect(req, 'line_user_not_found');
  }

  const companyId = resolveCompanyId();
  if (!companyId) {
    return toLoginRedirect(req, 'line_company_missing');
  }
  const now = new Date().toISOString();
  const tokenExpiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  const { data: lineCustomer, error: lineCustomerError } = await supabaseAdmin
    .from('line_customers')
    .upsert(
      {
        company_id: companyId,
        line_user_id: lineUserId,
        group_id: null,
        conversation_key: 'DIRECT',
        display_name: profile.displayName || null,
        profile_image_url: profile.pictureUrl || null,
        line_login_access_token: accessToken,
        line_login_refresh_token: refreshToken || null,
        line_login_token_expires_at: tokenExpiresAt,
        line_friendship_checked_at: now,
        updated_at: now,
        is_deleted: false,
      },
      { onConflict: 'company_id,line_user_id,conversation_key' },
    )
    .select('id, customer_id')
    .single();

  if (lineCustomerError || !lineCustomer?.customer_id) {
    return toLoginRedirect(req, 'line_not_mapped_customer');
  }

  const { data: portalUser, error: portalUserError } = await supabaseAdmin
    .from('customer_portal_users')
    .select('auth_user_id, is_active')
    .eq('customer_id', lineCustomer.customer_id)
    .eq('is_active', true)
    .maybeSingle();

  if (portalUserError || !portalUser?.auth_user_id) {
    return toLoginRedirect(req, 'line_customer_portal_missing');
  }

  const { data: authData, error: authGetError } = await supabaseAdmin.auth.admin.getUserById(portalUser.auth_user_id);
  const authEmail = String(authData?.user?.email || '').trim();
  if (authGetError || !authEmail) {
    return toLoginRedirect(req, 'line_auth_user_missing');
  }

  // Resolve redirect path before building the response — we already have auth_user_id
  const ctx = await getUserContext(portalUser.auth_user_id);
  const home = getDefaultHomeByContext(ctx);
  const redirectPath = safeNext || home;

  // Build the redirect response first so the supabase client can write session cookies onto it
  const response = NextResponse.redirect(new URL(redirectPath, origin));
  response.cookies.delete('line_oauth_state');
  response.cookies.delete('line_oauth_next');

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: magicData, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: authEmail,
    options: { redirectTo: `${origin}/customer` },
  });

  const otpToken = String((magicData as GenerateLinkData | null)?.properties?.email_otp || '').trim();
  if (magicError || !otpToken) {
    return toLoginRedirect(req, 'line_generate_link_failed');
  }

  // email_otp from generateLink must be verified with type: 'email', not 'magiclink'
  const verify = await supabase.auth.verifyOtp({ email: authEmail, token: otpToken, type: 'email' });
  if (verify.error || !verify.data.user) {
    return toLoginRedirect(req, 'line_session_create_failed');
  }

  // Best-effort: send a welcome ping from OA after successful LINE auth.
  // This doesn't block login flow if LINE push is temporarily unavailable.
  try {
    await pushLineMessage(lineUserId, 'เข้าสู่ระบบสำเร็จแล้ว');
  } catch {
    // ignore push errors to keep auth callback stable
  }

  return response;
}
