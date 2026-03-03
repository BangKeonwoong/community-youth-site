-- Public invite profile details, birthday messages, and birthday helper RPCs.

alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists phone_number text,
  add column if not exists gender text;

alter table public.profiles
  drop constraint if exists profiles_gender_check;

alter table public.profiles
  add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female'));

alter table public.profiles
  drop constraint if exists profiles_phone_number_check;

alter table public.profiles
  add constraint profiles_phone_number_check
  check (phone_number is null or phone_number ~ '^01[016789][0-9]{7,8}$');

alter table public.profiles
  drop constraint if exists profiles_birth_date_check;

alter table public.profiles
  add constraint profiles_birth_date_check
  check (birth_date is null or birth_date <= (timezone('Asia/Seoul', now()))::date);

create table if not exists public.birthday_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.birthday_messages
  drop constraint if exists birthday_messages_content_length_check;

alter table public.birthday_messages
  add constraint birthday_messages_content_length_check
  check (char_length(btrim(content)) between 1 and 500);

alter table public.birthday_messages
  drop constraint if exists birthday_messages_sender_receiver_check;

alter table public.birthday_messages
  add constraint birthday_messages_sender_receiver_check
  check (sender_id <> receiver_id);

create index if not exists idx_birthday_messages_sender_id
  on public.birthday_messages (sender_id);
create index if not exists idx_birthday_messages_receiver_id
  on public.birthday_messages (receiver_id);
create index if not exists idx_birthday_messages_created_at
  on public.birthday_messages (created_at desc);

alter table public.birthday_messages enable row level security;

drop policy if exists birthday_messages_select_receiver_sender_admin on public.birthday_messages;
create policy birthday_messages_select_receiver_sender_admin
on public.birthday_messages
for select
to authenticated
using (
  receiver_id = auth.uid()
  or sender_id = auth.uid()
  or public.is_admin()
);

drop policy if exists birthday_messages_insert_sender_only on public.birthday_messages;
create policy birthday_messages_insert_sender_only
on public.birthday_messages
for insert
to authenticated
with check (sender_id = auth.uid());

drop policy if exists birthday_messages_update_receiver_or_admin on public.birthday_messages;
create policy birthday_messages_update_receiver_or_admin
on public.birthday_messages
for update
to authenticated
using (receiver_id = auth.uid() or public.is_admin())
with check (receiver_id = auth.uid() or public.is_admin());

drop policy if exists birthday_messages_delete_admin_only on public.birthday_messages;
create policy birthday_messages_delete_admin_only
on public.birthday_messages
for delete
to authenticated
using (public.is_admin());

grant select, insert, update, delete on table public.birthday_messages to authenticated;

drop function if exists public.redeem_invite_code(text, text);
drop function if exists public.bootstrap_owner_profile(text);

