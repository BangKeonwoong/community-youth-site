import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type JsonRecord = Record<string, unknown>;

type BirthdayProfile = {
  id: string;
  display_name: string | null;
  birth_date: string | null;
};

type NotificationSettingsRow = {
  profile_id: string;
  browser_enabled?: boolean;
  birthday_daily_enabled?: boolean;
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

  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const kstToday = getKstDateParts();

  const birthdays = await fetchTodaysBirthdays(supabase, kstToday.monthDay);
  if (birthdays.length === 0) {
    return json({ ok: true, skipped: true, reason: "NO_BIRTHDAYS", date_key: kstToday.dateKey }, 200);
  }

  const allProfileIds = await fetchAllProfileIds(supabase);
  if (allProfileIds.length === 0) {
    return json({ ok: true, skipped: true, reason: "NO_PROFILES", date_key: kstToday.dateKey }, 200);
  }

  const recipientIds = await filterRecipientsBySettings(supabase, allProfileIds);
  if (recipientIds.length === 0) {
    return json({ ok: true, skipped: true, reason: "ALL_FILTERED_OUT", date_key: kstToday.dateKey }, 200);
  }

  const alreadyDelivered = await fetchDailyDeliveredProfiles(
    supabase,
    recipientIds,
    kstToday.dateKey,
    "birthday_daily",
  );

  const pendingRecipientIds = recipientIds.filter((id) => !alreadyDelivered.has(id));
  if (pendingRecipientIds.length === 0) {
    return json({ ok: true, skipped: true, reason: "ALREADY_SENT_TODAY", date_key: kstToday.dateKey }, 200);
  }

  const subscriptions = await fetchActiveSubscriptions(supabase, pendingRecipientIds);
  if (subscriptions.length === 0) {
    return json(
      {
        ok: true,
        skipped: true,
        reason: "NO_ACTIVE_SUBSCRIPTIONS",
        date_key: kstToday.dateKey,
        recipients_pending: pendingRecipientIds.length,
      },
      200,
    );
  }

  const birthdayNames = birthdays.map((profile) => profile.display_name || "Member");
  const payload = buildBirthdayDailyPayload(kstToday.dateKey, birthdays, birthdayNames);

  const invalidSubscriptionIds = new Set<number>();
  const successfulSubscriptionIds = new Set<number>();
  const deliveredProfileIds = new Set<string>();

  let attempted = 0;
  let delivered = 0;
  let failed = 0;
  let noop = 0;

  for (const subscription of subscriptions) {
    attempted += 1;

    const result = await sendPush(subscription, payload, env);
    if (result.noOp) {
      noop += 1;
      deliveredProfileIds.add(subscription.profile_id);
      continue;
    }

    if (result.ok) {
      delivered += 1;
      successfulSubscriptionIds.add(subscription.id);
      deliveredProfileIds.add(subscription.profile_id);
      continue;
    }

    failed += 1;
    if (isInvalidPushStatus(result.status)) {
      invalidSubscriptionIds.add(subscription.id);
    }

    console.error(
      "[push-birthday-daily] push delivery failed",
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
      console.error("[push-birthday-daily] failed to update last_used_at", error);
    }
  }

  if (invalidSubscriptionIds.size > 0) {
    const { error } = await supabase
      .from("web_push_subscriptions")
      .update({ is_active: false, last_used_at: nowIso })
      .in("id", Array.from(invalidSubscriptionIds));

    if (error) {
      console.error("[push-birthday-daily] failed to deactivate invalid subscriptions", error);
    }
  }

  if (deliveredProfileIds.size > 0) {
    const logRows = Array.from(deliveredProfileIds).map((profileId) => ({
      profile_id: profileId,
      date_key: kstToday.dateKey,
      notification_type: "birthday_daily",
      metadata: {
        birthday_count: birthdays.length,
        birthday_profile_ids: birthdays.map((profile) => profile.id),
      },
    }));

    const { error } = await supabase
      .from("notification_daily_delivery_log")
      .upsert(logRows, { onConflict: "profile_id,date_key,notification_type" });

    if (error) {
      console.error("[push-birthday-daily] failed to write daily delivery log", error);
    }
  }

  return json(
    {
      ok: true,
      date_key: kstToday.dateKey,
      birthdays_today: birthdays.length,
      recipients_total: recipientIds.length,
      recipients_pending: pendingRecipientIds.length,
      subscriptions_attempted: attempted,
      delivered,
      failed,
      noop,
      invalidated_subscriptions: invalidSubscriptionIds.size,
      logged_profiles: deliveredProfileIds.size,
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

function getKstDateParts(date = new Date()): { dateKey: string; monthDay: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  const year = partMap.get("year") ?? "0000";
  const month = partMap.get("month") ?? "01";
  const day = partMap.get("day") ?? "01";

  return {
    dateKey: `${year}-${month}-${day}`,
    monthDay: `${month}-${day}`,
  };
}

async function fetchTodaysBirthdays(
  supabase: ReturnType<typeof createClient>,
  monthDay: string,
): Promise<BirthdayProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,birth_date")
    .not("birth_date", "is", null);

  if (error) {
    throw new Error(`Failed to fetch birthdays: ${error.message}`);
  }

  const rows = (data ?? []) as BirthdayProfile[];
  return rows.filter((row) => {
    if (!row.birth_date || row.birth_date.length < 10) {
      return false;
    }

    return row.birth_date.slice(5, 10) === monthDay;
  });
}

async function fetchAllProfileIds(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data, error } = await supabase.from("profiles").select("id");
  if (error) {
    throw new Error(`Failed to fetch profiles: ${error.message}`);
  }

  return uniqueStrings(data?.map((row) => asString((row as JsonRecord).id)) ?? []);
}

async function filterRecipientsBySettings(
  supabase: ReturnType<typeof createClient>,
  profileIds: string[],
): Promise<string[]> {
  if (profileIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("profile_notification_settings")
    .select("profile_id,browser_enabled,birthday_daily_enabled")
    .in("profile_id", profileIds);

  if (error) {
    throw new Error(`Failed to fetch notification settings: ${error.message}`);
  }

  const settingsMap = new Map<string, NotificationSettingsRow>();
  for (const row of data ?? []) {
    const record = row as NotificationSettingsRow;
    settingsMap.set(record.profile_id, record);
  }

  return profileIds.filter((profileId) => {
    const settings = settingsMap.get(profileId);
    const browserEnabled = settings?.browser_enabled ?? true;
    const birthdayDailyEnabled = settings?.birthday_daily_enabled ?? true;
    return browserEnabled && birthdayDailyEnabled;
  });
}

async function fetchDailyDeliveredProfiles(
  supabase: ReturnType<typeof createClient>,
  profileIds: string[],
  dateKey: string,
  notificationType: string,
): Promise<Set<string>> {
  if (profileIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("notification_daily_delivery_log")
    .select("profile_id")
    .eq("date_key", dateKey)
    .eq("notification_type", notificationType)
    .in("profile_id", profileIds);

  if (error) {
    throw new Error(`Failed to fetch daily delivery log: ${error.message}`);
  }

  return new Set(uniqueStrings(data?.map((row) => asString((row as JsonRecord).profile_id)) ?? []));
}

async function fetchActiveSubscriptions(
  supabase: ReturnType<typeof createClient>,
  profileIds: string[],
): Promise<WebPushSubscriptionRow[]> {
  if (profileIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("web_push_subscriptions")
    .select("id,profile_id,endpoint,p256dh,auth,user_agent")
    .eq("is_active", true)
    .in("profile_id", profileIds);

  if (error) {
    throw new Error(`Failed to fetch web push subscriptions: ${error.message}`);
  }

  return (data ?? []) as WebPushSubscriptionRow[];
}

function buildBirthdayDailyPayload(
  dateKey: string,
  birthdays: BirthdayProfile[],
  birthdayNames: string[],
): JsonRecord {
  const title =
    birthdays.length === 1
      ? `Today is ${birthdayNames[0]}'s birthday`
      : `Today has ${birthdays.length} birthdays`;

  const previewNames = birthdayNames.slice(0, 5).join(", ");
  const body =
    birthdays.length === 1
      ? `Send birthday wishes to ${previewNames}.`
      : `Celebrate: ${previewNames}${birthdays.length > 5 ? ", and more" : ""}.`;

  return {
    title,
    body,
    data: {
      table: "profiles",
      notification_type: "birthday_daily",
      date_key: dateKey,
      birthday_profile_ids: birthdays.map((profile) => profile.id),
    },
  };
}

async function sendPush(
  subscription: WebPushSubscriptionRow,
  payload: JsonRecord,
  env: Env,
): Promise<PushResult> {
  const webPush = await getWebPush();
  if (!webPush) {
    console.warn(
      "[push-birthday-daily] web-push unavailable, skipping actual delivery (TODO: install npm:web-push)",
      JSON.stringify({ subscription_id: subscription.id, profile_id: subscription.profile_id }),
    );
    return { ok: true, noOp: true, status: null };
  }

  if (!env.vapidPublicKey || !env.vapidPrivateKey || !env.vapidSubject) {
    console.warn(
      "[push-birthday-daily] missing VAPID env vars, skipping actual delivery",
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
    console.warn("[push-birthday-daily] failed to import npm:web-push", toErrorMessage(error));
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
