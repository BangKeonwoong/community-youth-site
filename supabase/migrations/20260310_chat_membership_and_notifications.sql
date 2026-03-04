-- Chat membership + notification infrastructure.

create table if not exists public.chat_room_members (
  room_id bigint not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint chat_room_members_role_check check (role in ('owner', 'member'))
);

create index if not exists idx_chat_room_members_user_id
  on public.chat_room_members (user_id);

create index if not exists idx_chat_room_members_room_role
  on public.chat_room_members (room_id, role);

insert into public.chat_room_members (room_id, user_id, role, joined_at, last_read_at)
select
  r.id,
  r.created_by,
  'owner',
  coalesce(r.created_at, now()),
  coalesce(r.last_message_at, r.created_at, now())
from public.chat_rooms r
where r.created_by is not null
on conflict (room_id, user_id)
do update
set role = 'owner',
    joined_at = least(public.chat_room_members.joined_at, excluded.joined_at),
    last_read_at = greatest(public.chat_room_members.last_read_at, excluded.last_read_at);

insert into public.chat_room_members (room_id, user_id, role, joined_at, last_read_at)
select
  m.room_id,
  m.author_id,
  'member',
  min(m.created_at),
  max(m.created_at)
from public.chat_messages m
group by m.room_id, m.author_id
on conflict (room_id, user_id) do nothing;

create or replace function public.ensure_chat_room_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_room_members (room_id, user_id, role, joined_at, last_read_at)
  values (
    new.id,
    new.created_by,
    'owner',
    coalesce(new.created_at, now()),
    coalesce(new.last_message_at, new.created_at, now())
  )
  on conflict (room_id, user_id)
  do update
  set role = 'owner',
      joined_at = least(public.chat_room_members.joined_at, excluded.joined_at),
      last_read_at = greatest(public.chat_room_members.last_read_at, excluded.last_read_at);

  return new;
end;
$$;

create or replace function public.is_chat_room_member(
  p_room_id bigint,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_room_members crm
    where crm.room_id = p_room_id
      and crm.user_id = coalesce(p_user_id, auth.uid())
  );
$$;

create or replace function public.is_chat_room_owner(
  p_room_id bigint,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_room_members crm
    where crm.room_id = p_room_id
      and crm.user_id = coalesce(p_user_id, auth.uid())
      and crm.role = 'owner'
  );
$$;

revoke all on function public.is_chat_room_member(bigint, uuid) from public;
revoke all on function public.is_chat_room_owner(bigint, uuid) from public;
grant execute on function public.is_chat_room_member(bigint, uuid) to authenticated, service_role;
grant execute on function public.is_chat_room_owner(bigint, uuid) to authenticated, service_role;

revoke all on function public.ensure_chat_room_creator_membership() from public;
grant execute on function public.ensure_chat_room_creator_membership() to service_role;

drop trigger if exists trg_chat_rooms_ensure_creator_membership on public.chat_rooms;
create trigger trg_chat_rooms_ensure_creator_membership
after insert on public.chat_rooms
for each row
execute function public.ensure_chat_room_creator_membership();

alter table public.chat_room_members enable row level security;

drop policy if exists chat_room_members_select_member_or_admin on public.chat_room_members;
create policy chat_room_members_select_member_or_admin
on public.chat_room_members
for select
to authenticated
using (
  public.is_admin()
  or public.is_chat_room_member(room_id)
);

drop policy if exists chat_room_members_insert_self_or_admin on public.chat_room_members;
create policy chat_room_members_insert_self_or_admin
on public.chat_room_members
for insert
to authenticated
with check (
  public.is_admin()
  or (
    user_id = auth.uid()
    and role = 'member'
  )
);

drop policy if exists chat_room_members_insert_owner_manage on public.chat_room_members;
create policy chat_room_members_insert_owner_manage
on public.chat_room_members
for insert
to authenticated
with check (
  public.is_chat_room_owner(room_id)
);

drop policy if exists chat_room_members_update_self_or_admin on public.chat_room_members;
create policy chat_room_members_update_self_or_admin
on public.chat_room_members
for update
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
)
with check (
  public.is_admin()
  or (
    user_id = auth.uid()
    and role = 'member'
  )
);

