-- GnóRate procurement + market intelligence additions. Safe additive migration.
create table if not exists procurement_requests (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade, status text not null default 'draft' check(status in ('draft','open','quotes_received','awarded','closed','cancelled')),
  closes_at timestamptz, notes text, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists procurement_requests_company_idx on procurement_requests(company_id,created_at desc);
alter table procurement_requests enable row level security;
create policy procurement_requests_company on procurement_requests for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

alter table quote_offers add column if not exists procurement_request_id uuid references procurement_requests(id) on delete set null;
alter table quote_offers add column if not exists supplier_id uuid references suppliers(id) on delete set null;
alter table quote_offers add column if not exists accepted_at timestamptz;
alter table quote_offers add column if not exists accepted_by uuid references auth.users(id) on delete set null;
alter table quote_offers add column if not exists terms_url text;
alter table quote_offers add column if not exists authority_confirmed boolean not null default false;
alter table quote_offers add column if not exists commission_disclosure text;

create table if not exists market_snapshots (
  id uuid primary key default gen_random_uuid(), snapshot_date date not null unique,
  sem_day_ahead_eur_mwh numeric, sem_change_7d_pct numeric, gas_eur_mwh numeric, gas_change_7d_pct numeric,
  brent_usd_bbl numeric, brent_change_7d_pct numeric, carbon_eur_t numeric, carbon_change_7d_pct numeric,
  eur_usd numeric, pressure_score numeric, pressure_label text,
  narrative text, source_meta jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table market_snapshots enable row level security;
create policy market_snapshots_read on market_snapshots for select to authenticated using(true);
comment on table market_snapshots is 'Daily evidence-led market indicators. pressure_score is a directional signal, not a retail-price forecast.';
