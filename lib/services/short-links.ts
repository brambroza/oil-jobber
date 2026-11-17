import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { buildDocumentShortUrl, isPlausibleShortCode, SHORT_CODE_BYTES } from '@/lib/utils/short-link';

/**
 * Creates a short link (<origin>/d/<code>) for a stored document PDF.
 * Returns null when the link cannot be created (e.g. the migration is not
 * applied yet) so the caller can fall back to the long storage URL.
 *
 * @param input - tenant, storage path in the `documents` bucket, type, order, user and site origin
 * @returns short URL or null
 */
export async function createDocumentShortLink(input: {
  companyId: string;
  storagePath: string;
  documentType: string;
  saleOrderId: string | null;
  userId: string | null;
  origin: string;
}): Promise<string | null> {
  if (!input.origin) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = randomBytes(SHORT_CODE_BYTES).toString('base64url');
    const { error } = await supabaseAdmin.from('document_short_links').insert({
      code,
      company_id: input.companyId,
      storage_path: input.storagePath,
      document_type: input.documentType,
      sale_order_id: input.saleOrderId,
      created_by: input.userId,
    });
    if (!error) return buildDocumentShortUrl(input.origin, code);
    if (error.code !== '23505') return null; // only retry on a code collision
  }
  return null;
}

/**
 * Resolves a short code to the public URL of its PDF.
 * @param code short code from the URL
 * @returns public storage URL or null when unknown
 */
export async function resolveDocumentShortLink(code: string): Promise<string | null> {
  if (!isPlausibleShortCode(code)) return null;
  const { data } = await supabaseAdmin
    .from('document_short_links')
    .select('storage_path')
    .eq('code', code)
    .maybeSingle();
  if (!data?.storage_path) return null;
  return supabaseAdmin.storage.from('documents').getPublicUrl(String(data.storage_path)).data.publicUrl;
}
