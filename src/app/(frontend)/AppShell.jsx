"use client";
import { useState, useEffect, useCallback } from "react";
import { Dashboard, LOGO_B64 } from "./Dashboard";
import AnalyticsDashboard from "./AnalyticsDashboard";

// ─── Brand (kept local so this shell has no heavy deps) ───────────────────────
const C = {
  green: "#84c561", greenDark: "#6aad49",
  blue: "#075c8f", dark: "#404041",
  bg: "#f2f2f2", white: "#ffffff", border: "#e5e7eb",
  mid: "#6b7280", red: "#dc2626",
};

const API = "/api"; // same-origin Payload API

// ─── Map a Payload user → the { role, regions } shape the Packages dashboard expects
function toPackagesSession(u) {
  let role = "rm";
  if (u.superAdmin) role = "manager";
  else if (u.department === "sales" && u.level === "manager") role = "manager";
  else if (u.department === "sales" && u.level === "member") role = "rm";
  else if (u.department === "marketing") role = "reports";
  return {
    user: { name: u.name || u.username, role, regions: u.regions?.length ? u.regions : null },
    loginTime: Date.now(),
  };
}

const canSeePackages = (u) => Boolean(u?.superAdmin) || u?.department === "sales";
const canSeeAnalytics = (u) => Boolean(u?.superAdmin) || u?.department === "marketing";

