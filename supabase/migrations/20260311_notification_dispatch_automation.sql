-- Automate notification dispatch wiring:
-- - Table INSERT trigger -> push-dispatch edge function
-- - Daily cron job -> push-birthday-daily edge function
-- Secrets are NOT hardcoded. Configure using set_notification_dispatch_config().

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create table if not exists public.notification_dispatch_config (
  id integer primary key default 1 check (id = 1),
  dispatch_function_url text not null default '',
  birthday_daily_function_url text not null default '',
  webhook_secret text not null default '',
  auth_bearer_token text,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_dispatch_config (
  id,
  dispatch_function_url,
  birthday_daily_function_url,
  webhook_secret,
  auth_bearer_token,
  is_enabled
)
values (
  1,
  'https://prqgrmudhnvhzfgxvjoj.supabase.co/functions/v1/push-dispatch',
  'https://prqgrmudhnvhzfgxvjoj.supabase.co/functions/v1/push-birthday-daily',
  '',
  null,
  false
)
on conflict (id) do nothing;

drop trigger if exists trg_notification_dispatch_config_set_updated_at on public.notification_dispatch_config;
create trigger trg_notification_dispatch_config_set_updated_at
before update on public.notification_dispatch_config
for each row
execute function public.set_updated_at();

alter table public.notification_dispatch_config enable row level security;

drop policy if exists notification_dispatch_config_select_admin_only on public.notification_dispatch_config;
create policy notification_dispatch_config_select_admin_only
on public.notification_dispatch_config
for select
to authenticated
using (public.is_admin());

drop policy if exists notification_dispatch_config_update_admin_only on public.notification_dispatch_config;
create policy notification_dispatch_config_update_admin_only
on public.notification_dispatch_config
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.get_notification_dispatch_config()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.notification_dispatch_config%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_admin() then
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

create or replace function public.enqueue_notification_http_post(
  p_url text,
  p_headers jsonb,
  p_body jsonb,
  p_timeout_ms integer default 4000
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_url), '') = '' then
    return;
  end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
  using
    p_url,
    coalesce(p_body, '{}'::jsonb),
    coalesce(p_headers, '{}'::jsonb),
    greatest(coalesce(p_timeout_ms, 4000), 500);
exception
  when undefined_function then
    raise notice 'pg_net extension is not available; notification webhook dispatch skipped';
end;
$$;

create or replace function public.refresh_notification_dispatch_schedule()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.notification_dispatch_config%rowtype;
  v_headers jsonb;
  v_job_name text := 'push-birthday-daily-utc-0000';
  v_job_id bigint;
  v_command text;
begin
  begin
    execute 'select jobid from cron.job where jobname = $1'
      into v_job_id
      using v_job_name;

    if v_job_id is not null then
      execute 'select cron.unschedule($1)' using v_job_id;
    end if;
  exception
    when undefined_table or undefined_function then
      return;
  end;

  select *
    into v_config
  from public.notification_dispatch_config
  where id = 1;

  if not found or not coalesce(v_config.is_enabled, false) then
    return;
  end if;

  if coalesce(btrim(v_config.birthday_daily_function_url), '') = ''
     or coalesce(btrim(v_config.webhook_secret), '') = '' then
    return;
  end if;

  v_headers := jsonb_build_object(
    'content-type', 'application/json',
    'x-push-webhook-secret', v_config.webhook_secret
  );

  if coalesce(btrim(v_config.auth_bearer_token), '') <> '' then
    v_headers := v_headers || jsonb_build_object('authorization', 'Bearer ' || v_config.auth_bearer_token);
  end if;

  v_command := format(
    'select net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb, timeout_milliseconds := 30000);',
    v_config.birthday_daily_function_url,
    '{}',
    v_headers::text
  );

  execute 'select cron.schedule($1, $2, $3)'
  using v_job_name, '0 0 * * *', v_command;
exception
  when undefined_function then
    raise notice 'pg_cron extension is not available; birthday schedule skipped';
end;
$$;

create or replace function public.trg_notification_dispatch_config_refresh_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_notification_dispatch_schedule();
  return null;
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
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_admin() then
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

drop trigger if exists trg_notification_dispatch_config_refresh_schedule on public.notification_dispatch_config;
create trigger trg_notification_dispatch_config_refresh_schedule
after insert or update on public.notification_dispatch_config
for each statement
execute function public.trg_notification_dispatch_config_refresh_schedule();

create or replace function public.dispatch_notification_webhook_from_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.notification_dispatch_config%rowtype;
  v_headers jsonb;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  select *
    into v_config
  from public.notification_dispatch_config
  where id = 1;

  if not found or not coalesce(v_config.is_enabled, false) then
    return new;
  end if;

  if coalesce(btrim(v_config.dispatch_function_url), '') = ''
     or coalesce(btrim(v_config.webhook_secret), '') = '' then
    return new;
  end if;

  v_headers := jsonb_build_object(
    'content-type', 'application/json',
    'x-push-webhook-secret', v_config.webhook_secret
  );

  if coalesce(btrim(v_config.auth_bearer_token), '') <> '' then
    v_headers := v_headers || jsonb_build_object('authorization', 'Bearer ' || v_config.auth_bearer_token);
  end if;

  perform public.enqueue_notification_http_post(
    p_url => v_config.dispatch_function_url,
    p_headers => v_headers,
    p_body => jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    ),
    p_timeout_ms => 5000
  );

  return new;
end;
$$;

drop trigger if exists trg_chat_messages_dispatch_notification on public.chat_messages;
create trigger trg_chat_messages_dispatch_notification
after insert on public.chat_messages
for each row
execute function public.dispatch_notification_webhook_from_insert();

drop trigger if exists trg_birthday_messages_dispatch_notification on public.birthday_messages;
create trigger trg_birthday_messages_dispatch_notification
after insert on public.birthday_messages
for each row
execute function public.dispatch_notification_webhook_from_insert();

drop trigger if exists trg_meetups_dispatch_notification on public.meetups;
create trigger trg_meetups_dispatch_notification
after insert on public.meetups
for each row
execute function public.dispatch_notification_webhook_from_insert();

drop trigger if exists trg_community_events_dispatch_notification on public.community_events;
create trigger trg_community_events_dispatch_notification
after insert on public.community_events
for each row
execute function public.dispatch_notification_webhook_from_insert();

revoke all on function public.get_notification_dispatch_config() from public;
revoke all on function public.set_notification_dispatch_config(text, text, text, text, boolean) from public;
revoke all on function public.enqueue_notification_http_post(text, jsonb, jsonb, integer) from public;
revoke all on function public.refresh_notification_dispatch_schedule() from public;
revoke all on function public.trg_notification_dispatch_config_refresh_schedule() from public;
revoke all on function public.dispatch_notification_webhook_from_insert() from public;

grant execute on function public.get_notification_dispatch_config() to authenticated, service_role;
grant execute on function public.set_notification_dispatch_config(text, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.enqueue_notification_http_post(text, jsonb, jsonb, integer) to service_role;
grant execute on function public.refresh_notification_dispatch_schedule() to service_role;
grant execute on function public.trg_notification_dispatch_config_refresh_schedule() to service_role;
grant execute on function public.dispatch_notification_webhook_from_insert() to service_role;

grant select, update on public.notification_dispatch_config to authenticated;

select public.refresh_notification_dispatch_schedule();
