-- Login ID based auth support and member type profile field.

alter table public.profiles
  add column if not exists login_id text,
  add column if not exists member_type text;

create or replace function public.normalize_login_id(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    substring(
      regexp_replace(lower(btrim(coalesce(p_value, ''))), '[^a-z0-9._-]+', '', 'g')
      from 1 for 20
    ),
    ''
  );
$$;

create or replace function public.claim_unique_login_id(
  p_user_id uuid,
  p_seed text,
  p_fallback text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
  v_counter integer := 1;
  v_suffix text;
begin
  v_base := public.normalize_login_id(p_seed);

  if v_base is null then
    v_base := public.normalize_login_id(p_fallback);
  end if;

  if v_base is null then
    v_base := 'user' || substring(replace(coalesce(p_user_id::text, ''), '-', '') from 1 for 12);
  end if;

  if char_length(v_base) < 4 then
    v_base := rpad(v_base, 4, '0');
  end if;

  if char_length(v_base) > 20 then
    v_base := left(v_base, 20);
  end if;

  v_candidate := v_base;

  loop
    exit when not exists (
      select 1
      from public.profiles p
      where lower(p.login_id) = lower(v_candidate)
        and p.id <> p_user_id
    );

    v_suffix := v_counter::text;
    v_candidate := left(v_base, greatest(4, 20 - char_length(v_suffix))) || v_suffix;
    v_counter := v_counter + 1;
  end loop;

  return v_candidate;
end;
$$;

update public.profiles p
set login_id = public.claim_unique_login_id(
  p.id,
  split_part(coalesce(u.email, ''), '@', 1),
  p.display_name
)
from auth.users u
where u.id = p.id
  and nullif(btrim(coalesce(p.login_id, '')), '') is null;

update public.profiles p
set login_id = public.claim_unique_login_id(p.id, p.display_name, null)
where nullif(btrim(coalesce(p.login_id, '')), '') is null;

update public.profiles p
set member_type = 'pastor'
from auth.users u
where u.id = p.id
  and lower(coalesce(u.email, '')) = 'fish9694@gmail.com';

update public.profiles p
set member_type = 'student'
from auth.users u
where u.id = p.id
  and lower(split_part(coalesce(u.email, ''), '@', 1)) like 'test%'
  and p.member_type is distinct from 'pastor';

update public.profiles
set member_type = 'student'
where member_type is null;

alter table public.profiles
  alter column login_id set not null,
  alter column member_type set not null;

create unique index if not exists idx_profiles_login_id_lower_unique
  on public.profiles (lower(login_id));

alter table public.profiles
  drop constraint if exists profiles_login_id_format_check;

alter table public.profiles
  add constraint profiles_login_id_format_check
  check (login_id ~ '^[a-z0-9._-]{4,20}$');

alter table public.profiles
  drop constraint if exists profiles_member_type_check;

alter table public.profiles
  add constraint profiles_member_type_check
  check (member_type in ('pastor', 'teacher', 'student'));

create or replace function public.resolve_login_email(
  p_login_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_login_id text := public.normalize_login_id(p_login_id);
  v_email text;
begin
  if v_login_id is null or char_length(v_login_id) < 4 then
    return null;
  end if;

  select u.email
    into v_email
  from public.profiles p
  join auth.users u
    on u.id = p.id
  where lower(p.login_id) = v_login_id
  limit 1;

  return nullif(btrim(coalesce(v_email, '')), '');
end;
$$;

drop function if exists public.upsert_profile_details(text, date, text, text);
drop function if exists public.redeem_invite_code(text, text, date, text, text);
drop function if exists public.bootstrap_owner_profile(text, date, text, text);

create or replace function public.upsert_profile_details(
  p_display_name text,
  p_birth_date date,
  p_phone_number text,
  p_gender text,
  p_member_type text
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
  v_member_type text := lower(nullif(btrim(coalesce(p_member_type, '')), ''));
  v_today date := (timezone('Asia/Seoul', now()))::date;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_display_name is null or char_length(v_display_name) < 2 or char_length(v_display_name) > 40 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  if v_birth_date is null or v_phone_number is null or v_gender is null or v_member_type is null then
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

  if v_member_type not in ('pastor', 'teacher', 'student') then
    raise exception 'INVALID_MEMBER_TYPE';
  end if;

  insert into public.profiles (id, display_name, birth_date, phone_number, gender, member_type)
  values (v_user_id, v_display_name, v_birth_date, v_phone_number, v_gender, v_member_type)
  on conflict (id)
  do update
    set display_name = excluded.display_name,
        birth_date = excluded.birth_date,
        phone_number = excluded.phone_number,
        gender = excluded.gender,
        member_type = excluded.member_type,
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
  p_gender text default null,
  p_login_id text default null,
  p_member_type text default null
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
  v_login_id text := public.normalize_login_id(p_login_id);
  v_member_type text := lower(nullif(btrim(coalesce(p_member_type, '')), ''));
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

  v_display_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_display_name is null then
    v_display_name := nullif(btrim(v_invite.invited_name), '');
  end if;
  if v_display_name is null then
    v_display_name := '새가족';
  end if;

  if v_birth_date is null or v_phone_number is null or v_gender is null or v_member_type is null then
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

  if v_member_type not in ('pastor', 'teacher', 'student') then
    raise exception 'INVALID_MEMBER_TYPE';
  end if;

  if v_login_id is null or char_length(v_login_id) < 4 then
    raise exception 'INVALID_LOGIN_ID';
  end if;

  if exists (
    select 1
    from public.profiles p
    where lower(p.login_id) = lower(v_login_id)
      and p.id <> v_user_id
  ) then
    raise exception 'LOGIN_ID_ALREADY_IN_USE';
  end if;

  insert into public.profiles (id, display_name, birth_date, phone_number, gender, login_id, member_type)
  values (v_user_id, v_display_name, v_birth_date, v_phone_number, v_gender, v_login_id, v_member_type)
  on conflict (id)
  do update
    set display_name = case
      when nullif(btrim(public.profiles.display_name), '') is null then excluded.display_name
      else public.profiles.display_name
    end,
    birth_date = excluded.birth_date,
    phone_number = excluded.phone_number,
    gender = excluded.gender,
    member_type = excluded.member_type,
    login_id = case
      when nullif(btrim(coalesce(public.profiles.login_id, '')), '') is null then excluded.login_id
      else public.profiles.login_id
    end,
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
  p_gender text default null,
  p_login_id text default null,
  p_member_type text default null
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
  v_login_id text := public.normalize_login_id(p_login_id);
  v_member_type text := lower(nullif(btrim(coalesce(p_member_type, '')), ''));
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

  if v_birth_date is null or v_phone_number is null or v_gender is null or v_member_type is null then
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

  if v_member_type not in ('pastor', 'teacher', 'student') then
    raise exception 'INVALID_MEMBER_TYPE';
  end if;

  if v_login_id is null or char_length(v_login_id) < 4 then
    raise exception 'INVALID_LOGIN_ID';
  end if;

  if exists (
    select 1
    from public.profiles p
    where lower(p.login_id) = lower(v_login_id)
      and p.id <> v_user_id
  ) then
    raise exception 'LOGIN_ID_ALREADY_IN_USE';
  end if;

  insert into public.profiles (id, display_name, birth_date, phone_number, gender, login_id, member_type, is_admin)
  values (v_user_id, v_name, v_birth_date, v_phone_number, v_gender, v_login_id, v_member_type, true)
  on conflict (id)
  do update
    set display_name = case
      when nullif(btrim(public.profiles.display_name), '') is null then excluded.display_name
      else public.profiles.display_name
    end,
        birth_date = excluded.birth_date,
        phone_number = excluded.phone_number,
        gender = excluded.gender,
        member_type = excluded.member_type,
        login_id = case
          when nullif(btrim(coalesce(public.profiles.login_id, '')), '') is null then excluded.login_id
          else public.profiles.login_id
        end,
        is_admin = true,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

revoke all on function public.upsert_profile_details(text, date, text, text, text) from public;
grant execute on function public.upsert_profile_details(text, date, text, text, text) to authenticated;

revoke all on function public.redeem_invite_code(text, text, date, text, text, text, text) from public;
grant execute on function public.redeem_invite_code(text, text, date, text, text, text, text) to authenticated;

revoke all on function public.bootstrap_owner_profile(text, date, text, text, text, text) from public;
grant execute on function public.bootstrap_owner_profile(text, date, text, text, text, text) to authenticated;