drop policy if exists chat_room_members_update_owner_manage on public.chat_room_members;
create policy chat_room_members_update_owner_manage
on public.chat_room_members
for update
to authenticated
using (
  public.is_chat_room_owner(room_id)
)
with check (
  public.is_chat_room_owner(room_id)
);

drop policy if exists chat_room_members_delete_self_or_admin on public.chat_room_members;
create policy chat_room_members_delete_self_or_admin
on public.chat_room_members
for delete
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
);

drop policy if exists chat_room_members_delete_owner_manage on public.chat_room_members;
create policy chat_room_members_delete_owner_manage
on public.chat_room_members
for delete
to authenticated
using (
  public.is_chat_room_owner(room_id)
);

grant select, insert, update, delete on table public.chat_room_members to authenticated;

-- tighten chat room and chat message access to room membership

drop policy if exists chat_rooms_select_authenticated on public.chat_rooms;
drop policy if exists chat_rooms_select_member_or_admin on public.chat_rooms;
create policy chat_rooms_select_member_or_admin
on public.chat_rooms
for select
to authenticated
using (
  public.is_admin()
  or public.is_chat_room_member(id)
);

drop policy if exists chat_rooms_insert_authenticated on public.chat_rooms;
drop policy if exists chat_rooms_insert_self_or_admin on public.chat_rooms;
create policy chat_rooms_insert_self_or_admin
on public.chat_rooms
for insert
to authenticated
with check (
  created_by = auth.uid()
  or public.is_admin()
);

drop policy if exists chat_rooms_update_owner_or_admin on public.chat_rooms;
drop policy if exists chat_rooms_update_owner_member_or_admin on public.chat_rooms;
create policy chat_rooms_update_owner_member_or_admin
on public.chat_rooms
for update
to authenticated
using (
  public.is_admin()
  or public.is_chat_room_owner(id)
)
with check (
  public.is_admin()
  or public.is_chat_room_owner(id)
);

drop policy if exists chat_rooms_delete_owner_or_admin on public.chat_rooms;
drop policy if exists chat_rooms_delete_owner_member_or_admin on public.chat_rooms;
create policy chat_rooms_delete_owner_member_or_admin
on public.chat_rooms
for delete
to authenticated
using (
  public.is_admin()
  or public.is_chat_room_owner(id)
);

drop policy if exists chat_messages_select_authenticated on public.chat_messages;
drop policy if exists chat_messages_select_member_or_admin on public.chat_messages;
create policy chat_messages_select_member_or_admin
on public.chat_messages
for select
to authenticated
using (
  public.is_admin()
  or public.is_chat_room_member(room_id)
);

drop policy if exists chat_messages_insert_self on public.chat_messages;
drop policy if exists chat_messages_insert_member_or_admin on public.chat_messages;
create policy chat_messages_insert_member_or_admin
on public.chat_messages
for insert
to authenticated
with check (
  public.is_admin()
  or (
    author_id = auth.uid()
    and public.is_chat_room_member(room_id)
  )
);

drop policy if exists chat_messages_update_author_or_admin on public.chat_messages;
drop policy if exists chat_messages_update_member_or_admin on public.chat_messages;
create policy chat_messages_update_member_or_admin
on public.chat_messages
for update
to authenticated
using (
  public.is_admin()
  or (
    author_id = auth.uid()
    and public.is_chat_room_member(room_id)
  )
)
with check (
  public.is_admin()
  or (
    author_id = auth.uid()
    and public.is_chat_room_member(room_id)
  )
);

create table if not exists public.profile_notification_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  in_app_enabled boolean not null default true,
  browser_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  schedule_enabled boolean not null default true,
  meetup_enabled boolean not null default true,
  chat_enabled boolean not null default true,
  message_enabled boolean not null default true,
  birthday_daily_enabled boolean not null default true,
  birthday_message_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.profile_notification_settings (profile_id)
select p.id
from public.profiles p
on conflict (profile_id) do nothing;

drop trigger if exists trg_profile_notification_settings_set_updated_at on public.profile_notification_settings;
create trigger trg_profile_notification_settings_set_updated_at
before update on public.profile_notification_settings
for each row
execute function public.set_updated_at();

alter table public.profile_notification_settings enable row level security;

drop policy if exists profile_notification_settings_select_self_or_admin on public.profile_notification_settings;
create policy profile_notification_settings_select_self_or_admin
on public.profile_notification_settings
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_admin()
);

