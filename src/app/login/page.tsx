"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, KeyRound } from "lucide-react";
import Logo from "@/components/Logo";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  // /login?mode=up&invite=CODE (the link in an invitation)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") === "up" || q.get("invite")) setMode("up");
    if (q.get("invite")) setInvite(q.get("invite")!.toUpperCase());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabase();
    if (mode === "in") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg({ kind: "err", text: error.message === "Invalid login credentials" ? "Fel e-post eller lösenord." : error.message });
      else window.location.href = "/home";
    } else {
      const code = invite.trim().toUpperCase();
      const { data: ok } = await sb.rpc("check_invite", { p_code: code });
      if (!ok) {
        setMsg({ kind: "err", text: "Inbjudningskoden är ogiltig eller redan använd." });
        return setBusy(false);
      }
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback`, data: { invite_code: code } },
      });
      if (error) {
        const dbErr = /database error/i.test(error.message);
        setMsg({ kind: "err", text: dbErr ? "Kunde inte skapa kontot – koden kan just ha använts. Kontakta den som bjöd in dig." : error.message });
      } else if (data.session) window.location.href = "/home";
      else setMsg({ kind: "ok", text: "Nästan klart! Kolla din mejl och klicka på bekräftelselänken." });
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-[85dvh] flex-col justify-center">
      <Link href="/" className="mb-8 inline-flex w-fit items-center gap-1 text-sm text-ink-3 hover:text-ink-2">
        <ChevronLeft size={16} /> trakkr.se
      </Link>
      <div className="mb-8">
        <Logo size={44} animate />
        <p className="mt-3 text-ink-2">{mode === "in" ? "Välkommen tillbaka." : "Skapa ditt konto med din inbjudningskod."}</p>
      </div>

      <div className="mb-3 flex rounded-xl border border-line bg-surface p-1">
        {(
          [
            ["in", "Logga in"],
            ["up", "Skapa konto"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setMode(k);
              setMsg(null);
            }}
            className={`relative flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${mode === k ? "text-ink" : "text-ink-3"}`}
          >
            {mode === k && <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-lg bg-surface-2" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            <span className="relative">{l}</span>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="card space-y-4 p-5">
        <AnimatePresence initial={false}>
          {mode === "up" && (
            <motion.div key="invite" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <label className="label" htmlFor="invite">
                Inbjudningskod
              </label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent" />
                <input
                  id="invite"
                  required
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="input pl-9 font-mono uppercase tracking-wider"
                  placeholder="TRAKKR-XXXXXX"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value.toUpperCase())}
                />
              </div>
              <p className="mt-1.5 text-xs text-ink-3">Trakkr är just nu bara öppet för inbjudna.</p>
            </motion.div>
          )}
        </AnimatePresence>
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
        <button className="btn-primary w-full py-3" disabled={busy}>
          {busy ? "Vänta…" : mode === "in" ? "Logga in" : "Skapa konto"}
        </button>
      </form>
    </main>
  );
}
