# Supabase Edge Functions: Notification Infrastructure

This folder contains notification-related Edge Functions:

- `push-dispatch`: receives DB webhook events and dispatches push notifications.
- `push-birthday-daily`: scheduled daily birthday notification dispatcher (KST logic with daily dedupe).

## 1) Required Secrets

Set these secrets in Supabase for both functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`
- `PUSH_WEBHOOK_SECRET`

Example:

```bash
supabase secrets set \
  SUPABASE_URL="https://<project-ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
  WEB_PUSH_VAPID_PUBLIC_KEY="<vapid-public-key>" \
  WEB_PUSH_VAPID_PRIVATE_KEY="<vapid-private-key>" \
  WEB_PUSH_VAPID_SUBJECT="mailto:admin@example.com" \
  PUSH_WEBHOOK_SECRET="<shared-secret>"
```

## 2) Deploy Functions

```bash
supabase functions deploy push-dispatch
supabase functions deploy push-birthday-daily
```

## 3) Apply DB Automation Migration

```bash
supabase db push
```

`20260311_notification_dispatch_automation.sql` does the following automatically:

- `chat_messages`, `birthday_messages`, `meetups`, `community_events` INSERT trigger
  -> call `push-dispatch`
- daily cron (`0 0 * * *` UTC)
  -> call `push-birthday-daily`

## 4) Set Notification Dispatch Config (Admin RPC)

After migration, inject webhook auth/config using admin account:

```sql
select public.set_notification_dispatch_config(
  p_dispatch_function_url => 'https://<project-ref>.supabase.co/functions/v1/push-dispatch',
  p_birthday_daily_function_url => 'https://<project-ref>.supabase.co/functions/v1/push-birthday-daily',
  p_webhook_secret => '<PUSH_WEBHOOK_SECRET>',
  p_auth_bearer_token => null,
  p_is_enabled => true
);
```

Check:

```sql
select public.get_notification_dispatch_config();
```

`20260312` + `20260313` 마이그레이션 적용 후에는
`service_role` JWT 컨텍스트에서도 위 RPC를 호출할 수 있습니다.

The function computes birthdays in **Asia/Seoul (KST)** and deduplicates once-per-day delivery using:

- `public.notification_daily_delivery_log`
  - key: `(profile_id, date_key, notification_type)`

## 5) Web Push Runtime Note

Both functions attempt to use `npm:web-push` in Deno runtime.

- If unavailable, they run a structured no-op fallback with logging.
- TODO for production: ensure `web-push` compatibility is available in your deployed Edge runtime.
