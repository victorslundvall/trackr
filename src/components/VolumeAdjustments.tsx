"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Activity, ArrowDown, ArrowUp, Check } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { loadExercises } from "@/lib/data";
import { loadSettings } from "@/lib/settings";
import { plannedWeekly, suggestAdjustments, type Adjustment, type MuscleFeedback, type TplEx } from "@/lib/feedback";
import type { WeekPlan } from "@/lib/coach/program";
import { spring } from "./motion";
import { estimateZones, type FeedbackRow } from "@/lib/zones";

/** After a program session: turn the muscle feedback into set changes for next time. */
/** `veto`: muscle → coach's reason to keep the volume (from the coach review). Those rows start deselected. */
export default function VolumeAdjustments({
  workoutId,
  templateId,
  veto,
  waiting,
  onReady,
}: {
  workoutId: string;
  templateId: string | null;
  veto?: Record<string, string>;
  waiting?: boolean; // coach review still running – hold the apply button
  onReady?: (list: Adjustment[]) => void;
}) {
  const [adj, setAdj] = useState<Adjustment[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [hadFeedback, setHadFeedback] = useState(false);

  useEffect(() => {
    if (!templateId) {
      onReady?.([]);
      return;
    }
    const sb = supabase();
    (async () => {
      const [{ data: fb }, { data: tpl }, { data: done }, exs, settings, { data: hist }] = await Promise.all([
        sb.from("muscle_feedback").select("muscle,recovery,pump,effort,joint_pain").eq("workout_id", workoutId),
        sb.from("templates").select("id,program_id").eq("id", templateId).single(),
        sb.from("set_adjustments").select("id").eq("workout_id", workoutId).limit(1),
        loadExercises(),
        loadSettings(),
        sb.rpc("muscle_feedback_history", { p_weeks: 26 }),
      ]);
      const feedback = (fb ?? []) as MuscleFeedback[];
      setHadFeedback(feedback.length > 0);
      if (!feedback.length || !tpl) {
        onReady?.([]);
        return setAdj([]);
      }
      if (done?.length) {
        setState("done");
        onReady?.([]);
        return setAdj([]);
      }
      const exMap = new Map(exs.map((e) => [e.id, e]));
      setNames(new Map(exs.map((e) => [e.id, e.name])));

      // all templates in the program → planned weekly volume per muscle
      let templateIds = [templateId];
      let daysPerWeek = 1;
      let deload = false;
      if (tpl.program_id) {
        const [{ data: prog }, { data: tpls }, { data: pr }] = await Promise.all([
          sb.from("programs").select("days_per_week,week_plan").eq("id", tpl.program_id).single(),
          sb.from("templates").select("id").eq("program_id", tpl.program_id),
          sb.rpc("program_progress", { p_program: tpl.program_id }),
        ]);
        templateIds = (tpls ?? []).map((t) => t.id);
        daysPerWeek = prog?.days_per_week ?? templateIds.length;
        const p = (pr ?? [])[0] as { completed: number; days: number; weeks: number | null } | undefined;
        if (p && p.days && p.weeks) {
          const week = (Math.floor(Math.max(0, p.completed - 1) / p.days) % p.weeks) + 1;
          deload = !!((prog?.week_plan ?? []) as WeekPlan[]).find((w) => w.week === week)?.deload;
        }
      } else daysPerWeek = 1;
      const { data: te } = await sb.from("template_exercises").select("id,template_id,exercise_id,target_sets,position").in("template_id", templateIds);
      const toTpl = (r: { id: string; exercise_id: string; target_sets: number; position: number }): TplEx => ({
        id: r.id,
        exercise_id: r.exercise_id,
        target_sets: r.target_sets,
        position: r.position,
        primary: exMap.get(r.exercise_id)?.primary_muscles ?? [],
        secondary: exMap.get(r.exercise_id)?.secondary_muscles ?? [],
      });
      const rows = (te ?? []) as { id: string; template_id: string; exercise_id: string; target_sets: number; position: number }[];
      const session = rows.filter((r) => r.template_id === templateId).sort((a, b) => a.position - b.position).map(toTpl);
      const weekly = plannedWeekly(rows.map(toTpl), templateIds.length, daysPerWeek);
      const zones = estimateZones((hist ?? []) as FeedbackRow[]);
      const list = suggestAdjustments({ feedback, session, weekly, settings, deload, zones });
      setAdj(list);
      setOn(Object.fromEntries(list.map((a) => [a.te_id, true])));
      onReady?.(list);
    })().catch(() => onReady?.([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId, templateId]);

  // coach says keep → deselect those rows (once, when the veto arrives)
  const vetoKey = JSON.stringify(veto ?? {});
  useEffect(() => {
    if (!veto || !adj?.length) return;
    setOn((o) => {
      const n = { ...o };
      adj.forEach((a) => {
        if (veto[a.muscle]) n[a.te_id] = false;
      });
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vetoKey, adj]);

  async function apply() {
    if (!adj) return;
    setState("saving");
    const sb = supabase();
    await Promise.all(adj.filter((a) => on[a.te_id]).map((a) => sb.from("template_exercises").update({ target_sets: a.to }).eq("id", a.te_id)));
    await sb.from("set_adjustments").insert(
      adj.map((a) => ({ workout_id: workoutId, template_exercise_id: a.te_id, exercise_id: a.exercise_id, muscle: a.muscle, from_sets: a.from, to_sets: a.to, reason: a.reason, applied: !!on[a.te_id] })),
    );
    setState("done");
  }

  if (!templateId || adj === null || (!adj.length && state !== "done" && !hadFeedback)) return null;

  return (
    <section className="card p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Activity size={17} className="text-sky" /> Volym till nästa gång
      </h2>
      <AnimatePresence mode="wait">
        {state === "done" ? (
          <motion.p key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-sm text-accent">
            <Check size={16} /> Passet är uppdaterat inför nästa gång.
          </motion.p>
        ) : adj.length === 0 ? (
          <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-ink-3">
            Utifrån din feedback ligger volymen rätt – inga ändringar.
          </motion.p>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className="mb-3 text-sm text-ink-3">Baserat på hur musklerna kändes. Tryck för att välja bort.</p>
            <ul className="stagger space-y-2">
              {adj.map((a) => {
                const sel = !!on[a.te_id];
                const up = a.to > a.from;
                return (
                  <li key={a.te_id}>
                    <button
                      onClick={() => setOn((o) => ({ ...o, [a.te_id]: !o[a.te_id] }))}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${sel ? (up ? "border-accent/40 bg-accent/[0.06]" : "border-warm/40 bg-warm/[0.06]") : "border-line opacity-50"}`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${up ? "bg-accent/15 text-accent" : "bg-warm/15 text-warm"}`}>
                        {up ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{names.get(a.exercise_id) ?? "Övning"}</div>
                        <div className="text-xs text-ink-3">{a.reason}</div>
                        {veto?.[a.muscle] && <div className="mt-0.5 text-xs text-sky">Coachen: {veto[a.muscle]}</div>}
                      </div>
                      <div className="shrink-0 text-sm font-bold tabular-nums">
                        {a.from} → <span className={up ? "text-accent" : "text-warm"}>{a.to}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <motion.button whileTap={{ scale: 0.97 }} transition={spring} className="btn-primary mt-3 w-full py-3" onClick={apply} disabled={waiting || state === "saving" || !Object.values(on).some(Boolean)}>
              {waiting ? "Coachen tittar på förslagen…" : state === "saving" ? "Sparar…" : "Använd ändringarna"}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
