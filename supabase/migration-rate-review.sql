-- GnóRate Pass 3: rate review audit fields.
-- Safe to run against an existing database; historical readings are preserved.
alter table public.readings
  add column if not exists rate_review_status text not null default 'unreviewed',
  add column if not exists rate_reviewed_at timestamptz,
  add column if not exists rate_reviewed_by uuid references auth.users(id) on delete set null;

-- Add the allowed-value check only if it does not already exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'readings_rate_review_status_check'
      and conrelid = 'public.readings'::regclass
  ) then
    alter table public.readings
      add constraint readings_rate_review_status_check
      check (rate_review_status in ('unreviewed','confirmed','corrected','dismissed'));
  end if;
end $$;
