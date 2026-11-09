-- Keep the exact LINE message object that was pushed, so the chat page can show
-- a Flex message the way the customer sees it. message_text stays as the
-- plain-text summary used for search and the conversation preview.
-- Older rows keep message_payload null and are shown as text.
alter table line_messages
  add column if not exists message_payload jsonb;
