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

## 3) Configure DB Webhooks -> `push-dispatch`

Create DB webhooks for these tables/events and point them to `push-dispatch`:

- `public.chat_messages`
- `public.birthday_messages`
- `public.meetups`
- `public.community_events`

Each webhook request must include the shared secret header:

- `x-push-webhook-secret: <PUSH_WEBHOOK_SECRET>`

`push-dispatch` expects payloads containing at least:

- `table`
- `record`

(standard Supabase DB webhook shape is supported).

## 4) Scheduler Cron -> `push-birthday-daily`

Create a scheduled invocation for `push-birthday-daily` at **UTC 00:00** daily.

- Cron: `0 0 * * *` (UTC)
- Include header: `x-push-webhook-secret: <PUSH_WEBHOOK_SECRET>`

The function computes birthdays in **Asia/Seoul (KST)** and deduplicates once-per-day delivery using:

- `public.notification_daily_delivery_log`
  - key: `(profile_id, date_key, notification_type)`

## 5) Web Push Runtime Note

Both functions attempt to use `npm:web-push` in Deno runtime.

- If unavailable, they run a structured no-op fallback with logging.
- TODO for production: ensure `web-push` compatibility is available in your deployed Edge runtime.
