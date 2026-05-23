import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนอัปโหลดไฟล์' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  const companyId = resolveCompanyId(String(form.get('company_id') || ''));
  const orderId = String(form.get('order_id') || '').trim();

  if (!companyId) return NextResponse.json({ error: 'ไม่พบ company_id' }, { status: 422 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'ไม่พบไฟล์ที่อัปโหลด' }, { status: 422 });

  const safeName = sanitizeFileName(file.name || 'document');
  const path = `${companyId}/${orderId || 'manual'}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('dofiles')
    .upload(path, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 400 });

  const { data: publicUrlData } = supabaseAdmin.storage.from('dofiles').getPublicUrl(path);
  return NextResponse.json({ path, url: publicUrlData.publicUrl });
}