drop policy if exists profile_notification_settings_insert_self_or_admin on public.profile_notification_settings;
create policy profile_notification_settings_insert_self_or_admin
on public.profile_notification_settings
for insert
to authenticated
with check (
  profile_id = auth.uid()
  or public.is_admin()
);

drop policy if exists profile_notification_settings_update_self_or_admin on public.profile_notification_settings;
create policy profile_notification_settings_update_self_or_admin
on public.profile_notification_settings
for update
to authenticated
using (
  profile_id = auth.uid()
  or public.is_admin()
)
with check (
  profile_id = auth.uid()
  or public.is_admin()
);

create or replace function public.ensure_profile_notification_settings(p_profile uuid)
returns public.profile_notification_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.profile_notification_settings%rowtype;
begin
  if p_profile is null then
    raise exception 'PROFILE_REQUIRED';
  end if;

  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if auth.uid() <> p_profile and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.profile_notification_settings (profile_id)
  values (p_profile)
  on conflict (profile_id) do nothing;

  select *
    into v_settings
  from public.profile_notification_settings
  where profile_id = p_profile;

  return v_settings;
end;
$$;

revoke all on function public.ensure_profile_notification_settings(uuid) from public;
grant execute on function public.ensure_profile_notification_settings(uuid) to authenticated, service_role;

grant select, insert, update on table public.profile_notification_settings to authenticated;

create table if not exists public.web_push_subscriptions (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_web_push_subscriptions_profile_endpoint
  on public.web_push_subscriptions (profile_id, endpoint);

create index if not exists idx_web_push_subscriptions_profile_active
  on public.web_push_subscriptions (profile_id, is_active)
  where is_active = true;

drop trigger if exists trg_web_push_subscriptions_set_updated_at on public.web_push_subscriptions;
create trigger trg_web_push_subscriptions_set_updated_at
before update on public.web_push_subscriptions
for each row
execute function public.set_updated_at();

alter table public.web_push_subscriptions enable row level security;

drop policy if exists web_push_subscriptions_select_own_or_admin on public.web_push_subscriptions;
create policy web_push_subscriptions_select_own_or_admin
on public.web_push_subscriptions
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_admin()
);

drop policy if exists web_push_subscriptions_insert_self_or_admin on public.web_push_subscriptions;
create policy web_push_subscriptions_insert_self_or_admin
on public.web_push_subscriptions
for insert
to authenticated
with check (
  profile_id = auth.uid()
  or public.is_admin()
);

drop policy if exists web_push_subscriptions_update_self_or_admin on public.web_push_subscriptions;
create policy web_push_subscriptions_update_self_or_admin
on public.web_push_subscriptions
for update
to authenticated
using (
  profile_id = auth.uid()
  or public.is_admin()
)
with check (
  profile_id = auth.uid()
  or public.is_admin()
);

drop policy if exists web_push_subscriptions_delete_self_or_admin on public.web_push_subscriptions;
create policy web_push_subscriptions_delete_self_or_admin
on public.web_push_subscriptions
for delete
to authenticated
using (
  profile_id = auth.uid()
  or public.is_admin()
);

grant select, insert, update, delete on table public.web_push_subscriptions to authenticated;

-- identity sequence grant for authenticated inserts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'web_push_subscriptions_id_seq'
  ) THEN
    EXECUTE 'grant usage, select on sequence public.web_push_subscriptions_id_seq to authenticated';
  END IF;
END;
$$;

create table if not exists public.notification_daily_delivery_log (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  date_key date not null,
  notification_type text not null,
  delivered_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (profile_id, date_key, notification_type)
);

create index if not exists idx_notification_daily_delivery_log_date_type
  on public.notification_daily_delivery_log (date_key, notification_type);

alter table public.birthday_messages
  add column if not exists message_context text;

update public.birthday_messages
set message_context = 'birthday'
where message_context is null;

alter table public.birthday_messages
  alter column message_context set default 'birthday';

alter table public.birthday_messages
  alter column message_context set not null;

alter table public.birthday_messages
  drop constraint if exists birthday_messages_message_context_check;

alter table public.birthday_messages
  add constraint birthday_messages_message_context_check
  check (message_context in ('birthday', 'direct'));
