import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('refineries');
  if (guard.response) return guard.response;
  const { id } = await params;
  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from('refineries')
    .update({
      name: body.name,
      contact_info: body.contact_info ?? null,
      image_url: body.image_url ?? null,
      active: Boolean(body.active),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('refineries');
  if (guard.response) return guard.response;
  const { id } = await params;
  const { error } = await supabaseAdmin
    .from('refineries')
    .update({ is_deleted: true })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
