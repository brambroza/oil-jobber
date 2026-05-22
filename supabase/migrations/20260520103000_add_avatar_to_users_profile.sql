alter table users_profile
  add column if not exists avatar_url text null;
