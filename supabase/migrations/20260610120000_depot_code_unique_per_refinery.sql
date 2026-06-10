-- Depot code can be reused across refineries, but not within the same refinery.
drop index if exists uq_depots_company_code_active;
drop index if exists uq_depots_company_refinery_code_active;

create unique index if not exists uq_depots_company_code_active
on public.depots using btree (company_id, upper(code), refinery_id)
where is_deleted = false;
