-- Documentation of the deployed schema. Do not run over existing tables.
create table public.plex_fran_accounts (
 id uuid primary key default gen_random_uuid(), payload text not null,
 revision integer not null default 1, updated_at timestamptz not null default now(),
 account_number integer not null unique, email_hash text not null unique
);
create table public.plex_fran_people (
 id uuid primary key default gen_random_uuid(), payload text not null,
 revision integer not null default 1, updated_at timestamptz not null default now(),
 name_hash text not null unique
);
alter table public.plex_fran_accounts enable row level security;
alter table public.plex_fran_people enable row level security;
revoke all on public.plex_fran_accounts,public.plex_fran_people from anon,authenticated;
grant all on public.plex_fran_accounts,public.plex_fran_people to service_role;
create policy plex_fran_deny_direct_access on public.plex_fran_accounts to anon,authenticated using(false) with check(false);
create policy plex_fran_deny_direct_access on public.plex_fran_people to anon,authenticated using(false) with check(false);
-- The automatic RLS event trigger is internal; do not expose its function.
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
