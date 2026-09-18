"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Minus, Sparkles } from "lucide-react";
import { Sheet, TypingDots, spring } from "./motion";
import { enqueue, uuid } from "@/lib/offline";
import { loadExercises } from "@/lib/data";
import type { ReadinessPlan } from "@/app/api/coach/readiness/route";

type Scores = { sleep: number; soreness: number; energy: number; stress: number };
const ROWS: { k: keyof Scores; label: string; lo: string; hi: string; invert?: boolean }[] = [
  { k: "sleep", label: "Sömn", lo: "Dålig", hi: "Toppen" },
  { k: "energy", label: "Energi", lo: "Slut", hi: "Full" },
  { k: "soreness", label: "Träningsvärk", lo: "Ingen", hi: "Mycket", invert: true },
  { k: "stress", label: "Stress", lo: "Lugn", hi: "Hög", invert: true },
];

const VERDICT: Record<ReadinessPlan["verdict"], { cls: string; icon: React.ReactNode }> = {
  push: { cls: "text-accent", icon: <ArrowUp size={16} /> },
  as_planned: { cls: "text-accent", icon: <Minus size={16} /> },
  ease: { cls: "text-warm", icon: <ArrowDown size={16} /> },
  light: { cls: "text-warm", icon: <ArrowDown size={16} /> },
};

/**
 * Pre-workout check-in. Returns via onStart(adjust?) – the caller starts the workout.
 * The coach suggests a plan; the user applies or ignores it.
 */
export default function ReadinessSheet({
  open,
  templateId,
  sessionName,
  onClose,
  onStart,
}: {
  open: boolean;
  templateId: string | null;
  sessionName: string;
  onClose: () => void;
  onStart: (adjust: Map<string, { sets?: number; note?: string }> | undefined, meta: { readinessId: string | null; plan: ReadinessPlan | null }) => Promise<void>;
}) {
  const [s, setS] = useState<Scores>({ sleep: 3, energy: 3, soreness: 2, stress: 2 });
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"form" | "asking" | "plan">("form");
  const [plan, setPlan] = useState<ReadinessPlan | null>(null);
  const [rid, setRid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (open) {
      setPhase("form");
      setPlan(null);
      setErr(null);
      setBusy(false);
    }
  }, [open]);
  useEffect(() => {
    loadExercises()
      .then((ex) => setNames(new Map(ex.map((e) => [e.id, e.name]))))
      .catch(() => {});
  }, []);

  const online = typeof navigator === "undefined" || navigator.onLine;

  async function ask() {
    if (!templateId) return;
    setPhase("asking");
    setErr(null);
    try {
      const res = await fetch("/api/coach/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, ...s, note }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setPlan(j.plan);
      setRid(j.id);
      setPhase("plan");
    } catch (e) {
      setErr((e as Error).message);
      setPhase("form");
    }
  }

  async function startPlain() {
    setBusy(true);
    // log the check-in even without asking the coach (works offline)
    const id = rid ?? uuid();
    if (!rid) enqueue({ table: "readiness", kind: "insert", values: [{ id, template_id: templateId, ...s, note: note || null }] });
    await onStart(undefined, { readinessId: id, plan: null });
  }

  async function applyPlan() {
    if (!plan) return;
    setBusy(true);
    const adjust = new Map(plan.adjustments.map((a) => [a.exercise_id, { sets: a.sets ?? undefined, note: `${a.load}${a.note ? ` – ${a.note}` : ""}` }]));
    await onStart(adjust, { readinessId: rid, plan });
  }

  return (
    <Sheet open={open} onClose={onClose} className="max-h-[90dvh] max-w-md overflow-y-auto">
      <AnimatePresence mode="wait" initial={false}>
        {phase !== "plan" ? (
          <motion.div key="form" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="eyebrow text-accent">Dagsform</div>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight">Hur känns det inför {sessionName}?</h2>
            <div className="mt-4 space-y-4">
              {ROWS.map((r) => (
                <div key={r.k}>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-xs text-ink-3">
                      {r.lo} – {r.hi}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map((v) => {
                      const on = s[r.k] === v;
                      const good = r.invert ? v <= 2 : v >= 4;
                      const bad = r.invert ? v >= 4 : v <= 2;
                      return (
                        <button
                          key={v}
                          onClick={() => setS({ ...s, [r.k]: v })}
                          className={`relative h-10 rounded-xl border text-sm font-semibold transition active:scale-95 ${
                            on ? "border-transparent text-accent-ink" : "border-line bg-surface-2 text-ink-2 hover:text-ink"
                          }`}
                        >
                          {on && (
                            <motion.span
                              layoutId={`ready-${r.k}`}
                              transition={spring}
                              className={`absolute inset-0 rounded-xl ${good ? "bg-accent" : bad ? "bg-warm" : "bg-ink"}`}
                            />
                          )}
                          <span className="relative">{v}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <input className="input text-sm" placeholder="Något coachen bör veta? (t.ex. ont i vänster axel)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {err && <p className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{err}</p>}
            <div className="mt-5 grid gap-2">
              {online && templateId ? (
                <button className="btn-primary py-3.5" onClick={ask} disabled={phase === "asking"}>
                  {phase === "asking" ? (
                    <>
                      <TypingDots /> Coachen planerar…
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Fråga coachen
                    </>
                  )}
                </button>
              ) : (
                <p className="text-center text-xs text-ink-3">Offline – dagsformen sparas och synkas senare.</p>
              )}
              <button className="btn-outline py-3" onClick={startPlain} disabled={busy || phase === "asking"}>
                Starta utan justering
              </button>
            </div>
          </motion.div>
        ) : (
          plan && (
            <motion.div key="plan" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <div className="eyebrow text-accent">Coachens plan</div>
              <h2 className={`mt-0.5 flex items-center gap-2 text-xl font-bold tracking-tight ${VERDICT[plan.verdict].cls}`}>
                {VERDICT[plan.verdict].icon}
                {plan.headline}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{plan.summary}</p>
              {plan.adjustments.length > 0 ? (
                <ul className="stagger mt-4 divide-y divide-line rounded-xl border border-line">
                  {plan.adjustments.map((a) => (
                    <li key={a.exercise_id} className="px-3 py-2.5 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{names.get(a.exercise_id) ?? "Övning"}</span>
                        <span className="shrink-0 text-xs font-semibold text-accent">
                          {a.sets != null ? `${a.sets} set · ` : ""}
                          {a.load}
                        </span>
                      </div>
                      {a.note && <div className="text-xs text-ink-3">{a.note}</div>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl bg-accent/10 p-3 text-sm text-accent">Inga ändringar – kör passet som det är.</p>
              )}
              <div className="mt-5 grid gap-2">
                <button className="btn-primary py-3.5" onClick={applyPlan} disabled={busy}>
                  {plan.adjustments.length ? "Använd planen och starta" : "Starta passet"}
                </button>
                {plan.adjustments.length > 0 && (
                  <button className="btn-outline py-3" onClick={startPlain} disabled={busy}>
                    Ignorera – kör som vanligt
                  </button>
                )}
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </Sheet>
  );
}
