import { NextResponse } from 'next/server';
import { z } from 'zod';

/** UUID string. */
export const uuid = z.string().uuid({ message: 'รหัสอ้างอิงไม่ถูกต้อง' });

/** Finite number coerced from string/number input. */
export const money = z.coerce.number({ invalid_type_error: 'ต้องเป็นตัวเลข' }).finite();

/** `YYYY-MM-DD` date string. */
export const dateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD');

/** Empty string → null, otherwise trimmed string; `undefined` stays undefined (for PATCH). */
export const optionalText = (max = 2000) =>
  z.union([z.string().trim().max(max, `ความยาวต้องไม่เกิน ${max} ตัวอักษร`), z.null()])
    .optional()
    .transform((value): string | null | undefined => (value === undefined ? undefined : value === '' || value === null ? null : value));

/**
 * Signature image as a data URI. Only PNG/JPEG (what pdfmake can embed), at
 * most ~300 KB. Empty/null clears the signature; `undefined` leaves it alone.
 */
export const optionalSignatureDataUri = z.union([
  z.string().trim().max(400_000, 'ไฟล์ลายเซ็นใหญ่เกินไป (ไม่เกิน 300 KB)').regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, 'ลายเซ็นต้องเป็นไฟล์ภาพ PNG หรือ JPEG'),
  z.literal(''),
  z.null(),
]).optional().transform((value): string | null | undefined => (value === undefined ? undefined : value === '' || value === null ? null : value));

/** Empty string → null, otherwise a UUID; `undefined` stays undefined. */
export const optionalUuid = z.union([uuid, z.literal(''), z.null()])
  .optional()
  .transform((value): string | null | undefined => (value === undefined ? undefined : value === '' || value === null ? null : value));

/** Optional non-empty string (empty string → undefined). */
export const optionalString = (schema: z.ZodString) =>
  z.union([schema, z.literal('')]).optional().transform((value): string | undefined => (value === '' ? undefined : value));

export type ParseResult<T> = { data: T; response?: undefined } | { data?: undefined; response: NextResponse };

/**
 * Validates a request body against a schema and turns the first issue into a
 * 422 JSON response with a Thai message.
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): ParseResult<T> {
  const result = schema.safeParse(body);
  if (result.success) return { data: result.data };
  const issue = result.error.issues[0];
  const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
  return { response: NextResponse.json({ error: `ข้อมูลไม่ถูกต้อง ${path}${issue?.message ?? ''}`.trim() }, { status: 422 }) };
}

/**
 * Validates URL search params (as a plain object) the same way as `parseBody`.
 */
export function parseQuery<T>(schema: z.ZodType<T>, params: URLSearchParams): ParseResult<T> {
  return parseBody(schema, Object.fromEntries(params.entries()));
}
