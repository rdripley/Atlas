create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  notify_new_requests boolean not null default true,
  notify_daily_summary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_household_id_idx
  on public.push_subscriptions (household_id);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions'
      and policyname = 'Members can view their notification devices'
  ) then
    create policy "Members can view their notification devices"
    on public.push_subscriptions
    for select
    to authenticated
    using (user_id = auth.uid() and public.is_atlas_household_member(household_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions'
      and policyname = 'Members can add their notification devices'
  ) then
    create policy "Members can add their notification devices"
    on public.push_subscriptions
    for insert
    to authenticated
    with check (user_id = auth.uid() and public.is_atlas_household_member(household_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions'
      and policyname = 'Members can update their notification devices'
  ) then
    create policy "Members can update their notification devices"
    on public.push_subscriptions
    for update
    to authenticated
    using (user_id = auth.uid() and public.is_atlas_household_member(household_id))
    with check (user_id = auth.uid() and public.is_atlas_household_member(household_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions'
      and policyname = 'Members can remove their notification devices'
  ) then
    create policy "Members can remove their notification devices"
    on public.push_subscriptions
    for delete
    to authenticated
    using (user_id = auth.uid() and public.is_atlas_household_member(household_id));
  end if;
end
$$;

grant select, insert, update, delete on public.push_subscriptions to authenticated;
