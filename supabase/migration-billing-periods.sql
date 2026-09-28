-- Optional but recommended: preserves billing-period dates for accurate annual usage projections.
begin;
alter table public.readings add column if not exists billing_period_start date;
alter table public.readings add column if not exists billing_period_end date;
update public.readings set billing_period_end = reading_date where billing_period_end is null and reading_date is not null;
create index if not exists readings_billing_period_idx on public.readings(account_id, billing_period_end desc, billing_period_start);
commit;
