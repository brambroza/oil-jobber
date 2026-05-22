import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // NOTE:
  // Current auth flow uses supabase-js on client side (local storage session).
  // Checking a fixed cookie here causes false redirect even after successful login.
  // Keep middleware passive for now; enforce access in server-side auth integration later.
  if (pathname.startsWith('/dashboard')) return NextResponse.next();
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
