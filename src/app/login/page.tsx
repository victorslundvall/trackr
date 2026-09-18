"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabase();
    if (mode === "in") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg({ kind: "err", text: error.message === "Invalid login credentials" ? "Fel e-post eller lösenord." : error.message });
      else window.location.href = "/";
    } else {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setMsg({ kind: "err", text: error.message });
      else if (data.session) window.location.href = "/";
      else setMsg({ kind: "ok", text: "Kolla din mejl och klicka på bekräftelselänken." });
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-[80dvh] flex-col justify-center">
      <div className="mb-10">
        <div className="text-4xl font-black tracking-tight">
          Trackr<span className="text-accent">.</span>
        </div>
        <p className="mt-2 text-ink-2">Logga passen. Se framstegen.</p>
      </div>
      <form onSubmit={submit} className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="email">E-post</label>
          <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pw">Lösenord</label>
          <input
            id="pw"
            type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            minLength={6}
            required
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {msg && <p className={`text-sm ${msg.kind === "err" ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {mode === "in" ? "Logga in" : "Skapa konto"}
        </button>
        <button type="button" className="w-full text-center text-sm text-ink-2" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Inget konto? Skapa ett" : "Har redan konto? Logga in"}
        </button>
      </form>
    </main>
  );
}
