import { supabase } from "../supabase";

export type NotificationStatus = "unsupported" | "blocked" | "disabled" | "enabled";

function applicationServerKey() {
  const value = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!value) throw new Error("Atlas notifications are not configured yet.");

  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return bytes;
}

export function notificationsSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "disabled";

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "enabled" : "disabled";
}

export async function enableNotifications(userId: string, householdId: string) {
  if (!notificationsSupported()) throw new Error("This device does not support Atlas notifications.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Notifications are blocked. Allow them in Chrome’s Atlas site settings."
      : "Notification permission was not enabled.");
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(),
  });
  const serialized = subscription.toJSON();
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;
  if (!p256dh || !auth) throw new Error("Chrome did not provide a complete notification subscription.");

  const { error } = await supabase.from("push_subscriptions").upsert({
    endpoint: subscription.endpoint,
    p256dh,
    auth,
    user_id: userId,
    household_id: householdId,
    notify_new_requests: true,
    notify_daily_summary: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });

  if (error) {
    await subscription.unsubscribe();
    throw error;
  }
  return "enabled" as const;
}

export async function disableNotifications() {
  if (!notificationsSupported()) return "unsupported" as const;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    if (error) throw error;
    await subscription.unsubscribe();
  }
  return "disabled" as const;
}
