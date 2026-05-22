import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
export async function POST(req: NextRequest) { const b = await req.json(); const { data, error } = await supabaseAdmin.from('receipts').insert(b).select('*').single(); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json(data); }
