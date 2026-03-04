import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type JsonRecord = Record<string, unknown>;

type NotificationSettingKey =
  | "in_app_enabled"
  | "browser_enabled"
  | "sound_enabled"
  | "schedule_enabled"
  | "meetup_enabled"
  | "chat_enabled"
  | "message_enabled"
  | "birthday_daily_enabled"
  | "birthday_message_enabled";

type DatabaseWebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: JsonRecord | null;
  old_record?: JsonRecord | null;
};

type ResolvedDispatch = {
  table: string;
  actorId: string | null;
  excludeActor: boolean;
  recipientIds: string[];
  requiredSettings: NotificationSettingKey[];
  notificationType: string;
  pushPayload: JsonRecord;
};

type NotificationSettingsRow = {
  profile_id: string;
  in_app_enabled?: boolean;
  browser_enabled?: boolean;
  sound_enabled?: boolean;
  schedule_enabled?: boolean;
  meetup_enabled?: boolean;
  chat_enabled?: boolean;
  message_enabled?: boolean;
  birthday_daily_enabled?: boolean;
  birthday_message_enabled?: boolean;
};

type WebPushSubscriptionRow = {
  id: number;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
};

type PushResult = {
  ok: boolean;
  noOp: boolean;
  status: number | null;
  error?: string;
};

type Env = {
  supabaseUrl: string;
  serviceRoleKey: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  webhookSecret: string;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

let webPushModule: any | null | undefined;
let vapidConfigured = false;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-webhook-secret, x-push-webhook-secret, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let env: Env;
  try {
    env = readEnv();
  } catch (error) {
    return json({ error: "MISSING_ENV", detail: toErrorMessage(error) }, 500);
  }

  const providedSecret = readWebhookSecret(req);
  if (!providedSecret || !timingSafeEqual(providedSecret, env.webhookSecret)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  let payload: DatabaseWebhookPayload;
  try {
    payload = await req.json();
  } catch (_error) {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const table = asString(payload.table)?.trim();
  const record = asRecord(payload.record);

  if (!table || !record) {
    return json({ error: "INVALID_PAYLOAD", detail: "Expected table + record in webhook payload." }, 400);
  }

  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let resolved: ResolvedDispatch;
  try {
    resolved = await resolveDispatch(supabase, table, record);
  } catch (error) {
    return json({ error: "RESOLVE_FAILED", detail: toErrorMessage(error) }, 400);
  }

  if (resolved.recipientIds.length === 0) {
    return json({ ok: true, skipped: true, reason: "NO_RECIPIENTS", table: resolved.table }, 200);
  }

  let filteredRecipients: string[];
  try {
    filteredRecipients = await filterRecipientsBySettings(
      supabase,
      resolved.recipientIds,
      resolved.requiredSettings,
    );
  } catch (error) {
    return json({ error: "SETTINGS_FILTER_FAILED", detail: toErrorMessage(error) }, 500);
  }

  if (resolved.excludeActor && resolved.actorId) {
    filteredRecipients = filteredRecipients.filter((id) => id !== resolved.actorId);
  }

  if (filteredRecipients.length === 0) {
    return json({ ok: true, skipped: true, reason: "ALL_FILTERED_OUT", table: resolved.table }, 200);
  }

  let subscriptions: WebPushSubscriptionRow[];
  try {
    subscriptions = await fetchActiveSubscriptions(supabase, filteredRecipients);
  } catch (error) {
    return json({ error: "SUBSCRIPTIONS_FETCH_FAILED", detail: toErrorMessage(error) }, 500);
  }

  if (subscriptions.length === 0) {
    return json({ ok: true, skipped: true, reason: "NO_ACTIVE_SUBSCRIPTIONS", table: resolved.table }, 200);
  }

  const invalidSubscriptionIds = new Set<number>();
  const successfulSubscriptionIds = new Set<number>();
  let attempted = 0;
  let delivered = 0;
  let failed = 0;
  let noop = 0;

  for (const subscription of subscriptions) {
    attempted += 1;
    const result = await sendPush(subscription, resolved.pushPayload, env);

    if (result.noOp) {
      noop += 1;
      continue;
    }

    if (result.ok) {
      delivered += 1;
      successfulSubscriptionIds.add(subscription.id);
      continue;
    }

    failed += 1;
    if (isInvalidPushStatus(result.status)) {
      invalidSubscriptionIds.add(subscription.id);
    }

    console.error(
      "[push-dispatch] push delivery failed",
      JSON.stringify({
        subscription_id: subscription.id,
        profile_id: subscription.profile_id,
        status: result.status,
        error: result.error,
      }),
    );
  }

  const nowIso = new Date().toISOString();

  if (successfulSubscriptionIds.size > 0) {
    const { error } = await supabase
      .from("web_push_subscriptions")
      .update({ last_used_at: nowIso })
      .in("id", Array.from(successfulSubscriptionIds));

    if (error) {
      console.error("[push-dispatch] failed to update last_used_at", error);
    }
  }

  if (invalidSubscriptionIds.size > 0) {
    const { error } = await supabase
      .from("web_push_subscriptions")
      .update({ is_active: false, last_used_at: nowIso })
      .in("id", Array.from(invalidSubscriptionIds));

    if (error) {
      console.error("[push-dispatch] failed to deactivate invalid subscriptions", error);
    }
  }

  return json(
    {
      ok: true,
      table: resolved.table,
      notification_type: resolved.notificationType,
      recipients_total: resolved.recipientIds.length,
      recipients_after_settings: filteredRecipients.length,
      subscriptions_attempted: attempted,
      delivered,
      failed,
      noop,
      invalidated_subscriptions: invalidSubscriptionIds.size,
    },
    200,
  );
});

function readEnv(): Env {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const vapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ?? "";
  const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";

  const missing = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
    ["PUSH_WEBHOOK_SECRET", webhookSecret],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
    webhookSecret,
  };
}

