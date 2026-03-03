-- Schedule tab support: community events table, trigger, and RLS policies.

create table if not exists public.community_events (
  id bigint generated always as identity primary key,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_all_day boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(title)) between 2 and 120),
  check (ends_at >= starts_at)
);

create index if not exists idx_community_events_starts_at
  on public.community_events (starts_at);

create index if not exists idx_community_events_created_by
  on public.community_events (created_by);

drop trigger if exists trg_community_events_set_updated_at on public.community_events;
create trigger trg_community_events_set_updated_at
before update on public.community_events
for each row
execute function public.set_updated_at();

alter table public.community_events enable row level security;

drop policy if exists community_events_select_authenticated on public.community_events;
create policy community_events_select_authenticated
on public.community_events
for select
to authenticated
using (true);

drop policy if exists community_events_insert_admin_only on public.community_events;
create policy community_events_insert_admin_only
on public.community_events
for insert
to authenticated
with check (public.is_admin());

drop policy if exists community_events_update_admin_only on public.community_events;
create policy community_events_update_admin_only
on public.community_events
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists community_events_delete_admin_only on public.community_events;
create policy community_events_delete_admin_only
on public.community_events
for delete
to authenticated
using (public.is_admin());

grant select, insert, update, delete on table public.community_events to authenticated;
