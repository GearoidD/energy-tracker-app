-- Run this entire file once in the Supabase SQL Editor (Project > SQL Editor > New query)

create extension if not exists "pgcrypto";

-- One row per company / team using the tracker
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- One row per user, linking them to a company. Extends Supabase's built-in auth.users.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  email text,
  role text default 'member', -- 'admin' or 'member'
  created_at timestamptz default now()
);

-- The energy accounts themselves
create table accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  provider text,
  account_number text,
  fuel_type text default 'electricity',
  contract_end date,
  rate numeric,
  standing_charge numeric,
  usage numeric,
  market_rate numeric,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User-maintained market rate benchmarks. Not a live quote feed — this is
-- "what we believe typical rates look like right now", entered by your team
-- from whatever source you trust (a broker call, a comparison site, CRU/Ofgem
-- published averages), and used to estimate savings for any account that
-- doesn't yet have a real quote in market_rate.
create table benchmarks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade not null,
  fuel_type text default 'electricity',
  usage_min numeric default 0,
  usage_max numeric, -- leave blank for "no upper limit"
  typical_rate numeric not null,
  typical_standing_charge numeric,
  source_note text,
  updated_at timestamptz default now()
);

-- Row Level Security: every table is locked down by default, then we open
-- narrow, specific holes. This is what makes it safe for multiple companies
-- to share one database without seeing each other's data.

alter table companies enable row level security;
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table benchmarks enable row level security;

-- Companies: any logged-in user can create one (happens once, at signup).
-- Everyone can only ever SEE the company they belong to.
create policy "companies_insert_authenticated" on companies
  for insert with check (auth.uid() is not null);

create policy "companies_select_own" on companies
  for select using (
    id in (select company_id from profiles where id = auth.uid())
  );

-- Profiles: users can create their own profile row, see profiles in their
-- own company (for a future "team members" view), and update their own.
create policy "profiles_insert_self" on profiles
  for insert with check (id = auth.uid());

create policy "profiles_select_own_company" on profiles
  for select using (
    company_id in (select company_id from profiles where id = auth.uid())
  );

create policy "profiles_update_self" on profiles
  for update using (id = auth.uid());

-- Accounts: fully scoped to company_id. A user can only read/write/delete
-- accounts belonging to the company their profile is attached to.
create policy "accounts_select_company" on accounts
  for select using (
    company_id in (select company_id from profiles where id = auth.uid())
  );

create policy "accounts_insert_company" on accounts
  for insert with check (
    company_id in (select company_id from profiles where id = auth.uid())
  );

create policy "accounts_update_company" on accounts
  for update using (
    company_id in (select company_id from profiles where id = auth.uid())
  );

create policy "accounts_delete_company" on accounts
  for delete using (
    company_id in (select company_id from profiles where id = auth.uid())
  );
