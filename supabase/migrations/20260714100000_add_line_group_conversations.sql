-- A LINE user can contact the OA directly and from more than one group.
-- Keep each source as a separate conversation in line_customers.
alter table line_customers
  add column if not exists group_id text,
  add column if not exists conversation_key text not null default 'DIRECT';

alter table line_messages
  add column if not exists group_id text;

alter table line_customers
  drop constraint if exists line_customers_line_user_id_key;

create unique index if not exists line_customers_company_conversation_key_idx
  on line_customers (company_id, line_user_id, conversation_key);

create index if not exists line_messages_company_group_id_idx
  on line_messages (company_id, group_id)
  where group_id is not null;

alter table line_customers
  add constraint line_customers_group_conversation_check
  check (
    (group_id is null and conversation_key = 'DIRECT')
    or (group_id is not null and conversation_key = group_id)
  ) not valid;

alter table line_customers
  validate constraint line_customers_group_conversation_check;
