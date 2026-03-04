-- Signup policy: allow no-invite signup until a configured end timestamp.

create table if not exists public.signup_policy (
  id boolean primary key default true,
  no_invite_required_until timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id = true)
);

insert into public.signup_policy (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists trg_signup_policy_set_updated_at on public.signup_policy;
create trigger trg_signup_policy_set_updated_at
before update on public.signup_policy
for each row execute function public.set_updated_at();

alter table public.signup_policy enable row level security;

drop policy if exists signup_policy_select_admin_only on public.signup_policy;
create policy signup_policy_select_admin_only
on public.signup_policy
for select
to authenticated
using (public.is_admin());

drop policy if exists signup_policy_insert_admin_only on public.signup_policy;
create policy signup_policy_insert_admin_only
on public.signup_policy
for insert
to authenticated
with check (public.is_admin());

drop policy if exists signup_policy_update_admin_only on public.signup_policy;
create policy signup_policy_update_admin_only
on public.signup_policy
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.get_signup_policy()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
  v_is_no_invite_period boolean;
  v_is_bootstrap_available boolean;
begin
  select p.no_invite_required_until
    into v_until
  from public.signup_policy p
  where p.id = true;

  if v_until is null then
    v_is_no_invite_period := false;
  else
    v_is_no_invite_period := v_until > now();
  end if;

  select not exists (select 1 from public.profiles)
    into v_is_bootstrap_available;

  return jsonb_build_object(
    'no_invite_required_until', v_until,
    'is_no_invite_period', v_is_no_invite_period,
    'is_bootstrap_available', v_is_bootstrap_available,
    'is_invite_required', (not v_is_bootstrap_available) and (not v_is_no_invite_period),
    'server_now', now()
  );
end;
$$;

create or replace function public.set_no_invite_signup_until(
  p_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_admin(v_actor_id) then
    raise exception 'ADMIN_ONLY';
  end if;

  if p_until is not null and p_until <= now() then
    raise exception 'INVALID_NO_INVITE_PERIOD_END';
  end if;

  insert into public.signup_policy (id, no_invite_required_until, updated_by)
  values (true, p_until, v_actor_id)
  on conflict (id)
  do update
    set no_invite_required_until = excluded.no_invite_required_until,
        updated_by = excluded.updated_by,
        updated_at = now();

  return public.get_signup_policy();
end;
$$;

create or replace function public.complete_signup_profile(
  p_code text default null,
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
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_birth_date date := p_birth_date;
  v_phone_number text := nullif(regexp_replace(coalesce(p_phone_number, ''), '[^0-9]', '', 'g'), '');
  v_gender text := lower(nullif(btrim(coalesce(p_gender, '')), ''));
  v_login_id text := public.normalize_login_id(p_login_id);
  v_member_type text := lower(nullif(btrim(coalesce(p_member_type, '')), ''));
  v_profile public.profiles%rowtype;
  v_policy jsonb;
  v_is_no_invite_period boolean := false;
  v_is_bootstrap_available boolean := false;
  v_today date := (timezone('Asia/Seoul', now()))::date;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select public.get_signup_policy()
    into v_policy;

  v_is_no_invite_period := coalesce((v_policy ->> 'is_no_invite_period')::boolean, false);
  v_is_bootstrap_available := coalesce((v_policy ->> 'is_bootstrap_available')::boolean, false);

  if v_is_bootstrap_available then
    return public.bootstrap_owner_profile(
      p_display_name => p_display_name,
      p_birth_date => p_birth_date,
      p_phone_number => p_phone_number,
      p_gender => p_gender,
      p_login_id => p_login_id,
      p_member_type => p_member_type
    );
  end if;

  if v_is_no_invite_period then
    if v_code <> '' then
      raise exception 'INVITE_CODE_DISABLED_DURING_OPEN_SIGNUP';
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

    return v_profile;
  end if;

  if v_code = '' then
    raise exception 'INVITE_REQUIRED';
  end if;

  return public.redeem_invite_code(
    p_code => v_code,
    p_display_name => p_display_name,
    p_birth_date => p_birth_date,
    p_phone_number => p_phone_number,
    p_gender => p_gender,
    p_login_id => p_login_id,
    p_member_type => p_member_type
  );
end;
$$;

revoke all on function public.get_signup_policy() from public;
grant execute on function public.get_signup_policy() to anon, authenticated;

revoke all on function public.set_no_invite_signup_until(timestamptz) from public;
grant execute on function public.set_no_invite_signup_until(timestamptz) to authenticated;

revoke all on function public.complete_signup_profile(text, text, date, text, text, text, text) from public;
grant execute on function public.complete_signup_profile(text, text, date, text, text, text, text) to authenticated;
