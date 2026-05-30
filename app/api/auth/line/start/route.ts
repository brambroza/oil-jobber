import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

function getOrigin(req: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const channelId = (process.env.LINE_LOGIN_CHANNEL_ID || '').trim();
  if (!channelId) {
    return NextResponse.json({ error: 'LINE_LOGIN_CHANNEL_ID is not configured' }, { status: 500 });
  }

  const origin = getOrigin(req);
  const redirectUri = `${origin}/api/auth/line/callback`;
  const nextPathRaw = req.nextUrl.searchParams.get('next') || '/customer';
  const safeNext = nextPathRaw.startsWith('/dashboard') || nextPathRaw.startsWith('/customer') ? nextPathRaw : '/customer';

  const state = randomBytes(24).toString('hex');
  const nonce = randomBytes(16).toString('hex');

  const lineAuthUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
  lineAuthUrl.searchParams.set('response_type', 'code');
  lineAuthUrl.searchParams.set('client_id', channelId);
  lineAuthUrl.searchParams.set('redirect_uri', redirectUri);
  lineAuthUrl.searchParams.set('state', state);
  lineAuthUrl.searchParams.set('scope', 'profile openid');
  lineAuthUrl.searchParams.set('nonce', nonce);
  lineAuthUrl.searchParams.set('prompt', 'consent');
  // Ask user to add OA friend during LINE Login flow.
  lineAuthUrl.searchParams.set('bot_prompt', 'aggressive');

  const response = NextResponse.redirect(lineAuthUrl);
  response.cookies.set('line_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });
  response.cookies.set('line_oauth_next', safeNext, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });

  return response;
}
