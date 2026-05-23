import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { getDefaultHomeByContext, getUserContext } from '@/lib/auth/user-context';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ home: '/login', is_dashboard_user: false, is_customer_user: false }, { status: 401 });
  }

  const ctx = await getUserContext(user.id);
  return NextResponse.json({
    home: getDefaultHomeByContext(ctx),
    is_dashboard_user: ctx.isDashboardUser,
    is_customer_user: ctx.isCustomerUser,
    dashboard_role: ctx.dashboardRole,
  });
}

