import { muscleLabel } from "./format";
import { TARGET_MUSCLES, volumeTarget, type UserSettings } from "./settings";

/** Answers per muscle, given after its last exercise in a session. */
export type MuscleFeedback = {
  muscle: string;
  recovery: 1 | 2 | 3 | null; // 1 fortfarande öm · 2 precis återhämtad · 3 pigg länge
  pump: 1 | 2 | 3 | null; // 1 knappt · 2 bra · 3 grym
  effort: 1 | 2 | 3 | null; // 1 lätt · 2 lagom · 3 maxat
  joint_pain: boolean;
};

export const FB_LABELS = {
  recovery: { title: "Återhämtning", hint: "sedan förra gången", opts: ["Fortfarande öm", "Precis återställd", "Pigg länge"] },
  pump: { title: "Pump", hint: "idag", opts: ["Knappt", "Bra", "Grym"] },
  effort: { title: "Ansträngning", hint: "idag", opts: ["Lätt", "Lagom", "Maxat"] },
} as const;

export type TplEx = { id: string; exercise_id: string; target_sets: number; position: number; primary: string[]; secondary: string[] };
export type Adjustment = { te_id: string; exercise_id: string; muscle: string; from: number; to: number; reason: string };

export { TARGET_MUSCLES };

/**
 * Trakkr's volume autoregulation.
 * Per muscle: recovery (did the last dose heal in time?), stimulus (pump) and cost (effort, joints)
 * give a score; ≥ +1 adds a set, ≤ −1 removes one – but always steered by the weekly target range,
 * so a muscle never drifts to maintenance level or runs away far above the range.
 */
export function suggestAdjustments(opts: {
  feedback: MuscleFeedback[];
  session: TplEx[]; // exercises in the template that was trained
  weekly: Record<string, number>; // planned hard sets per muscle per week in the whole program
  settings: UserSettings;
  deload: boolean;
}): Adjustment[] {
  if (opts.deload) return [];
  const out: Adjustment[] = [];
  const touched = new Set<string>();
  for (const f of opts.feedback) {
    if (!TARGET_MUSCLES.includes(f.muscle)) continue;
    let score = 0;
    const why: string[] = [];
    if (f.recovery === 1) (score -= 1), why.push("fortfarande öm");
    if (f.recovery === 3) (score += 1), why.push("pigg länge");
    if (f.pump === 1) (score += 0.5), why.push("svag pump");
    if (f.effort === 1) (score += 0.5), why.push("kändes lätt");
    if (f.effort === 3) (score -= 0.5), why.push("maxat");
    if (f.joint_pain) (score -= 1.5), why.push("känning i leder");

    const target = volumeTarget(f.muscle, opts.settings);
    const weekly = opts.weekly[f.muscle] ?? 0;
    let delta = score >= 1 ? 1 : score <= -1 ? -1 : 0;

    if (target) {
      if (delta > 0 && weekly + 1 > target.max + 2) {
        delta = 0; // already well above the range – more isn't better
      }
      if (delta < 0 && weekly - 1 < target.min && !f.joint_pain && f.recovery !== 1) {
        delta = 0; // don't cut below the range just because it felt hard
      }
      if (delta === 0 && weekly < target.min && f.recovery !== 1 && !f.joint_pain) {
        delta = 1;
        why.push(`under målet (${fmt(weekly)}/${target.min} set i veckan)`);
      }
    }
    if (!delta) continue;

    const cands = opts.session.filter((e) => e.primary.includes(f.muscle) && !touched.has(e.id));
    if (!cands.length) continue;
    let pick: TplEx | undefined;
    if (delta > 0) {
      // add to the last (usually isolation) exercise for the muscle, max 5 sets
      pick = [...cands].reverse().find((e) => e.target_sets < 5);
    } else {
      // remove from the exercise with most sets, never below 2
      pick = [...cands].filter((e) => e.target_sets > 2).sort((a, b) => b.target_sets - a.target_sets || b.position - a.position)[0];
    }
    if (!pick) continue;
    touched.add(pick.id);
    const label = muscleLabel(f.muscle).toLowerCase();
    out.push({
      te_id: pick.id,
      exercise_id: pick.exercise_id,
      muscle: f.muscle,
      from: pick.target_sets,
      to: pick.target_sets + delta,
      reason: `${capital(label)}: ${why.join(", ")}`,
    });
  }
  return out;
}

/** Planned weekly hard sets per muscle for a program (primary = 1, secondary = 0.5), scaled to days/week. */
export function plannedWeekly(all: TplEx[], templatesInProgram: number, daysPerWeek: number) {
  const perRotation: Record<string, number> = {};
  for (const e of all) {
    e.primary.forEach((m) => (perRotation[m] = (perRotation[m] ?? 0) + e.target_sets));
    e.secondary.forEach((m) => (perRotation[m] = (perRotation[m] ?? 0) + e.target_sets * 0.5));
  }
  const scale = templatesInProgram ? daysPerWeek / templatesInProgram : 1;
  return Object.fromEntries(Object.entries(perRotation).map(([m, v]) => [m, v * scale]));
}

const fmt = (n: number) => Number(n.toFixed(1)).toLocaleString("sv-SE");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
