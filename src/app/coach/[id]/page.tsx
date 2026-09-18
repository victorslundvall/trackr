"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowUp, Check, ChevronLeft, Loader2, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { coachStream, matchExercises, saveProgram, splitQuickReplies, type MatchRow } from "@/lib/coach/client";
import { isValidDraft, type ProgramDraft } from "@/lib/coach/program";
import Markdown from "@/components/Markdown";
import ProgramView from "@/components/ProgramView";

type Msg = { id?: string; role: "user" | "assistant"; content: string; program_draft: ProgramDraft | null };
type Chat = { id: string; title: string; profile: Record<string, unknown>; program_id: string | null };

export default function CoachChat() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [chat, setChat] = useState<Chat | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ProgramDraft | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode's double effect run: a stale load must not wipe an in-flight reply.
    let cancelled = false;
    const sb = supabase();
    Promise.all([
      sb.from("coach_chats").select("id,title,profile,program_id").eq("id", id).single(),
      sb.from("coach_messages").select("id,role,content,program_draft").eq("chat_id", id).order("created_at"),
    ]).then(([{ data: c }, { data: m }]) => {
      if (cancelled) return;
      if (!c) return router.replace("/coach");
      setChat(c);
      const list = (m ?? []) as Msg[];
      setMsgs(list);
      const intro = sessionStorage.getItem(`coach-intro-${id}`);
      if (!list.length && intro && !started.current) {
        started.current = true;
        sessionStorage.removeItem(`coach-intro-${id}`);
        send(intro);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, status]);

  /** retry=true: ask for a new reply to the conversation as it is (e.g. after an error) without adding a user message. */
  async function send(text: string, retry = false) {
    if ((!retry && !text.trim()) || streaming) return;
    setError(null);
    if (!retry) setInput("");
    setStreaming(true);
    setMsgs((m) => [...m, ...(retry ? [] : [{ role: "user" as const, content: text.trim(), program_draft: null }]), { role: "assistant", content: "", program_draft: null }]);
    const patchLast = (f: (m: Msg) => Msg) =>
      setMsgs((m) => {
        const last = m[m.length - 1];
        if (!last || last.role !== "assistant") return [...m, f({ role: "assistant", content: "", program_draft: null })];
        return [...m.slice(0, -1), f(last)];
      });
    try {
      for await (const ev of coachStream(id, retry ? "" : text)) {
        if (ev.t === "text") {
          setStatus(null);
          patchLast((m) => ({ ...m, content: m.content + ev.d }));
        } else if (ev.t === "status") setStatus(ev.d);
        else if (ev.t === "program") {
          setStatus(null);
          patchLast((m) => ({ ...m, program_draft: ev.d }));
          setChat((c) => (c ? { ...c, title: ev.d.name } : c));
        } else if (ev.t === "error") setError(ev.d);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatus(null);
      setStreaming(false);
      setMsgs((m) => (m[m.length - 1]?.role === "assistant" && !m[m.length - 1].content && !m[m.length - 1].program_draft ? m.slice(0, -1) : m));
    }
  }

  if (!chat) return <div className="py-20 text-center text-ink-3">Laddar…</div>;

  const lastDraftIdx = msgs.map((m) => isValidDraft(m.program_draft)).lastIndexOf(true);
  const last = msgs[msgs.length - 1];
  const quick = !streaming && last?.role === "assistant" ? splitQuickReplies(last.content).options : [];

  return (
    <main className="flex min-h-[calc(100dvh-2.5rem)] flex-col">
      <header className="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-2 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-md">
        <Link href="/coach" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{chat.title}</div>
          <div className="text-xs text-ink-3">Trackr Coach</div>
        </div>
        {chat.program_id && (
          <Link href={`/programs/${chat.program_id}`} className="btn-ghost px-3 py-2 text-xs">
            Programmet
          </Link>
        )}
      </header>

      <div className="flex-1 space-y-4 pb-40">
        {msgs.map((m, i) => {
          const isUser = m.role === "user";
          const { clean } = splitQuickReplies(m.content);
          const typing = streaming && i === msgs.length - 1 && !isUser;
          return (
            <div key={m.id ?? i} className={isUser ? "flex justify-end" : ""}>
              {isUser ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/15 px-3.5 py-2.5 text-sm text-ink">{m.content}</div>
              ) : (
                <div className="space-y-3">
                  {(clean || typing) && (
                    <div className="flex gap-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
                        <Sparkles size={14} />
                      </span>
                      <div className="min-w-0 flex-1 pt-1 text-sm leading-relaxed text-ink-2">
                        {clean ? <Markdown text={clean} /> : <span className="text-ink-3">Tänker…</span>}
                      </div>
                    </div>
                  )}
                  {m.program_draft && isValidDraft(m.program_draft) && (
                    <div className={`card p-4 ${i === lastDraftIdx ? "border-accent/40" : "opacity-70"}`}>
                      {i !== lastDraftIdx && <div className="mb-2 text-xs uppercase tracking-wide text-ink-3">Tidigare version</div>}
                      <ProgramView draft={m.program_draft} initiallyOpen={i === lastDraftIdx} />
                      {i === lastDraftIdx && (
                        <button className="btn-primary mt-4 w-full py-3" onClick={() => setSaving(m.program_draft)}>
                          <Check size={18} /> {chat.program_id ? "Uppdatera sparat program" : "Spara program"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {status && (
          <div className="flex items-center gap-2 pl-9 text-sm text-ink-3">
            <Loader2 size={15} className="animate-spin" /> {status}
          </div>
        )}
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        {!streaming && last?.role === "user" && (
          <button className="btn-ghost w-full" onClick={() => send("", true)}>
            Inget svar – försök igen
          </button>
        )}
        <div ref={bottom} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-4 py-3">
          {quick.length > 0 && (
            <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4">
              {quick.map((q) => (
                <button key={q} onClick={() => send(q)} className="chip shrink-0 border-accent/50 py-1.5 text-sm text-ink">
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              className="input max-h-40 min-h-[2.75rem] resize-none py-2.5"
              rows={1}
              placeholder={lastDraftIdx >= 0 ? "Be om ändringar, t.ex. “byt bänkpress mot hantelpress”" : "Svara coachen…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button className="btn-primary h-11 w-11 shrink-0 p-0" disabled={streaming || !input.trim()} aria-label="Skicka">
              {streaming ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={20} />}
            </button>
          </form>
        </div>
      </div>

      {saving && (
        <SaveDialog
          draft={saving}
          chat={chat}
          onClose={() => setSaving(null)}
          onSaved={(pid) => router.push(`/programs/${pid}`)}
        />
      )}
    </main>
  );
}

function SaveDialog({ draft, chat, onClose, onSaved }: { draft: ProgramDraft; chat: Chat; onClose: () => void; onSaved: (id: string) => void }) {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [useMatch, setUseMatch] = useState<Record<string, boolean>>({});
  const [deload, setDeload] = useState(chat.profile.deload !== false && draft.week_plan.some((w) => w.deload));
  const [activate, setActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasDeload = draft.week_plan.some((w) => w.deload);

  useEffect(() => {
    const names = [...new Set(draft.days.flatMap((d) => d.exercises.map((e) => e.name)))];
    matchExercises(names).then(setMatches);
  }, [draft]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const pid = await saveProgram({ draft, chatId: chat.id, programId: chat.program_id, includeDeload: deload, activate, matches: matches ?? [], useMatch });
      onSaved(pid);
    } catch (e) {
      setErr((e as { message?: string }).message ?? "Kunde inte spara.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onClose}>
      <div className="card max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{chat.program_id ? "Uppdatera program" : "Spara program"}</h2>
        <p className="mt-1 text-sm text-ink-2">Varje dag blir en mall. Övningarna kopplas till dina befintliga där det går.</p>

        <div className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-3">Övningar</div>
        {!matches ? (
          <p className="py-4 text-sm text-ink-3">Matchar övningar…</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-line rounded-xl border border-line">
            {matches.map((m) => {
              const exact = m.exercise_id && m.matched_name?.toLowerCase() === m.name.toLowerCase();
              const using = m.exercise_id && useMatch[m.name] !== false;
              return (
                <li key={m.name} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{m.name}</div>
                    <div className="truncate text-xs text-ink-3">
                      {using ? (exact ? (m.own ? "Din övning" : "Från biblioteket") : `→ ${m.matched_name}${m.own ? " (din)" : ""}`) : "Ny övning skapas"}
                    </div>
                  </div>
                  {m.exercise_id && !exact && (
                    <button className="chip shrink-0" onClick={() => setUseMatch((u) => ({ ...u, [m.name]: u[m.name] === false }))}>
                      {using ? "Skapa ny" : "Använd match"}
                    </button>
                  )}
                  {using ? <Check size={16} className="shrink-0 text-accent" /> : <Plus size={16} className="shrink-0 text-ink-3" />}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 space-y-3">
          {hasDeload && (
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={deload} onChange={(e) => setDeload(e.target.checked)} />
              Ta med deload-veckan
            </label>
          )}
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
            Gör till mitt aktiva program
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-5 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>Avbryt</button>
          <button className="btn-primary flex-1" onClick={save} disabled={busy || !matches}>
            {busy ? "Sparar…" : "Spara"}
          </button>
        </div>
      </div>
    </div>
  );
}
