/**
 * Rule-based progression engine. Pure functions – no I/O.
 *
 * Signals (per exercise, working sets only):
 *  - increase: all sets at the top load hit the top of the rep range, or
 *              same top load ≥ SAME_WEIGHT_SESSIONS sessions in a row while reps went up
 *  - stalled:  no improvement for ≥ STALL_SESSIONS sessions
 *  - progressing: the latest session beat everything before it (in the window)
 */

export const STALL_SESSIONS = 3;
export const SAME_WEIGHT_SESSIONS = 3;
export const DEFAULT_INCREMENT = 1.25;

export interface PSet {
  load: number | null;
  extra: number | null;
  reps: number;
  rpe?: number | null;
  rir?: number | null;
}
export interface PSession {
  workoutId: string;
  date: string;
  sets: PSet[];
}
export interface PTarget {
  repMin?: number | null;
  repMax?: number | null;
  increment?: number | null;
  bodyweight?: boolean;
}
export type PStatus = "increase" | "stalled" | "progressing" | "steady" | "new";
export interface PResult {
  status: PStatus;
  /** short badge text */
  label: string;
  /** one-sentence explanation */
  reason: string;
  topLoad: number | null;
  suggestion?: { load: number; extra?: number; reps?: number | null };
  sessionsAtWeight: number;
  stalledFor: number;
}

const EPS = 1e-6;
const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("sv-SE");

/** Parse "8-12", "8–12", "8 till 12", "10", "3x8-12" → {min,max}. */
export function parseRepRange(s: string | null | undefined): { min: number; max: number } | null {
  if (!s) return null;
  const t = s.replace(/^\s*\d+\s*[x×]\s*/i, "");
  const m = t.match(/(\d+)\s*(?:-|–|—|till|to)\s*(\d+)/i);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const one = t.match(/(\d+)/);
  return one ? { min: Number(one[1]), max: Number(one[1]) } : null;
}

interface Summary {
  top: number;
  nTop: number;
  bestReps: number;
  totalRepsTop: number;
  minRepsTop: number;
  topExtra: number | null;
}

function summarize(s: PSession): Summary | null {
  if (!s.sets.length) return null;
  const loads = s.sets.map((x) => x.load ?? 0);
  const top = Math.max(...loads);
  const atTop = s.sets.filter((x) => Math.abs((x.load ?? 0) - top) < EPS);
  return {
    top,
    nTop: atTop.length,
    bestReps: Math.max(...atTop.map((x) => x.reps)),
    totalRepsTop: atTop.reduce((a, x) => a + x.reps, 0),
    minRepsTop: Math.min(...atTop.map((x) => x.reps)),
    topExtra: atTop[0]?.extra ?? null,
  };
}

/** a strictly better than b? */
function better(a: Summary, b: Summary) {
  if (a.top > b.top + EPS) return true;
  if (Math.abs(a.top - b.top) > EPS) return false;
  if (a.bestReps > b.bestReps) return true;
  return a.nTop >= b.nTop && a.totalRepsTop > b.totalRepsTop;
}

/** sessions: newest first. */
export function evaluate(sessions: PSession[], target: PTarget = {}): PResult {
  const inc = target.increment && target.increment > 0 ? target.increment : DEFAULT_INCREMENT;
  const sums = sessions.map(summarize).filter((x): x is Summary => !!x);
  if (sums.length === 0) {
    return { status: "new", label: "Ny", reason: "Ingen historik ännu.", topLoad: null, sessionsAtWeight: 0, stalledFor: 0 };
  }
  const latest = sums[0];

  // consecutive sessions at the same top load (newest first)
  let sessionsAtWeight = 1;
  while (sessionsAtWeight < sums.length && Math.abs(sums[sessionsAtWeight].top - latest.top) < EPS) sessionsAtWeight++;

  // stall counter: walk oldest → newest keeping a running best
  const chrono = [...sums].reverse();
  let best = chrono[0];
  let lastImprovement = 0;
  chrono.forEach((s, i) => {
    if (i > 0 && better(s, best)) {
      best = s;
      lastImprovement = i;
    }
  });
  const stalledFor = chrono.length - 1 - lastImprovement;

  const suggest = (reps?: number | null) => {
    const load = latest.top + inc;
    return target.bodyweight ? { load, extra: (latest.topExtra ?? 0) + inc, reps } : { load, reps };
  };
  const incTxt = `+${fmt(inc)} kg`;
  const nextTxt = (s: { load: number; extra?: number }) => (s.extra != null ? `+${fmt(s.extra)} kg extra` : `${fmt(s.load)} kg`);
  const base = { topLoad: latest.top, sessionsAtWeight, stalledFor };

  // 1) top of rep range reached on all sets at top load
  if (target.repMax && latest.minRepsTop >= target.repMax) {
    const s = suggest(target.repMin ?? null);
    return {
      ...base,
      status: "increase",
      label: `Höj ${incTxt}`,
      reason: `Alla set nådde ${target.repMax} reps – höj till ${nextTxt(s)}${target.repMin ? ` och sikta på ${target.repMin} reps` : ""}.`,
      suggestion: s,
    };
  }

  // 2) same weight for N sessions and reps trending up
  if (sessionsAtWeight >= SAME_WEIGHT_SESSIONS && latest.top > 0) {
    const oldest = sums[sessionsAtWeight - 1];
    // best of the last two sessions (one bad day shouldn't hide the trend) vs the first session at this weight
    const recent = better(sums[1], latest) ? sums[1] : latest;
    const repsUp = better(recent, oldest);
    if (repsUp) {
      const s = suggest(null);
      return {
        ...base,
        status: "increase",
        label: `Höj ${incTxt}`,
        reason: `${sessionsAtWeight} pass på ${fmt(latest.top)} kg och reps ökar – dags att höja till ${nextTxt(s)}.`,
        suggestion: s,
      };
    }
  }

  // 3) stalled
  if (sums.length > STALL_SESSIONS && stalledFor >= STALL_SESSIONS) {
    return {
      ...base,
      status: "stalled",
      label: `Stagnerat · ${stalledFor} pass`,
      reason: `Inga framsteg på ${stalledFor} pass (varken mer vikt eller fler reps än ${fmt(best.top)} kg × ${best.bestReps}).`,
    };
  }

  // 4) progressing
  if (sums.length >= 2 && stalledFor === 0) {
    return { ...base, status: "progressing", label: "Framsteg", reason: "Bättre än tidigare pass – fortsätt så." };
  }

  return {
    ...base,
    status: "steady",
    label: "Stabil",
    reason: sums.length < 2 ? "För lite historik för en bedömning." : `Inga framsteg på ${stalledFor} pass ännu.`,
  };
}

/** Group rows from the progression_sessions RPC into sessions per exercise (newest first). */
export function groupRows(
  rows: { exercise_id: string; workout_id: string; started_at: string; pos: number; load: number | null; extra_weight: number | null; reps: number; rpe: number | null; rir: number | null }[],
) {
  const out = new Map<string, PSession[]>();
  for (const r of rows) {
    const list = out.get(r.exercise_id) ?? [];
    let s = list.find((x) => x.workoutId === r.workout_id);
    if (!s) {
      s = { workoutId: r.workout_id, date: r.started_at, sets: [] };
      list.push(s);
    }
    s.sets.push({
      load: r.load == null ? null : Number(r.load),
      extra: r.extra_weight == null ? null : Number(r.extra_weight),
      reps: r.reps,
      rpe: r.rpe,
      rir: r.rir,
    });
    out.set(r.exercise_id, list);
  }
  out.forEach((l) => l.sort((a, b) => b.date.localeCompare(a.date)));
  return out;
}
