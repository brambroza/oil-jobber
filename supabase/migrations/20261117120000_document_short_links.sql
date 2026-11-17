-- Short links for document PDFs sent to customers on LINE.
-- The PDF stays in the public `documents` bucket; the LINE button now points
-- to <site>/d/<code>, which redirects to the stored file, instead of the long
-- Supabase storage URL. Only the service role reads/writes this table.
-- Safe to deploy code first: when this table is missing the app falls back
-- to the long storage URL.

create table if not exists public.document_short_links (
  code text primary key,
  company_id uuid not null references public.companies(id),
  storage_path text not null,
  document_type text not null,
  sale_order_id uuid references public.sale_orders(id),
  created_by uuid references public.users_profile(id),
  created_at timestamptz not null default now(),
  constraint document_short_links_code_chk check (code ~ '^[A-Za-z0-9_-]{11}$')
);

create index if not exists idx_document_short_links_order
  on public.document_short_links (company_id, sale_order_id, created_at desc);

alter table public.document_short_links enable row level security;
