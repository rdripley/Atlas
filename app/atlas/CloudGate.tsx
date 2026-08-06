import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import AtlasApp from "./AtlasApp";
import { createSeedState } from "./seed";
import { loadState } from "./storage";
import type { AtlasState, Profile } from "./types";
import type { Thought } from "./types";
import {
  disableNotifications,
  enableNotifications,
  getNotificationStatus,
  type NotificationStatus,
} from "./notifications";

type AuthMode = "sign-in" | "sign-up";
type OnboardingMode = "create" | "join";
type SyncStatus = "Saved" | "Saving…" | "Offline";

interface Membership {
  householdId: string;
  householdName: string;
  inviteCode: string;
  displayName: string;
  role: Profile;
}

interface MembershipRow {
  household_id: string;
  display_name: string;
  role: Profile;
  households: {
    name: string;
    invite_code: string;
  } | null;
}

function normalizeInviteCode(value: string) {
  const characters = value
    .toUpperCase()
    .replaceAll("O", "0")
    .replace(/[IL]/g, "1")
    .replace(/[^A-F0-9]/g, "")
    .slice(0, 8);
  return characters.length > 4
    ? `${characters.slice(0, 4)}-${characters.slice(4)}`
    : characters;
}

function AtlasMark() {
  return <span className="auth-mark" aria-hidden="true">A</span>;
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-card auth-loading" aria-live="polite">
        <AtlasMark />
        <p className="eyebrow">Atlas</p>
        <h1>{message}</h1>
      </section>
    </main>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const result = mode === "sign-up"
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: "https://rdripley.github.io/Atlas/" },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your email and confirm your Atlas account, then return here to sign in.");
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <AtlasMark />
        <p className="eyebrow">Shared household</p>
        <h1>Welcome to Atlas.</h1>
        <p className="auth-intro">Sign in to keep your household requests and plans synced across devices.</p>
        <div className="auth-tabs" aria-label="Account action">
          <button type="button" className={mode === "sign-in" ? "active" : ""} onClick={() => { setMode("sign-in"); setMessage(""); }}>
            Sign in
          </button>
          <button type="button" className={mode === "sign-up" ? "active" : ""} onClick={() => { setMode("sign-up"); setMessage(""); }}>
            Create account
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}
          </button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <p className="auth-fine-print">Use separate accounts for Russ and Andrea. Both accounts will join the same private household.</p>
      </section>
    </main>
  );
}

function OnboardingScreen({ session, onReady }: { session: Session; onReady: () => Promise<void> }) {
  const [mode, setMode] = useState<OnboardingMode>("create");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    if (mode === "create") {
      const { data, error } = await supabase.rpc("create_atlas_household", {
        p_display_name: displayName.trim(),
        p_household_name: "Atlas Household",
      });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }

      const result = data as { household_id: string };
      const initialState = { ...loadState(), profile: "planner" as const };
      const saveResult = await supabase.from("atlas_states").insert({
        household_id: result.household_id,
        state: initialState,
        updated_by: session.user.id,
      });
      if (saveResult.error) {
        setMessage(saveResult.error.message);
        setBusy(false);
        return;
      }
    } else {
      const { error } = await supabase.rpc("join_atlas_household", {
        p_display_name: displayName.trim(),
        p_invite_code: normalizeInviteCode(inviteCode),
      });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
    }

    await onReady();
    setBusy(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <AtlasMark />
        <p className="eyebrow">One household, two accounts</p>
        <h1>Set up your place.</h1>
        <p className="auth-intro">Russ creates the household first. Andrea joins afterward using the private invite code in Settings.</p>
        <div className="auth-tabs" aria-label="Household setup">
          <button type="button" className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setMessage(""); }}>
            Create household
          </button>
          <button type="button" className={mode === "join" ? "active" : ""} onClick={() => { setMode("join"); setMessage(""); }}>
            Join household
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Your name
            <input
              autoComplete="name"
              placeholder={mode === "create" ? "Russ" : "Andrea"}
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          {mode === "join" && (
            <label>
              Household invite code
              <input
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="XXXX-XXXX"
                required
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
              />
              <span className="field-hint">You can paste the code with or without the hyphen. Atlas corrects common O/0 and I/1 mix-ups.</span>
            </label>
          )}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Working…" : mode === "create" ? "Create Atlas household" : "Join Atlas household"}
          </button>
        </form>
        {message && <p className="auth-message" role="alert">{message}</p>}
      </section>
    </main>
  );
}

