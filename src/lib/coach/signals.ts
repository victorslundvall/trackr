import type { FeedbackRow } from "../zones";

export type Best = { exercise_id: string; workout_id: string; started_at: string; e1rm: number };

export type Signal =
  | { kind: "sore_but_stronger"; muscle: string; exercise_ids: string[]; detail: string }
  | { kind: "low_pump_streak"; muscle: string; exercise_ids: string[]; detail: string }
  | { kind: "joint_repeat"; muscle: string; exercise_ids: string[]; detail: string }
  | { kind: "stalled"; muscle: string | null; exercise_ids: string[]; detail: string };

export const SIGNAL_LABEL: Record<Signal["kind"], string> = {
  sore_but_stronger: "Öm men starkare",
  low_pump_streak: "Svag pump i rad",
  joint_repeat: "Återkommande ledkänning",
  stalled: "Står still",
};

const pct = (a: number, b: number) => ((a - b) / b) * 100;

/**
 * Situations where the simple ±1-set rule is likely wrong or not enough – these are handed to the coach.
 * - sore_but_stronger: rules would cut volume, but performance is going up (soreness ≠ under-recovery).
 * - low_pump_streak: three sessions of weak pump → the exercise may be the problem, not the volume.
 * - joint_repeat: joints complain repeatedly → swap the exercise rather than just cutting a set.
 * - stalled: e1RM flat ≥ 3 weeks while recovery is fine → change rep range or exercise.
 */
export function detectSignals(opts: {
  workoutId: string;
  history: FeedbackRow[];
  bests: Best[];
  exercises: { id: string; name: string; primary_muscles: string[] }[];
}): Signal[] {
  const { workoutId, history, bests, exercises } = opts;
  const out: Signal[] = [];
  const now = history.filter((r) => r.workout_id === workoutId);
  const inWorkout = new Set(exercises.map((e) => e.id));
  const bestsBy = new Map<string, Best[]>();
  bests.forEach((b) => bestsBy.set(b.exercise_id, [...(bestsBy.get(b.exercise_id) ?? []), b]));
  bestsBy.forEach((l) => l.sort((a, b) => a.started_at.localeCompare(b.started_at)));
  const name = (id: string) => exercises.find((e) => e.id === id)?.name ?? "?";

  for (const cur of now) {
    const last3 = history.filter((r) => r.muscle === cur.muscle && r.started_at <= cur.started_at).slice(-3);
    const exIds = (cur.exercises ?? []).filter((id) => inWorkout.has(id));
    if (last3.length >= 3 && last3.every((r) => r.pump === 1)) {
      out.push({ kind: "low_pump_streak", muscle: cur.muscle, exercise_ids: exIds, detail: `Pump "knappt" tre pass i rad (${exIds.map(name).join(", ")}).` });
    }
    if (last3.filter((r) => r.joint_pain).length >= 2) {
      out.push({ kind: "joint_repeat", muscle: cur.muscle, exercise_ids: exIds, detail: `Ledkänning ${last3.filter((r) => r.joint_pain).length} av de senaste ${last3.length} passen (${exIds.map(name).join(", ")}).` });
    }
    if (last3.filter((r) => r.recovery === 1).length >= 2) {
      const since = last3[0].started_at;
      const rising = exIds.filter((id) => {
        const l = bestsBy.get(id) ?? [];
        const before = l.filter((b) => b.started_at < since).slice(-2);
        const today = l.find((b) => b.workout_id === workoutId);
        if (!before.length || !today) return false;
        return pct(today.e1rm, Math.max(...before.map((b) => b.e1rm))) > 1;
      });
      if (rising.length)
        out.push({
          kind: "sore_but_stronger",
          muscle: cur.muscle,
          exercise_ids: rising,
          detail: `"Fortfarande öm" ${last3.filter((r) => r.recovery === 1).length} av 3 pass, men e1RM har ökat i ${rising.map(name).join(", ")}.`,
        });
    }
  }

  // stagnation per exercise in today's session
  const cutoff = Date.now() - 70 * 864e5;
  for (const ex of exercises) {
    const l = (bestsBy.get(ex.id) ?? []).filter((b) => new Date(b.started_at).getTime() >= cutoff);
    if (l.length < 5) continue;
    const span = (new Date(l[l.length - 1].started_at).getTime() - new Date(l[0].started_at).getTime()) / 864e5;
    if (span < 21) continue;
    const recent = l.slice(-3);
    const earlier = l.slice(0, -3);
    const rb = Math.max(...recent.map((b) => b.e1rm));
    const eb = Math.max(...earlier.map((b) => b.e1rm));
    if (rb > eb * 1.005) continue;
    const muscle = ex.primary_muscles[0] ?? null;
    const fresh = history.filter((r) => r.muscle === muscle).slice(-1)[0];
    if (fresh && (fresh.recovery === 1 || fresh.joint_pain)) continue; // fatigue explains it – rules handle that
    out.push({
      kind: "stalled",
      muscle,
      exercise_ids: [ex.id],
      detail: `${ex.name}: bästa e1RM de senaste 3 passen ${rb.toFixed(1)} kg mot ${eb.toFixed(1)} kg tidigare (${l.length} pass på ${Math.round(span)} dagar).`,
    });
  }
  return out;
}
