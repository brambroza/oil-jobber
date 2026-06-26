alter table line_customers
add column if not exists line_login_access_token text,
add column if not exists line_login_refresh_token text,
add column if not exists line_login_token_expires_at timestamptz,
add column if not exists line_friendship_checked_at timestamptz;
