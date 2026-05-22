-- Seed default company for single-tenant setup
insert into companies (id, name)
select '11111111-1111-4111-8111-111111111111'::uuid, 'Jobber Oil Co., Ltd.'
where not exists (
  select 1 from companies where id = '11111111-1111-4111-8111-111111111111'::uuid
);
