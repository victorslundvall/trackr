"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Check, Repeat, Shield, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { loadExercises } from "@/lib/data";
import { muscleLabel } from "@/lib/format";
import { SIGNAL_LABEL, type Signal } from "@/lib/coach/signals";
import type { Adjustment } from "@/lib/feedback";
import type { CoachAction } from "@/app/api/coach/review/route";
import { TypingDots, spring } from "./motion";

type Review = { id: string; signals: Signal[]; summary: string | null; actions: CoachAction[]; applied: Record<string, boolean> };

/**
 * Coach's second opinion when the feedback signals conflict (sore but stronger, weak pump streak, joints, stagnation).
 * Waits for the rule-based suggestions so the coach can overrule them; `onVeto` tells VolumeAdjustments which muscles to keep.
 */
export default function CoachReview({
  workoutId,
  suggestions,
  onVeto,
  onDone,
}: {
  workoutId: string;
  suggestions: Adjustment[] | null;
  onVeto: (v: Record<string, string>) => void;
  onDone: () => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    loadExercises().then((ex) => setNames(new Map(ex.map((e) => [e.id, e.name]))));
  }, []);

  useEffect(() => {
    if (suggestions === null || started.current) return;
    started.current = true;
    setLoading(true);
    const slow = setTimeout(() => onDone(), 20000); // never block the adjustments for long
    fetch("/api/coach/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workoutId, suggestions: suggestions.map((a) => ({ muscle: a.muscle, exercise_id: a.exercise_id, from: a.from, to: a.to, reason: a.reason })) }),
    })
      .then((r) => r.json())
      .then((j) => {
        const rv = j.review as Review | null;
        setReview(rv);
        const veto: Record<string, string> = {};
        rv?.actions.forEach((a) => {
          if (a.kind === "keep_volume" && a.muscle) veto[a.muscle] = a.message || "behåll volymen";
        });
        if (Object.keys(veto).length) onVeto(veto);
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(slow);
        setLoading(false);
        onDone();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, workoutId]);

  async function apply(a: CoachAction) {
    if (!review || !a.te_id) return;
    setBusy(a.id);
    const sb = supabase();
    if (a.kind === "swap_exercise" && a.replacement_id) {
      await sb.from("template_exercises").update({ exercise_id: a.replacement_id, rationale: `Bytt av coachen: ${a.message}` }).eq("id", a.te_id);
    } else if (a.kind === "rep_range" && a.target_reps) {
      await sb.from("template_exercises").update({ target_reps: a.target_reps }).eq("id", a.te_id);
    }
    const applied = { ...review.applied, [a.id]: true };
    await sb.from("coach_reviews").update({ applied }).eq("id", review.id);
    setReview({ ...review, applied });
    setBusy(null);
  }

  if (loading && !review)
    return (
      <p className="flex items-center gap-2 px-1 text-xs text-ink-3">
        <TypingDots className="text-sky" /> Coachen går igenom feedbacken
      </p>
    );
  if (!review || !review.signals.length || !review.summary) return null;

  const n = (id: string | null) => (id ? names.get(id) ?? "Övningen" : "");

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card-glow p-4">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <Sparkles size={17} className="text-accent" /> Coachens bedömning
      </h2>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {review.signals.map((s, i) => (
          <span key={i} className="rounded-md bg-sky/12 px-2 py-0.5 text-[11px] font-medium text-sky">
            {SIGNAL_LABEL[s.kind]}
            {s.muscle ? ` · ${muscleLabel(s.muscle).toLowerCase()}` : ""}
          </span>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-ink-2">{review.summary}</p>

      {review.actions.length > 0 && (
        <ul className="stagger mt-3 space-y-2">
          {review.actions.map((a) => {
            const done = !!review.applied[a.id];
            const can = !!a.te_id && ((a.kind === "swap_exercise" && !!a.replacement_id) || (a.kind === "rep_range" && !!a.target_reps));
            return (
              <li key={a.id} className="rounded-xl border border-line bg-surface-2/50 p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky/15 text-sky">
                    {a.kind === "swap_exercise" ? <Repeat size={14} /> : a.kind === "keep_volume" ? <Shield size={14} /> : a.kind === "rep_range" ? <ArrowRight size={14} /> : <Sparkles size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {a.kind === "swap_exercise" && (
                        <>
                          Byt {n(a.exercise_id)} → {a.replacement_id ? n(a.replacement_id) : a.replacement_name}
                        </>
                      )}
                      {a.kind === "rep_range" && (
                        <>
                          {n(a.exercise_id)}: {a.current_reps ?? "?"} → {a.target_reps} reps
                        </>
                      )}
                      {a.kind === "keep_volume" && <>Behåll set för {a.muscle ? muscleLabel(a.muscle).toLowerCase() : "muskeln"}</>}
                      {a.kind === "note" && <>Tips</>}
                    </div>
                    <div className="text-xs text-ink-3">{a.message}</div>
                    {a.kind === "swap_exercise" && !a.replacement_id && a.te_id && <div className="mt-1 text-xs text-warm">Övningen finns inte i ditt bibliotek – byt manuellt i passet.</div>}
                    {a.kind === "keep_volume" && <div className="mt-1 text-xs text-sky">Avmarkerat i förslagen nedan.</div>}
                  </div>
                  {can &&
                    (done ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent">
                        <Check size={14} /> Klart
                      </span>
                    ) : (
                      <motion.button whileTap={{ scale: 0.95 }} className="btn-outline shrink-0 px-3 py-1.5 text-xs" disabled={busy === a.id} onClick={() => apply(a)}>
                        {busy === a.id ? "…" : a.kind === "swap_exercise" ? "Byt" : "Ändra"}
                      </motion.button>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
