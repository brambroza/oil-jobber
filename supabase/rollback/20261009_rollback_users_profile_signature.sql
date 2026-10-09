-- Rollback for 20261009120000_users_profile_signature.sql
alter table public.users_profile drop column if exists signature_url;
