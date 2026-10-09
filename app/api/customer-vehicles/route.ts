import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { canAccessCustomer, customerForbidden, loadCustomerScope } from '@/lib/services/customer-scope';

export async function GET(req: NextRequest) {
  const guard = await requireStaff();
  if (guard.response) return guard.response;
  const companyId = guard.ctx.companyId;
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const scope = await loadCustomerScope(guard.ctx);
  if (scope && 'error' in scope) return NextResponse.json({ error: scope.error }, { status: 400 });
  if (Array.isArray(scope) && !scope.length) return NextResponse.json([]);

  let query = supabaseAdmin
    .from('customer_vehicles')
    .select('id, company_id, customer_id, license_plate, driver_name, driver_phone, pickup_license_number, created_at, updated_at, is_deleted, customers(company_name)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (Array.isArray(scope)) query = query.in('customer_id', scope);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const guard = await requireStaff('customers');
  if (guard.response) return guard.response;
  const body = await req.json();
  const companyId = guard.ctx.companyId;
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });

  const licensePlate = String(body.license_plate ?? '').trim();
  const customerId = String(body.customer_id ?? '').trim();
  if (!customerId) return NextResponse.json({ error: 'กรุณาเลือกลูกค้า' }, { status: 422 });
  if (!licensePlate) return NextResponse.json({ error: 'กรุณาระบุทะเบียนรถ' }, { status: 422 });
  if (!(await canAccessCustomer(guard.ctx, customerId))) return customerForbidden();

  const payload = {
    company_id: companyId,
    customer_id: customerId,
    license_plate: licensePlate,
    driver_name: String(body.driver_name ?? '').trim() || null,
    driver_phone: String(body.driver_phone ?? '').trim() || null,
    pickup_license_number: String(body.pickup_license_number ?? '').trim() || null,
  };

  const { data, error } = await supabaseAdmin
    .from('customer_vehicles')
    .insert(payload)
    .select('id, company_id, customer_id, license_plate, driver_name, driver_phone, pickup_license_number, created_at, updated_at, customers(company_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