create or replace function public.upsert_profile_details(
  p_display_name text,
  p_birth_date date,
  p_phone_number text,
  p_gender text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_birth_date date := p_birth_date;
  v_phone_number text := nullif(regexp_replace(coalesce(p_phone_number, ''), '[^0-9]', '', 'g'), '');
  v_gender text := lower(nullif(btrim(coalesce(p_gender, '')), ''));
  v_today date := (timezone('Asia/Seoul', now()))::date;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_display_name is null or char_length(v_display_name) < 2 or char_length(v_display_name) > 40 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  if v_birth_date is null or v_phone_number is null or v_gender is null then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if v_birth_date > v_today then
    raise exception 'INVALID_BIRTH_DATE';
  end if;

  if v_phone_number !~ '^01[016789][0-9]{7,8}$' then
    raise exception 'INVALID_PHONE_NUMBER';
  end if;

  if v_gender not in ('male', 'female') then
    raise exception 'INVALID_GENDER';
  end if;

  insert into public.profiles (id, display_name, birth_date, phone_number, gender)
  values (v_user_id, v_display_name, v_birth_date, v_phone_number, v_gender)
  on conflict (id)
  do update
    set display_name = excluded.display_name,
        birth_date = excluded.birth_date,
        phone_number = excluded.phone_number,
        gender = excluded.gender,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.redeem_invite_code(
  p_code text,
  p_display_name text default null,
  p_birth_date date default null,
  p_phone_number text default null,
  p_gender text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_code text;
  v_display_name text;
  v_birth_date date := p_birth_date;
  v_phone_number text := nullif(regexp_replace(coalesce(p_phone_number, ''), '[^0-9]', '', 'g'), '');
  v_gender text := lower(nullif(btrim(coalesce(p_gender, '')), ''));
  v_invite public.invite_codes%rowtype;
  v_profile public.profiles%rowtype;
  v_now timestamptz := now();
  v_today date := (timezone('Asia/Seoul', now()))::date;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));
  if v_code = '' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  select *
    into v_invite
  from public.invite_codes
  where code = v_code
  for update;

  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'INVITE_REVOKED';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < v_now then
    raise exception 'INVITE_EXPIRED';
  end if;

  if v_invite.used_count >= v_invite.max_uses then
    raise exception 'INVITE_USAGE_EXCEEDED';
  end if;

  if exists (
    select 1
    from public.invite_code_redemptions r
    where r.user_id = v_user_id
  ) or exists (
    select 1
    from public.invite_codes i
    where i.redeemed_by = v_user_id
      and i.is_redeemed = true
  ) then
    raise exception 'USER_ALREADY_REDEEMED';
  end if;

  select u.email
    into v_user_email
  from auth.users u
  where u.id = v_user_id;

  if v_invite.invited_email is not null
     and lower(v_invite.invited_email) <> lower(coalesce(v_user_email, '')) then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;

  v_display_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_display_name is null then
    v_display_name := nullif(btrim(v_invite.invited_name), '');
  end if;
  if v_display_name is null then
    v_display_name := '새가족';
  end if;

  if v_birth_date is null or v_phone_number is null or v_gender is null then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if char_length(v_display_name) < 2 or char_length(v_display_name) > 40 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  if v_birth_date > v_today then
    raise exception 'INVALID_BIRTH_DATE';
  end if;

  if v_phone_number !~ '^01[016789][0-9]{7,8}$' then
    raise exception 'INVALID_PHONE_NUMBER';
  end if;

  if v_gender not in ('male', 'female') then
    raise exception 'INVALID_GENDER';
  end if;

  insert into public.profiles (id, display_name, birth_date, phone_number, gender)
  values (v_user_id, v_display_name, v_birth_date, v_phone_number, v_gender)
  on conflict (id)
  do update
    set display_name = case
      when nullif(btrim(public.profiles.display_name), '') is null then excluded.display_name
      else public.profiles.display_name
    end,
    birth_date = excluded.birth_date,
    phone_number = excluded.phone_number,
    gender = excluded.gender,
    updated_at = now()
  returning * into v_profile;

  begin
    insert into public.invite_code_redemptions (invite_code_id, user_id, redeemed_at)
    values (v_invite.id, v_user_id, v_now);
  exception
    when unique_violation then
      raise exception 'USER_ALREADY_REDEEMED';
  end;

  update public.invite_codes
  set used_count = used_count + 1,
      is_redeemed = (used_count + 1) >= max_uses,
      redeemed_by = case when (used_count + 1) >= max_uses then v_user_id else null end,
      redeemed_at = case when (used_count + 1) >= max_uses then v_now else null end,
      updated_at = v_now
  where id = v_invite.id
    and used_count < max_uses;

  if not found then
    raise exception 'INVITE_USAGE_EXCEEDED';
  end if;

  return v_profile;
end;
$$;

