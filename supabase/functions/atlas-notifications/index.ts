import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-atlas-cron-secret",
};

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface AtlasTask {
  title?: string;
  status?: string;
  plannedFor?: string | null;
  section?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function phoenixDateKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function sendPushes(
  admin: ReturnType<typeof createClient>,
  subscriptions: PushSubscriptionRow[],
  payload: Record<string, unknown>,
) {
  const expiredIds: string[] = [];
  const serialized = JSON.stringify(payload);

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, serialized, { TTL: 60 * 60 });
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) expiredIds.push(subscription.id);
      else console.error("Atlas push delivery failed", statusCode || error);
    }
  }));

  if (expiredIds.length) {
    await admin.from("push_subscriptions").delete().in("id", expiredIds);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return json({ error: "Notification service is not configured" }, 503);
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "https://rdripley.github.io/Atlas/",
    vapidPublicKey,
    vapidPrivateKey,
  );

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  if (body.action === "daily_summary") {
    if (request.headers.get("x-atlas-cron-secret") !== Deno.env.get("ATLAS_CRON_SECRET")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const [{ data: states, error: stateError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
      admin.from("atlas_states").select("household_id, state"),
      admin.from("push_subscriptions").select("id, household_id, endpoint, p256dh, auth").eq("notify_daily_summary", true),
    ]);
    if (stateError || subscriptionError) return json({ error: "Could not load daily plans" }, 500);

    const today = phoenixDateKey();
    for (const row of states ?? []) {
      const state = row.state as { tasks?: AtlasTask[] };
      const tasks = (state.tasks ?? []).filter((task) =>
        task.status !== "Completed" &&
        task.plannedFor !== null &&
        (task.plannedFor ? task.plannedFor <= today : task.section !== "Tomorrow")
      );
      if (!tasks.length) continue;

      const householdSubscriptions = (subscriptions ?? [])
        .filter((subscription) => subscription.household_id === row.household_id) as PushSubscriptionRow[];
      const preview = tasks.slice(0, 3).map((task) => task.title).filter(Boolean).join(" · ");
      await sendPushes(admin, householdSubscriptions, {
        title: `Today in Atlas · ${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
        body: preview,
        tag: `atlas-daily-${today}`,
        url: "/Atlas/",
      });
    }
    return json({ delivered: true });
  }

  if (body.action !== "new_request") return json({ error: "Unknown notification action" }, 400);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult.user) return json({ error: "Unauthorized" }, 401);

  const { data: membership, error: membershipError } = await userClient
    .from("household_members")
    .select("household_id, display_name")
    .eq("user_id", userResult.user.id)
    .single();
  if (membershipError || !membership) return json({ error: "Household membership not found" }, 403);

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("household_id", membership.household_id)
    .eq("notify_new_requests", true)
    .neq("user_id", userResult.user.id);
  if (subscriptionError) return json({ error: "Could not load notification devices" }, 500);

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "New household request";
  const urgent = body.urgent === true;
  await sendPushes(admin, (subscriptions ?? []) as PushSubscriptionRow[], {
    title: urgent ? `Urgent request from ${membership.display_name}` : `New request from ${membership.display_name}`,
    body: title,
    tag: urgent ? "atlas-urgent-request" : "atlas-new-request",
    urgent,
    url: "/Atlas/",
  });
  return json({ delivered: true });
});
