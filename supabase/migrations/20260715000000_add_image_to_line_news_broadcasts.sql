alter table line_news_broadcasts
  add column if not exists image_urls jsonb not null default '[]'::jsonb;
