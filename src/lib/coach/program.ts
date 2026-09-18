export interface ProgramExercise {
  name: string;
  primary_muscles: string[];
  secondary_muscles?: string[];
  equipment?: string | null;
  sets: number;
  rep_min: number;
  rep_max: number;
  rir?: string | null;
  start_weight?: number | null;
  rationale?: string | null;
  notes?: string | null;
}
export interface ProgramDay {
  name: string;
  focus?: string | null;
  exercises: ProgramExercise[];
}
export interface WeekPlan {
  week: number;
  rir: string;
  note?: string | null;
  deload?: boolean;
}
export type ProgramProgress = { completed: number; next_template: string | null; next_day: number | null; week: number; weeks: number | null; days: number };

export interface ProgramDraft {
  name: string;
  description?: string | null;
  days_per_week: number;
  weeks: number;
  week_plan: WeekPlan[];
  days: ProgramDay[];
  notes?: string | null;
}

const MUSCLES = [
  "chest", "shoulders", "triceps", "biceps", "forearms", "lats", "middle back", "lower back", "traps",
  "abdominals", "quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors", "neck",
];

export const PROPOSE_PROGRAM_TOOL = {
  name: "propose_program",
  description:
    "Visa ett komplett träningsprogram för användaren i appen. Anropa när du vet tillräckligt, och igen med hela det uppdaterade programmet när användaren vill ändra något.",
  input_schema: {
    type: "object" as const,
    required: ["name", "days_per_week", "weeks", "week_plan", "days"],
    properties: {
      name: { type: "string", description: "Kort programnamn, t.ex. 'Upper/Lower 4 dagar – hypertrofi'" },
      description: { type: "string", description: "1–2 meningar om upplägget" },
      days_per_week: { type: "integer", minimum: 1, maximum: 7 },
      weeks: { type: "integer", minimum: 1, maximum: 16, description: "Antal veckor i mesocykeln inkl. ev. deload" },
      week_plan: {
        type: "array",
        items: {
          type: "object",
          required: ["week", "rir"],
          properties: {
            week: { type: "integer" },
            rir: { type: "string", description: "t.ex. '2–3'" },
            note: { type: "string" },
            deload: { type: "boolean" },
          },
        },
      },
      days: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "exercises"],
          properties: {
            name: { type: "string" },
            focus: { type: "string" },
            exercises: {
              type: "array",
              items: {
                type: "object",
                required: ["name", "primary_muscles", "sets", "rep_min", "rep_max"],
                properties: {
                  name: { type: "string", description: "Standardnamn på engelska" },
                  primary_muscles: { type: "array", items: { type: "string", enum: MUSCLES } },
                  secondary_muscles: { type: "array", items: { type: "string", enum: MUSCLES } },
                  equipment: { type: "string", enum: ["barbell", "dumbbell", "cable", "machine", "body only", "kettlebells", "bands", "e-z curl bar", "other"] },
                  sets: { type: "integer", minimum: 1, maximum: 10 },
                  rep_min: { type: "integer", minimum: 1, maximum: 50 },
                  rep_max: { type: "integer", minimum: 1, maximum: 50 },
                  rir: { type: "string" },
                  start_weight: { type: "number", description: "Föreslagen startvikt i kg (utelämna om okänt)" },
                  rationale: { type: "string" },
                  notes: { type: "string", description: "Teknik/utförande, t.ex. 'lengthened partials sista setet'" },
                },
              },
            },
          },
        },
      },
      notes: { type: "string", description: "Övergripande råd: uppvärmning, progression, vila" },
    },
  },
};

/** A draft must have a name and at least one day with exercises to be shown/saved. */
export function isValidDraft(d: Partial<ProgramDraft> | null | undefined): d is ProgramDraft {
  return !!d && typeof d === "object" && typeof d.name === "string" && !!d.name.trim() && Array.isArray(d.days) && d.days.length > 0 && d.days.every((x) => Array.isArray(x.exercises) && x.exercises.length > 0 && x.exercises.every((e) => !!e.name));
}

/** Models occasionally return nested arrays/objects as JSON strings in large tool inputs – parse them back. */
function unstring<T>(v: unknown, fallback: T): T {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return (v ?? fallback) as T;
}
const arr = <T,>(v: unknown): T[] => {
  const x = unstring<unknown>(v, []);
  return Array.isArray(x) ? (x as T[]) : [];
};
const num = (v: unknown, d: number) => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : d;
};

/** Light sanity-fixing of model output. Never throws. */
export function normalizeDraft(raw: unknown): ProgramDraft {
  const d = unstring<Partial<ProgramDraft>>(raw, {}) ?? {};
  const days = arr<ProgramDay>(d.days).map((day0) => {
    const day = unstring<ProgramDay>(day0, { name: "", exercises: [] });
    return {
      ...day,
      exercises: arr<ProgramExercise>(day.exercises).map((e0) => {
        const e = unstring<ProgramExercise>(e0, {} as ProgramExercise);
        const a = num(e.rep_min, 8);
        const b = num(e.rep_max, a);
        return {
          ...e,
          sets: Math.max(1, Math.round(num(e.sets, 3))),
          rep_min: Math.min(a, b),
          rep_max: Math.max(a, b),
          start_weight: e.start_weight == null ? null : num(e.start_weight, 0) || null,
          primary_muscles: arr<string>(e.primary_muscles).filter((m) => MUSCLES.includes(m)),
          secondary_muscles: arr<string>(e.secondary_muscles).filter((m) => MUSCLES.includes(m)),
        };
      }),
    };
  });
  const week_plan = arr<WeekPlan>(d.week_plan).map((w0, i) => {
    const w = unstring<WeekPlan>(w0, { week: i + 1, rir: "" });
    return { ...w, week: num(w.week, i + 1), rir: String(w.rir ?? "") };
  });
  return {
    ...(d as ProgramDraft),
    name: typeof d.name === "string" ? d.name : "",
    days,
    week_plan,
    days_per_week: num(d.days_per_week, days.length),
    weeks: num(d.weeks, week_plan.length),
  };
}

/** Weekly hard sets per muscle (primary 1, secondary 0.5). */
export function weeklyVolume(d: ProgramDraft) {
  const v = new Map<string, number>();
  d.days.forEach((day) =>
    day.exercises.forEach((e) => {
      e.primary_muscles.forEach((m) => v.set(m, (v.get(m) ?? 0) + e.sets));
      (e.secondary_muscles ?? []).forEach((m) => v.set(m, (v.get(m) ?? 0) + e.sets * 0.5));
    }),
  );
  return [...v.entries()].sort((a, b) => b[1] - a[1]);
}
