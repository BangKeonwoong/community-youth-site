-- Multi-use invite codes, redemption audit, and admin role management.

alter table public.invite_codes
  add column if not exists max_uses integer not null default 1,
  add column if not exists used_count integer not null default 0,
  add column if not exists revoked_at timestamptz;

update public.invite_codes
set used_count = max_uses
where is_redeemed = true
  and used_count < max_uses;

alter table public.invite_codes
  drop constraint if exists invite_codes_max_uses_check;

alter table public.invite_codes
  add constraint invite_codes_max_uses_check
  check (max_uses > 0);

alter table public.invite_codes
  drop constraint if exists invite_codes_used_count_check;

alter table public.invite_codes
  add constraint invite_codes_used_count_check
  check (used_count >= 0 and used_count <= max_uses);

create index if not exists idx_invite_codes_revoked_at on public.invite_codes (revoked_at);
create index if not exists idx_invite_codes_used_count on public.invite_codes (used_count);

create table if not exists public.invite_code_redemptions (
  id bigint generated always as identity primary key,
  invite_code_id bigint not null references public.invite_codes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (invite_code_id, user_id),
  unique (user_id)
);

insert into public.invite_code_redemptions (invite_code_id, user_id, redeemed_at)
select
  i.id,
  i.redeemed_by,
  coalesce(i.redeemed_at, i.updated_at, i.created_at, now())
from public.invite_codes i
where i.redeemed_by is not null
  and i.is_redeemed = true
on conflict (user_id) do nothing;

create index if not exists idx_invite_code_redemptions_invite_code_id
  on public.invite_code_redemptions (invite_code_id);
create index if not exists idx_invite_code_redemptions_redeemed_at
  on public.invite_code_redemptions (redeemed_at desc);

create or replace function public.redeem_invite_code(
  p_code text,
  p_display_name text default null
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
  v_invite public.invite_codes%rowtype;
  v_profile public.profiles%rowtype;
  v_now timestamptz := now();
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

  insert into public.profiles (id, display_name)
  values (v_user_id, v_display_name)
  on conflict (id)
  do update
    set display_name = case
      when nullif(btrim(public.profiles.display_name), '') is null then excluded.display_name
      else public.profiles.display_name
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

revoke all on function public.redeem_invite_code(text, text) from public;
grant execute on function public.redeem_invite_code(text, text) to authenticated;

create or replace function public.set_profile_admin_status(
  p_profile_id uuid,
  p_is_admin boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_admin_count integer;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_admin(v_actor_id) then
    raise exception 'ADMIN_ONLY';
  end if;

  perform pg_advisory_xact_lock(hashtext('profiles_set_admin_status'));

  select *
    into v_profile
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_profile.is_admin = true and coalesce(p_is_admin, false) = false then
    select count(*)
      into v_admin_count
    from public.profiles
    where is_admin = true;

    if v_admin_count <= 1 then
      raise exception 'LAST_ADMIN_REQUIRED';
    end if;
  end if;

  update public.profiles
  set is_admin = coalesce(p_is_admin, false),
      updated_at = now()
  where id = p_profile_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.set_profile_admin_status(uuid, boolean) from public;
grant execute on function public.set_profile_admin_status(uuid, boolean) to authenticated;

alter table public.invite_code_redemptions enable row level security;

drop policy if exists invite_code_redemptions_select_admin_only on public.invite_code_redemptions;
create policy invite_code_redemptions_select_admin_only
on public.invite_code_redemptions
for select
to authenticated
using (public.is_admin());
