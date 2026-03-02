-- Bootstrap first owner profile without invite code.
-- This is only allowed when profiles table is empty.

create or replace function public.bootstrap_owner_profile(
  p_display_name text default null
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

  insert into public.profiles (id, display_name, is_admin)
  values (v_user_id, v_name, true)
  on conflict (id)
  do update
    set display_name = excluded.display_name,
        is_admin = true,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.bootstrap_owner_profile(text) from public;
grant execute on function public.bootstrap_owner_profile(text) to authenticated;
