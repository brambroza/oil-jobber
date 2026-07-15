import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนอัปโหลดรูปภาพ' }, { status: 401 });

  const form = await req.formData();
  const companyId = resolveCompanyId(String(form.get('company_id') || ''));
  const file = form.get('file');
  if (!companyId) return NextResponse.json({ error: 'ไม่พบ company_id' }, { status: 422 });
  if (!(file instanceof File) || !file.type.startsWith('image/')) return NextResponse.json({ error: 'กรุณาเลือกไฟล์ภาพ' }, { status: 422 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'ไฟล์ภาพต้องมีขนาดไม่เกิน 10 MB' }, { status: 422 });

  const path = `${companyId}/line-news/${Date.now()}-${sanitizeFileName(file.name || 'image')}`;
  const { error: uploadError } = await supabaseAdmin.storage.from('dofiles').upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

  const { data } = supabaseAdmin.storage.from('dofiles').getPublicUrl(path);
  return NextResponse.json({ path, url: data.publicUrl });
}
