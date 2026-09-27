-- GnóRate bill-period-aware annual usage. Safe additive migration.
begin;
alter table public.readings add column if not exists billing_period_start date;
alter table public.readings add column if not exists billing_period_end date;
-- Existing reading_date already represents the billing-period end in the uploader.
update public.readings set billing_period_end = reading_date where billing_period_end is null and reading_date is not null;
create index if not exists readings_billing_period_idx on public.readings(account_id, billing_period_end desc, billing_period_start);
comment on column public.readings.billing_period_start is 'Inclusive start date of the energy usage period shown on the bill.';
comment on column public.readings.billing_period_end is 'Inclusive end date of the energy usage period shown on the bill.';
commit;
