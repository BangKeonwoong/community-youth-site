-- Use auth.role() for service_role detection in notification config RPCs.

create or replace function public.get_notification_dispatch_config()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.notification_dispatch_config%rowtype;
  v_role text := coalesce(auth.role(), '');
begin
  if auth.uid() is null and v_role <> 'service_role' then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_role <> 'service_role' and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.notification_dispatch_config (id)
  values (1)
  on conflict (id) do nothing;

  select *
    into v_config
  from public.notification_dispatch_config
  where id = 1;

  return jsonb_build_object(
    'dispatch_function_url', v_config.dispatch_function_url,
    'birthday_daily_function_url', v_config.birthday_daily_function_url,
    'has_webhook_secret', coalesce(btrim(v_config.webhook_secret), '') <> '',
    'has_auth_bearer_token', coalesce(btrim(v_config.auth_bearer_token), '') <> '',
    'is_enabled', v_config.is_enabled,
    'updated_at', v_config.updated_at
  );
end;
$$;

create or replace function public.set_notification_dispatch_config(
  p_dispatch_function_url text default null,
  p_birthday_daily_function_url text default null,
  p_webhook_secret text default null,
  p_auth_bearer_token text default null,
  p_is_enabled boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.notification_dispatch_config%rowtype;
  v_next public.notification_dispatch_config%rowtype;
  v_role text := coalesce(auth.role(), '');
begin
  if auth.uid() is null and v_role <> 'service_role' then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_role <> 'service_role' and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.notification_dispatch_config (id)
  values (1)
  on conflict (id) do nothing;

  select *
    into v_current
  from public.notification_dispatch_config
  where id = 1;

  update public.notification_dispatch_config
  set
    dispatch_function_url = coalesce(
      nullif(btrim(p_dispatch_function_url), ''),
      v_current.dispatch_function_url
    ),
    birthday_daily_function_url = coalesce(
      nullif(btrim(p_birthday_daily_function_url), ''),
      v_current.birthday_daily_function_url
    ),
    webhook_secret = case
      when p_webhook_secret is null then v_current.webhook_secret
      else btrim(p_webhook_secret)
    end,
    auth_bearer_token = case
      when p_auth_bearer_token is null then v_current.auth_bearer_token
      else nullif(btrim(p_auth_bearer_token), '')
    end,
    is_enabled = coalesce(p_is_enabled, v_current.is_enabled)
  where id = 1
  returning *
    into v_next;

  perform public.refresh_notification_dispatch_schedule();

  return jsonb_build_object(
    'dispatch_function_url', v_next.dispatch_function_url,
    'birthday_daily_function_url', v_next.birthday_daily_function_url,
    'has_webhook_secret', coalesce(btrim(v_next.webhook_secret), '') <> '',
    'has_auth_bearer_token', coalesce(btrim(v_next.auth_bearer_token), '') <> '',
    'is_enabled', v_next.is_enabled,
    'updated_at', v_next.updated_at
  );
end;
$$;
