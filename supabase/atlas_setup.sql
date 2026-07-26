begin;

create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 4) || '-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 4)),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('planner', 'requester')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table if not exists public.atlas_states (
  household_id uuid primary key references public.households(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.atlas_states enable row level security;

create or replace function public.is_atlas_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_atlas_household_member(uuid) from public;
grant execute on function public.is_atlas_household_member(uuid) to authenticated;

drop policy if exists "Members can view their household" on public.households;
create policy "Members can view their household"
on public.households
for select
to authenticated
using (public.is_atlas_household_member(id));

drop policy if exists "Members can view household members" on public.household_members;
create policy "Members can view household members"
on public.household_members
for select
to authenticated
using (public.is_atlas_household_member(household_id));

drop policy if exists "Members can view Atlas state" on public.atlas_states;
create policy "Members can view Atlas state"
on public.atlas_states
for select
to authenticated
using (public.is_atlas_household_member(household_id));

drop policy if exists "Members can create Atlas state" on public.atlas_states;
create policy "Members can create Atlas state"
on public.atlas_states
for insert
to authenticated
with check (
  public.is_atlas_household_member(household_id)
  and updated_by = auth.uid()
);

drop policy if exists "Members can update Atlas state" on public.atlas_states;
create policy "Members can update Atlas state"
on public.atlas_states
for update
to authenticated
using (public.is_atlas_household_member(household_id))
with check (
  public.is_atlas_household_member(household_id)
  and updated_by = auth.uid()
);

grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update on public.atlas_states to authenticated;

create or replace function public.create_atlas_household(
  p_display_name text,
  p_household_name text default 'Atlas Household'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household public.households;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_display_name), '') is null then
    raise exception 'Your name is required.';
  end if;

  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'This account already belongs to a household.';
  end if;

  insert into public.households (name, created_by)
  values (coalesce(nullif(trim(p_household_name), ''), 'Atlas Household'), auth.uid())
  returning * into v_household;

  insert into public.household_members (household_id, user_id, display_name, role)
  values (v_household.id, auth.uid(), trim(p_display_name), 'planner');

  return jsonb_build_object(
    'household_id', v_household.id,
    'invite_code', v_household.invite_code
  );
end;
$$;

create or replace function public.join_atlas_household(
  p_display_name text,
  p_invite_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household public.households;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_display_name), '') is null then
    raise exception 'Your name is required.';
  end if;

  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'This account already belongs to a household.';
  end if;

  select *
  into v_household
  from public.households
  where invite_code = upper(trim(p_invite_code));

  if v_household.id is null then
    raise exception 'That household invite code is not valid.';
  end if;

  insert into public.household_members (household_id, user_id, display_name, role)
  values (v_household.id, auth.uid(), trim(p_display_name), 'requester');

  return jsonb_build_object('household_id', v_household.id);
end;
$$;

revoke all on function public.create_atlas_household(text, text) from public;
revoke all on function public.join_atlas_household(text, text) from public;
grant execute on function public.create_atlas_household(text, text) to authenticated;
grant execute on function public.join_atlas_household(text, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'atlas_states'
  ) then
    alter publication supabase_realtime add table public.atlas_states;
  end if;
end;
$$;

commit;
