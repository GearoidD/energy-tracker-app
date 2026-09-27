-- GnóRate complete baseline schema
-- Intended for a fresh Supabase project. Keep future changes as migrations after this baseline.
create extension if not exists "pgcrypto";

create table companies (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  active_company_id uuid references companies(id) on delete set null,
  created_at timestamptz not null default now()
);
create table company_members (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now(), unique(company_id,user_id)
);
create table invites (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  used_at timestamptz, used_by uuid references auth.users(id)
);
create table accounts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  name text not null, provider text, account_number text, supplier_account_number text, fuel_type text not null default 'electricity' check (fuel_type in ('electricity','gas')),
  location text, contract_end date, rate numeric, standing_charge numeric, usage numeric, market_rate numeric, notes text,
  renewal_status text not null default 'not_started' check (renewal_status in ('not_started','quote_requested','switching','renewed')),
  dg_group text, mic_kva numeric, spc_kwh numeric, bill_delivery_method text, portal_login_email text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint accounts_company_account_number_unique unique(company_id,account_number)
);
create table readings (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade, reading_date date, usage numeric, rate numeric, standing_charge numeric,
  total_cost numeric, source text not null default 'manual', confidence text check (confidence in ('low','medium','high') or confidence is null),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint readings_account_date_unique unique(account_id,reading_date)
);
create table account_notes (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade, body text not null, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table benchmarks (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  fuel_type text not null default 'electricity', usage_min numeric default 0, usage_max numeric, typical_rate numeric not null,
  typical_standing_charge numeric, source_note text, source_type text not null default 'team_entry', source_date date, updated_at timestamptz not null default now()
);
create table suppliers (
  id uuid primary key default gen_random_uuid(), name text not null unique, fuel_types text[] not null default array['electricity']::text[],
  contact_email text, contact_phone text, accepts_email_quotes boolean not null default false, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table master_rates (
  id uuid primary key default gen_random_uuid(), fuel_type text not null, tariff_tier text, min_usage numeric, max_usage numeric,
  rate numeric not null, standing_charge numeric, capacity_charge numeric, supplier_id uuid references suppliers(id) on delete set null,
  note text, updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table rate_scan_queue (
  id uuid primary key default gen_random_uuid(), fuel_type text not null, tariff_tier text, rate numeric, capacity_charge numeric,
  supplier_id uuid references suppliers(id) on delete set null, source_note text, status text not null default 'pending' check(status in ('pending','confirmed','dismissed')),
  scanned_at timestamptz not null default now()
);

create index accounts_company_idx on accounts(company_id); create index accounts_contract_end_idx on accounts(contract_end);
create index readings_company_idx on readings(company_id); create index readings_account_date_idx on readings(account_id,reading_date desc);
create index notes_company_idx on account_notes(company_id); create index members_user_idx on company_members(user_id);

-- RLS helper: membership is the single source of truth for company access.
create or replace function public.is_company_member(target uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from company_members m where m.company_id=target and m.user_id=auth.uid());
$$;
create or replace function public.is_company_admin(target uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from company_members m where m.company_id=target and m.user_id=auth.uid() and m.role='admin');
$$;

alter table companies enable row level security; alter table profiles enable row level security; alter table company_members enable row level security;
alter table invites enable row level security; alter table accounts enable row level security; alter table readings enable row level security;
alter table account_notes enable row level security; alter table benchmarks enable row level security; alter table suppliers enable row level security;
alter table master_rates enable row level security; alter table rate_scan_queue enable row level security;

create policy companies_insert on companies for insert to authenticated with check(true);
create policy companies_select on companies for select to authenticated using(public.is_company_member(id));
create policy profiles_self on profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy members_select on company_members for select to authenticated using(public.is_company_member(company_id));
create policy members_insert on company_members for insert to authenticated with check(user_id=auth.uid() or public.is_company_admin(company_id));
create policy members_update on company_members for update to authenticated using(public.is_company_admin(company_id));
create policy members_delete on company_members for delete to authenticated using(public.is_company_admin(company_id));
create policy invites_select on invites for select to authenticated using(public.is_company_member(company_id));
create policy invites_insert on invites for insert to authenticated with check(public.is_company_admin(company_id));
create policy invites_update on invites for update to authenticated using(public.is_company_admin(company_id));

create policy accounts_company on accounts for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy readings_company on readings for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy notes_company on account_notes for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy benchmarks_company on benchmarks for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

-- Verified market data is readable by signed-in customers; writes are performed through trusted admin/service-role routes.
create policy suppliers_read on suppliers for select to authenticated using(true);
create policy master_rates_read on master_rates for select to authenticated using(true);
create policy rate_queue_submit on rate_scan_queue for insert to authenticated with check(status='pending');

comment on column benchmarks.source_type is 'Provenance category, e.g. supplier_quote, broker, regulator, comparison_site, team_entry.';
comment on table master_rates is 'Admin-confirmed market reference rates. Never describe unreviewed rate_scan_queue rows as verified.';