function readWebhookSecret(req: Request): string | null {
  const directHeader = req.headers.get("x-push-webhook-secret") ?? req.headers.get("x-webhook-secret");
  if (directHeader) {
    return directHeader.trim();
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

async function resolveDispatch(
  supabase: ReturnType<typeof createClient>,
  table: string,
  record: JsonRecord,
): Promise<ResolvedDispatch> {
  if (table === "chat_messages") {
    const roomId = asNumber(record.room_id);
    if (roomId === null) {
      throw new Error("chat_messages payload missing room_id");
    }

    const actorId = asString(record.author_id);
    const { data, error } = await supabase
      .from("chat_room_members")
      .select("user_id")
      .eq("room_id", roomId);

    if (error) {
      throw new Error(`Failed to load room members: ${error.message}`);
    }

    const recipientIds = uniqueStrings(data?.map((row) => asString((row as JsonRecord).user_id)) ?? []);
    const contentPreview = truncate(
      asString(record.content) ?? "A new chat message arrived.",
      120,
    );

    return {
      table,
      actorId,
      excludeActor: true,
      recipientIds,
      requiredSettings: ["browser_enabled", "chat_enabled", "message_enabled"],
      notificationType: "chat_message",
      pushPayload: {
        title: "New chat message",
        body: contentPreview,
        data: {
          table,
          room_id: roomId,
          message_id: asNumber(record.id),
        },
      },
    };
  }

  if (table === "birthday_messages") {
    const receiverId = asString(record.receiver_id);
    if (!receiverId) {
      throw new Error("birthday_messages payload missing receiver_id");
    }

    const messageContext = asString(record.message_context) === "direct" ? "direct" : "birthday";
    const actorId = asString(record.sender_id);

    return {
      table,
      actorId,
      excludeActor: false,
      recipientIds: [receiverId],
      requiredSettings:
        messageContext === "direct"
          ? ["browser_enabled", "message_enabled"]
          : ["browser_enabled", "birthday_message_enabled"],
      notificationType:
        messageContext === "direct" ? "birthday_message_direct" : "birthday_message_birthday",
      pushPayload: {
        title: messageContext === "direct" ? "New message" : "Birthday message",
        body: truncate(asString(record.content) ?? "A new message arrived.", 120),
        data: {
          table,
          message_id: asNumber(record.id),
          message_context: messageContext,
        },
      },
    };
  }

  if (table === "meetups" || table === "community_events") {
    const { data, error } = await supabase.from("profiles").select("id");
    if (error) {
      throw new Error(`Failed to load profile ids: ${error.message}`);
    }

    const recipientIds = uniqueStrings(data?.map((row) => asString((row as JsonRecord).id)) ?? []);
    const actorId = asString(record.created_by);
    const titleText = asString(record.title) ?? (table === "meetups" ? "Meetup schedule" : "Community schedule");
    const startsAtText = asString(record.starts_at);

    return {
      table,
      actorId,
      excludeActor: false,
      recipientIds,
      requiredSettings:
        table === "meetups"
          ? ["browser_enabled", "schedule_enabled", "meetup_enabled"]
          : ["browser_enabled", "schedule_enabled"],
      notificationType: table === "meetups" ? "meetup_update" : "community_event_update",
      pushPayload: {
        title: table === "meetups" ? `Meetup alert: ${titleText}` : `Community event alert: ${titleText}`,
        body:
          startsAtText && startsAtText.length > 0
            ? `Starts at: ${startsAtText}`
            : "A new schedule item was posted.",
        data: {
          table,
          event_id: asNumber(record.id),
        },
      },
    };
  }

  throw new Error(`Unsupported webhook table: ${table}`);
}

async function filterRecipientsBySettings(
  supabase: ReturnType<typeof createClient>,
  recipientIds: string[],
  requiredSettings: NotificationSettingKey[],
): Promise<string[]> {
  if (recipientIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("profile_notification_settings")
    .select(
      "profile_id,in_app_enabled,browser_enabled,sound_enabled,schedule_enabled,meetup_enabled,chat_enabled,message_enabled,birthday_daily_enabled,birthday_message_enabled",
    )
    .in("profile_id", recipientIds);

  if (error) {
    throw new Error(`Failed to load notification settings: ${error.message}`);
  }

  const settingsMap = new Map<string, NotificationSettingsRow>();
  for (const row of data ?? []) {
    const rowRecord = row as NotificationSettingsRow;
    settingsMap.set(rowRecord.profile_id, rowRecord);
  }

  return recipientIds.filter((profileId) => {
    const settings = settingsMap.get(profileId);
    return requiredSettings.every((settingKey) => (settings?.[settingKey] ?? true) === true);
  });
}

async function fetchActiveSubscriptions(
  supabase: ReturnType<typeof createClient>,
  recipientIds: string[],
): Promise<WebPushSubscriptionRow[]> {
  if (recipientIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("web_push_subscriptions")
    .select("id,profile_id,endpoint,p256dh,auth,user_agent")
    .eq("is_active", true)
    .in("profile_id", recipientIds);

  if (error) {
    throw new Error(`Failed to load web push subscriptions: ${error.message}`);
  }

  return (data ?? []) as WebPushSubscriptionRow[];
}

async function sendPush(
  subscription: WebPushSubscriptionRow,
  payload: JsonRecord,
  env: Env,
): Promise<PushResult> {
  const webPush = await getWebPush();
  if (!webPush) {
    console.warn(
      "[push-dispatch] web-push unavailable, skipping actual delivery (TODO: install npm:web-push)",
      JSON.stringify({ subscription_id: subscription.id, profile_id: subscription.profile_id }),
    );
    return { ok: true, noOp: true, status: null };
  }

  if (!env.vapidPublicKey || !env.vapidPrivateKey || !env.vapidSubject) {
    console.warn(
      "[push-dispatch] missing VAPID env vars, skipping actual delivery",
      JSON.stringify({ subscription_id: subscription.id, profile_id: subscription.profile_id }),
    );
    return { ok: true, noOp: true, status: null };
  }

  try {
    if (!vapidConfigured) {
      webPush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
      vapidConfigured = true;
    }

    const response = await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        expirationTime: null,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
    );

    const status = extractStatusCode(response) ?? 201;
    return {
      ok: status >= 200 && status < 300,
      noOp: false,
      status,
    };
  } catch (error) {
    return {
      ok: false,
      noOp: false,
      status: extractStatusCode(error),
      error: toErrorMessage(error),
    };
  }
}

async function getWebPush(): Promise<any | null> {
  if (webPushModule !== undefined) {
    return webPushModule;
  }

  try {
    const imported = await import("npm:web-push");
    webPushModule = imported.default ?? imported;
  } catch (error) {
    console.warn("[push-dispatch] failed to import npm:web-push", toErrorMessage(error));
    webPushModule = null;
  }

  return webPushModule;
}

function extractStatusCode(value: unknown): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybe = value as { statusCode?: unknown; status?: unknown; status_code?: unknown };
  const statusCode = asNumber(maybe.statusCode);
  if (statusCode !== null) {
    return statusCode;
  }

  const status = asNumber(maybe.status);
  if (status !== null) {
    return status;
  }

  return asNumber(maybe.status_code);
}

function isInvalidPushStatus(status: number | null): boolean {
  return status === 404 || status === 410;
}

function json(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value)));
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch (_jsonError) {
    return "Unknown error";
  }
}