// ══════════════════════════════════════════════════════════════════════════════
export default function AppShell() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const [app, setApp] = useState(null); // 'packages' | 'analytics' | null

  const fetchMe = useCallback(async () => {
    try {
      const r = await fetch(`${API}/users/me`, { credentials: "include" });
      const d = await r.json();
      setUser(d?.user || null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  // Auto-route when the user can only see one app (skip the picker)
  useEffect(() => {
    if (!user) return;
    const p = canSeePackages(user), a = canSeeAnalytics(user);
    if (p && !a) setApp("packages");
    else if (a && !p) setApp("analytics");
  }, [user]);

  const logout = useCallback(async () => {
    try { await fetch(`${API}/users/logout`, { method: "POST", credentials: "include" }); } catch {}
    setUser(null); setApp(null);
  }, []);

  if (user === undefined) return <FullScreen><Spinner /></FullScreen>;
  if (!user) return <LoginScreen onAuthed={fetchMe} />;

  // Selected Packages → hand off to the existing dashboard with a compat session
  if (app === "packages") {
    return <Dashboard session={toPackagesSession(user)} onLogout={logout} />;
  }
  if (app === "analytics") {
    return <AnalyticsDashboard user={user} onBack={user.superAdmin ? () => setApp(null) : null} onLogout={logout} />;
  }

  // Super-admin (or anyone with both) → app picker
  return <AppPicker user={user} onPick={setApp} onLogout={logout} />;
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({ onAuthed }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) { setErr("Please enter your username and password."); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      });
      if (r.ok) { await onAuthed(); }
      else { setErr("Incorrect username or password. Please try again."); setLoading(false); }
    } catch {
      setErr("Could not reach the server. Please try again."); setLoading(false);
    }
  };

  return (
    <FullScreen>
      <div style={{ width: 360, background: C.white, borderRadius: 16, padding: 32, boxShadow: "0 10px 40px rgba(0,0,0,.12)" }}>
        <img src={`data:image/svg+xml;base64,${LOGO_B64}`} alt="easyMarkets" style={{ height: 34, marginBottom: 24 }} />
        <div style={{ fontSize: 20, fontWeight: 700, color: C.dark, marginBottom: 4 }}>Sign in</div>
        <div style={{ fontSize: 13, color: C.mid, marginBottom: 24 }}>Internal tools · easyMarkets</div>

        <label style={lbl}>Username</label>
        <input value={username} autoFocus
          onChange={(e) => { setUsername(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. natalia.a" style={inp} />

        <label style={lbl}>Password</label>
        <div style={{ position: "relative" }}>
          <input value={password} type={show ? "text" : "password"}
            onChange={(e) => { setPassword(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="••••••••" style={inp} />
          <button onClick={() => setShow((s) => !s)} style={eyeBtn} tabIndex={-1}>{show ? "Hide" : "Show"}</button>
        </div>

        {err && <div style={{ color: C.red, fontSize: 13, margin: "10px 0 0" }}>{err}</div>}

        <button onClick={submit} disabled={loading}
          style={{ ...primaryBtn, marginTop: 20, opacity: loading ? 0.7 : 1 }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </FullScreen>
  );
}

// ─── App picker (super-admin / multi-app users) ───────────────────────────────
function AppPicker({ user, onPick, onLogout }) {
  const tiles = [];
  if (canSeePackages(user)) tiles.push({ id: "packages", title: "Packages Journey", desc: "Client journey tracking for the packages campaign.", accent: C.green, icon: "📦" });
  if (canSeeAnalytics(user)) tiles.push({ id: "analytics", title: "Marketing Analytics", desc: "Global email & push performance across all campaigns.", accent: C.blue, icon: "📊" });

  return (
    <FullScreen>
      <div style={{ width: "min(760px, 92vw)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <img src={`data:image/svg+xml;base64,${LOGO_B64}`} alt="easyMarkets" style={{ height: 30 }} />
          <div style={{ fontSize: 13, color: C.mid }}>
            {user.name} · <button onClick={onLogout} style={linkBtn}>Sign out</button>
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.dark, marginBottom: 6 }}>Choose an app</div>
        <div style={{ fontSize: 14, color: C.mid, marginBottom: 24 }}>You have access to the following tools.</div>
        <div style={{ display: "grid", gridTemplateColumns: tiles.length > 1 ? "1fr 1fr" : "1fr", gap: 16 }}>
          {tiles.map((t) => (
            <button key={t.id} onClick={() => onPick(t.id)} style={tileStyle(t.accent)}>
              <div style={{ fontSize: 32 }}>{t.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.dark, marginTop: 10 }}>{t.title}</div>
              <div style={{ fontSize: 13, color: C.mid, marginTop: 4, lineHeight: 1.5 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </FullScreen>
  );
}

// ─── Analytics placeholder (built in the next step) ───────────────────────────
function AnalyticsPlaceholder({ user, onBack, onLogout }) {
  return (
    <FullScreen>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 40 }}>📊</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.dark, marginTop: 12 }}>Marketing Analytics</div>
        <div style={{ fontSize: 14, color: C.mid, marginTop: 8, lineHeight: 1.6 }}>
          Signed in as <strong>{user.name}</strong>. The analytics app is being built — data layer and dashboards come next.
        </div>
        <div style={{ marginTop: 22, display: "flex", gap: 10, justifyContent: "center" }}>
          {onBack && <button onClick={onBack} style={ghostBtn}>← Apps</button>}
          <button onClick={onLogout} style={ghostBtn}>Sign out</button>
        </div>
      </div>
    </FullScreen>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────
const FullScreen = ({ children }) => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: C.bg, padding: 24, fontFamily: "system-ui" }}>{children}</div>
);
const Spinner = () => (
  <div style={{ width: 34, height: 34, border: `3px solid ${C.border}`, borderTopColor: C.green, borderRadius: "50%", animation: "emspin 0.8s linear infinite" }}>
    <style>{`@keyframes emspin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const lbl = { display: "block", fontSize: 12, fontWeight: 600, color: C.mid, margin: "14px 0 6px" };
const inp = { width: "100%", padding: "11px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "system-ui" };
const primaryBtn = { width: "100%", padding: "12px", background: C.green, color: C.white, border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer" };
const ghostBtn = { padding: "9px 16px", background: C.white, color: C.dark, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" };
const linkBtn = { background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 };
const eyeBtn = { position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 12, fontWeight: 600 };
const tileStyle = (accent) => ({ textAlign: "left", background: C.white, border: `1px solid ${C.border}`, borderTop: `3px solid ${accent}`, borderRadius: 12, padding: 22, cursor: "pointer", transition: "box-shadow .15s", boxShadow: "0 1px 3px rgba(0,0,0,.06)" });