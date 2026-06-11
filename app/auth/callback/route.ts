import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { getDefaultHomeByContext, getUserContext } from '@/lib/auth/user-context';

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get('code');
  const nextPath = requestUrl.searchParams.get('next');
  const safeNext = nextPath && (nextPath.startsWith('/dashboard') || nextPath.startsWith('/customer') || nextPath === '/reset-password') ? nextPath : null;

  if (!code) {
    const url = new URL('/login', requestUrl.origin);
    url.searchParams.set('error', 'missing_oauth_code');
    return NextResponse.redirect(url);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const url = new URL('/login', requestUrl.origin);
    url.searchParams.set('error', 'oauth_exchange_failed');
    return NextResponse.redirect(url);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = new URL('/login', requestUrl.origin);
    url.searchParams.set('error', 'oauth_user_missing');
    return NextResponse.redirect(url);
  }

  const ctx = await getUserContext(user.id);
  const home = getDefaultHomeByContext(ctx);
  const redirectPath = safeNext || home;

  return NextResponse.redirect(new URL(redirectPath, requestUrl.origin));
}
