create table public.plex_fran_notes (
 id uuid primary key default gen_random_uuid(),payload text not null,
 revision integer not null default 1,updated_at timestamptz not null default now()
);
alter table public.plex_fran_notes enable row level security;
revoke all on public.plex_fran_notes from anon,authenticated;
grant all on public.plex_fran_notes to service_role;
create policy plex_fran_deny_direct_access on public.plex_fran_notes to anon,authenticated using(false) with check(false);
create table public.plex_fran_activity (
 id integer primary key check(id=1),activity_date date not null,
 touched_at timestamptz not null default now()
);
alter table public.plex_fran_activity enable row level security;
revoke all on public.plex_fran_activity from anon,authenticated;
create policy plex_fran_deny_direct_access on public.plex_fran_activity to anon,authenticated using(false) with check(false);
insert into public.plex_fran_activity(id,activity_date) values(1,current_date);
create or replace function public.plex_fran_save_account(
 p_id uuid,p_revision integer,p_payload text,p_number integer,p_email_hash text,
 p_person_payload text,p_person_hash text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare saved_id uuid;
begin
 if p_id is null then
  insert into public.plex_fran_accounts(payload,account_number,email_hash)
   values(p_payload,p_number,p_email_hash) returning id into saved_id;
 else
  update public.plex_fran_accounts set payload=p_payload,account_number=p_number,
   email_hash=p_email_hash,revision=revision+1,updated_at=now()
   where id=p_id and revision=p_revision returning id into saved_id;
  if saved_id is null then raise exception 'stale_revision' using errcode='P0001'; end if;
 end if;
 if p_person_payload is not null then
  insert into public.plex_fran_people(payload,name_hash)
   values(p_person_payload,p_person_hash) on conflict(name_hash) do nothing;
 end if;
 return saved_id;
end;
$$;
revoke all on function public.plex_fran_save_account(uuid,integer,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.plex_fran_save_account(uuid,integer,text,integer,text,text,text) to service_role;
create or replace function public.plex_fran_save_person(
 p_id uuid,p_revision integer,p_payload text,p_name_hash text,p_accounts jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare saved_id uuid; item jsonb; updated_id uuid;
begin
 update public.plex_fran_people set payload=p_payload,name_hash=p_name_hash,
  revision=revision+1,updated_at=now() where id=p_id and revision=p_revision returning id into saved_id;
 if saved_id is null then raise exception 'stale_revision' using errcode='P0001'; end if;
 for item in select value from jsonb_array_elements(p_accounts) loop
  update public.plex_fran_accounts set payload=item->>'payload',revision=revision+1,updated_at=now()
   where id=(item->>'id')::uuid and revision=(item->>'revision')::integer returning id into updated_id;
  if updated_id is null then raise exception 'stale_revision' using errcode='P0001'; end if;
 end loop;
 return saved_id;
end;
$$;
revoke all on function public.plex_fran_save_person(uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.plex_fran_save_person(uuid,integer,text,text,jsonb) to service_role;
