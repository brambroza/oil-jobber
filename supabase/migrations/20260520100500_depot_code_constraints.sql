-- Depot code must be unique per company (ignoring soft-deleted rows)
create unique index if not exists uq_depots_company_code_active
on depots (company_id, upper(code))
where is_deleted = false;

-- Optional sanity check for non-empty code
alter table depots
  add constraint depots_code_not_blank
  check (length(trim(code)) > 0);