create or replace function public.bootstrap_owner_profile(
  p_display_name text default null,
  p_birth_date date default null,
  p_phone_number text default null,
  p_gender text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_name text;
  v_birth_date date := p_birth_date;
  v_phone_number text := nullif(regexp_replace(coalesce(p_phone_number, ''), '[^0-9]', '', 'g'), '');
  v_gender text := lower(nullif(btrim(coalesce(p_gender, '')), ''));
  v_today date := (timezone('Asia/Seoul', now()))::date;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if exists (select 1 from public.profiles) then
    raise exception 'BOOTSTRAP_ALREADY_COMPLETED';
  end if;

  v_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_name is null then
    v_name := '관리자';
  end if;

  if v_birth_date is null or v_phone_number is null or v_gender is null then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  if v_birth_date > v_today then
    raise exception 'INVALID_BIRTH_DATE';
  end if;

  if v_phone_number !~ '^01[016789][0-9]{7,8}$' then
    raise exception 'INVALID_PHONE_NUMBER';
  end if;

  if v_gender not in ('male', 'female') then
    raise exception 'INVALID_GENDER';
  end if;

  insert into public.profiles (id, display_name, birth_date, phone_number, gender, is_admin)
  values (v_user_id, v_name, v_birth_date, v_phone_number, v_gender, true)
  on conflict (id)
  do update
    set display_name = excluded.display_name,
        birth_date = excluded.birth_date,
        phone_number = excluded.phone_number,
        gender = excluded.gender,
        is_admin = true,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.list_upcoming_birthdays(
  p_days integer default 7
)
returns table (
  id uuid,
  display_name text,
  birth_date date,
  next_birthday date,
  days_until integer,
  is_today boolean
)
language sql
stable
security definer
set search_path = public
as $$
with params as (
  select
    (timezone('Asia/Seoul', now()))::date as base_date,
    greatest(coalesce(p_days, 7), 0) as day_limit
),
base as (
  select
    p.id,
    p.display_name,
    p.birth_date,
    extract(month from p.birth_date)::integer as birth_month,
    extract(day from p.birth_date)::integer as birth_day,
    params.base_date,
    params.day_limit,
    extract(year from params.base_date)::integer as base_year
  from public.profiles p
  cross join params
  where p.birth_date is not null
),
calculated as (
  select
    id,
    display_name,
    birth_date,
    base_date,
    day_limit,
    case
      when birth_month = 2 and birth_day = 29 then
        make_date(
          base_year,
          2,
          case
            when mod(base_year, 400) = 0 or (mod(base_year, 4) = 0 and mod(base_year, 100) <> 0) then 29
            else 28
          end
        )
      else make_date(base_year, birth_month, birth_day)
    end as birthday_this_year,
    birth_month,
    birth_day,
    base_year
  from base
),
next_dates as (
  select
    id,
    display_name,
    birth_date,
    base_date,
    day_limit,
    case
      when birthday_this_year >= base_date then birthday_this_year
      when birth_month = 2 and birth_day = 29 then
        make_date(
          base_year + 1,
          2,
          case
            when mod(base_year + 1, 400) = 0 or (mod(base_year + 1, 4) = 0 and mod(base_year + 1, 100) <> 0) then 29
            else 28
          end
        )
      else make_date(base_year + 1, birth_month, birth_day)
    end as next_birthday
  from calculated
)
select
  id,
  display_name,
  birth_date,
  next_birthday,
  (next_birthday - base_date)::integer as days_until,
  next_birthday = base_date as is_today
from next_dates
where (next_birthday - base_date)::integer between 0 and day_limit
order by days_until asc, display_name asc;
$$;

create or replace function public.send_birthday_message(
  p_receiver_id uuid,
  p_content text
)
returns public.birthday_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.birthday_messages%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_receiver_id
  ) then
    raise exception 'RECEIVER_NOT_FOUND';
  end if;

  if v_content = '' or char_length(v_content) > 500 then
    raise exception 'INVALID_MESSAGE_CONTENT';
  end if;

  if not exists (
    select 1
    from public.list_upcoming_birthdays(7) b
    where b.id = p_receiver_id
  ) then
    raise exception 'BIRTHDAY_WINDOW_ONLY';
  end if;

  insert into public.birthday_messages (sender_id, receiver_id, content)
  values (v_user_id, p_receiver_id, v_content)
  returning * into v_message;

  return v_message;
end;
$$;

create or replace function public.mark_birthday_message_read(
  p_message_id bigint
)
returns public.birthday_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.birthday_messages%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
    into v_message
  from public.birthday_messages
  where id = p_message_id
  for update;

  if not found then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;

  if v_message.receiver_id <> v_user_id and not public.is_admin(v_user_id) then
    raise exception 'MESSAGE_ACCESS_DENIED';
  end if;

  update public.birthday_messages
  set read_at = coalesce(read_at, now())
  where id = p_message_id
  returning * into v_message;

  return v_message;
end;
$$;

revoke all on function public.upsert_profile_details(text, date, text, text) from public;
grant execute on function public.upsert_profile_details(text, date, text, text) to authenticated;

revoke all on function public.redeem_invite_code(text, text, date, text, text) from public;
grant execute on function public.redeem_invite_code(text, text, date, text, text) to authenticated;

revoke all on function public.bootstrap_owner_profile(text, date, text, text) from public;
grant execute on function public.bootstrap_owner_profile(text, date, text, text) to authenticated;

revoke all on function public.list_upcoming_birthdays(integer) from public;
grant execute on function public.list_upcoming_birthdays(integer) to authenticated;

revoke all on function public.send_birthday_message(uuid, text) from public;
grant execute on function public.send_birthday_message(uuid, text) to authenticated;

revoke all on function public.mark_birthday_message_read(bigint) from public;
grant execute on function public.mark_birthday_message_read(bigint) to authenticated;