export default function CloudGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [cloudState, setCloudState] = useState<AtlasState | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("Saved");
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>("disabled");
  const saveTimer = useRef<number | null>(null);

  const loadHousehold = useCallback(async (activeSession: Session) => {
    setLoading(true);
    const membershipResult = await supabase
      .from("household_members")
      .select("household_id, display_name, role, households(name, invite_code)")
      .eq("user_id", activeSession.user.id)
      .maybeSingle();

    if (membershipResult.error) {
      setLoading(false);
      throw membershipResult.error;
    }

    if (!membershipResult.data) {
      setMembership(null);
      setCloudState(null);
      setLoading(false);
      return;
    }

    const row = membershipResult.data as unknown as MembershipRow;
    const nextMembership: Membership = {
      householdId: row.household_id,
      householdName: row.households?.name ?? "Atlas Household",
      inviteCode: row.households?.invite_code ?? "",
      displayName: row.display_name,
      role: row.role,
    };
    setMembership(nextMembership);

    const stateResult = await supabase
      .from("atlas_states")
      .select("state")
      .eq("household_id", row.household_id)
      .maybeSingle();

    if (stateResult.error) {
      setLoading(false);
      throw stateResult.error;
    }

    const savedState = stateResult.data?.state as AtlasState | undefined;
    if (savedState) {
      setCloudState({ ...savedState, profile: nextMembership.role });
    } else {
      const fallbackState = { ...createSeedState(), profile: nextMembership.role };
      const insertResult = await supabase.from("atlas_states").insert({
        household_id: nextMembership.householdId,
        state: fallbackState,
        updated_by: activeSession.user.id,
      });
      if (insertResult.error) {
        setLoading(false);
        throw insertResult.error;
      }
      setCloudState(fallbackState);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) {
        loadHousehold(data.session).catch(() => {
          setSyncStatus("Offline");
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        loadHousehold(nextSession).catch(() => {
          setSyncStatus("Offline");
          setLoading(false);
        });
      } else {
        setMembership(null);
        setCloudState(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadHousehold]);

  useEffect(() => {
    if (!membership || !session) return;
    const channel = supabase
      .channel(`atlas-household-${membership.householdId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "atlas_states",
          filter: `household_id=eq.${membership.householdId}`,
        },
        (payload) => {
          const next = payload.new as { state?: AtlasState; updated_by?: string };
          if (next.updated_by !== session.user.id && next.state) {
            setCloudState({ ...next.state, profile: membership.role });
            setSyncStatus("Saved");
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [membership, session]);

  useEffect(() => {
    if (!membership || !session) return;
    getNotificationStatus()
      .then(setNotificationStatus)
      .catch(() => setNotificationStatus("disabled"));
  }, [membership, session]);

  const turnOnNotifications = useCallback(async () => {
    if (!membership || !session) return;
    const status = await enableNotifications(session.user.id, membership.householdId);
    setNotificationStatus(status);
  }, [membership, session]);

  const turnOffNotifications = useCallback(async () => {
    const status = await disableNotifications();
    setNotificationStatus(status);
  }, []);

  const notifyHousehold = useCallback(async (thought: Thought) => {
    if (!membership || !session) return;
    await supabase.functions.invoke("atlas-notifications", {
      body: {
        action: "new_request",
        title: thought.text.slice(0, 240),
        urgent: thought.urgent,
      },
    });
  }, [membership, session]);

  const saveCloudState = useCallback((nextState: AtlasState) => {
    if (!membership || !session) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    setSyncStatus("Saving…");
    saveTimer.current = window.setTimeout(async () => {
      const result = await supabase.from("atlas_states").upsert({
        household_id: membership.householdId,
        state: { ...nextState, profile: membership.role },
        updated_at: new Date().toISOString(),
        updated_by: session.user.id,
      });
      setSyncStatus(result.error ? "Offline" : "Saved");
    }, 500);
  }, [membership, session]);

  if (loading) return <LoadingScreen message="Opening your household…" />;
  if (!session) return <AuthScreen />;
  if (!membership) return <OnboardingScreen session={session} onReady={() => loadHousehold(session)} />;
  if (!cloudState) return <LoadingScreen message="Preparing Atlas…" />;

  return (
    <AtlasApp
      initialState={cloudState}
      fixedProfile={membership.role}
      onStateChange={saveCloudState}
      onThoughtCaptured={(thought) => { void notifyHousehold(thought); }}
      account={{
        displayName: membership.displayName,
        email: session.user.email ?? "",
        householdName: membership.householdName,
        inviteCode: membership.inviteCode,
        syncStatus,
        notificationStatus,
        onEnableNotifications: turnOnNotifications,
        onDisableNotifications: turnOffNotifications,
        onSignOut: () => supabase.auth.signOut(),
      }}
    />
  );
}
