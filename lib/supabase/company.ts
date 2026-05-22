export function resolveCompanyId(input?: unknown): string | null {
  const fromInput = typeof input === 'string' ? input.trim() : '';
  if (fromInput) return fromInput;

  const fromEnv = (
    process.env.DEFAULT_COMPANY_ID ||
    process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ||
    ''
  ).trim();

  return fromEnv || null;
}
