"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, Copy, Plus, Share2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { PageSkeleton } from "@/components/motion";
import { dateLabel } from "@/lib/format";

type Invite = { code: string; note: string | null; created_at: string; used_email: string | null; used_at: string | null };
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return `TRAKKR-${[...b].map((x) => ALPHABET[x % ALPHABET.length]).join("")}`;
}
const linkFor = (code: string) => `${window.location.origin}/login?mode=up&invite=${code}`;

export default function InvitesPage() {
  const sb = supabase();
  const [list, setList] = useState<Invite[] | null>(null);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await sb.from("invite_codes").select("code,note,created_at,used_email,used_at").order("created_at", { ascending: false });
    setList((data ?? []) as Invite[]);
  }, [sb]);
  useEffect(() => {
    sb.rpc("is_admin").then(({ data }) => {
      setAdmin(!!data);
      if (data) load();
    });
  }, [sb, load]);

  async function create() {
    setErr(null);
    const code = newCode();
    const { error } = await sb.from("invite_codes").insert({ code, note: note.trim() || null });
    if (error) return setErr(error.message);
    setNote("");
    await load();
    share(code);
  }

  async function share(code: string) {
    const url = linkFor(code);
    const text = `Du är inbjuden till Trakkr! Skapa ditt konto här: ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "Inbjudan till Trakkr", text, url });
      else throw new Error();
    } catch {
      await navigator.clipboard?.writeText(url).catch(() => {});
      setCopied(code);
      setTimeout(() => setCopied(null), 1800);
    }
  }

  async function remove(code: string) {
    setList((l) => l?.filter((x) => x.code !== code) ?? null);
    await sb.from("invite_codes").delete().eq("code", code);
  }

  if (admin === false)
    return (
      <main className="mt-10 text-center text-sm text-ink-3">
        Bara administratörer kan skapa inbjudningar. <Link href="/more" className="text-accent">Tillbaka</Link>
      </main>
    );
  if (!list) return <PageSkeleton rows={3} />;
  const unused = list.filter((i) => !i.used_at).length;

  return (
    <main className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/more" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="h1 flex-1">Inbjudningar</h1>
      </div>

      <section className="card-glow space-y-3 p-4">
        <p className="text-sm text-ink-2">Varje kod kan användas en gång. Länken fyller i koden automatiskt.</p>
        <input className="input" placeholder="Vem är den till? (valfritt)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-primary w-full py-3" onClick={create}>
          <Plus size={18} /> Skapa och dela inbjudan
        </button>
        {err && <p className="text-sm text-danger">{err}</p>}
      </section>

      <div className="eyebrow">
        {list.length} koder · {unused} oanvända
      </div>
      <ul className="card stagger divide-y divide-line overflow-hidden">
        {list.map((i) => (
          <li key={i.code} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className={`font-mono text-sm tracking-wide ${i.used_at ? "text-ink-3 line-through" : "text-ink"}`}>{i.code}</div>
              <div className="truncate text-xs text-ink-3">
                {i.used_at ? `Använd av ${i.used_email ?? "okänd"} · ${dateLabel(i.used_at, { day: "numeric", month: "short" })}` : i.note ?? `Skapad ${dateLabel(i.created_at, { day: "numeric", month: "short" })}`}
              </div>
            </div>
            {!i.used_at && (
              <>
                <button className="rounded-lg p-2 text-ink-2 hover:bg-surface-2" onClick={() => share(i.code)} aria-label="Dela">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={copied === i.code ? "c" : "s"} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="flex">
                      {copied === i.code ? <Check size={17} className="text-accent" /> : typeof navigator !== "undefined" && "share" in navigator ? <Share2 size={17} /> : <Copy size={17} />}
                    </motion.span>
                  </AnimatePresence>
                </button>
                <button className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-danger" onClick={() => remove(i.code)} aria-label="Ta bort">
                  <Trash2 size={16} />
                </button>
              </>
            )}
            {i.used_at && <Check size={17} className="text-accent" />}
          </li>
        ))}
        {list.length === 0 && <li className="p-4 text-sm text-ink-3">Inga koder ännu.</li>}
      </ul>
    </main>
  );
}
